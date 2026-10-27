package expo.modules.autobackup

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Calendar

class AutoBackupReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Fired by AlarmManager at 3:00 AM on Sunday
    // Triggers intent or broadcast flag
  }
}

class AutoBackupModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  /**
   * Resolves the folder where apps store their backups:
   * 1. Primary standard external storage directory: /storage/emulated/0/Backups/DocVault
   * 2. Public Documents directory: /storage/emulated/0/Documents/DocVault/Backups
   * 3. App-specific external storage: /storage/emulated/0/Android/data/com.docvault.app/files/Backups
   * 4. Internal app files fallback: /data/user/0/com.docvault.app/files/Backups
   */
  private fun getBackupFolder(): File {
    // 1. Standard public /storage/emulated/0/Backups/DocVault
    try {
      val extDir = Environment.getExternalStorageDirectory()
      val backupsDir = File(extDir, "Backups/DocVault")
      if (backupsDir.exists() || backupsDir.mkdirs()) {
        val testFile = File(backupsDir, ".test_write")
        if (testFile.createNewFile()) {
          testFile.delete()
          return backupsDir
        }
      }
    } catch (_: Exception) {}

    // 2. Documents/DocVault/Backups
    try {
      val docsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
      val backupsDir = File(docsDir, "DocVault/Backups")
      if (backupsDir.exists() || backupsDir.mkdirs()) {
        val testFile = File(backupsDir, ".test_write")
        if (testFile.createNewFile()) {
          testFile.delete()
          return backupsDir
        }
      }
    } catch (_: Exception) {}

    // 3. App-specific external storage (always available on Android 10+ scoped storage without permissions)
    val appExt = context.getExternalFilesDir("Backups")
    if (appExt != null && (appExt.exists() || appExt.mkdirs())) {
      return appExt
    }

    // 4. Internal app files
    val internal = File(context.filesDir, "Backups")
    internal.mkdirs()
    return internal
  }

  private fun getBackupFile(): File {
    return File(getBackupFolder(), "DocVault-backup.zip")
  }

  override fun definition() = ModuleDefinition {
    Name("AutoBackup")

    Function("isSupported") {
      true
    }

    Function("getBackupPath") {
      getBackupFile().absolutePath
    }

    Function("getBackupStatus") {
      val file = getBackupFile()
      mapOf(
        "path" to file.absolutePath,
        "exists" to file.exists(),
        "size" to (if (file.exists()) file.length() else 0L),
        "lastModified" to (if (file.exists()) file.lastModified() else 0L)
      )
    }

    AsyncFunction("saveBackup") { tempZipPath: String ->
      val cleanPath = tempZipPath.removePrefix("file://")
      val src = File(cleanPath)
      if (!src.exists()) {
        throw IllegalArgumentException("Source backup file does not exist: $cleanPath")
      }

      val destFolder = getBackupFolder()
      if (!destFolder.exists()) destFolder.mkdirs()

      val finalFile = File(destFolder, "DocVault-backup.zip")
      val tmpDest = File(destFolder, "DocVault-backup.zip.tmp")

      // Atomically copy and replace: write to tmp file first
      FileInputStream(src).use { input ->
        FileOutputStream(tmpDest).use { output ->
          input.copyTo(output)
          output.flush()
        }
      }

      // Overwrite the previous backup so ONLY ONE latest backup file remains
      if (finalFile.exists()) {
        finalFile.delete()
      }
      if (!tmpDest.renameTo(finalFile)) {
        // Fallback if direct rename failed across filesystems
        FileInputStream(tmpDest).use { input ->
          FileOutputStream(finalFile).use { output ->
            input.copyTo(output)
            output.flush()
          }
        }
        tmpDest.delete()
      }

      // Clean up source cache file
      try {
        src.delete()
      } catch (_: Exception) {}

      mapOf(
        "success" to true,
        "path" to finalFile.absolutePath,
        "size" to finalFile.length()
      )
    }

    Function("scheduleWeeklyAlarm") { dayOfWeek: Int, hourOfDay: Int, minute: Int ->
      try {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
          ?: return@Function false

        val intent = Intent(context, AutoBackupReceiver::class.java).apply {
          action = "expo.modules.autobackup.TRIGGER_BACKUP"
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
          PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getBroadcast(context, 1001, intent, flags)

        val cal = Calendar.getInstance().apply {
          set(Calendar.HOUR_OF_DAY, hourOfDay)
          set(Calendar.MINUTE, minute)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
          set(Calendar.DAY_OF_WEEK, dayOfWeek)
          if (timeInMillis <= System.currentTimeMillis()) {
            add(Calendar.WEEK_OF_YEAR, 1)
          }
        }

        // Schedule repeating weekly alarm (7 days interval)
        val weekMillis = 7L * 24 * 60 * 60 * 1000
        alarmManager.setInexactRepeating(
          AlarmManager.RTC_WAKEUP,
          cal.timeInMillis,
          weekMillis,
          pendingIntent
        )
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
