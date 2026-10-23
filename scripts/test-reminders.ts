// Run with: npm test   (date maths and reminder planning, no phone needed)
import { nextDue, occurrenceDates, planCustomReminders, planReminders } from "../src/reminders-plan";
import type { Reminder } from "../src/types";
import { addYears, daysUntil, expiryInfo, fileSearchText, maskValue, parseISODate, toISODate } from "../src/utils";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

const now = new Date(2026, 9, 22, 14, 0); // 22 Oct 2026, 2 PM local

assert(toISODate(parseISODate("2027-03-05")) === "2027-03-05", "ISO date round-trip");
assert(daysUntil("2026-10-22", now) === 0, "today is 0 days");
assert(daysUntil("2026-10-23", now) === 1, "tomorrow is 1 day");
assert(daysUntil("2026-10-21", now) === -1, "yesterday is -1");
assert(daysUntil("2027-03-28", now) === 157, "crossing a daylight-saving change still counts whole days");
assert(toISODate(addYears(new Date(2028, 1, 29), 1)) === "2029-02-28", "29 Feb + 1 year clamps to 28 Feb");

assert(expiryInfo("2026-10-12", now).tone === "expired" && expiryInfo("2026-10-12", now).label === "Expired 10 days ago", "expired label");
assert(expiryInfo("2026-10-22", now).label === "Expires today", "today label");
assert(expiryInfo("2026-11-21", now).label === "Expires in 30 days" && expiryInfo("2026-11-21", now).tone === "soon", "soon label");
assert(expiryInfo("2030-01-15", now).tone === "ok", "far expiry is calm");

assert(maskValue("ABCDE1234F") === "•••••• 234F", "mask keeps last 4 visible");
assert(!maskValue("ABCDE1234F").includes("ABCDE"), "mask hides the start");
assert(maskValue("12") === "••", "short values fully masked");

const entries = [
  { id: "a", name: "Passport", folderId: "f1", folderLabel: "Dad", expiresOn: "2026-12-25" },
  { id: "b", name: "Old licence", folderId: "f1", folderLabel: "Dad", expiresOn: "2026-10-30" },
  { id: "c", name: "Long gone", folderId: "f2", folderLabel: "Mom", expiresOn: "2025-01-01" },
];
const plan = planReminders(entries, [60, 30, 7, 0], now);
const key = (r: (typeof plan)[number]) => `${r.fileId}:${r.offset}`;
assert(!plan.some((r) => r.fileId === "c"), "no reminders for expired files");
const order = plan.map(key);
assert(order[0] === "b:7", "soonest reminder first");
assert(plan.filter((r) => r.fileId === "a").length === 4, "four reminders for a far expiry");
assert(plan.filter((r) => r.fileId === "b").length === 2, "only future reminders kept for a near expiry (7 days and the day)");
const first = plan.find((r) => r.fileId === "a" && r.offset === 60)!;
assert(toISODate(first.fireAt) === "2026-10-26" && first.fireAt.getHours() === 9, "60 days before 25 Dec 2026 is 26 Oct at 9 AM");
assert(plan.every((r, i) => i === 0 || plan[i - 1].fireAt <= r.fireAt), "sorted by time");
assert(planReminders(entries, [60, 30, 7, 0], now, 3).length === 3, "cap respected");

const txt = fileSearchText({ id: "x", folderId: "f", name: "Dad Passport", mime: "", size: 0, storedAs: "", addedAt: 0, tags: ["Travel"], notes: "Locker 2", fields: [{ id: "1", label: "Document number", value: "P1234567" }] });
assert(txt.includes("travel") && txt.includes("locker") && txt.includes("p1234567") && txt.includes("document number"), "search covers tags, notes, details");

// ---- standalone reminders
const base: Reminder = { id: "r", title: "Netflix", dueOn: "2026-01-31", time: "08:30", repeat: "monthly", offsets: [1, 0], amount: "₹499", createdAt: 0 };
assert(occurrenceDates(base, now, 4).join(",") === "2026-10-31,2026-11-30,2026-12-31,2027-01-31", "monthly on the 31st clamps to month end and recovers");
assert(occurrenceDates({ ...base, dueOn: "2026-10-22" }, now, 2).join(",") === "2026-10-22,2026-11-22", "an occurrence today still counts");
assert(occurrenceDates({ ...base, repeat: "yearly", dueOn: "2024-02-29" }, now, 3).join(",") === "2027-02-28,2028-02-29,2029-02-28", "yearly on 29 Feb clamps in non-leap years");
assert(occurrenceDates({ ...base, repeat: "none", dueOn: "2026-12-01" }, now, 3).join(",") === "2026-12-01", "one-off has a single date");
assert(occurrenceDates({ ...base, repeat: "none", dueOn: "2026-09-01" }, now, 3).length === 0, "past one-off has no future dates");
assert(nextDue({ ...base, repeat: "none", dueOn: "2026-09-01" }, now) === "2026-09-01", "unfinished past one-off is shown as overdue");
assert(nextDue({ ...base, repeat: "none", dueOn: "2026-09-01", doneThrough: "2026-09-01" }, now) === null, "finished one-off disappears");
const doneOct = { ...base, doneThrough: "2026-10-31" };
assert(occurrenceDates(doneOct, now, 2).join(",") === "2026-11-30,2026-12-31", "marking a cycle done skips it and keeps the next one");
const far = { ...base, dueOn: "2020-03-15" };
assert(occurrenceDates(far, now, 1)[0] === "2026-11-15", "long-running subscription jumps to the right cycle");

const plan2 = planCustomReminders([{ ...base, dueOn: "2026-10-23", offsets: [1, 0] }], now);
const firstTwo = plan2.slice(0, 2).map((p) => `${toISODate(p.fireAt)} ${p.fireAt.getHours()}:${String(p.fireAt.getMinutes()).padStart(2, "0")} o${p.offset}`);
assert(firstTwo.join(" | ") === "2026-10-23 8:30 o0 | 2026-11-22 8:30 o1", "the lead-day notification already passed, the due-day one is next");
assert(plan2.length === 23, "twelve monthly cycles x two notifications, minus the lead notification that already passed");
assert(planCustomReminders([doneOct], now).every((p) => p.occurrence !== "2026-10-31"), "done cycle has no notifications");
const snoozed = planCustomReminders([{ ...base, repeat: "none", dueOn: "2026-12-01", snoozeUntil: new Date(2026, 9, 23, 8, 30).getTime() }], now);
assert(snoozed[0].snoozed && toISODate(snoozed[0].fireAt) === "2026-10-23", "snooze adds one extra notification");
assert(planCustomReminders([{ ...base, offsets: [] }], now).length > 0, "empty offsets fall back to the due day");
console.log("all reminder tests passed");
