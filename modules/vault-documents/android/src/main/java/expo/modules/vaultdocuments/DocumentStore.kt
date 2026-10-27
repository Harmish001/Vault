package expo.modules.vaultdocuments

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class VaultDocFolder(
  val id: String,
  val name: String,
  val parentId: String?
)

internal class VaultDocFile(
  val id: String,
  val folderId: String?,
  val name: String,
  val displayName: String,
  val mime: String,
  val size: Long,
  val storedAs: String,
  val addedAt: Long,
  val searchTerms: String
)

internal class VaultDocumentsData(
  val enabled: Boolean,
  val folders: List<VaultDocFolder>,
  val files: List<VaultDocFile>
)

internal object DocumentStore {
  private const val ALIAS = "docvault_documents_provider"

  private fun file(context: Context) = File(context.noBackupFilesDir, "documents_provider.bin")

  fun hasData(context: Context) = file(context).exists()

  fun clear(context: Context) {
    file(context).delete()
  }

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return gen.generateKey()
  }

  fun write(context: Context, json: String, enabled: Boolean) {
    val payload = JSONObject().apply {
      put("enabled", enabled)
      put("data", JSONObject(json))
    }.toString()

    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val body = cipher.doFinal(payload.toByteArray(Charsets.UTF_8))
    val tmp = File(context.noBackupFilesDir, "documents_provider.tmp")
    tmp.writeBytes(byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + body)
    if (!tmp.renameTo(file(context))) {
      file(context).delete()
      tmp.renameTo(file(context))
    }
  }

  fun read(context: Context): VaultDocumentsData? {
    return runCatching {
      val f = file(context)
      if (!f.exists()) return null
      val bytes = f.readBytes()
      val ivLen = bytes[0].toInt()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 1, ivLen))
      val raw = String(cipher.doFinal(bytes, 1 + ivLen, bytes.size - 1 - ivLen), Charsets.UTF_8)
      val root = JSONObject(raw)
      val enabled = root.optBoolean("enabled", true)
      val data = root.getJSONObject("data")

      val foldersArray = data.optJSONArray("folders") ?: org.json.JSONArray()
      val folders = (0 until foldersArray.length()).map { i ->
        val o = foldersArray.getJSONObject(i)
        VaultDocFolder(
          id = o.getString("id"),
          name = o.getString("name"),
          parentId = if (o.isNull("parentId")) null else o.optString("parentId", null)
        )
      }

      val filesArray = data.optJSONArray("files") ?: org.json.JSONArray()
      val files = (0 until filesArray.length()).map { i ->
        val o = filesArray.getJSONObject(i)
        VaultDocFile(
          id = o.getString("id"),
          folderId = if (o.isNull("folderId")) null else o.optString("folderId", null),
          name = o.getString("name"),
          displayName = o.optString("displayName", o.getString("name")),
          mime = o.optString("mime", "application/octet-stream"),
          size = o.optLong("size", 0L),
          storedAs = o.getString("storedAs"),
          addedAt = o.optLong("addedAt", System.currentTimeMillis()),
          searchTerms = o.optString("searchTerms", "")
        )
      }

      VaultDocumentsData(enabled, folders, files)
    }.getOrNull()
  }
}
