// Run with: npm test   (name suggestions from OCR text, no phone needed)
import { mrzCheck, verhoeffCheckDigit } from "../src/ocr/parse";
import { personFor, suggestNameFromText } from "../src/ocr/name";
import type { Folder } from "../src/types";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};
const eq = (got: string | null, want: string | null, msg: string) => assert(got === want, `${msg} (got ${JSON.stringify(got)})`);
const now = new Date(2026, 9, 23);

const folders: Folder[] = [
  { id: "dad", name: "Dad", parentId: null, color: "#000", createdAt: 0 },
  { id: "dad-ids", name: "IDs", parentId: "dad", color: "#000", createdAt: 0 },
  { id: "bills", name: "Bills", parentId: null, color: "#000", createdAt: 0 },
];
eq(personFor(folders, "dad-ids") ?? null, "Dad", "person comes from the top-level folder");
eq(personFor(folders, "bills") ?? null, null, "category folders are not people");

// ID documents
const base = "23456789012";
const digits = base + verhoeffCheckDigit(base);
const aadhaar = `Government of India\nRahul Sharma\n${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}\nआधार`;
eq(suggestNameFromText(aadhaar, "Dad", now), "Aadhaar - Dad", "Aadhaar with the folder's person");
eq(suggestNameFromText("INCOME TAX DEPARTMENT\nPermanent Account Number\nABCPS1234F", undefined, now), "PAN card", "PAN without a person");

const no = "J8369854<";
const line2 = `${no}${mrzCheck(no)}IND900512${mrzCheck("900512")}M300512${mrzCheck("300512")}`.padEnd(44, "<");
const passport = `REPUBLIC OF INDIA\nPassport\nP<INDSHARMA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<<\n${line2}`;
eq(suggestNameFromText(passport, undefined, now), "Passport - Rahul", "passport holder's given name from the MRZ");
eq(suggestNameFromText(passport, "Personal", now), "Passport - Personal", "folder person wins over the MRZ name");

// Insurance, bills and other kinds
const car = "XYZ General Insurance Co.\nPrivate Car Package Policy\nPolicy No: 3001/12345678/00\nPeriod of Insurance: 15/03/2026 to 14/03/2027";
eq(suggestNameFromText(car, "Dad", now), "Car Insurance - 2027", "car policy named with its end year");
eq(suggestNameFromText("Star Health Insurance\nMediclaim policy\nValid till 31/12/2027", undefined, now), "Health Insurance - 2027", "health policy");
eq(
  suggestNameFromText("HDFC Bank\nStatement of Account\nFrom 01/03/2026 To 31/03/2026\nClosing balance 12,000.00", undefined, now),
  "Bank Statement - Mar 2026",
  "bank statement with its month"
);
eq(suggestNameFromText("Dr. Mehta Clinic\nPrescription\nDate: 02/10/2026\nTab. Paracetamol", undefined, now), "Prescription - Oct 2026", "prescription");
eq(
  suggestNameFromText("Airtel Postpaid\nBill Date 20/10/2026\nAmount Due Rs 499.00\nDue Date 05/11/2026", undefined, now),
  "Airtel Bill - Nov 2026",
  "bill named after the biller and the due month"
);
eq(suggestNameFromText("Hello, see you at 5", "Dad", now), null, "no suggestion for unrelated text");
eq(suggestNameFromText("", "Dad", now), null, "no suggestion without text");

console.log("\nAll naming tests passed.");
