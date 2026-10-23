import type { Reminder } from "../types";

export type DraftFields = {
  title?: string;
  reference?: string;
  amount?: string;
  amountValue?: number;
  dueOn?: string;
};

function normalizeRef(ref: string): string {
  return ref.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function normalizeTitle(title: string): string {
  return title.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

/**
 * Finds an existing reminder that matches this bill draft.
 * 1. Same non-empty reference (alphanumeric only, case-insensitive) -> match reason "reference"
 * 2. Same normalized title AND existing reminder repeats (monthly/yearly) -> match reason "title"
 */
export function findMatch(
  draft: DraftFields,
  existing: Reminder[]
): { reminder: Reminder; reason: "reference" | "title" } | null {
  if (!existing?.length) return null;

  // 1. Reference match
  if (draft.reference?.trim()) {
    const normRef = normalizeRef(draft.reference);
    if (normRef) {
      for (const r of existing) {
        if (r.reference && normalizeRef(r.reference) === normRef) {
          return { reminder: r, reason: "reference" };
        }
      }
    }
  }

  // 2. Title match for repeating reminders
  if (draft.title?.trim()) {
    const normTitle = normalizeTitle(draft.title);
    if (normTitle) {
      for (const r of existing) {
        if (
          (r.repeat === "monthly" || r.repeat === "yearly") &&
          normalizeTitle(r.title) === normTitle
        ) {
          return { reminder: r, reason: "title" };
        }
      }
    }
  }

  return null;
}

/**
 * Clears fileId on any reminders pointing to deleted files.
 */
export function unlinkFile(
  reminders: Reminder[] | undefined,
  fileIds: string[]
): Reminder[] {
  if (!reminders?.length || !fileIds.length) return reminders ? [...reminders] : [];
  const doomed = new Set(fileIds);
  return reminders.map((r) => {
    if (r.fileId && doomed.has(r.fileId)) {
      const copy = { ...r };
      delete copy.fileId;
      return copy;
    }
    return r;
  });
}
