import type { Favorite, Folder, VaultFile, VaultIndex } from "./types";
import { folderPath } from "./utils";

export const sameFav = (a: Favorite, kind: Favorite["kind"], id: string) => a.kind === kind && a.id === id;

export function isFavorite(favs: Favorite[], kind: Favorite["kind"], id: string): boolean {
  return favs.some((f) => sameFav(f, kind, id));
}

/** Adds at the end, or removes if already there. */
export function toggleFavorite(favs: Favorite[], kind: Favorite["kind"], id: string): Favorite[] {
  return isFavorite(favs, kind, id) ? favs.filter((f) => !sameFav(f, kind, id)) : [...favs, { kind, id }];
}

/** Drops favorites whose file or folder no longer exists (deleted, or missing after a restore). */
export function pruneFavorites(favs: Favorite[] | undefined, files: VaultFile[], folders: Folder[]): Favorite[] {
  if (!favs?.length) return [];
  const fileIds = new Set(files.map((f) => f.id));
  const folderIds = new Set(folders.map((f) => f.id));
  return favs.filter((f) => (f.kind === "file" ? fileIds.has(f.id) : folderIds.has(f.id)));
}

export type WidgetItem = { id: string; name: string; folder: string; mime: string; storedAs: string };

/** Favorite files for the home-screen widget, in the user's order. Folders stay in the app. */
export function widgetItems(index: Pick<VaultIndex, "files" | "folders" | "favorites">, hidden: string[]): WidgetItem[] {
  const skip = new Set(hidden);
  const byId = new Map(index.files.map((f) => [f.id, f]));
  const out: WidgetItem[] = [];
  for (const fav of index.favorites ?? []) {
    const f = fav.kind === "file" && !skip.has(fav.id) ? byId.get(fav.id) : undefined;
    if (f) out.push({ id: f.id, name: f.name, folder: folderPath(index.folders, f.folderId), mime: f.mime, storedAs: f.storedAs });
  }
  return out;
}
