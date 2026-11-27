package expo.modules.vaultdocuments

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VaultDocumentsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("VaultDocuments")

    Function("isSupported") {
      true
    }

    Function("sync") { json: String, enabled: Boolean, masterKeyBase64: String? ->
      DocumentStore.write(context, json, enabled, masterKeyBase64)
    }

    Function("clear") {
      DocumentStore.clear(context)
    }

    AsyncFunction("shareMultiple") { uris: List<String>, mimeType: String, dialogTitle: String ->
      if (uris.isEmpty()) throw IllegalArgumentException("No files to share")
      val parsedUris = ArrayList<Uri>(uris.size)
      for (u in uris) {
        parsedUris.add(Uri.parse(u))
      }

      val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        setTypeAndNormalize(mimeType.ifEmpty { "*/*" })
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, parsedUris)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val clip = ClipData.newRawUri(null, parsedUris[0])
        for (i in 1 until parsedUris.size) {
          clip.addItem(ClipData.Item(parsedUris[i]))
        }
        clipData = clip
      }

      val resInfoList = context.packageManager.queryIntentActivities(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
      )
      for (info in resInfoList) {
        val pkg = info.activityInfo.packageName
        for (uri in parsedUris) {
          context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      }

      val chooser = Intent.createChooser(intent, dialogTitle).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      appContext.throwingActivity.startActivity(chooser)
    }
  }
}
