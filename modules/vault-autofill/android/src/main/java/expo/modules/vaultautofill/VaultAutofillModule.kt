package expo.modules.vaultautofill

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Everything that touches AutofillManager runs only once `manager` is non-null, which means API 26+.
@SuppressLint("NewApi")
class VaultAutofillModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val manager: AutofillManager?
    get() = if (Build.VERSION.SDK_INT >= 26) context.getSystemService(AutofillManager::class.java) else null

  override fun definition() = ModuleDefinition {
    Name("VaultAutofill")

    Function("isSupported") {
      manager?.isAutofillSupported == true
    }

    /** True when DocVault is the phone's selected autofill service. */
    Function("isEnabled") {
      manager?.hasEnabledAutofillServices() == true
    }

    Function("setData") { json: String ->
      AutofillStore.write(context, json)
    }

    Function("clear") {
      AutofillStore.clear(context)
    }

    /** Opens Android's "choose autofill service" screen with DocVault preselected. */
    Function("openSettings") {
      val activity = appContext.currentActivity ?: return@Function false
      val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE, Uri.parse("package:" + context.packageName))
      runCatching { activity.startActivity(intent) }.isSuccess
    }

    /** Gives the autofill slot back (to Google or a password manager) when DocVault holds it. */
    Function("disable") {
      manager?.takeIf { it.hasEnabledAutofillServices() }?.disableAutofillServices()
      AutofillStore.clear(context)
    }
  }
}
