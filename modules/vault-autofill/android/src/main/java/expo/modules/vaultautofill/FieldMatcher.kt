package expo.modules.vaultautofill

import android.app.assist.AssistStructure
import android.os.Build
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId
import androidx.annotation.RequiresApi

internal class Match(val id: AutofillId, val kind: String)

/** Recognises form fields DocVault can fill from their hints, ids, labels and HTML attributes. */
@RequiresApi(Build.VERSION_CODES.O)
internal object FieldMatcher {
  // First match wins, so document names come before generic words like "name" or "number".
  private val RULES = listOf(
    "aadhaar" to Regex("aa?dh?aa?r|uidai"),
    "pan" to Regex("\\bpan( ?(no|num|number|card))?\\b|pancard|pannumber|panno"),
    "passport" to Regex("passport"),
    "licence" to Regex("licen[cs]e|driving|\\bdl ?(no|number)?\\b"),
    "voter" to Regex("voter|\\bepic\\b"),
    "vehicle" to Regex("vehicle|\\brc ?(no|number)\\b|registration ?(no|number)|\\breg ?no\\b"),
    "dob" to Regex("birth|\\bdob\\b|\\bbday\\b"),
    "email" to Regex("e ?mail"),
    "phone" to Regex("phone|mobile|\\btel\\b|whatsapp|contact ?(no|number)"),
    "pincode" to Regex("pin ?code|postal ?code|post ?code|\\bzip\\b"),
    "address" to Regex("address|street|\\baddr\\b|locality"),
    "name" to Regex("\\bname\\b|fullname|\\bperson name\\b"),
  )

  // Logins, payments and other people's details: never offer anything here.
  private val SKIP = Regex(
    "password|passcode|\\bpin\\b(?! code)|\\botp\\b|\\bcvv\\b|captcha|credit|debit|\\bexpiry\\b|user ?name|login|" +
      "search|coupon|promo|\\bfirst\\b|\\blast\\b|\\bmiddle\\b|father|mother|spouse|husband|wife|nominee|guardian|company|employer"
  )

  private val HTML_ATTRS = setOf("name", "id", "placeholder", "autocomplete", "label", "aria-label")

  fun find(structure: AssistStructure): List<Match> {
    val out = mutableListOf<Match>()
    for (i in 0 until structure.windowNodeCount) walk(structure.getWindowNodeAt(i).rootViewNode, out)
    return out.distinctBy { it.id }
  }

  private fun walk(node: AssistStructure.ViewNode, out: MutableList<Match>) {
    val id = node.autofillId
    if (id != null && node.autofillType == View.AUTOFILL_TYPE_TEXT && node.visibility == View.VISIBLE && !isSecret(node)) {
      kindOf(signature(node))?.let { out.add(Match(id, it)) }
    }
    for (i in 0 until node.childCount) walk(node.getChildAt(i), out)
  }

  private fun kindOf(sig: String): String? {
    if (sig.isBlank() || SKIP.containsMatchIn(sig)) return null
    return RULES.firstOrNull { it.second.containsMatchIn(sig) }?.first
  }

  private fun signature(node: AssistStructure.ViewNode): String {
    val parts = mutableListOf<String?>()
    node.autofillHints?.let { parts.addAll(it) }
    parts += node.hint
    parts += node.idEntry
    parts += node.contentDescription?.toString()
    node.htmlInfo?.attributes?.forEach { if (it.first in HTML_ATTRS) parts += it.second }
    return parts.filterNotNull().joinToString(" ") { normalize(it) }
  }

  /** "panNumber", "pan_no" and "PAN No." all become "pan number" / "pan no". */
  private fun normalize(s: String) =
    s.replace(Regex("([a-z])([A-Z])"), "$1 $2").lowercase().replace(Regex("[^a-z0-9]+"), " ").trim()

  private fun isSecret(node: AssistStructure.ViewNode): Boolean {
    if (node.htmlInfo?.attributes?.any { it.first == "type" && it.second == "password" } == true) return true
    val t = node.inputType
    val variation = t and InputType.TYPE_MASK_VARIATION
    return when (t and InputType.TYPE_MASK_CLASS) {
      InputType.TYPE_CLASS_TEXT -> variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
        variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
      InputType.TYPE_CLASS_NUMBER -> variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
      else -> false
    }
  }
}
