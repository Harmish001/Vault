package expo.modules.lockscreencard

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.media.ExifInterface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.DisplayMetrics
import android.view.WindowManager
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream

class CardLine : Record {
  @Field val label: String = ""
  @Field val value: String = ""
}

class Card : Record {
  @Field val name: String = ""
  @Field val lines: List<CardLine> = emptyList()
  @Field val footer: String = ""
  @Field val color: String = "#7A1F35"
  /** optional background photo, a file path inside the app */
  @Field val photo: String? = null
  @Field val qrPayload: String = ""
  @Field val primaryContact: String = ""
}

class LockScreenCardModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("LockScreenCard")

    Function("isSupported") {
      val wm = WallpaperManager.getInstance(context)
      wm.isWallpaperSupported && wm.isSetWallpaperAllowed
    }

    /** Half-size render for the in-app preview; returns a file:// uri. */
    AsyncFunction("preview") { card: Card ->
      val (w, h) = screen()
      val bmp = render(card, w / 2, h / 2)
      val out = File(context.cacheDir, "lock-card-preview-${System.currentTimeMillis()}.png")
      context.cacheDir.listFiles { f -> f.name.startsWith("lock-card-preview-") }?.forEach { it.delete() }
      FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
      "file://" + out.absolutePath
    }

    /** Sets the card as the lock-screen wallpaper only; the home screen keeps its own. */
    AsyncFunction("apply") { card: Card ->
      val (w, h) = screen()
      WallpaperManager.getInstance(context).setBitmap(render(card, w, h), null, true, WallpaperManager.FLAG_LOCK)
    }

    /** Lock screen falls back to the home-screen wallpaper. */
    AsyncFunction("remove") {
      WallpaperManager.getInstance(context).clear(WallpaperManager.FLAG_LOCK)
    }
  }

  @Suppress("DEPRECATION")
  private fun screen(): Pair<Int, Int> {
    val dm = DisplayMetrics()
    context.getSystemService(WindowManager::class.java).defaultDisplay.getRealMetrics(dm)
    return minOf(dm.widthPixels, dm.heightPixels) to maxOf(dm.widthPixels, dm.heightPixels)
  }

  private fun getSystemWallpaper(w: Int, h: Int): Bitmap? {
    return runCatching {
      val wm = WallpaperManager.getInstance(context)
      val drawable = wm.drawable ?: return@runCatching null
      val dw = drawable.intrinsicWidth.takeIf { it > 0 } ?: w
      val dh = drawable.intrinsicHeight.takeIf { it > 0 } ?: h
      val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bmp)
      val scale = maxOf(w / dw.toFloat(), h / dh.toFloat())
      val ox = (w - dw * scale) / 2f
      val oy = (h - dh * scale) / 2f
      canvas.save()
      canvas.translate(ox, oy)
      canvas.scale(scale, scale)
      drawable.setBounds(0, 0, dw, dh)
      drawable.draw(canvas)
      canvas.restore()
      bmp
    }.getOrNull()
  }

  private fun generateQrBitmap(content: String, size: Int): Bitmap? {
    if (content.isBlank() || size <= 0) return null
    return runCatching {
      val hints = hashMapOf<EncodeHintType, Any>(
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        EncodeHintType.MARGIN to 1,
        EncodeHintType.CHARACTER_SET to "UTF-8"
      )
      val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
      val mw = matrix.width
      val mh = matrix.height
      val pixels = IntArray(mw * mh)
      for (y in 0 until mh) {
        val offset = y * mw
        for (x in 0 until mw) {
          pixels[offset + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
        }
      }
      val bmp = Bitmap.createBitmap(mw, mh, Bitmap.Config.ARGB_8888)
      bmp.setPixels(pixels, 0, mw, 0, 0, mw, mh)
      bmp
    }.getOrNull()
  }

  private fun buildFallbackQrText(card: Card): String {
    val b = StringBuilder()
    if (card.name.isNotBlank()) b.append("EMERGENCY INFO\nName: ").append(card.name).append("\n\n")
    if (card.lines.isNotEmpty()) {
      b.append("Emergency Contacts & Details:\n")
      for (l in card.lines) {
        if (l.value.isNotBlank()) {
          b.append("• ").append(l.label).append(": ").append(l.value).append("\n")
        }
      }
      b.append("\n")
    }
    if (card.footer.isNotBlank()) b.append("Note: ").append(card.footer)
    return b.toString().trim()
  }

  private fun render(card: Card, w: Int, h: Int): Bitmap {
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val accent = runCatching { Color.parseColor(card.color) }.getOrDefault(Color.rgb(122, 31, 53))

    // Preserve the user's existing wallpaper and draw the card on top of it
    val photo = card.photo?.let { runCatching { loadPhoto(it, w, h) }.getOrNull() } ?: getSystemWallpaper(w, h)
    if (photo != null) {
      val scale = maxOf(w / photo.width.toFloat(), h / photo.height.toFloat())
      val m = Matrix().apply {
        setScale(scale, scale)
        postTranslate((w - photo.width * scale) / 2f, (h - photo.height * scale) / 2f)
      }
      canvas.drawBitmap(photo, m, Paint(Paint.FILTER_BITMAP_FLAG))
      canvas.drawColor(Color.argb(50, 0, 0, 0))
    } else {
      val dark = Color.rgb(Color.red(accent) / 3, Color.green(accent) / 3, Color.blue(accent) / 3)
      canvas.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, 0f, h.toFloat(), accent, dark, Shader.TileMode.CLAMP) })
    }

    // Sizes scale with the screen width so the card looks the same on every phone.
    val u = w / 100f
    val margin = 7 * u
    val pad = 4.5f * u
    val inner = (w - 2 * margin - 2 * pad).toInt()

    fun text(size: Float, color: Int, bold: Boolean = false, spacing: Float = 0f) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size * u
      this.color = color
      typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
      letterSpacing = spacing
    }
    fun layout(s: String, p: TextPaint, maxLines: Int = 3, align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL) =
      StaticLayout.Builder.obtain(s, 0, s.length, p, inner).setAlignment(align)
        .setMaxLines(maxLines).setEllipsize(android.text.TextUtils.TruncateAt.END).build()

    val ink = Color.rgb(28, 28, 30)
    val muted = Color.rgb(110, 110, 118)
    val qrContent = card.qrPayload.takeIf { it.isNotBlank() } ?: buildFallbackQrText(card)
    val qrBmp = generateQrBitmap(qrContent, 512)

    val header = layout("IN CASE OF EMERGENCY", text(3.2f, Color.WHITE, bold = true, spacing = 0.08f), 1, Layout.Alignment.ALIGN_CENTER)
    val headerH = header.height + 2 * (2.4f * u)
    val gap = 2.0f * u

    if (qrBmp != null) {
      val name = card.name.takeIf { it.isNotBlank() }?.let { layout(it, text(4.6f, ink, bold = true), 1, Layout.Alignment.ALIGN_CENTER) }
      val sub = layout("Scan QR with camera for emergency info", text(2.7f, muted), 2, Layout.Alignment.ALIGN_CENTER)

      val qrSize = minOf(inner.toFloat() * 0.72f, 50 * u)
      val primary = card.primaryContact.takeIf { it.isNotBlank() }
        ?: card.lines.firstOrNull { it.label.startsWith("Call", ignoreCase = true) }?.let { "${it.label}: ${it.value}" }
      val primaryLayout = primary?.let { layout("📞 $it", text(3.0f, ink, bold = true), 1, Layout.Alignment.ALIGN_CENTER) }
      val footer = card.footer.takeIf { it.isNotBlank() }?.let { layout(it, text(2.6f, muted), 2, Layout.Alignment.ALIGN_CENTER) }

      var bodyH = pad
      name?.let { bodyH += it.height + gap * 0.8f }
      bodyH += sub.height + gap
      bodyH += qrSize + (2.5f * u) + gap
      primaryLayout?.let { bodyH += it.height + gap }
      footer?.let { bodyH += it.height + gap }
      bodyH += pad - gap
      val cardH = headerH + bodyH

      val top = maxOf(h * 0.26f, minOf(h * 0.46f, h * 0.86f - cardH))
      val rect = RectF(margin, top, w - margin, top + cardH)
      val radius = 4.5f * u

      canvas.drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(245, 255, 255, 255) })
      canvas.save()
      canvas.clipRect(rect.left, rect.top, rect.right, rect.top + headerH)
      canvas.drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent })
      canvas.restore()

      var y = top + 2.4f * u
      fun draw(l: StaticLayout) {
        canvas.save()
        canvas.translate(margin + pad, y)
        l.draw(canvas)
        canvas.restore()
        y += l.height
      }

      draw(header)
      y = top + headerH + pad
      name?.let { draw(it); y += gap * 0.8f }
      draw(sub); y += gap

      // Draw QR Box container
      val qrPad = 1.2f * u
      val qrLeft = margin + pad + (inner - qrSize) / 2f
      val qrBox = RectF(qrLeft - qrPad, y - qrPad, qrLeft + qrSize + qrPad, y + qrSize + qrPad)
      canvas.drawRoundRect(qrBox, 2.5f * u, 2.5f * u, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
      canvas.drawRoundRect(qrBox, 2.5f * u, 2.5f * u, Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(35, 0, 0, 0)
        style = Paint.Style.STROKE
        strokeWidth = 1f * u
      })
      canvas.drawBitmap(qrBmp, null, RectF(qrLeft, y, qrLeft + qrSize, y + qrSize), Paint(Paint.FILTER_BITMAP_FLAG))
      y += qrSize + (2.5f * u) + gap

      primaryLayout?.let { draw(it); y += gap }
      footer?.let { draw(it) }
      return bmp
    }

    // Fallback text rendering if QR code generation is unavailable
    val name = card.name.takeIf { it.isNotBlank() }?.let { layout(it, text(6.2f, ink, bold = true), 2) }
    val rows = card.lines.filter { it.value.isNotBlank() }.map {
      layout(it.label.uppercase(), text(2.9f, muted, spacing = 0.06f), 1) to layout(it.value, text(4.6f, ink, bold = true))
    }
    val footer = card.footer.takeIf { it.isNotBlank() }?.let { layout(it, text(3.3f, muted)) }

    val headerHText = header.height + 2 * (2.6f * u)
    val gapText = 2.6f * u
    var bodyH = pad
    name?.let { bodyH += it.height + gapText }
    rows.forEach { (l, v) -> bodyH += l.height + 0.6f * u + v.height + gapText }
    footer?.let { bodyH += it.height + gapText }
    bodyH += pad - gapText
    val cardH = headerHText + bodyH

    val top = maxOf(h * 0.30f, minOf(h * 0.50f, h * 0.86f - cardH))
    val rect = RectF(margin, top, w - margin, top + cardH)
    val radius = 4.5f * u
    canvas.drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(240, 255, 255, 255) })
    canvas.save()
    canvas.clipRect(rect.left, rect.top, rect.right, rect.top + headerHText)
    canvas.drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent })
    canvas.restore()

    var y = top + 2.6f * u
    fun draw(l: StaticLayout) {
      canvas.save()
      canvas.translate(margin + pad, y)
      l.draw(canvas)
      canvas.restore()
      y += l.height
    }
    draw(header)
    y = top + headerHText + pad
    name?.let { draw(it); y += gapText }
    rows.forEach { (l, v) -> draw(l); y += 0.6f * u; draw(v); y += gapText }
    footer?.let { draw(it) }
    return bmp
  }

  private fun loadPhoto(path: String, w: Int, h: Int): Bitmap? {
    val clean = path.removePrefix("file://")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(clean, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= w && bounds.outHeight / (sample * 2) >= h) sample *= 2
    val raw = BitmapFactory.decodeFile(clean, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val degrees = when (ExifInterface(clean).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
    if (degrees == 0f) return raw
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(degrees) }, true)
  }
}
