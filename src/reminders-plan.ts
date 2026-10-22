import { parseISODate } from "./utils";

export type ReminderEntry = {
  id: string;
  name: string;
  folderId: string;
  folderLabel: string;
  expiresOn: string; // YYYY-MM-DD
};

export type PlannedReminder = {
  fileId: string;
  folderId: string;
  name: string;
  folderLabel: string;
  offset: number; // days before expiry
  fireAt: Date; // local 9:00 AM
};

export const REMINDER_HOUR = 9;

/** Decides which notifications should exist. Pure, so it can be tested without a phone. */
export function planReminders(
  entries: ReminderEntry[],
  offsets: number[],
  now: Date = new Date(),
  cap = 100
): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const uniq = Array.from(new Set(offsets));
  for (const e of entries) {
    const exp = parseISODate(e.expiresOn);
    if (isNaN(exp.getTime())) continue;
    for (const offset of uniq) {
      const fireAt = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate() - offset, REMINDER_HOUR, 0, 0);
      if (fireAt.getTime() > now.getTime() + 60_000) {
        out.push({ fileId: e.id, folderId: e.folderId, name: e.name, folderLabel: e.folderLabel, offset, fireAt });
      }
    }
  }
  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, cap); // soonest first; the rest are scheduled on a later app start
}
