import { requireOptionalNativeModule } from "expo";
import type { Folder } from "./types";

type Shortcut = { id: string; label: string; color: string; url: string };

// Missing in Expo Go and on iOS; every helper then reports "not supported".
const native = requireOptionalNativeModule<{
  isSupported(): boolean;
  pin(s: Shortcut): boolean;
  sync(folders: Shortcut[]): void;
}>("FolderShortcuts");

const toShortcut = (f: Folder): Shortcut => ({
  id: f.id,
  label: f.name,
  color: f.color,
  url: `docvault://quick/folder?id=${encodeURIComponent(f.id)}`,
});

export const canPinFolders = () => native?.isSupported() ?? false;

/** Asks the launcher to place the shortcut; Android shows its own confirmation. */
export const pinFolder = (f: Folder) => native?.pin(toShortcut(f)) ?? false;

/** Keeps pinned folder shortcuts in step with renames, recolors and deletes. */
export function syncFolderShortcuts(folders: Folder[]) {
  try {
    native?.sync(folders.map(toShortcut));
  } catch {
    // launcher rate limits are not worth surfacing; the next change retries
  }
}
