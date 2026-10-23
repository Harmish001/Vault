package expo.modules.foldershortcuts

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.PersistableBundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class FolderShortcut : Record {
  @Field val id: String = ""
  @Field val label: String = ""
  @Field val color: String = "#000000"
  @Field val url: String = ""
}

// Static launcher shortcuts the user drags to the home screen are pinned too, so only touch ids we made.
private const val PREFIX = "folder-"

// Everything below runs only once `manager` is non-null, which means API 26+.
@SuppressLint("NewApi")
class FolderShortcutsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val manager: ShortcutManager?
    get() = if (Build.VERSION.SDK_INT >= 26) context.getSystemService(ShortcutManager::class.java) else null

  override fun definition() = ModuleDefinition {
    Name("FolderShortcuts")

    Function("isSupported") {
      manager?.isRequestPinShortcutSupported == true
    }

    Function("pin") { s: FolderShortcut ->
      val m = manager ?: return@Function false
      m.isRequestPinShortcutSupported && m.requestPinShortcut(build(s), null)
    }

    /** Relabels pinned folder shortcuts after a rename or recolor, and greys out those whose folder is gone. */
    Function("sync") { folders: List<FolderShortcut> ->
      val m = manager ?: return@Function
      val byId = folders.associateBy { PREFIX + it.id }
      val pinned = m.pinnedShortcuts.filter { it.id.startsWith(PREFIX) }

      val gone = pinned.filter { it.isEnabled && it.id !in byId }.map { it.id }
      if (gone.isNotEmpty()) m.disableShortcuts(gone, "This folder is no longer in DocVault")

      val stale = pinned.mapNotNull { p ->
        byId[p.id]?.takeIf { s ->
          !p.isEnabled || p.shortLabel?.toString() != s.label || p.extras?.getString("color") != s.color
        }
      }
      if (stale.isNotEmpty()) {
        m.enableShortcuts(stale.map { PREFIX + it.id })
        m.updateShortcuts(stale.map { build(it) })
      }
    }
  }

  private fun build(s: FolderShortcut): ShortcutInfo {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(s.url)).setPackage(context.packageName)
    return ShortcutInfo.Builder(context, PREFIX + s.id)
      .setShortLabel(s.label)
      .setLongLabel(s.label)
      .setIcon(icon(s.label, s.color))
      .setIntent(intent)
      .setExtras(PersistableBundle().apply { putString("color", s.color) })
      .build()
  }

  /** Folder color with the folder's first letter, drawn inside the adaptive icon's safe zone. */
  private fun icon(label: String, color: String): Icon {
    val size = 216
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(runCatching { Color.parseColor(color) }.getOrDefault(Color.DKGRAY))
    val name = label.trim()
    val letter = if (name.isEmpty()) "?" else String(Character.toChars(name.codePointAt(0))).uppercase()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = Color.WHITE
      textSize = 80f
      typeface = Typeface.DEFAULT_BOLD
      textAlign = Paint.Align.CENTER
    }
    canvas.drawText(letter, size / 2f, size / 2f - (paint.descent() + paint.ascent()) / 2, paint)
    return Icon.createWithAdaptiveBitmap(bmp)
  }
}
