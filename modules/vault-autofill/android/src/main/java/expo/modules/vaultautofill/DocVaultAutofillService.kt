package expo.modules.vaultautofill

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

/** One row in the system's autofill dropdown, with the DocVault icon. */
internal fun row(context: Context, text: String) =
  RemoteViews(context.packageName, R.layout.docvault_autofill_item).apply {
    setImageViewResource(R.id.docvault_autofill_icon, context.applicationInfo.icon)
    setTextViewText(R.id.docvault_autofill_text, text)
  }

/**
 * Offers "Fill from DocVault" on recognised fields. Nothing is read or sent here: the values are
 * decrypted only in [AutofillAuthActivity], after the fingerprint / PIN prompt.
 */
@RequiresApi(Build.VERSION_CODES.O)
class DocVaultAutofillService : AutofillService() {
  override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
    val structure = request.fillContexts.lastOrNull()?.structure
    if (structure == null || structure.activityComponent.packageName == packageName || !AutofillStore.hasData(this)) {
      callback.onSuccess(null)
      return
    }
    val matches = FieldMatcher.find(structure)
    if (matches.isEmpty()) {
      callback.onSuccess(null)
      return
    }
    val ids = matches.map { it.id }.toTypedArray()
    val intent = Intent(this, AutofillAuthActivity::class.java)
      .putExtra(AutofillAuthActivity.EXTRA_IDS, ids)
      .putExtra(AutofillAuthActivity.EXTRA_KINDS, matches.map { it.kind }.toTypedArray())
    // Mutable: Android adds the form structure to this intent when it starts the activity.
    val flags = PendingIntent.FLAG_CANCEL_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
    val sender = PendingIntent.getActivity(this, 0, intent, flags).intentSender
    callback.onSuccess(FillResponse.Builder().setAuthentication(ids, sender, row(this, "Fill from DocVault")).build())
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }
}
