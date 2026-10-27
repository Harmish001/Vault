import { requireOptionalNativeModule } from "expo";
import * as FileSystem from "expo-file-system/legacy";
import { AUTO_BACKUP_FILENAME } from "./auto-backup-plan";

type NativeAutoBackup = {
  isSupported(): boolean;
  getBackupPath(): string;
  getBackupStatus(): {
    path: string;
    exists: boolean;
    size: number;
    lastModified: number;
  };
  saveBackup(tempZipPath: string): Promise<{
    success: boolean;
    path: string;
    size: number;
  }>;
  scheduleWeeklyAlarm(dayOfWeek: Int32Array | number, hourOfDay: number, minute: number): boolean;
};

const native = requireOptionalNativeModule<NativeAutoBackup>("AutoBackup");

const FALLBACK_DIR = (FileSystem.documentDirectory ?? "") + "backups/";
const FALLBACK_PATH = FALLBACK_DIR + AUTO_BACKUP_FILENAME;

/**
 * Returns the resolved path where auto-backups are stored.
 * On Android, this defaults to the standard /storage/emulated/0/Backups/DocVault/DocVault-backup.zip
 * or /storage/emulated/0/Android/data/com.docvault.app/files/Backups/DocVault-backup.zip.
 */
export async function getAutoBackupPath(): Promise<string> {
  if (native?.isSupported()) {
    try {
      return native.getBackupPath();
    } catch {
      // fallback below
    }
  }
  return FALLBACK_PATH;
}

/**
 * Checks the status of the latest auto-backup file.
 */
export async function getAutoBackupStatus(): Promise<{
  path: string;
  exists: boolean;
  size: number;
  lastModified: number;
}> {
  if (native?.isSupported()) {
    try {
      return native.getBackupStatus();
    } catch {
      // fallback below
    }
  }

  const info = await FileSystem.getInfoAsync(FALLBACK_PATH).catch(() => ({ exists: false } as FileSystem.FileInfo));
  return {
    path: FALLBACK_PATH,
    exists: info.exists,
    size: info.exists && "size" in info ? info.size : 0,
    lastModified: info.exists && "modificationTime" in info ? Math.round((info.modificationTime ?? 0) * 1000) : 0,
  };
}

/**
 * Atomically saves the temporary zip archive to the auto-backup destination,
 * overwriting any previous backup so only ONE latest backup file remains.
 */
export async function saveAutoBackup(tempZipPath: string): Promise<{
  success: boolean;
  path: string;
  size: number;
}> {
  if (native?.isSupported()) {
    try {
      return await native.saveBackup(tempZipPath);
    } catch (e) {
      console.warn("[auto-backup] native save failed, using fallback:", e);
    }
  }

  // Fallback using FileSystem
  await FileSystem.makeDirectoryAsync(FALLBACK_DIR, { intermediates: true });
  await FileSystem.deleteAsync(FALLBACK_PATH, { idempotent: true });
  await FileSystem.copyAsync({ from: tempZipPath, to: FALLBACK_PATH });
  await FileSystem.deleteAsync(tempZipPath, { idempotent: true });

  const info = await FileSystem.getInfoAsync(FALLBACK_PATH);
  return {
    success: true,
    path: FALLBACK_PATH,
    size: info.exists && "size" in info ? info.size : 0,
  };
}

/**
 * Registers a weekly alarm with Android's AlarmManager for Sunday at 3:00 AM.
 */
export function scheduleWeeklyAutoBackupAlarm(): boolean {
  if (native?.isSupported()) {
    try {
      // Calendar.SUNDAY is 1 in Java Calendar
      return native.scheduleWeeklyAlarm(1, 3, 0);
    } catch {
      return false;
    }
  }
  return false;
}
