// Run with: npm test   (favorites list rules and widget contents, no phone needed)
import { isFavorite, pruneFavorites, toggleFavorite, widgetItems } from "../src/favorites";
import type { Favorite, Folder, Note, VaultFile } from "../src/types";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

const folders: Folder[] = [
  { id: "dad", name: "Dad", parentId: null, color: "#065F46", createdAt: 0 },
  { id: "ids", name: "IDs", parentId: "dad", color: "#065F46", createdAt: 0 },
];
const file = (id: string, name: string, folderId: string): VaultFile => ({
  id,
  folderId,
  name,
  mime: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
  size: 1,
  storedAs: id + ".bin",
  addedAt: 0,
});
const files = [file("pp", "Passport.pdf", "ids"), file("dl", "Licence.jpg", "ids"), file("ins", "Insurance.pdf", "dad")];
const testNote: Note = {
  id: "n1",
  title: "Wi-Fi Pass",
  content: "secret123",
  isSecret: true,
  createdAt: 0,
  updatedAt: 0,
};

let favs: Favorite[] = [];
favs = toggleFavorite(favs, "file", "pp");
favs = toggleFavorite(favs, "folder", "dad");
favs = toggleFavorite(favs, "file", "ins");
assert(favs.map((f) => f.id).join() === "pp,dad,ins", "new favorites are added at the end");
assert(isFavorite(favs, "folder", "dad") && !isFavorite(favs, "file", "dad"), "files and folders are told apart");
favs = toggleFavorite(favs, "folder", "dad");
assert(favs.map((f) => f.id).join() === "pp,ins", "toggling again removes");

// Note favorite tests
favs = toggleFavorite(favs, "note", "n1");
assert(favs.map((f) => f.id).join() === "pp,ins,n1", "notes can be added to favorites");
assert(isFavorite(favs, "note", "n1"), "notes are detected as favorites");

const stale: Favorite[] = [{ kind: "file", id: "gone" }, ...favs, { kind: "folder", id: "missing" }, { kind: "note", id: "deletedNote" }];
assert(pruneFavorites(stale, files, folders, [testNote]).map((f) => f.id).join() === "pp,ins,n1", "missing files, folders and notes are dropped");
assert(pruneFavorites(undefined, files, folders).length === 0, "older indexes without favorites work");

const order: Favorite[] = [
  { kind: "file", id: "ins" },
  { kind: "note", id: "n1" },
  { kind: "folder", id: "dad" },
  { kind: "file", id: "dl" },
  { kind: "file", id: "pp" },
];
const items = widgetItems({ files, folders, favorites: order, notes: [testNote] }, ["dl"]);
assert(items.map((i) => i.id).join() === "ins,n1,pp", "widget keeps the user's order and includes notes");
assert(items[1].folder === "Secure Note" && items[1].name === "Wi-Fi Pass", "note widget items carry title and secure note label");

const hiddenNoteItems = widgetItems({ files, folders, favorites: order, notes: [testNote] }, ["dl", "n1"]);
assert(hiddenNoteItems.map((i) => i.id).join() === "ins,pp", "notes can be hidden from widget");

assert(widgetItems({ files, folders }, []).length === 0, "no favorites means an empty widget");

console.log("\nAll favorites tests passed.");
