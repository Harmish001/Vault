import type { VaultFile } from "../types";
import { guessMime } from "../utils";

/**
 * Computes the narrowest MIME type that covers all files in a multi-file share intent:
 * exact match when identical, `<type>/*` when sharing one top-level kind (e.g. `image/*`),
 * or wildcard when mixed document types are selected.
 */
export function commonShareMime(files: Pick<VaultFile, "name" | "mime">[]): string {
  if (!files.length) return "*/*";
  const mimes = files.map((f) => guessMime(f.name, f.mime));
  const first = mimes[0];
  if (mimes.every((m) => m === first)) return first;

  const top = first.split("/")[0];
  if (top && top !== "*" && mimes.every((m) => m.startsWith(top + "/"))) {
    return `${top}/*`;
  }
  return "*/*";
}
