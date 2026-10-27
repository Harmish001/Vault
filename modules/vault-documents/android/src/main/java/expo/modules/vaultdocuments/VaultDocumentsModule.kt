package expo.modules.vaultdocuments

import android.content.Context
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

    Function("sync") { json: String, enabled: Boolean ->
      DocumentStore.write(context, json, enabled)
    }

    Function("clear") {
      DocumentStore.clear(context)
    }
  }
}
