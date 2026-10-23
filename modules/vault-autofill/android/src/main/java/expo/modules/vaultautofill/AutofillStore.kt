package expo.modules.vaultautofill

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

internal class Profile(val name: String, val values: Map<String, String>)

/**
 * The details autofill may offer, written by the app while it is unlocked and read only after the
 * unlock prompt. AES-GCM with a key that never leaves the Android Keystore; kept out of Android backups.
 */
internal object AutofillStore {
  private const val ALIAS = "docvault_autofill"

  private fun file(context: Context) = File(context.noBackupFilesDir, "autofill.bin")

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

  fun write(context: Context, json: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val body = cipher.doFinal(json.toByteArray(Charsets.UTF_8))
    val tmp = File(context.noBackupFilesDir, "autofill.tmp")
    tmp.writeBytes(byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + body)
    if (!tmp.renameTo(file(context))) throw IllegalStateException("couldn't save autofill data")
  }

  fun read(context: Context): List<Profile> {
    val f = file(context)
    if (!f.exists()) return emptyList()
    val bytes = f.readBytes()
    val ivLen = bytes[0].toInt()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 1, ivLen))
    val json = String(cipher.doFinal(bytes, 1 + ivLen, bytes.size - 1 - ivLen), Charsets.UTF_8)

    val list = JSONObject(json).getJSONArray("profiles")
    return (0 until list.length()).map { i ->
      val p = list.getJSONObject(i)
      val v = p.getJSONObject("values")
      Profile(p.getString("name"), v.keys().asSequence().associateWith { v.getString(it) })
    }
  }
}
