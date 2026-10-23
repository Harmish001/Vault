import { toISODate } from "../utils";
import { findDates, MONTHS } from "../ocr/dates";
import type { ReminderCategory, Repeat } from "../types";
import {
  extractAmountCandidates,
  type AmountCandidate,
  type Confidence,
} from "./amount";
import {
  BILLERS,
  CATEGORY_DEFAULTS,
  CATEGORY_KEYWORDS,
  SMS_HEADER_MAP,
} from "./billers";

export type Field<T> = { value: T; confidence: Confidence; why: string };

export type BillParseResult = {
  isBill: boolean;
  title?: Field<string>;
  amount?: Field<AmountCandidate>;
  amountAlternatives: AmountCandidate[];
  dueOn?: Field<string>;
  repeat?: Field<Repeat>;
  reference?: Field<string>;
  category: ReminderCategory;
  offsets: number[];
  overdue: boolean;
};

const DUE_KEYWORDS = [
  "payment due date",
  "payment due",
  "due date",
  "due on",
  "due by",
  "pay by",
  "pay before",
  "last date of payment",
  "last date",
  "next billing date",
  "next payment",
  "renews on",
  "renewal date",
  "will renew",
  "expires on",
  "valid till",
  "valid until",
  "bill due",
  "premium due date",
  "premium due",
  "due",
];

const EXCLUDE_DATE_KEYWORDS = [
  "bill date",
  "invoice date",
  "statement date",
  "issue date",
  "date of issue",
  "date of birth",
  "dob",
  "paid on",
];

const RE_REF =
  /\b(consumer\s*(?:no|number|id|#)|customer\s*(?:no|number|id|#)|policy\s*(?:no|number|id|#)|account\s*(?:no|number|id|#)|a\/c\s*(?:no|number|id|#)|card\s*ending|loan\s*account|ref\s*(?:no|number|id|#)?|reference\s*(?:no|number|id|#)?)\s*[:\-]?\s*([A-Z0-9]{4,20})\b/i;

export function parseBill(
  input: string | string[],
  now: Date = new Date()
): BillParseResult {
  let raw = Array.isArray(input) ? input.join("\n") : input;
  if (raw.length > 20000) raw = raw.slice(0, 20000);

  // Normalisation
  const text = raw.replace(/\r/g, "\n");
  const rawLines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  const lines = rawLines.filter(Boolean);
  const joined = lines.join("\n");
  const lower = joined.toLowerCase();
  const todayISO = toISODate(now);

  // 1. Title & Biller & Category
  let title: Field<string> | undefined;
  let category: ReminderCategory = "other";
  let repeatFromDict: Repeat | undefined;

  // 1.1 Dictionary match
  for (const b of BILLERS) {
    let matched = false;
    for (const alias of b.aliases) {
      if (alias === "vi ") {
        // Special guard for Vi: word boundary + telecom keyword
        const viRegex = /\bvi\b/i;
        if (
          viRegex.test(joined) &&
          /\b(postpaid|prepaid|recharge|telecom|bill|broadband)\b/i.test(joined)
        ) {
          matched = true;
          break;
        }
      } else {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i");
        if (re.test(joined)) {
          matched = true;
          break;
        }
      }
    }
    if (matched) {
      title = { value: b.name, confidence: "high", why: "dictionary" };
      category = b.category;
      repeatFromDict = b.repeat;
      break;
    }
  }

  // 1.2 SMS Sender Header if no dictionary title yet (e.g. AX-AIRTEL, or sender Netflix)
  if (!title) {
    const senderMatch =
      /\b(?:[A-Z]{2}-([A-Z]{3,8})|sender\s*[:\-]?\s*([A-Za-z0-9+ ]+))\b/i.exec(
        joined
      );
    if (senderMatch) {
      const headerCode = (senderMatch[1] ?? "").toUpperCase();
      const senderText = (senderMatch[2] ?? "").trim();
      if (headerCode && SMS_HEADER_MAP[headerCode]) {
        const info = SMS_HEADER_MAP[headerCode];
        title = { value: info.name, confidence: "medium", why: "sms-header" };
        category = info.category;
        repeatFromDict = info.repeat;
      } else if (senderText) {
        // Check if senderText matches any dictionary
        for (const b of BILLERS) {
          if (
            b.name.toLowerCase() === senderText.toLowerCase() ||
            b.aliases.some((a) => a.toLowerCase() === senderText.toLowerCase())
          ) {
            title = { value: b.name, confidence: "high", why: "sender-match" };
            category = b.category;
            repeatFromDict = b.repeat;
            break;
          }
        }
        if (!title && senderText.length >= 2 && senderText.length <= 40) {
          title = { value: senderText, confidence: "medium", why: "sender" };
        }
      }
    }
  }

  // 1.3 Email From display name
  if (!title) {
    const fromMatch = /From:\s*"?([^"<]+)"?\s*</i.exec(joined);
    if (fromMatch && fromMatch[1].trim().length >= 2) {
      title = { value: fromMatch[1].trim(), confidence: "medium", why: "email-from" };
    }
  }

  // 1.4 Fallback: First valid non-empty header line
  if (!title) {
    for (const l of lines) {
      if (l.length >= 3 && l.length <= 40) {
        // Not a greeting
        if (/^(dear|hello|hi|thanks)\b/i.test(l)) continue;
        // Not mostly digits
        const digits = l.replace(/\D/g, "").length;
        if (digits > l.length * 0.4) continue;
        // Not generic document labels
        if (/^(tax\s*invoice|invoice|bill|receipt|statement|payment\s*receipt)$/i.test(l)) continue;
        // Check if uppercase or title-cased
        if (l === l.toUpperCase() || /^[A-Z]/.test(l)) {
          title = { value: l, confidence: "low", why: "header-line" };
          break;
        }
      }
    }
  }

  // Fallback category detection if still "other"
  if (category === "other") {
    for (const ck of CATEGORY_KEYWORDS) {
      if (ck.keywords.some((k) => lower.includes(k))) {
        category = ck.category;
        break;
      }
    }
  }

  // 2. Amount & Alternatives
  const { chosen: chosenAmount, alternatives } = extractAmountCandidates(joined, lines);
  const amountField: Field<AmountCandidate> | undefined = chosenAmount
    ? {
        value: chosenAmount,
        confidence: chosenAmount.confidence,
        why: chosenAmount.label,
      }
    : undefined;

  // 3. Due Date
  const allFoundDates = findDates(lines, now);
  type EvaluatedDate = {
    iso: string;
    isDueKeyword: boolean;
    isExcluded: boolean;
    confidence: Confidence;
  };

  const evaluated: EvaluatedDate[] = [];

  for (const fd of allFoundDates) {
    const line = lines[fd.line] ?? "";
    const prefix = line.slice(Math.max(0, fd.start - 40), fd.start).toLowerCase();
    const prev = fd.line > 0 ? lines[fd.line - 1].slice(-40).toLowerCase() : "";
    const ctx = prefix.trim().length >= 3 ? prefix : `${prev} ${prefix}`;

    let isExcluded = false;
    for (const ex of EXCLUDE_DATE_KEYWORDS) {
      if (ctx.includes(ex)) {
        isExcluded = true;
        break;
      }
    }

    let isDueKeyword = false;
    for (const dk of DUE_KEYWORDS) {
      if (ctx.includes(dk)) {
        isDueKeyword = true;
        break;
      }
    }

    // Ambiguity check: e.g. 03/04/2026 vs 25/10/2026
    const matchedText = line.slice(fd.start, fd.end);
    let conf: Confidence = "high";
    const numMatch = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(matchedText);
    if (numMatch && +numMatch[1] <= 12 && +numMatch[2] <= 12) {
      conf = "medium";
    }
    if (!line.slice(fd.start, fd.end).match(/\d{4}/)) {
      // 2-digit year or no year
      conf = "medium";
    }

    evaluated.push({
      iso: fd.iso,
      isDueKeyword,
      isExcluded,
      confidence: conf,
    });
  }

  // Also check ordinal day only rule: e.g. "due by 5th" or "Rent for Nov ₹18,000 due by 5th"
  let ordinalDueISO: string | null = null;
  let ordinalRepeatMonthly = false;
  // Must have ordinal suffix st/nd/rd/th and not be part of a full date like 25-Oct or 05/11
  const ordinalMatch =
    /\b(?:due\s*(?:by|on|before)?|on\s*the)\s*(\d{1,2})(?:st|nd|rd|th)\b(?![\/\-.A-Za-z])/i.exec(
      joined
    );
  if (ordinalMatch && amountField && evaluated.filter((d) => d.isDueKeyword && !d.isExcluded).length === 0) {
    const day = +ordinalMatch[1];
    if (day >= 1 && day <= 31) {
      // Check if a month name is present in text (e.g. "Rent for Nov")
      let foundMonth: number | null = null;
      for (const [mName, mNum] of Object.entries(MONTHS)) {
        const re = new RegExp(`\\b${mName}[a-z]*\\b`, "i");
        if (re.test(joined)) {
          foundMonth = mNum;
          break;
        }
      }
      const curY = now.getFullYear();
      if (foundMonth !== null) {
        const dt = new Date(curY, foundMonth - 1, day);
        if (dt.getMonth() === foundMonth - 1) {
          ordinalDueISO = toISODate(dt);
        }
      } else {
        // Next occurrence on or after now
        let cand = new Date(curY, now.getMonth(), day);
        if (cand.getDate() !== day) {
          // day overflow (e.g. 31st in 30-day month)
          cand = new Date(curY, now.getMonth() + 1, 0);
        }
        if (toISODate(cand) < todayISO) {
          cand = new Date(curY, now.getMonth() + 1, day);
          if (cand.getDate() !== day) cand = new Date(curY, now.getMonth() + 2, 0);
        }
        ordinalDueISO = toISODate(cand);
      }
      ordinalRepeatMonthly = true;
    }
  }

  let dueOnField: Field<string> | undefined;
  let overdue = false;

  const dueKeywordDates = evaluated.filter((d) => d.isDueKeyword && !d.isExcluded);

  if (dueKeywordDates.length > 0) {
    // Choose earliest not before today; else latest if all are past
    const futureOrToday = dueKeywordDates.filter((d) => d.iso >= todayISO);
    if (futureOrToday.length > 0) {
      futureOrToday.sort((a, b) => a.iso.localeCompare(b.iso));
      dueOnField = {
        value: futureOrToday[0].iso,
        confidence: futureOrToday[0].confidence,
        why: "due-keyword",
      };
    } else {
      dueKeywordDates.sort((a, b) => b.iso.localeCompare(a.iso));
      dueOnField = {
        value: dueKeywordDates[0].iso,
        confidence: dueKeywordDates[0].confidence,
        why: "overdue-due-keyword",
      };
      overdue = true;
    }
  } else if (ordinalDueISO) {
    dueOnField = {
      value: ordinalDueISO,
      confidence: "low",
      why: "ordinal-day",
    };
    if (ordinalDueISO < todayISO) overdue = true;
  } else {
    // If no keyword-labelled date exists, but exactly one non-excluded date exists
    const nonExcluded = evaluated.filter((d) => !d.isExcluded);
    if (nonExcluded.length === 1) {
      dueOnField = {
        value: nonExcluded[0].iso,
        confidence: nonExcluded[0].confidence === "medium" ? "medium" : "low",
        why: "single-date",
      };
      if (nonExcluded[0].iso < todayISO) overdue = true;
    }
  }

  // 4. Repeat & Offsets
  let repeatField: Field<Repeat> | undefined;
  const defRepeat = repeatFromDict ?? CATEGORY_DEFAULTS[category].defaultRepeat;
  const offsets = CATEGORY_DEFAULTS[category].defaultOffsets;

  // Check text overrides for repeat
  if (/\b(monthly|per\s*month|\/month|\/mo)\b/i.test(joined)) {
    repeatField = { value: "monthly", confidence: "high", why: "text-monthly" };
  } else if (/\b(annual|yearly|per\s*year|\/year|mode:\s*yearly|mode:\s*annual)\b/i.test(joined)) {
    repeatField = { value: "yearly", confidence: "high", why: "text-yearly" };
  } else if (/\b(quarterly|half\s*yearly)\b/i.test(joined)) {
    repeatField = {
      value: "none",
      confidence: "low",
      why: "This looks quarterly. DocVault doesn't repeat quarterly yet, so it's set to once.",
    };
  } else if (ordinalRepeatMonthly) {
    repeatField = { value: "monthly", confidence: "low", why: "ordinal-day" };
  } else if (defRepeat !== "none") {
    repeatField = { value: defRepeat, confidence: "medium", why: "category-default" };
  } else {
    repeatField = { value: "none", confidence: "medium", why: "default" };
  }

  // 5. Reference number
  let referenceField: Field<string> | undefined;
  const refMatch = RE_REF.exec(joined);
  if (refMatch) {
    const val = refMatch[2].trim();
    const digits = val.replace(/\D/g, "");
    if (digits.length >= 4 && val.length >= 5 && val.length <= 20) {
      referenceField = {
        value: val,
        confidence: "high",
        why: refMatch[1],
      };
    }
  }

  // 6. isBill
  const isBill = !!amountField && (!!dueOnField || !!title);

  return {
    isBill,
    title,
    amount: amountField,
    amountAlternatives: alternatives,
    dueOn: dueOnField,
    repeat: repeatField,
    reference: referenceField,
    category,
    offsets,
    overdue,
  };
}
