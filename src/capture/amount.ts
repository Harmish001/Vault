/**
 * Amount extraction and Indian Rupee (INR) formatting/parsing for bill capture.
 */

export type Confidence = "high" | "medium" | "low";

export type AmountLabel = "total" | "minimum" | "payable" | "after-due" | "plain";

export type AmountCandidate = {
  value: number; // in rupees
  text: string; // as formatted/shown, e.g. "₹12,430.50"
  label: AmountLabel;
  confidence: Confidence;
};

/**
 * Format a numeric amount in INR according to the Indian numbering system.
 * Two decimal places only when paise are present (e.g. 123456.78 -> ₹1,23,456.78, 499 -> ₹499).
 */
export function formatINR(n: number): string {
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const hasPaise = abs % 1 !== 0;
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  let res = "";
  if (intPart.length <= 3) {
    res = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const parts: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      parts.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    res = parts.join(",") + "," + last3;
  }
  return `${isNegative ? "-" : ""}₹${res}${hasPaise ? "." + decPart : ""}`;
}

/**
 * Parses an INR string to a number.
 * Returns null if not a valid amount or outside [1, 10_000_000].
 */
export function parseINR(s: string): number | null {
  if (!s || typeof s !== "string") return null;
  // Clean currency symbols, commas, whitespace, trailing /-
  const cleaned = s
    .replace(/[₹\s]|(?:\b|^)(?:rs\.?|inr|rupees)(?:\b|$)/gi, "")
    .replace(/\/-$/, "")
    .replace(/,/g, "")
    .trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const val = parseFloat(cleaned);
  if (isNaN(val) || val < 1 || val > 10_000_000) return null;
  return Math.round(val * 100) / 100;
}

// Triggers defined in §8.4
const TRIGGERS_AFTER_DUE = [
  "after due date",
  "late fee",
  "late payment",
  "penalty",
  "surcharge",
];

const TRIGGERS_TOTAL = [
  "total amount due",
  "total due",
  "total payable",
  "amount due",
  "outstanding",
];

const TRIGGERS_PAYABLE = [
  "net payable",
  "amount payable",
  "payable by",
  "pay now",
  "bill amount",
  "premium amount",
  "premium",
  "amount to pay",
  "you will be charged",
  "you'll be charged",
  "charged",
  "bill of",
];

const TRIGGERS_MINIMUM = [
  "minimum amount due",
  "min. amount due",
  "min amount due",
  "min due",
  "minimum due",
];

function detectLabel(context: string): AmountLabel {
  let c = context.toLowerCase();
  // Sentence / clause separator: comma, semicolon, pipe, newline, or period followed by space
  const match = /[,;|\n]|(?:\.\s+)/g;
  let lastSep = -1;
  let m: RegExpExecArray | null;
  while ((m = match.exec(c)) !== null) {
    lastSep = m.index + m[0].length;
  }
  if (lastSep !== -1) {
    c = c.slice(lastSep);
  }

  let bestLabel: AmountLabel = "plain";
  let bestEnd = -1;

  const allTriggers: [string[], AmountLabel][] = [
    [TRIGGERS_AFTER_DUE, "after-due"],
    [TRIGGERS_MINIMUM, "minimum"],
    [TRIGGERS_TOTAL, "total"],
    [TRIGGERS_PAYABLE, "payable"],
  ];

  for (const [triggers, label] of allTriggers) {
    for (const t of triggers) {
      const idx = c.lastIndexOf(t);
      if (idx !== -1) {
        const end = idx + t.length;
        if (end > bestEnd) {
          bestEnd = end;
          bestLabel = label;
        }
      }
    }
  }

  return bestLabel;
}

/**
 * Extract amount candidates from normalized text lines.
 */
export function extractAmountCandidates(
  text: string,
  lines: string[]
): { chosen?: AmountCandidate; alternatives: AmountCandidate[] } {
  const candidates: (AmountCandidate & { lineIndex: number; onSameLine: boolean; indexInDoc: number })[] = [];

  // Match:
  // 1) Currency symbol before: (₹|Rs|INR) [\d,]+(\.\d{1,2})?
  // 2) Currency symbol after: [\d,]+(\.\d{1,2})? (rs|inr|rupees|/-)
  // 3) Keyword preceded amount: (?:amount|due|pay|total|charged|premium)\s*[:\-]?\s*₹?\s*[\d,]+(\.\d{1,2})?
  // Reject longer digit runs (>= 10 digits without decimal or comma, or >= 8 plain digits like 20261023)
  const amountRegex =
    /(?:(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|rupees|\/-)|(?:₹\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:\/month|\/mo|\/year))/gi;

  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    amountRegex.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = amountRegex.exec(line)) !== null) {
      const rawNum = m[1] ?? m[2] ?? m[3];
      if (!rawNum) continue;

      // Check digit run: if digits without commas/dots >= 8, ignore (e.g. phone numbers, ref codes)
      const digitsOnly = rawNum.replace(/\D/g, "");
      if (digitsOnly.length >= 8 && !rawNum.includes(",") && !rawNum.includes(".")) continue;

      const val = parseINR(rawNum);
      if (val === null) continue;

      // Extract 40 chars before the match on the same line, or previous line if match is at start of line
      let context = line.slice(Math.max(0, m.index - 40), m.index);
      let onSameLine = context.trim().length > 0;
      if (m.index < 5 && lIdx > 0) {
        const prevLine = lines[lIdx - 1];
        context = prevLine.slice(-40) + " " + context;
      }

      const label = detectLabel(context);
      const conf: Confidence =
        (label === "total" || label === "payable") && onSameLine
          ? "high"
          : "low"; // will adjust for plain below

      candidates.push({
        value: val,
        text: formatINR(val),
        label,
        confidence: conf,
        lineIndex: lIdx,
        onSameLine,
        indexInDoc: candidates.length,
      });
    }
  }

  // Also check if any candidate was missed if formatted as `Net Payable Amount: ₹ 1,846.00`
  // The above regex matches it because of `₹\s*1,846.00`.
  // What about `Total ₹2,499`? The regex matches `₹\s*2,499`.
  // What about `amount ₹500`? Matches `₹\s*500`.

  if (!candidates.length) {
    return { alternatives: [] };
  }

  // Remove exact duplicate values (keep the one with best priority / first)
  const uniqueCandidates: typeof candidates = [];
  const seenValues = new Set<number>();
  for (const c of candidates) {
    if (!seenValues.has(c.value)) {
      seenValues.add(c.value);
      uniqueCandidates.push(c);
    }
  }

  // Choose the default amount:
  // Priority: total (1) > payable (2) > plain (4)
  // minimum (3) and after-due are alternative only
  const eligible = uniqueCandidates.filter(
    (c) => c.label === "total" || c.label === "payable" || c.label === "plain"
  );

  let chosen: AmountCandidate | undefined;

  if (eligible.length > 0) {
    // Check if total exists
    const totals = eligible.filter((c) => c.label === "total");
    if (totals.length > 0) {
      chosen = totals[0];
    } else {
      const payables = eligible.filter((c) => c.label === "payable");
      if (payables.length > 0) {
        chosen = payables[0];
      } else {
        // Only plain exist
        const plains = eligible.filter((c) => c.label === "plain");
        if (plains.length > 1) {
          // Sort by value descending
          const sorted = [...plains].sort((a, b) => b.value - a.value);
          if (sorted[0].value >= 2 * sorted[1].value) {
            chosen = { ...sorted[0], confidence: "medium" };
          } else {
            chosen = { ...plains[0], confidence: "low" };
          }
        } else {
          chosen = { ...plains[0], confidence: "low" };
        }
      }
    }
  } else {
    // No total, payable, or plain. Fallback to first minimum or after-due if any
    chosen = uniqueCandidates[0];
  }

  // Alternatives: all other candidates ordered by minimum, after-due, plain
  const remaining = uniqueCandidates.filter((c) => c.value !== chosen?.value);

  const minimums = remaining.filter((c) => c.label === "minimum");
  const afterDues = remaining.filter((c) => c.label === "after-due");
  const others = remaining.filter((c) => c.label !== "minimum" && c.label !== "after-due");

  const alternatives: AmountCandidate[] = [
    ...minimums.map(({ value, text, label, confidence }) => ({ value, text, label, confidence })),
    ...afterDues.map(({ value, text, label, confidence }) => ({ value, text, label, confidence })),
    ...others.map(({ value, text, label, confidence }) => ({ value, text, label, confidence })),
  ];

  return {
    chosen: chosen
      ? {
          value: chosen.value,
          text: chosen.text,
          label: chosen.label,
          confidence: chosen.confidence,
        }
      : undefined,
    alternatives,
  };
}
