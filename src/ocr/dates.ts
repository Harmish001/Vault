/**
 * Shared date-finding helpers for both the document OCR parser and the bill parser.
 * Pure and deterministic; all functions are exported for unit tests.
 */
import { toISODate } from "../utils";

export const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export function makeISO(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return toISODate(dt);
}

export type FoundDate = { iso: string; line: number; start: number; end: number };

/**
 * Finds all dates in the given lines, returning their position (line/offset)
 * and ISO string. Supports:
 *  - DD/MM/YYYY and YYYY/MM/DD (with -, . or / separators)
 *  - DD MMM YYYY (month name, 3+ letters)
 */
export function findDates(lines: string[], now?: Date): FoundDate[] {
  const out: FoundDate[] = [];
  lines.forEach((line, li) => {
    const up = line.toUpperCase();
    const patterns: [RegExp, (m: RegExpExecArray) => string | null][] = [
      // DD/MM/YYYY
      [/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?!\d)/g, (m) => makeISO(+m[3], +m[2], +m[1])],
      // YYYY/MM/DD
      [/(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g, (m) => makeISO(+m[1], +m[2], +m[3])],
      // DD MMM YYYY (e.g. 25-Oct-2026, 12 November 2026)
      [/(?<!\d)(\d{1,2})[\s\-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,.\-]*(\d{4})(?!\d)/g, (m) => makeISO(+m[3], MONTHS[m[2]], +m[1])],
      // MMM DD YYYY
      [/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,.\-]+(\d{1,2})(?:ST|ND|RD|TH)?[\s,.\-]+(\d{4})(?!\d)/g, (m) => makeISO(+m[3], MONTHS[m[1]], +m[2])],
      // DD-MM-YY (2-digit year)
      [/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?!\d)/g, (m) => makeISO(2000 + +m[3], +m[2], +m[1])],
      // DD-MMM-YY (e.g. 02-Nov-26)
      [/(?<!\d)(\d{1,2})[\s\-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,.\-]*(\d{2})(?!\d)/g, (m) => makeISO(2000 + +m[3], MONTHS[m[2]], +m[1])],
    ];

    if (now) {
      // Dates without year: e.g. 25 Oct, 25th Oct, Oct 25
      patterns.push(
        [
          /(?<!\d)(\d{1,2})(?:ST|ND|RD|TH)?[\s\-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*(?![\s,.\-]*\d{2,4})(?!\w)/g,
          (m) => resolveDateWithoutYear(+m[1], MONTHS[m[2]], now),
        ],
        [
          /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s,.\-]+(\d{1,2})(?:ST|ND|RD|TH)?(?![\s,.\-]*\d{2,4})(?!\w)/g,
          (m) => resolveDateWithoutYear(+m[2], MONTHS[m[1]], now),
        ]
      );
    }

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

/**
 * Resolves a date without a year to the next occurrence on or after now;
 * if that is more than 330 days away, use the previous occurrence instead.
 */
export function resolveDateWithoutYear(day: number, month: number, now: Date): string | null {
  const curY = now.getFullYear();
  let cand = makeISO(curY, month, day);
  if (!cand) return null;
  const nowISO = toISODate(now);
  if (cand < nowISO) {
    // Next occurrence next year
    const nextY = makeISO(curY + 1, month, day);
    if (!nextY) return null;
    const diffDays = (new Date(curY + 1, month - 1, day).getTime() - now.getTime()) / 86400000;
    if (diffDays > 330) {
      return cand; // previous occurrence
    }
    return nextY;
  } else {
    const diffDays = (new Date(curY, month - 1, day).getTime() - now.getTime()) / 86400000;
    if (diffDays > 330) {
      const prevY = makeISO(curY - 1, month, day);
      if (prevY) return prevY;
    }
    return cand;
  }
}

const RE_EXPIRY = /(valid\s*(up\s*)?(to|till|until|upto|thru)|validity|expiry|expires|expiration|expire|\bexp\b|renewal|valid up)/i;
const RE_ISSUE = /(date of issue|issue date|issued on|date of issuance|\bdoi\b)/i;
const RE_DOB = /(\bdob\b|date of birth|birth)/i;
const RE_PERIOD = /(policy|period|from|cover|insurance)/i;

export function classifyDates(lines: string[], dates: FoundDate[]) {
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
