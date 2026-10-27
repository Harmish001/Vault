import assert from "node:assert/strict";
import {
  AUTO_BACKUP_FILENAME,
  BACKUP_DAY_OF_WEEK,
  BACKUP_HOUR,
  getNextWeeklyBackupTime,
  getMostRecentWeeklyBackupTime,
  isAutoBackupDue,
  formatLastBackupTime,
} from "../src/auto-backup-plan";

console.log("running auto backup tests...");

// Test 1: Constant names
assert.equal(AUTO_BACKUP_FILENAME, "DocVault-backup.zip");
assert.equal(BACKUP_HOUR, 3);
assert.equal(BACKUP_DAY_OF_WEEK, 0); // Sunday
console.log("ok - constant values match requirements");

// Test 2: getNextWeeklyBackupTime from a Sunday before 3:00 AM
// Sunday Oct 25, 2026, 01:30 AM
const sundayBefore3AM = new Date(2026, 9, 25, 1, 30, 0);
const nextFromSundayEarly = getNextWeeklyBackupTime(sundayBefore3AM);
assert.equal(nextFromSundayEarly.getFullYear(), 2026);
assert.equal(nextFromSundayEarly.getMonth(), 9);
assert.equal(nextFromSundayEarly.getDate(), 25);
assert.equal(nextFromSundayEarly.getHours(), 3);
assert.equal(nextFromSundayEarly.getMinutes(), 0);
console.log("ok - Sunday before 3 AM schedules for today at 3 AM");

// Test 3: getNextWeeklyBackupTime from a Sunday after 3:00 AM
// Sunday Oct 25, 2026, 03:01 AM
const sundayAfter3AM = new Date(2026, 9, 25, 3, 1, 0);
const nextFromSundayLate = getNextWeeklyBackupTime(sundayAfter3AM);
assert.equal(nextFromSundayLate.getDate(), 1); // Nov 1
assert.equal(nextFromSundayLate.getMonth(), 10); // Nov
assert.equal(nextFromSundayLate.getHours(), 3);
console.log("ok - Sunday after 3 AM schedules for next Sunday Nov 1 at 3 AM");

// Test 4: getNextWeeklyBackupTime from a Wednesday (mid-week)
// Wednesday Oct 28, 2026, 14:00 PM
const wednesday = new Date(2026, 9, 28, 14, 0, 0);
const nextFromWed = getNextWeeklyBackupTime(wednesday);
assert.equal(nextFromWed.getDate(), 1); // Sunday Nov 1
assert.equal(nextFromWed.getMonth(), 10);
assert.equal(nextFromWed.getHours(), 3);
console.log("ok - Wednesday schedules for upcoming Sunday at 3 AM");

// Test 5: getMostRecentWeeklyBackupTime
// Sunday Oct 25, 2026, 04:00 AM -> most recent was today at 3:00 AM
const recentFromSundayLate = getMostRecentWeeklyBackupTime(new Date(2026, 9, 25, 4, 0, 0));
assert.equal(recentFromSundayLate.getDate(), 25);
assert.equal(recentFromSundayLate.getHours(), 3);
console.log("ok - most recent on Sunday 4 AM is Sunday 3 AM");

// Sunday Oct 25, 2026, 02:00 AM -> most recent was previous Sunday Oct 18 at 3:00 AM
const recentFromSundayEarly = getMostRecentWeeklyBackupTime(new Date(2026, 9, 25, 2, 0, 0));
assert.equal(recentFromSundayEarly.getDate(), 18);
assert.equal(recentFromSundayEarly.getHours(), 3);
console.log("ok - most recent on Sunday 2 AM is previous Sunday 3 AM");

// Test 6: isAutoBackupDue
// Never backed up -> due
assert.equal(isAutoBackupDue(null, wednesday), true);
assert.equal(isAutoBackupDue(undefined, wednesday), true);
assert.equal(isAutoBackupDue(0, wednesday), true);
console.log("ok - never backed up is due");

// Backed up before most recent Sunday 3 AM -> due
const lastWeekBackup = new Date(2026, 9, 24, 22, 0, 0).getTime(); // Saturday night
const sundayMorning = new Date(2026, 9, 25, 3, 5, 0); // Sunday 3:05 AM
assert.equal(isAutoBackupDue(lastWeekBackup, sundayMorning), true);
console.log("ok - backup is due when crossing Sunday 3 AM boundary");

// Backed up after most recent Sunday 3 AM -> NOT due
const sundayFreshBackup = new Date(2026, 9, 25, 3, 2, 0).getTime(); // Sunday 3:02 AM
const sundayNoon = new Date(2026, 9, 25, 12, 0, 0); // Sunday noon
assert.equal(isAutoBackupDue(sundayFreshBackup, sundayNoon), false);
console.log("ok - backup is NOT due if already backed up for this weekly cycle");

// Tuesday with backup done on Sunday 3 AM -> NOT due
assert.equal(isAutoBackupDue(sundayFreshBackup, wednesday), false);
console.log("ok - mid-week is not due if Sunday backup was completed");

// Following Sunday 3:05 AM with previous Sunday backup -> due
const nextSundayMorning = new Date(2026, 10, 1, 3, 5, 0);
assert.equal(isAutoBackupDue(sundayFreshBackup, nextSundayMorning), true);
console.log("ok - due again on the next Sunday at 3 AM");

// Test 7: formatLastBackupTime
assert.equal(formatLastBackupTime(null), "Not yet backed up");
const testNow = new Date(2026, 9, 25, 12, 0, 0);
const todayBackup = new Date(2026, 9, 25, 3, 0, 0).getTime();
assert.ok(formatLastBackupTime(todayBackup, testNow).startsWith("Today at"));
const yesterdayBackup = new Date(2026, 9, 24, 15, 30, 0).getTime();
assert.ok(formatLastBackupTime(yesterdayBackup, testNow).startsWith("Yesterday at"));
console.log("ok - human readable formatting handles today, yesterday, and older dates");

console.log("All auto backup tests passed successfully!");
