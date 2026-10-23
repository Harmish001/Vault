// Run with: npm test   (favorites list rules and widget contents, no phone needed)
import { isFavorite, pruneFavorites, toggleFavorite, widgetItems } from "../src/favorites";
import type { Favorite, Folder, VaultFile } from "../src/types";

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

let favs: Favorite[] = [];
favs = toggleFavorite(favs, "file", "pp");
favs = toggleFavorite(favs, "folder", "dad");
favs = toggleFavorite(favs, "file", "ins");
assert(favs.map((f) => f.id).join() === "pp,dad,ins", "new favorites are added at the end");
assert(isFavorite(favs, "folder", "dad") && !isFavorite(favs, "file", "dad"), "files and folders are told apart");
favs = toggleFavorite(favs, "folder", "dad");
assert(favs.map((f) => f.id).join() === "pp,ins", "toggling again removes");

const stale: Favorite[] = [{ kind: "file", id: "gone" }, ...favs, { kind: "folder", id: "missing" }];
assert(pruneFavorites(stale, files, folders).map((f) => f.id).join() === "pp,ins", "missing files and folders are dropped");
assert(pruneFavorites(undefined, files, folders).length === 0, "older indexes without favorites work");

const order: Favorite[] = [
  { kind: "file", id: "ins" },
  { kind: "folder", id: "dad" },
  { kind: "file", id: "dl" },
  { kind: "file", id: "pp" },
];
const items = widgetItems({ files, folders, favorites: order }, ["dl"]);
assert(items.map((i) => i.id).join() === "ins,pp", "widget keeps the user's order, skips folders and hidden files");
assert(items[1].folder === "Dad / IDs" && items[1].name === "Passport.pdf", "widget items carry name and folder path");
assert(widgetItems({ files, folders }, []).length === 0, "no favorites means an empty widget");

console.log("\nAll favorites tests passed.");
