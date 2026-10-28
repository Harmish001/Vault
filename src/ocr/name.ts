/**
 * Suggests a readable file name ("Passport - Dad", "Car Insurance - 2027") from text read on a scan.
 * Pure, so it is unit-tested on a computer. The person shows the suggestion and approves or edits it.
 */
import type { Folder } from "../types";
import { parseBill } from "../capture/parseBill";
import { findDates } from "./dates";
import { DOC_LABEL, detectDetails, type Detection } from "./parse";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Folder names that describe a kind of document rather than a family member.
const GENERIC_FOLDER =
  /^(documents?|docs|files|ids?|id cards?|identity|bills?|insurance|policies|scans?|recovered files|misc|others?|important|property|cars?|vehicles?|home|house|finance|bank(ing)?|tax(es)?|medical|health|work|office|education|certificates?|receipts?|warranty|warranties|travel)$/i;

/** The family member a folder belongs to: its top-level folder, unless that is a category like "Bills". */
export function personFor(folders: Folder[], folderId: string | null | undefined): string | undefined {
  let cur = folders.find((f) => f.id === folderId);
  for (let guard = 0; cur?.parentId && guard < 50; guard++) cur = folders.find((f) => f.id === cur!.parentId);
  const name = cur?.name.trim();
  return name && !GENERIC_FOLDER.test(name) ? name : undefined;
}

const INSURANCE: [RegExp, string][] = [
  [/TWO[\s-]?WHEELER|\bBIKE\b|SCOOTER|MOTOR\s*CYCLE/, "Bike Insurance"],
  [/PRIVATE CAR|FOUR[\s-]?WHEELER|\bCAR\b|MOTOR/, "Car Insurance"],
  [/HEALTH|MEDICLAIM|HOSPITALI[SZ]ATION/, "Health Insurance"],
  [/TERM PLAN|TERM INSURANCE|\bLIFE\b/, "Life Insurance"],
  [/TRAVEL/, "Travel Insurance"],
  [/HOME|HOUSEHOLD|FIRE|PROPERTY/, "Home Insurance"],
];

type Qualifier = "month" | "year" | "person";
const KINDS: [RegExp, string, Qualifier][] = [
  [/BANK STATEMENT|STATEMENT OF ACCOUNT|ACCOUNT STATEMENT/, "Bank Statement", "month"],
  [/SALARY SLIP|PAY\s*SLIP/, "Salary Slip", "month"],
  [/FORM\s*(NO\.?\s*)?16\b/, "Form 16", "year"],
  [/RENT(AL)? AGREEMENT|LEASE AGREEMENT|LEAVE AND LICEN[CS]E/, "Rent Agreement", "year"],
  [/BIRTH CERTIFICATE|CERTIFICATE OF BIRTH/, "Birth Certificate", "person"],
  [/MARRIAGE CERTIFICATE|CERTIFICATE OF MARRIAGE/, "Marriage Certificate", "person"],
  [/MARK\s*SHEET|GRADE CARD|STATEMENT OF MARKS/, "Marksheet", "person"],
  [/PRESCRIPTION/, "Prescription", "month"],
  [/LAB(ORATORY)? REPORT|PATHOLOGY|TEST REPORT|DIAGNOSTIC/, "Medical Report", "month"],
  [/WARRANTY/, "Warranty Card", "year"],
  [/TAX INVOICE|\bINVOICE\b/, "Invoice", "month"],
  [/\bRECEIPT\b/, "Receipt", "month"],
  [/ELECTRIC(ITY)?\s*BILL|POWER DISTRIBUTION|ELECTRIC\s*BILL/, "Electricity Bill", "month"],
  [/WATER\s*BILL/, "Water Bill", "month"],
  [/GAS\s*BILL|\bLPG\b|\bPNG\b/, "Gas Bill", "month"],
  [/BROADBAND|FIBER|\bWIFI\b\s*BILL/, "Broadband Bill", "month"],
  [/MUTUAL\s*FUND|DEMAT|CAS STATEMENT/, "Investment Statement", "month"],
  [/OFFER\s*LETTER|APPOINTMENT\s*LETTER/, "Offer Letter", "person"],
  [/EXPERIENCE\s*(LETTER|CERTIFICATE)|RELIEVING\s*LETTER/, "Experience Letter", "person"],
  [/DEGREE(\s*CERTIFICATE)?|DIPLOMA(\s*CERTIFICATE)?/, "Degree Certificate", "person"],
  [/DISCHARGE\s*SUMMARY|HOSPITAL\s*BILL/, "Medical Report", "month"],
  [/AFFIDAVIT|UNDERTAKING/, "Affidavit", "year"],
  [/PROPERTY\s*TAX/, "Property Tax Receipt", "year"],
  [/INCOME\s*TAX\s*RETURN|\bITR\b/, "ITR Acknowledgement", "year"],
  [/\bCERTIFICATE\b/, "Certificate", "person"],
];

/** Given name from a passport's machine-readable zone (P<INDSHARMA<<RAHUL<<...). */
function mrzGivenName(up: string): string | undefined {
  const m = /P<[A-Z]{3}[A-Z<]*?<<([A-Z]+)/.exec(up.replace(/ /g, ""));
  return m ? titleCase(m[1]) : undefined;
}

export type NameInput = {
  /** all text read from the document */
  text: string;
  det?: Detection | null;
  bill?: { isBill: boolean; title?: { value: string }; dueOn?: { value: string } } | null;
  /** family member the file is being saved for, see personFor */
  person?: string;
  now?: Date;
};

export function suggestName({ text, det, bill, person, now = new Date() }: NameInput): string | null {
  const up = text.toUpperCase();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const join = (base: string, q?: string) => (q ? `${base} - ${q}` : base);

  // Most recent sensible date in the text, for statements, bills and receipts.
  const limit = new Date(now.getFullYear() + 10, 0, 1).toISOString().slice(0, 10);
  const dates = findDates(lines).map((d) => d.iso).filter((iso) => iso <= limit).sort();
  const latest = dates.at(-1);
  const year = (det?.expiresOn ?? latest)?.slice(0, 4);

  if (det && det.docType !== "other") {
    if (det.docType === "vehicle") return join(DOC_LABEL.vehicle, det.fields.find((f) => f.id === "vehicle")?.value);
    return join(DOC_LABEL[det.docType], person ?? (det.docType === "passport" ? mrzGivenName(up) : undefined));
  }

  if (/INSURANCE|ASSURANCE|POLICY SCHEDULE|CERTIFICATE OF INSURANCE/.test(up)) {
    const kind = INSURANCE.find(([re]) => re.test(up))?.[1] ?? "Insurance Policy";
    return join(kind, year);
  }

  if (bill?.isBill && bill.title?.value.trim()) {
    const title = bill.title.value.trim();
    const due = bill.dueOn?.value ?? latest;
    return join(/\b(bill|invoice|statement)\b/i.test(title) ? title : `${title} Bill`, due ? monthYear(due) : undefined);
  }

  if (/\b(AADHAAR|UIDAI|UNIQUE IDENTIFICATION)\b|आधार/.test(up)) {
    return join("Aadhaar", person);
  }
  if (/\b(INCOME TAX DEPARTMENT|PERMANENT ACCOUNT NUMBER|PAN CARD)\b/.test(up)) {
    return join("PAN card", person);
  }
  if (/\b(DRIVING LICEN[CS]E|MOTOR VEHICLES DEPARTMENT)\b/.test(up)) {
    return join("Driving licence", person);
  }
  if (/\b(VOTER ID|ELECTION COMMISSION OF INDIA|ELECTOR PHOTO)\b/.test(up)) {
    return join("Voter ID", person);
  }

  for (const [re, label, q] of KINDS) {
    if (!re.test(up)) continue;
    if (q === "person") return join(label, person);
    if (q === "year") return join(label, year);
    return join(label, latest ? monthYear(latest) : undefined);
  }
  return null;
}

/** Runs the detectors on raw text and suggests a name; for imports, where no review form ran. */
export function suggestNameFromText(text: string, person?: string, now = new Date()): string | null {
  if (!text.trim()) return null;
  return suggestName({ text, det: detectDetails(text, now), bill: parseBill(text, now), person, now });
}

/** Makes a suggestion safe as a file name. */
export const cleanFileName = (n: string) => n.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
