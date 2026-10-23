import { strict as assert } from "assert";
import { formatINR, parseINR } from "../src/capture/amount";
import { parseBill } from "../src/capture/parseBill";
import { findMatch, unlinkFile } from "../src/capture/match";
import { resolveDateWithoutYear } from "../src/ocr/dates";
import type { Reminder } from "../src/types";

// Base fixed time for deterministic tests: 23 Oct 2026, 10:00 AM
const now = new Date(2026, 9, 23, 10, 0);

console.log("running capture tests...");

// --- Additional unit tests: INR formatting & parsing ---
assert.equal(parseINR("1,23,456.78"), 123456.78, "parseINR with Indian grouping");
assert.equal(formatINR(123456.78), "₹1,23,456.78", "formatINR with paise");
assert.equal(formatINR(499), "₹499", "formatINR integer only");

// --- Date resolution tests ---
const resAfter = resolveDateWithoutYear(25, 10, now);
assert.equal(resAfter, "2026-10-25", "25 Oct resolves to 2026-10-25 (after now)");

const resBeforeNear = resolveDateWithoutYear(15, 10, now);
assert.equal(resBeforeNear, "2026-10-15", "15 Oct within 330 days resolves to 2026-10-15");

// --- 14 Fixtures from spec §14.1 ---

// Fixture 1: Airtel
const f1 = parseBill(
  "Dear Customer, your Airtel bill of Rs 749.00 for 9876543210 is due on 25-Oct-2026. Pay now: airtel.in/pay",
  now
);
assert.equal(f1.title?.value, "Airtel", "f1 title");
assert.equal(f1.amount?.value.value, 749, "f1 amount");
assert.equal(f1.dueOn?.value, "2026-10-25", "f1 dueOn");
assert.equal(f1.repeat?.value, "monthly", "f1 repeat");
assert.equal(f1.repeat?.confidence, "medium", "f1 repeat conf");
assert.equal(f1.category, "telecom", "f1 category");
assert.deepEqual(f1.offsets, [1, 0], "f1 offsets");
console.log("ok - fixture 1 passed");

// Fixture 2: Torrent Power
const f2 = parseBill(
  "TORRENT POWER LIMITED\nConsumer No: 12345678901\nBill Date: 02/10/2026\nDue Date: 17/10/2026\nNet Payable Amount: ₹ 1,846.00\nAmount payable after due date ₹ 1,880.00",
  now
);
assert.equal(f2.title?.value, "Torrent Power", "f2 title");
assert.equal(f2.amount?.value.value, 1846, "f2 amount");
assert.equal(f2.amount?.value.label, "payable", "f2 amount label");
assert.equal(f2.amountAlternatives[0]?.value, 1880, "f2 alternative");
assert.equal(f2.amountAlternatives[0]?.label, "after-due", "f2 alt label");
assert.equal(f2.dueOn?.value, "2026-10-17", "f2 dueOn");
assert.equal(f2.overdue, true, "f2 overdue");
assert.equal(f2.reference?.value, "12345678901", "f2 reference");
assert.equal(f2.category, "utility", "f2 category");
console.log("ok - fixture 2 passed");

// Fixture 3: HDFC Bank Credit Card
const f3 = parseBill(
  "HDFC Bank Credit Card XX1234: Total Amount Due Rs.12,430.50, Minimum Amount Due Rs.620.00, Payment Due Date 05-Nov-2026.",
  now
);
assert.equal(f3.amount?.value.value, 12430.5, "f3 amount");
assert.equal(f3.amount?.value.label, "total", "f3 amount label");
assert.equal(f3.amountAlternatives[0]?.value, 620, "f3 alternative");
assert.equal(f3.amountAlternatives[0]?.label, "minimum", "f3 alt label");
assert.equal(f3.dueOn?.value, "2026-11-05", "f3 dueOn");
assert.equal(f3.category, "card", "f3 category");
assert.equal(f3.repeat?.value, "monthly", "f3 repeat");
console.log("ok - fixture 3 passed");

// Fixture 4: Netflix
const f4 = parseBill(
  "Your next billing date is 12 November 2026. Your plan: Premium ₹649/month sender Netflix",
  now
);
assert.equal(f4.title?.value, "Netflix", "f4 title");
assert.equal(f4.amount?.value.value, 649, "f4 amount");
assert.equal(f4.dueOn?.value, "2026-11-12", "f4 dueOn");
assert.equal(f4.repeat?.value, "monthly", "f4 repeat");
assert.equal(f4.category, "subscription", "f4 category");
assert.deepEqual(f4.offsets, [3, 1, 0], "f4 offsets");
console.log("ok - fixture 4 passed");

// Fixture 5: YouTube Premium
const f5 = parseBill(
  "Your subscription to YouTube Premium renews on 3 Dec 2026. You'll be charged ₹149.00 /month",
  now
);
assert.equal(f5.title?.value, "YouTube Premium", "f5 title");
assert.equal(f5.amount?.value.value, 149, "f5 amount");
assert.equal(f5.dueOn?.value, "2026-12-03", "f5 dueOn");
assert.equal(f5.repeat?.value, "monthly", "f5 repeat");
console.log("ok - fixture 5 passed");

// Fixture 6: LIC of India
const f6 = parseBill(
  "LIC of India\nPremium Due Date: 28/02/2027\nPremium Amount: Rs. 24,600\nPolicy No: 123456789\nMode: Yearly",
  now
);
assert.equal(f6.title?.value, "LIC of India", "f6 title");
assert.equal(f6.amount?.value.value, 24600, "f6 amount");
assert.equal(f6.dueOn?.value, "2027-02-28", "f6 dueOn");
assert.equal(f6.repeat?.value, "yearly", "f6 repeat");
assert.equal(f6.repeat?.confidence, "high", "f6 repeat confidence");
assert.equal(f6.category, "insurance", "f6 category");
assert.deepEqual(f6.offsets, [30, 7, 0], "f6 offsets");
assert.equal(f6.reference?.value, "123456789", "f6 reference");
console.log("ok - fixture 6 passed");

// Fixture 7: Rent
const f7 = parseBill("Rent for Nov ₹18,000 due by 5th", now);
assert.equal(f7.amount?.value.value, 18000, "f7 amount");
assert.equal(f7.dueOn?.value, "2026-11-05", "f7 dueOn");
assert.equal(f7.dueOn?.confidence, "low", "f7 dueOn conf");
assert.equal(f7.repeat?.value, "monthly", "f7 repeat");
assert.equal(f7.repeat?.confidence, "low", "f7 repeat conf");
assert.equal(f7.category, "rent", "f7 category");
console.log("ok - fixture 7 passed");

// Fixture 8: Shopping receipt (not a bill)
const f8 = parseBill("Thanks for shopping with us! Total ₹2,499", now);
assert.equal(f8.amount?.value.value, 2499, "f8 amount");
assert.equal(f8.amount?.confidence, "low", "f8 amount conf");
assert.equal(f8.dueOn, undefined, "f8 dueOn undefined");
assert.equal(f8.isBill, false, "f8 isBill false");
console.log("ok - fixture 8 passed");

// Fixture 9: Overdue bill
const f9 = parseBill("Bill due on 10/10/2026 amount ₹500", now);
assert.equal(f9.dueOn?.value, "2026-10-10", "f9 dueOn");
assert.equal(f9.overdue, true, "f9 overdue");
assert.equal(f9.amount?.value.value, 500, "f9 amount");
console.log("ok - fixture 9 passed");

// Fixture 10: Indian grouping amount
const f10 = parseBill("Due 25 Oct, pay ₹1,23,456.78", now);
assert.equal(f10.dueOn?.value, "2026-10-25", "f10 dueOn");
assert.equal(f10.dueOn?.confidence, "medium", "f10 dueOn conf");
assert.equal(f10.amount?.value.value, 123456.78, "f10 amount");
console.log("ok - fixture 10 passed");

// Fixture 11: Ambiguous date 03/04/2026
const f11 = parseBill("03/04/2026", now);
assert.equal(f11.dueOn?.value, "2026-04-03", "f11 dueOn DD/MM");
assert.equal(f11.dueOn?.confidence, "medium", "f11 dueOn conf");
console.log("ok - fixture 11 passed");

// Fixture 12: Support message with numbers (not amount)
const f12 = parseBill(
  "Dear Customer, call 98765 43210 for support. Ref 20261023",
  now
);
assert.equal(f12.amount, undefined, "f12 no amount");
assert.equal(f12.isBill, false, "f12 isBill false");
console.log("ok - fixture 12 passed");

// Fixture 13: Quarterly premium
const f13 = parseBill("Quarterly premium ₹6,150 due 15/12/2026", now);
assert.equal(f13.repeat?.value, "none", "f13 repeat none");
assert.ok(f13.repeat?.why.includes("quarterly"), "f13 quarterly hint");
assert.equal(f13.amount?.value.value, 6150, "f13 amount");
console.log("ok - fixture 13 passed");

// Fixture 14: Total vs Minimum due
const f14 = parseBill(
  "Minimum due ₹200. Total due ₹4,500. Pay by 02-Nov-26",
  now
);
assert.equal(f14.amount?.value.value, 4500, "f14 amount total");
assert.equal(f14.amount?.value.label, "total", "f14 label");
assert.equal(f14.amountAlternatives[0]?.value, 200, "f14 alt 200");
assert.equal(f14.dueOn?.value, "2026-11-02", "f14 dueOn");
console.log("ok - fixture 14 passed");

// --- findMatch unit tests ---
const sampleReminders: Reminder[] = [
  {
    id: "r1",
    title: "Torrent Power",
    dueOn: "2026-11-17",
    time: "09:00",
    repeat: "monthly",
    offsets: [2, 0],
    amount: "₹1,790",
    reference: "12345678901",
    createdAt: 1000,
  },
  {
    id: "r2",
    title: "One-off Bill",
    dueOn: "2026-10-30",
    time: "09:00",
    repeat: "none",
    offsets: [1, 0],
    createdAt: 2000,
  },
];

// Match by reference
const mRef = findMatch({ reference: "1234-5678-901", title: "Electricity" }, sampleReminders);
assert.equal(mRef?.reminder.id, "r1", "match by reference");
assert.equal(mRef?.reason, "reference", "reason reference");

// Match by normalized title for repeating reminder
const mTitle = findMatch({ title: "  Torrent   power! " }, sampleReminders);
assert.equal(mTitle?.reminder.id, "r1", "match by title");
assert.equal(mTitle?.reason, "title", "reason title");

// No match for one-off reminder by title
const mOneOff = findMatch({ title: "One-off Bill" }, sampleReminders);
assert.equal(mOneOff, null, "no match for repeat: none reminder");

// --- unlinkFile unit tests ---
const remindersWithFiles: Reminder[] = [
  {
    id: "r1",
    title: "Torrent Power",
    dueOn: "2026-11-17",
    time: "09:00",
    repeat: "monthly",
    offsets: [2, 0],
    fileId: "f1",
    createdAt: 1000,
  },
  {
    id: "r2",
    title: "Airtel",
    dueOn: "2026-10-25",
    time: "09:00",
    repeat: "monthly",
    offsets: [1, 0],
    fileId: "f2",
    createdAt: 2000,
  },
];
const unlinked = unlinkFile(remindersWithFiles, ["f1"]);
assert.equal(unlinked[0].fileId, undefined, "f1 unlinked");
assert.equal(unlinked[1].fileId, "f2", "f2 retained");

console.log("all capture tests passed!");
