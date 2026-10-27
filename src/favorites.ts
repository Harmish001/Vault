import type { Favorite, Folder, Note, VaultFile, VaultIndex } from "./types";
import { folderPath } from "./utils";

export const sameFav = (a: Favorite, kind: Favorite["kind"], id: string) => a.kind === kind && a.id === id;

export function isFavorite(favs: Favorite[], kind: Favorite["kind"], id: string): boolean {
  return favs.some((f) => sameFav(f, kind, id));
}

/** Adds at the end, or removes if already there. */
export function toggleFavorite(favs: Favorite[], kind: Favorite["kind"], id: string): Favorite[] {
  return isFavorite(favs, kind, id) ? favs.filter((f) => !sameFav(f, kind, id)) : [...favs, { kind, id }];
}

/** Drops favorites whose file, folder or note no longer exists (deleted, or missing after a restore). */
export function pruneFavorites(
  favs: Favorite[] | undefined,
  files: VaultFile[],
  folders: Folder[],
  notes: Note[] = []
): Favorite[] {
  if (!favs?.length) return [];
  const fileIds = new Set(files.map((f) => f.id));
  const folderIds = new Set(folders.map((f) => f.id));
  const noteIds = new Set(notes.map((n) => n.id));
  return favs.filter((f) => {
    if (f.kind === "file") return fileIds.has(f.id);
    if (f.kind === "folder") return folderIds.has(f.id);
    if (f.kind === "note") return noteIds.has(f.id);
    return false;
  });
}

export type WidgetItem = {
  id: string;
  name: string;
  folder: string;
  mime: string;
  storedAs: string;
  kind?: "file" | "note";
  hasInfo?: boolean;
};

/** Favorite files and notes for the home-screen widget, in the user's order. Folders stay in the app. */
export function widgetItems(
  index: Pick<VaultIndex, "files" | "folders" | "favorites"> & { notes?: Note[] },
  hidden: string[]
): WidgetItem[] {
  const skip = new Set(hidden);
  const byFileId = new Map(index.files.map((f) => [f.id, f]));
  const byNoteId = new Map((index.notes ?? []).map((n) => [n.id, n]));
  const out: WidgetItem[] = [];
  for (const fav of index.favorites ?? []) {
    if (skip.has(fav.id)) continue;
    if (fav.kind === "file") {
      const f = byFileId.get(fav.id);
      if (f) {
        const hasInfo = Boolean((f.fields && f.fields.some((field) => field.value?.trim())) || f.notes?.trim());
        out.push({
          id: f.id,
          name: f.name,
          folder: folderPath(index.folders, f.folderId),
          mime: f.mime,
          storedAs: f.storedAs,
          kind: "file",
          hasInfo,
        });
      }
    } else if (fav.kind === "note") {
      const n = byNoteId.get(fav.id);
      if (n) {
        out.push({
          id: n.id,
          name: n.title || "Untitled",
          folder: n.isSecret ? "Secure Note" : "Note",
          mime: "text/plain",
          storedAs: "",
          kind: "note",
          hasInfo: true,
        });
      }
    }
  }
  return out;
}
