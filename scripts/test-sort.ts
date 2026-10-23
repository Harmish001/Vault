// Run with: npm test   (file sort orders and batch tagging, no phone needed)
import { cleanTag, mergeTags, sortFiles } from "../src/utils";
import type { VaultFile } from "../src/types";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

const file = (id: string, name: string, extra: Partial<VaultFile> = {}): VaultFile => ({
  id,
  folderId: "f",
  name,
  mime: "application/pdf",
  size: 1,
  storedAs: id + ".pdf",
  addedAt: 0,
  ...extra,
});

const files = [
  file("a", "passport.pdf", { addedAt: 3, size: 500, expiresOn: "2030-01-01", openedAt: 100 }),
  file("b", "Aadhaar.pdf", { addedAt: 1, size: 900 }),
  file("c", "Bill 10.pdf", { addedAt: 2, size: 50, expiresOn: "2025-06-30", openedAt: 300 }),
  file("d", "Bill 9.pdf", { addedAt: 4, size: 200 }),
];
const order = (by: Parameters<typeof sortFiles>[1]) => sortFiles(files, by).map((f) => f.id).join("");

assert(order("added") === "dacb", "date added: newest first");
assert(order(undefined) === "dacb", "date added is the default");
assert(order("name") === "bdca", "name: A to Z, ignoring case, numbers in natural order");
assert(order("size") === "badc", "size: largest first");
assert(order("expiry") === "cabd", "expiry: soonest (or expired) first, files without one last by name");
assert(order("opened") === "cadb", "last opened: most recent first, never-opened last by newest");
assert(files[0].id === "a", "sorting doesn't change the original list");

assert(cleanTag("  ##Tax ") === "Tax", "tags lose spaces and leading #");
assert(mergeTags(["Tax"], ["tax", "2026", "2026"]).join() === "Tax,2026", "tags merge without duplicates in any case");
assert(mergeTags(undefined, ["x"]).join() === "x", "files without tags can be tagged");

console.log("\nAll sort tests passed.");
