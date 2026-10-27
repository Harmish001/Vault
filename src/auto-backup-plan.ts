/**
 * Pure planning and scheduling functions for weekly auto-backup at 3:00 AM.
 * Pure functions so they can be 100% tested with pure Node.js in test-auto-backup.ts.
 */

export const AUTO_BACKUP_FILENAME = "DocVault-backup.zip";
export const BACKUP_HOUR = 3; // 3:00 AM
export const BACKUP_MINUTE = 0;
export const BACKUP_DAY_OF_WEEK = 0; // 0 = Sunday

/**
 * Calculates the next upcoming Sunday at 3:00 AM from a given reference date.
 * If the reference date is Sunday before 3:00 AM, returns today at 3:00 AM.
 * If the reference date is Sunday after 3:00 AM, returns next Sunday at 3:00 AM.
 */
export function getNextWeeklyBackupTime(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  const day = d.getDay();
  const currentHour = d.getHours();
  const currentMinute = d.getMinutes();
  const currentSecond = d.getSeconds();
  const currentMs = d.getMilliseconds();

  let daysUntilSunday = (7 - day) % 7;

  // If today is Sunday, check if 3:00:00 AM has already passed
  if (day === BACKUP_DAY_OF_WEEK) {
    const passed3AM =
      currentHour > BACKUP_HOUR ||
      (currentHour === BACKUP_HOUR &&
        (currentMinute > BACKUP_MINUTE || currentSecond > 0 || currentMs > 0));
    if (passed3AM) {
      daysUntilSunday = 7;
    } else {
      daysUntilSunday = 0;
    }
  }

  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilSunday, BACKUP_HOUR, BACKUP_MINUTE, 0, 0);
  return target;
}

/**
 * Calculates the most recent Sunday 3:00 AM checkpoint that has already occurred on or before `now`.
 */
export function getMostRecentWeeklyBackupTime(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  const day = d.getDay();
  const currentHour = d.getHours();
  const currentMinute = d.getMinutes();
  const currentSecond = d.getSeconds();
  const currentMs = d.getMilliseconds();

  let daysBackToSunday = day; // Sunday is 0

  if (day === BACKUP_DAY_OF_WEEK) {
    const passed3AM =
      currentHour > BACKUP_HOUR ||
      (currentHour === BACKUP_HOUR &&
        (currentMinute > BACKUP_MINUTE || currentSecond > 0 || currentMs > 0));
    if (!passed3AM) {
      // 3:00 AM today hasn't happened yet, so the most recent was last Sunday
      daysBackToSunday = 7;
    } else {
      daysBackToSunday = 0;
    }
  }

  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBackToSunday, BACKUP_HOUR, BACKUP_MINUTE, 0, 0);
  return target;
}

/**
 * Returns true if a backup is due:
 * - If never backed up (`lastBackupTime == null`), returns true.
 * - If the last backup happened before the most recent Sunday 3:00 AM checkpoint, returns true.
 * - Otherwise (already backed up during or after the most recent 3:00 AM checkpoint), returns false.
 */
export function isAutoBackupDue(lastBackupTime: number | null | undefined, now: Date = new Date()): boolean {
  if (lastBackupTime == null || isNaN(lastBackupTime) || lastBackupTime <= 0) {
    return true;
  }
  const mostRecentCheckpoint = getMostRecentWeeklyBackupTime(now);
  return lastBackupTime < mostRecentCheckpoint.getTime();
}

/**
 * Returns a human-readable label for when the last backup occurred.
 */
export function formatLastBackupTime(timestamp: number | null | undefined, now: Date = new Date()): string {
  if (!timestamp) return "Not yet backed up";
  const date = new Date(timestamp);
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isSameDay) {
    return `Today at ${timeStr}`;
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} at ${timeStr}`;
}
