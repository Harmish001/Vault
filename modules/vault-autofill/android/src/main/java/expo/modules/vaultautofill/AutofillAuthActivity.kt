package expo.modules.vaultautofill

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

private val LABELS = mapOf(
  "name" to "Name", "phone" to "Mobile", "email" to "Email", "address" to "Address", "pincode" to "PIN code",
  "dob" to "Date of birth", "aadhaar" to "Aadhaar", "pan" to "PAN", "passport" to "Passport",
  "licence" to "Driving licence", "voter" to "Voter ID", "vehicle" to "Vehicle no.",
)

/** Asks for the same unlock as the app, then hands Android one suggestion per family member. */
@RequiresApi(Build.VERSION_CODES.O)
class AutofillAuthActivity : FragmentActivity() {
  companion object {
    const val EXTRA_IDS = "docvault.autofill.ids"
    const val EXTRA_KINDS = "docvault.autofill.kinds"
  }

  @Suppress("DEPRECATION")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    val ids = intent.getParcelableArrayExtra(EXTRA_IDS)?.filterIsInstance<AutofillId>()
    val kinds = intent.getStringArrayExtra(EXTRA_KINDS)
    if (ids == null || kinds == null || ids.size != kinds.size) return cancel()

    val unlock = BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    // A phone with no screen lock is already open to whoever holds it, same as the app itself.
    if (BiometricManager.from(this).canAuthenticate(unlock) != BiometricManager.BIOMETRIC_SUCCESS) return respond(ids, kinds)

    val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = respond(ids, kinds)
      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = cancel()
    })
    if (savedInstanceState == null) {
      prompt.authenticate(
        BiometricPrompt.PromptInfo.Builder()
          .setTitle("Fill from DocVault")
          .setSubtitle("Unlock to fill your saved details")
          .setAllowedAuthenticators(unlock)
          .build()
      )
    }
  }

  private fun cancel() {
    setResult(RESULT_CANCELED)
    finish()
  }

  @Suppress("DEPRECATION")
  private fun respond(ids: List<AutofillId>, kinds: Array<String>) {
    val profiles = runCatching { AutofillStore.read(this) }.getOrDefault(emptyList())
    val response = FillResponse.Builder()
    var offered = 0
    for (p in profiles) {
      val fills = ids.indices.mapNotNull { i -> p.values[kinds[i]]?.takeIf { it.isNotBlank() }?.let { i to it } }
      if (fills.isEmpty()) continue
      val what = fills.map { LABELS[kinds[it.first]] ?: kinds[it.first] }.distinct().joinToString(", ")
      val dataset = Dataset.Builder(row(this, "${p.name} · $what"))
      fills.forEach { (i, value) -> dataset.setValue(ids[i], AutofillValue.forText(value)) }
      response.addDataset(dataset.build())
      offered++
    }
    if (offered == 0) {
      Toast.makeText(this, "Nothing saved in DocVault for these fields yet", Toast.LENGTH_SHORT).show()
      return cancel()
    }
    setResult(RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response.build()))
    finish()
  }
}
