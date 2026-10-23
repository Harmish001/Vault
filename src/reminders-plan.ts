import type { Reminder } from "./types";
import { addYears, parseISODate, toISODate } from "./utils";

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

// ---------------------------------------------------------------------------------------
// Standalone reminders (subscriptions, bills, anything): once, monthly or yearly
// ---------------------------------------------------------------------------------------
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function monthlyDate(due: Date, i: number): Date {
  const t = due.getMonth() + i;
  const y = due.getFullYear() + Math.floor(t / 12);
  const m = ((t % 12) + 12) % 12;
  const dim = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(due.getDate(), dim)); // 31st -> last day of shorter months
}

/** The next `count` due dates on or after today that have not been marked done. */
export function occurrenceDates(r: Reminder, now: Date, count: number): string[] {
  const due = parseISODate(r.dueOn);
  if (isNaN(due.getTime())) return [];
  const today = startOfDay(now);
  const done = r.doneThrough ? parseISODate(r.doneThrough) : null;
  const ok = (d: Date) => d.getTime() >= today.getTime() && (!done || d.getTime() > done.getTime());

  if (r.repeat === "none") return ok(due) ? [toISODate(due)] : [];

  let i = 0; // skip straight to the cycle just before today
  if (r.repeat === "monthly") {
    i = Math.max(0, (today.getFullYear() - due.getFullYear()) * 12 + today.getMonth() - due.getMonth() - 1);
  } else {
    i = Math.max(0, today.getFullYear() - due.getFullYear() - 1);
  }
  const out: string[] = [];
  for (let guard = 0; out.length < count && guard < 600; i++, guard++) {
    const d = r.repeat === "monthly" ? monthlyDate(due, i) : addYears(due, i);
    if (ok(d)) out.push(toISODate(d));
  }
  return out;
}

/** What to show as "next due": the next cycle, or an unfinished one-off that is already overdue. */
export function nextDue(r: Reminder, now: Date = new Date()): string | null {
  const next = occurrenceDates(r, now, 1)[0];
  if (next) return next;
  if (r.repeat === "none") {
    const done = r.doneThrough ? parseISODate(r.doneThrough) : null;
    const due = parseISODate(r.dueOn);
    if (!isNaN(due.getTime()) && (!done || due.getTime() > done.getTime())) return r.dueOn;
  }
  return null;
}

export type PlannedCustom = {
  reminder: Reminder;
  occurrence: string; // the due date this notification belongs to
  offset: number; // days before the due date
  fireAt: Date;
  snoozed: boolean;
};

function atTime(day: Date, hhmm: string, minusDays: number): Date {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - minusDays, Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0);
}

export function planCustomReminders(reminders: Reminder[], now: Date = new Date()): PlannedCustom[] {
  const out: PlannedCustom[] = [];
  for (const r of reminders) {
    const count = r.repeat === "monthly" ? 12 : r.repeat === "yearly" ? 3 : 1;
    const offsets = Array.from(new Set(r.offsets?.length ? r.offsets : [0]));
    for (const occ of occurrenceDates(r, now, count)) {
      for (const offset of offsets) {
        const fireAt = atTime(parseISODate(occ), r.time, offset);
        if (fireAt.getTime() > now.getTime() + 60_000) out.push({ reminder: r, occurrence: occ, offset, fireAt, snoozed: false });
      }
    }
    if (r.snoozeUntil && r.snoozeUntil > now.getTime() + 60_000) {
      out.push({ reminder: r, occurrence: nextDue(r, now) ?? r.dueOn, offset: 0, fireAt: new Date(r.snoozeUntil), snoozed: true });
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
