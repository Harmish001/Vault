/**
 * Finds document numbers and dates in text read from a scan (Indian documents).
 * Pure and deterministic, so it is unit-tested on a computer. OCR is never perfect:
 * every result goes through a review form before anything is saved.
 */
import { toISODate } from "../utils";

export type DocType = "aadhaar" | "pan" | "passport" | "licence" | "voter" | "vehicle" | "other";

export const DOC_LABEL: Record<DocType, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN card",
  passport: "Passport",
  licence: "Driving licence",
  voter: "Voter ID",
  vehicle: "Vehicle registration",
  other: "Document",
};

export const DOC_TAG: Record<DocType, string> = {
  aadhaar: "aadhaar",
  pan: "pan",
  passport: "passport",
  licence: "licence",
  voter: "voter-id",
  vehicle: "vehicle",
  other: "",
};

export type DetectedField = { id: string; label: string; value: string; /** worth a second look */ check: boolean; on: boolean };
export type Detection = { docType: DocType; fields: DetectedField[]; expiresOn?: string };

// ---- Verhoeff checksum (Aadhaar's last digit) --------------------------------------
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = VD[c][VP[i % 8][Number(rev[i])]];
  return c === 0;
}

export function verhoeffCheckDigit(payload: string): string {
  let c = 0;
  const rev = payload.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = VD[c][VP[(i + 1) % 8][Number(rev[i])]];
  return String(VINV[c]);
}

// ---- Passport MRZ check digits ------------------------------------------------------
export function mrzCheck(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const v = ch === "<" ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  }
  return sum % 10;
}

// ---- helpers --------------------------------------------------------------------------
const STATE_CODES = new Set(
  "AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS UK UP WB".split(" ")
);
const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function makeISO(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return toISODate(dt);
}

type FoundDate = { iso: string; line: number; start: number; end: number };

function findDates(lines: string[]): FoundDate[] {
  const out: FoundDate[] = [];
  lines.forEach((line, li) => {
    const up = line.toUpperCase();
    const patterns: [RegExp, (m: RegExpExecArray) => string | null][] = [
      [/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?!\d)/g, (m) => makeISO(+m[3], +m[2], +m[1])],
      [/(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g, (m) => makeISO(+m[1], +m[2], +m[3])],
      [/(?<!\d)(\d{1,2})[\s\-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,.\-]*(\d{4})(?!\d)/g, (m) => makeISO(+m[3], MONTHS[m[2]], +m[1])],
    ];
    for (const [re, conv] of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(up))) {
        const iso = conv(m);
        if (iso && !out.some((o) => o.line === li && o.start < m!.index + m![0].length && m!.index < o.end)) {
          out.push({ iso, line: li, start: m.index, end: m.index + m[0].length });
        }
      }
    }
  });
  return out.sort((a, b) => a.line - b.line || a.start - b.start);
}

const RE_EXPIRY = /(valid\s*(up\s*)?(to|till|until|upto|thru)|validity|expiry|expires|expiration|expire|\bexp\b|renewal|valid up)/i;
const RE_ISSUE = /(date of issue|issue date|issued on|date of issuance|\bdoi\b)/i;
const RE_DOB = /(\bdob\b|date of birth|birth)/i;
const RE_PERIOD = /(policy|period|from|cover|insurance)/i;

function classifyDates(lines: string[], dates: FoundDate[]) {
  let expiry: string | undefined;
  let issue: string | undefined;
  let dob: string | undefined;
  const expiries: string[] = [];
  for (const d of dates) {
    const prefix = lines[d.line].slice(0, d.start);
    const prev = d.line > 0 && prefix.replace(/[^A-Za-z]/g, "").length < 3 ? lines[d.line - 1] : "";
    const ctx = `${prev} ${prefix}`;
    const rangeEnd = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2})\s*(to|-|–|till|until)\s*$/i.test(prefix) && RE_PERIOD.test(lines[d.line] + " " + prev);
    if (RE_DOB.test(ctx)) dob = dob ?? d.iso;
    else if (RE_ISSUE.test(ctx)) issue = issue ?? d.iso;
    else if (RE_EXPIRY.test(ctx) || rangeEnd) expiries.push(d.iso);
  }
  if (expiries.length) expiry = expiries.sort().at(-1);
  return { expiry, issue, dob };
}

const fixToLetter: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G" };
const fixToDigit: Record<string, string> = { O: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6", Q: "0", D: "0" };

function fixPan(tok: string): { value: string; corrected: boolean } | null {
  if (tok.length !== 10) return null;
  let out = "";
  for (let i = 0; i < 10; i++) {
    const ch = tok[i];
    if (i < 5 || i === 9) {
      if (/[A-Z]/.test(ch)) out += ch;
      else if (fixToLetter[ch]) out += fixToLetter[ch];
      else return null;
    } else {
      if (/\d/.test(ch)) out += ch;
      else if (fixToDigit[ch]) out += fixToDigit[ch];
      else return null;
    }
  }
  if (!"ABCFGHLJPT".includes(out[3])) return null;
  return { value: out, corrected: out !== tok };
}

const field = (id: string, label: string, value: string, check = false, on = true): DetectedField => ({ id, label, value, check, on });

const GENERIC_LABELS =
  /\b(policy|account|a\/c|consumer|customer|certificate|registration|reference|application|receipt|invoice|card|membership|subscription|connection|meter|loan)\s*(?:no|number|id|#)\b\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,24}(?: (?=[A-Z0-9\-\/]*\d)[A-Z0-9\-\/]{2,12}){0,3})/gi;

export function detectDetails(input: string | string[], now: Date = new Date()): Detection | null {
  const text = (Array.isArray(input) ? input.join("\n") : input).replace(/\r/g, "");
  if (!text.trim()) return null;
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const joined = lines.join("\n");
  const up = joined.toUpperCase();

  const has = (re: RegExp) => re.test(up);
  const kwAadhaar = has(/AADHAAR|AADHAR|UIDAI|UNIQUE IDENTIFICATION|आधार/) || joined.includes("आधार");
  const kwPan = has(/INCOME\s*TAX|PERMANENT ACCOUNT|\bPAN\b/);
  const kwPassport = has(/PASSPORT|REPUBLIC OF INDIA|NATIONALITY|P<IND/);
  const kwLicence = has(/DRIVING|LICEN[CS]E|TRANSPORT|\bDL\s*NO/);
  const kwVoter = has(/ELECTION|ELECTOR|\bEPIC\b|VOTER/);
  const kwVehicle = has(/REGISTRATION|\bREGN\b|VEHICLE|CHASSIS|\bRC\b/);

  const fields: DetectedField[] = [];
  let docType: DocType = "other";

  // Aadhaar: 12 digits (not a 16-digit VID), checked with the Verhoeff checksum
  const aadhaarRe = /(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?![\s-]?\d{4})(?!\d)/g;
  let am: RegExpExecArray | null;
  let aadhaar: { v: string; valid: boolean } | null = null;
  while ((am = aadhaarRe.exec(joined))) {
    const digits = am[1] + am[2] + am[3];
    const valid = verhoeffValid(digits);
    if (valid || kwAadhaar) {
      if (!aadhaar || (valid && !aadhaar.valid)) aadhaar = { v: `${am[1]} ${am[2]} ${am[3]}`, valid };
    }
  }

  // PAN
  let pan: { value: string; corrected: boolean } | null = null;
  for (const tok of up.match(/\b[A-Z0-9]{10}\b/g) ?? []) {
    const f = fixPan(tok);
    if (f && (!f.corrected || kwPan)) {
      pan = f;
      if (!f.corrected) break;
    }
  }

  // Passport: machine-readable zone first (has check digits), then the printed number
  let passport: { v: string; check: boolean } | null = null;
  let mrzExpiry: string | undefined;
  let mrzDob: string | undefined;
  for (const line of lines) {
    const l = line.toUpperCase().replace(/\s/g, "");
    const m = /^([A-Z0-9<]{9})(\d)([A-Z<]{3})(\d{6})(\d)([MF<])(\d{6})(\d)/.exec(l);
    if (!m) continue;
    const okNo = mrzCheck(m[1]) === Number(m[2]);
    const okDob = mrzCheck(m[4]) === Number(m[5]);
    const okExp = mrzCheck(m[7]) === Number(m[8]);
    if (okNo || (okDob && okExp)) {
      passport = { v: m[1].replace(/</g, ""), check: !(okNo && okDob && okExp) };
      const exp = makeISO(2000 + Number(m[7].slice(0, 2)), Number(m[7].slice(2, 4)), Number(m[7].slice(4, 6)));
      if (exp && okExp) mrzExpiry = exp;
      const yy = Number(m[4].slice(0, 2));
      const dob = makeISO(yy > now.getFullYear() % 100 ? 1900 + yy : 2000 + yy, Number(m[4].slice(2, 4)), Number(m[4].slice(4, 6)));
      if (dob && okDob) mrzDob = dob;
      break;
    }
  }
  if (!passport && kwPassport) {
    const pm = /(?<![A-Z0-9])([A-PR-WY]\d{7})(?![A-Z0-9])/.exec(up);
    if (pm) passport = { v: pm[1], check: true };
  }

  // Driving licence, voter ID, vehicle registration
  let licence: string | null = null;
  const lm = /(?<![A-Z0-9])([A-Z]{2})[\s-]?(\d{2})[\s-]?((?:19|20)\d{2})(\d{7})(?![A-Z0-9])/.exec(up);
  if (lm && STATE_CODES.has(lm[1]) && (kwLicence || true)) licence = `${lm[1]}${lm[2]} ${lm[3]}${lm[4]}`;
  let voter: string | null = null;
  const vm = /(?<![A-Z0-9])([A-Z]{3}\d{7})(?![A-Z0-9])/.exec(up);
  if (vm && kwVoter) voter = vm[1];
  let vehicle: string | null = null;
  const rm = /(?<![A-Z0-9])([A-Z]{2})[\s-]?(\d{1,2})[\s-]?([A-Z]{1,3})[\s-]?(\d{4})(?![A-Z0-9])/.exec(up);
  if (rm && STATE_CODES.has(rm[1]) && kwVehicle) vehicle = `${rm[1]}${rm[2].padStart(2, "0")} ${rm[3]} ${rm[4]}`;

  // Decide the document type from the strongest evidence
  if (aadhaar && (aadhaar.valid || kwAadhaar)) {
    docType = "aadhaar";
    fields.push(field("aadhaar", "Aadhaar number", aadhaar.v, !aadhaar.valid));
  } else if (pan) {
    docType = "pan";
    fields.push(field("pan", "PAN", pan.value, pan.corrected));
  } else if (passport) {
    docType = "passport";
    fields.push(field("passport", "Passport number", passport.v, passport.check));
  } else if (licence) {
    docType = "licence";
    fields.push(field("licence", "Driving licence number", licence, !kwLicence));
  } else if (voter) {
    docType = "voter";
    fields.push(field("voter", "Voter ID (EPIC) number", voter));
  } else if (vehicle) {
    docType = "vehicle";
    fields.push(field("vehicle", "Vehicle registration number", vehicle));
  }

  // Dates
  const cls = classifyDates(lines, findDates(lines));
  const expiresOn = mrzExpiry ?? cls.expiry;
  if (cls.issue) fields.push(field("issue", "Issue date", dmy(cls.issue)));
  const dob = mrzDob ?? cls.dob;
  if (dob && docType !== "other") fields.push(field("dob", "Date of birth", dmy(dob), false, false));

  // Labelled numbers (policy no., consumer no., ...) for bills, policies and anything else
  if (docType === "other") {
    GENERIC_LABELS.lastIndex = 0;
    let gm: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((gm = GENERIC_LABELS.exec(joined))) {
      const value = gm[2].toUpperCase().trim();
      if (value.replace(/[^A-Z0-9]/g, "").length < 5 || !/\d/.test(value) || seen.has(value)) continue;
      seen.add(value);
      const word = gm[1].toLowerCase() === "a/c" ? "Account" : gm[1][0].toUpperCase() + gm[1].slice(1).toLowerCase();
      fields.push(field("g-" + value, `${word} number`, value, true));
      if (seen.size >= 3) break;
    }
  }

  if (!fields.length && !expiresOn) return null;
  return { docType, fields, expiresOn };
}
