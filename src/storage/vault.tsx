import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NativeModules } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Directory as PickedDirectory, File as PickedFile } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { isPasswordProtected, unzip, unzipWithPassword, zip, zipWithPassword } from "react-native-zip-archive";
import { Favorite, Folder, IncomingFile, Profile, Reminder, VaultFile, VaultIndex } from "../types";
import { loadKey, randomNonce, replaceKey } from "../security/keystore";
import { decryptString, encryptString } from "../security/crypto";
import { pruneFavorites, toggleFavorite as toggleFav } from "../favorites";

export type FilePatch = Partial<Pick<VaultFile, "notes" | "tags" | "expiresOn" | "fields">>;
import { extOf, guessMime, mergeTags, stripFileScheme, uid, uniqueName } from "../utils";
import { openFile } from "../openFile";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_");
import { SCANNER_TMP, SCAN_OUT } from "../scan/paths";
import { folderColors } from "../theme";

const DOC = FileSystem.documentDirectory ?? "";
const CACHE = FileSystem.cacheDirectory ?? "";
const ROOT = DOC + "vault/";
const FILES_DIR = ROOT + "files/";
// The real index is encrypted and lives OUTSIDE vault/, so backups never pick it up.
const INDEX_ENC = DOC + "vault.enc";
const INDEX_ENC_TMP = DOC + "vault.enc.tmp";
// A plain index.json inside vault/ is only ever (a) an index from an older app version,
// (b) the index inside a backup being restored, or (c) a short-lived copy made while exporting.
const INDEX_PLAIN = ROOT + "index.json";
const INDEX_PLAIN_TMP = ROOT + "index.json.tmp";
const SHARE_DIR = CACHE + "share/";
const RESTORE_ZIP = CACHE + "restore.zip";
const RESTORE_DIR = CACHE + "restore/";
const OLD_ROOT = DOC + "vault_old/";

const EMPTY: VaultIndex = { version: 1, folders: [], files: [], reminders: [] };

export const PASSWORD_REQUIRED = "PASSWORD_REQUIRED";
export const BACKUPS_UNAVAILABLE =
  "Backups need the installed DocVault app. They can't run inside Expo Go, which doesn't include the zip module.";
export const backupFileName = () => `DocVault-backup-${new Date().toISOString().slice(0, 10)}.zip`;
const zipReady = () => Boolean(NativeModules.RNZipArchive);

async function exists(uri: string) {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

function parseIndex(text: string): VaultIndex | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.folders) && Array.isArray(parsed.files)) {
      return { ...parsed, reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [] } as VaultIndex;
    }
  } catch {
    // not a usable index
  }
  return null;
}

async function readPlain(uri: string): Promise<VaultIndex | null> {
  try {
    if (!(await exists(uri))) return null;
    return parseIndex(await FileSystem.readAsStringAsync(uri));
  } catch {
    return null;
  }
}

async function readEncrypted(uri: string, key: Uint8Array): Promise<{ index: VaultIndex | null; tried: boolean }> {
  if (!(await exists(uri))) return { index: null, tried: false };
  try {
    return { index: parseIndex(decryptString(key, await FileSystem.readAsStringAsync(uri))), tried: true };
  } catch {
    return { index: null, tried: true };
  }
}

async function mtime(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && "modificationTime" in info ? info.modificationTime ?? 0 : 0;
}

async function persistIndex(key: Uint8Array, idx: VaultIndex) {
  await FileSystem.writeAsStringAsync(INDEX_ENC_TMP, encryptString(key, JSON.stringify(idx), randomNonce()));
  await FileSystem.deleteAsync(INDEX_ENC, { idempotent: true });
  await FileSystem.moveAsync({ from: INDEX_ENC_TMP, to: INDEX_ENC });
}

async function removePlainIndexes() {
  await FileSystem.deleteAsync(INDEX_PLAIN, { idempotent: true });
  await FileSystem.deleteAsync(INDEX_PLAIN_TMP, { idempotent: true });
}

export const VAULT_UNREADABLE =
  "DocVault can't read its saved data on this phone. This can happen if the phone's secure storage was reset. Your files are untouched. Restore a backup to continue.";

type Loaded = { key: Uint8Array | null; index: VaultIndex; error: string | null; reason?: string };

function unreadable(key: Uint8Array | null, reason: string): Loaded {
  console.warn("[vault] can't read saved data:", reason);
  return { key, index: { ...EMPTY }, error: VAULT_UNREADABLE, reason };
}

/**
 * Loads the vault and, if needed, upgrades it:
 *  - older versions kept a plain index.json: it is encrypted and the plain copy removed;
 *  - a restored backup brings a plain index.json that is newer than the encrypted one: it is imported.
 * If the encrypted index exists but cannot be decrypted, nothing is ever overwritten.
 */
async function loadVault(): Promise<Loaded> {
  await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  const encExists = (await exists(INDEX_ENC)) || (await exists(INDEX_ENC_TMP));

  let key: Uint8Array | null;
  try {
    key = await loadKey(!encExists); // never invent a key if encrypted data already exists
  } catch (e) {
    return unreadable(null, "secure storage read failed: " + (e instanceof Error ? e.message : String(e)));
  }

  const plain = (await readPlain(INDEX_PLAIN)) ?? (await readPlain(INDEX_PLAIN_TMP));
  let current: VaultIndex | null = null;
  let tried = false;
  if (key) {
    for (const cand of [INDEX_ENC, INDEX_ENC_TMP]) {
      const r = await readEncrypted(cand, key);
      tried = tried || r.tried;
      if (r.index) {
        current = r.index;
        break;
      }
    }
  }

  let importedPlain = false;
  if (plain) {
    const plainPath = (await exists(INDEX_PLAIN)) ? INDEX_PLAIN : INDEX_PLAIN_TMP;
    if (!current || (await mtime(plainPath)) > (await mtime(INDEX_ENC))) {
      current = plain;
      importedPlain = true;
    }
  }

  if (!current) {
    if (encExists) {
      return unreadable(key, !key ? "encryption key missing" : tried ? "saved data doesn't decrypt with this key" : "saved data file is missing");
    }
    current = { ...EMPTY };
  }
  if (!key) return { ...unreadable(key, "encryption key missing"), index: current };

  if (!encExists || importedPlain) await persistIndex(key, current);
  if (plain) await removePlainIndexes();
  return { key, index: current, error: null };
}

export const vaultFilePath = (storedAs: string) => FILES_DIR + storedAs;

/**
 * Read-only load for code running without the app UI (the home-screen widget).
 * Never migrates, creates a key or writes anything; returns null if the index can't be read.
 */
export async function readVaultIndex(): Promise<VaultIndex | null> {
  try {
    const key = await loadKey(false);
    if (!key) return null;
    for (const cand of [INDEX_ENC, INDEX_ENC_TMP]) {
      const r = await readEncrypted(cand, key);
      if (r.index) return r.index;
    }
  } catch {
    // treated as unreadable
  }
  return null;
}

function normalizeUri(uri: string) {
  return /^(file|content):\/\//.test(uri) ? uri : "file://" + uri;
}

import { unlinkFile } from "../capture/match";
export { unlinkFile };

async function clearTempFiles() {
  try {
    await FileSystem.deleteAsync(SHARE_DIR, { idempotent: true });
    await FileSystem.deleteAsync(SCAN_OUT, { idempotent: true });
    await FileSystem.deleteAsync(SCANNER_TMP, { idempotent: true });
    await FileSystem.deleteAsync(RESTORE_ZIP, { idempotent: true });
    await FileSystem.deleteAsync(RESTORE_DIR, { idempotent: true });
    const names = await FileSystem.readDirectoryAsync(CACHE);
    await Promise.all(
      names
        .filter((n) => n.startsWith("DocVault-backup-"))
        .map((n) => FileSystem.deleteAsync(CACHE + n, { idempotent: true }))
    );
  } catch {
    // best effort
  }
}

type Ctx = {
  ready: boolean;
  /** set when the encrypted data cannot be read; writes are blocked until a backup is restored */
  error: string | null;
  /** short technical reason for `error`, for support */
  errorDetail: string | null;
  /**
   * Gives up on unreadable data: the old index is set aside (renamed, not deleted) and the stored
   * documents are listed in a "Recovered files" folder. Resolves to how many were recovered.
   */
  startFresh: () => Promise<number>;
  reminders: Reminder[];
  createReminder: (r: Omit<Reminder, "id" | "createdAt">) => Promise<Reminder>;
  updateReminder: (id: string, patch: Partial<Omit<Reminder, "id" | "createdAt">>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  /** only entries whose file or folder still exists, in the user's order */
  favorites: Favorite[];
  toggleFavorite: (kind: Favorite["kind"], id: string) => Promise<void>;
  reorderFavorites: (next: Favorite[]) => Promise<void>;
  /** the owner's emergency card and autofill details; null until first saved */
  profile: Profile | null;
  saveProfile: (p: Profile) => Promise<void>;
  folders: Folder[];
  files: VaultFile[];
  createFolder: (name: string, parentId: string | null, color: string) => Promise<Folder>;
  updateFolder: (id: string, patch: Partial<Pick<Folder, "name" | "color">>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  ensureFolder: (name: string, color?: string) => Promise<Folder>;
  addFiles: (folderId: string, incoming: IncomingFile[]) => Promise<{ added: number; failed: string[]; files: VaultFile[] }>;
  renameFile: (id: string, name: string) => Promise<void>;
  updateFile: (id: string, patch: FilePatch) => Promise<void>;
  moveFile: (id: string, folderId: string) => Promise<void>;
  moveFiles: (ids: string[], folderId: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  deleteFiles: (ids: string[]) => Promise<void>;
  addTags: (ids: string[], tags: string[]) => Promise<void>;
  /** opens in another app and remembers when, for "Last opened" sorting */
  openFile: (f: VaultFile) => Promise<void>;
  fileUri: (f: VaultFile) => string;
  shareFile: (f: VaultFile) => Promise<void>;
  /** copies under their real names into a folder the user picks; resolves how many were saved (0 if cancelled) */
  exportFiles: (files: VaultFile[]) => Promise<number>;
  shareFilesZip: (files: VaultFile[]) => Promise<void>;
  canZip: boolean;
  /** saveTo: a document uri picked with Android's "save as" screen; without it the share sheet opens */
  exportBackup: (password?: string, saveTo?: string) => Promise<void>;
  restoreBackup: (pickedUri: string, password?: string) => Promise<void>;
  totalBytes: number;
};

const VaultContext = createContext<Ctx | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState<VaultIndex>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const latest = useRef<VaultIndex>(EMPTY);
  const keyRef = useRef<Uint8Array | null>(null);
  const errorRef = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const apply = (l: Loaded) => {
    keyRef.current = l.key;
    errorRef.current = l.error;
    latest.current = l.index;
    setError(l.error);
    setErrorDetail(l.reason ?? null);
    setIndex(l.index);
  };

  useEffect(() => {
    (async () => {
      await clearTempFiles();
      apply(await loadVault());
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Serialises all writes so two quick taps can't interleave and lose data. */
  const mutate = useCallback(<T,>(fn: (cur: VaultIndex) => Promise<{ next: VaultIndex; result: T }>) => {
    const run = queue.current.then(async () => {
      if (errorRef.current || !keyRef.current) throw new Error(errorRef.current ?? "Vault is locked");
      const { next, result } = await fn(latest.current);
      await persistIndex(keyRef.current, next);
      latest.current = next;
      setIndex(next);
      return result;
    });
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const createFolder: Ctx["createFolder"] = (name, parentId, color) =>
    mutate(async (cur) => {
      const siblings = cur.folders.filter((f) => f.parentId === parentId).map((f) => f.name);
      const folder: Folder = {
        id: uid(),
        name: uniqueName(siblings, name.trim()),
        parentId,
        color,
        createdAt: Date.now(),
      };
      return { next: { ...cur, folders: [...cur.folders, folder] }, result: folder };
    });

  const updateFolder: Ctx["updateFolder"] = (id, patch) =>
    mutate(async (cur) => ({
      next: {
        ...cur,
        folders: cur.folders.map((f) =>
          f.id === id ? { ...f, ...patch, name: patch.name ? patch.name.trim() : f.name } : f
        ),
      },
      result: undefined,
    }));

  const deleteFolder: Ctx["deleteFolder"] = (id) =>
    mutate(async (cur) => {
      const doomed = new Set<string>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of cur.folders) {
          if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
            doomed.add(f.id);
            grew = true;
          }
        }
      }
      const gone = cur.files.filter((f) => doomed.has(f.folderId));
      const goneIds = gone.map((f) => f.id);
      await Promise.all(gone.map((f) => FileSystem.deleteAsync(FILES_DIR + f.storedAs, { idempotent: true })));
      return {
        next: {
          ...cur,
          folders: cur.folders.filter((f) => !doomed.has(f.id)),
          files: cur.files.filter((f) => !doomed.has(f.folderId)),
          reminders: unlinkFile(cur.reminders, goneIds),
          favorites: (cur.favorites ?? []).filter((f) => (f.kind === "file" ? !goneIds.includes(f.id) : !doomed.has(f.id))),
        },
        result: undefined,
      };
    });

  const ensureFolder: Ctx["ensureFolder"] = (name, color = folderColors[0]) =>
    mutate(async (cur) => {
      const match = cur.folders.find((f) => f.parentId === null && f.name.toLowerCase() === name.trim().toLowerCase());
      if (match) return { next: cur, result: match };
      const folder: Folder = {
        id: uid(),
        name: name.trim(),
        parentId: null,
        color,
        createdAt: Date.now(),
      };
      return { next: { ...cur, folders: [...cur.folders, folder] }, result: folder };
    });

  const addFiles: Ctx["addFiles"] = (folderId, incoming) =>
    mutate(async (cur) => {
      const added: VaultFile[] = [];
      const failed: string[] = [];
      const taken = cur.files.filter((f) => f.folderId === folderId).map((f) => f.name);
      for (const item of incoming) {
        try {
          const id = uid();
          const storedAs = id + extOf(item.name);
          const dest = FILES_DIR + storedAs;
          await FileSystem.copyAsync({ from: normalizeUri(item.uri), to: dest });
          if (normalizeUri(item.uri).startsWith(CACHE)) {
            FileSystem.deleteAsync(normalizeUri(item.uri), { idempotent: true }).catch(() => undefined);
          }
          const info = await FileSystem.getInfoAsync(dest);
          const name = uniqueName(taken, item.name);
          taken.push(name);
          added.push({
            id,
            folderId,
            name,
            mime: guessMime(item.name, item.mime),
            size: info.exists && "size" in info ? info.size : item.size ?? 0,
            storedAs,
            addedAt: Date.now(),
            ...(item.meta?.fields?.length ? { fields: item.meta.fields } : {}),
            ...(item.meta?.tags?.length ? { tags: item.meta.tags } : {}),
            ...(item.meta?.expiresOn ? { expiresOn: item.meta.expiresOn } : {}),
            ...(item.meta?.notes ? { notes: item.meta.notes } : {}),
          });
        } catch {
          failed.push(item.name);
        }
      }
      return { next: { ...cur, files: [...cur.files, ...added] }, result: { added: added.length, failed, files: added } };
    });

  const createReminder: Ctx["createReminder"] = (input) =>
    mutate(async (cur) => {
      const r: Reminder = { ...input, id: uid(), createdAt: Date.now() };
      return { next: { ...cur, reminders: [...(cur.reminders ?? []), r] }, result: r };
    });

  const updateReminder: Ctx["updateReminder"] = (id, patch) =>
    mutate(async (cur) => ({
      next: {
        ...cur,
        reminders: (cur.reminders ?? []).map((r) => {
          if (r.id !== id) return r;
          const n: Reminder = { ...r, ...patch };
          if (!n.amount?.trim()) delete n.amount;
          if (!n.note?.trim()) delete n.note;
          if (!n.doneThrough) delete n.doneThrough;
          if (!n.snoozeUntil) delete n.snoozeUntil;
          if (!n.reference?.trim()) delete n.reference;
          if (!n.fileId) delete n.fileId;
          if (!n.category) delete n.category;
          if (n.amountValue == null || isNaN(n.amountValue)) delete n.amountValue;
          return n;
        }),
      },
      result: undefined,
    }));

  const deleteReminder: Ctx["deleteReminder"] = (id) =>
    mutate(async (cur) => ({
      next: { ...cur, reminders: (cur.reminders ?? []).filter((r) => r.id !== id) },
      result: undefined,
    }));

  const renameFile: Ctx["renameFile"] = (id, name) =>
    mutate(async (cur) => ({
      next: { ...cur, files: cur.files.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) },
      result: undefined,
    }));

  const updateFile: Ctx["updateFile"] = (id, patch) =>
    mutate(async (cur) => ({
      next: {
        ...cur,
        files: cur.files.map((f) => {
          if (f.id !== id) return f;
          const n: VaultFile = { ...f, ...patch };
          const notes = n.notes?.trim();
          if (notes) n.notes = notes;
          else delete n.notes;
          const seen = new Set<string>();
          const tags = (n.tags ?? []).filter((t) => {
            const k = t.toLowerCase();
            if (!t || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (tags.length) n.tags = tags;
          else delete n.tags;
          if (!n.expiresOn) delete n.expiresOn;
          if (!n.fields?.length) delete n.fields;
          return n;
        }),
      },
      result: undefined,
    }));

  const moveFiles: Ctx["moveFiles"] = (ids, folderId) =>
    mutate(async (cur) => {
      const moving = new Set(ids);
      const taken = cur.files.filter((f) => f.folderId === folderId && !moving.has(f.id)).map((f) => f.name);
      return {
        next: {
          ...cur,
          files: cur.files.map((f) => {
            if (!moving.has(f.id) || f.folderId === folderId) return f;
            const name = uniqueName(taken, f.name);
            taken.push(name);
            return { ...f, folderId, name };
          }),
        },
        result: undefined,
      };
    });
  const moveFile: Ctx["moveFile"] = (id, folderId) => moveFiles([id], folderId);

  const deleteFiles: Ctx["deleteFiles"] = (ids) =>
    mutate(async (cur) => {
      const doomed = new Set(ids);
      const gone = cur.files.filter((f) => doomed.has(f.id));
      await Promise.all(gone.map((f) => FileSystem.deleteAsync(FILES_DIR + f.storedAs, { idempotent: true })));
      return {
        next: {
          ...cur,
          files: cur.files.filter((f) => !doomed.has(f.id)),
          reminders: unlinkFile(cur.reminders, ids),
          favorites: (cur.favorites ?? []).filter((f) => !(f.kind === "file" && doomed.has(f.id))),
        },
        result: undefined,
      };
    });
  const deleteFile: Ctx["deleteFile"] = (id) => deleteFiles([id]);

  const addTags: Ctx["addTags"] = (ids, tags) =>
    mutate(async (cur) => {
      const targets = new Set(ids);
      return {
        next: { ...cur, files: cur.files.map((f) => (targets.has(f.id) ? { ...f, tags: mergeTags(f.tags, tags) } : f)) },
        result: undefined,
      };
    });

  const openVaultFile: Ctx["openFile"] = async (f) => {
    if (!(await openFile(FILES_DIR + f.storedAs, f.mime))) return;
    await mutate(async (cur) => ({
      next: { ...cur, files: cur.files.map((x) => (x.id === f.id ? { ...x, openedAt: Date.now() } : x)) },
      result: undefined,
    })).catch(() => undefined);
  };

  const toggleFavorite: Ctx["toggleFavorite"] = (kind, id) =>
    mutate(async (cur) => ({
      next: { ...cur, favorites: toggleFav(pruneFavorites(cur.favorites, cur.files, cur.folders), kind, id) },
      result: undefined,
    }));

  const reorderFavorites: Ctx["reorderFavorites"] = (next) =>
    mutate(async (cur) => ({
      next: { ...cur, favorites: pruneFavorites(next, cur.files, cur.folders) },
      result: undefined,
    }));

  const saveProfile: Ctx["saveProfile"] = (p) => mutate(async (cur) => ({ next: { ...cur, profile: p }, result: undefined }));

  const favorites = useMemo(
    () => pruneFavorites(index.favorites, index.files, index.folders),
    [index.favorites, index.files, index.folders]
  );

  const fileUri = useCallback((f: VaultFile) => FILES_DIR + f.storedAs, []);

  const shareFile: Ctx["shareFile"] = async (f) => {
    // Share under the real file name instead of the internal id.
    await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
    const tmp = SHARE_DIR + safeName(f.name);
    await FileSystem.deleteAsync(tmp, { idempotent: true });
    await FileSystem.copyAsync({ from: FILES_DIR + f.storedAs, to: tmp });
    await Sharing.shareAsync(tmp, { mimeType: f.mime, dialogTitle: f.name });
  };

  const exportFiles: Ctx["exportFiles"] = async (list) => {
    const dir = await PickedDirectory.pickDirectoryAsync().catch(() => null);
    if (!dir) return 0; // picker cancelled
    const taken: string[] = [];
    for (const f of list) {
      const name = uniqueName(taken, safeName(f.name));
      taken.push(name);
      dir.createFile(name, f.mime).write(await new PickedFile(FILES_DIR + f.storedAs).bytes());
    }
    return list.length;
  };

  const shareFilesZip: Ctx["shareFilesZip"] = async (list) => {
    if (!zipReady()) throw new Error(BACKUPS_UNAVAILABLE);
    const dir = SHARE_DIR + "documents/";
    const out = SHARE_DIR + `DocVault-documents-${new Date().toISOString().slice(0, 10)}.zip`;
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await FileSystem.deleteAsync(out, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const taken: string[] = [];
    for (const f of list) {
      const name = uniqueName(taken, safeName(f.name));
      taken.push(name);
      await FileSystem.copyAsync({ from: FILES_DIR + f.storedAs, to: dir + name });
    }
    try {
      await zip(stripFileScheme(dir).replace(/\/$/, ""), stripFileScheme(out));
    } finally {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
    await Sharing.shareAsync(out, { mimeType: "application/zip", dialogTitle: `Share ${list.length} documents` });
  };

  const startFresh: Ctx["startFresh"] = async () => {
    await queue.current;
    const stamp = Date.now();
    for (const p of [INDEX_ENC, INDEX_ENC_TMP]) {
      if (await exists(p)) await FileSystem.moveAsync({ from: p, to: `${p}.unreadable-${stamp}` });
    }
    // Keep a working key (the set-aside index may still open with it later); replace a missing or broken one.
    let key: Uint8Array | null = null;
    try {
      key = await loadKey(false);
    } catch {
      // unreadable key: replaced below
    }
    key = key ?? (await replaceKey());

    await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
    const folder: Folder = { id: uid(), name: "Recovered files", parentId: null, color: folderColors[2], createdAt: Date.now() };
    const files: VaultFile[] = [];
    for (const storedAs of await FileSystem.readDirectoryAsync(FILES_DIR)) {
      const info = await FileSystem.getInfoAsync(FILES_DIR + storedAs);
      if (!info.exists || info.isDirectory) continue;
      files.push({
        id: uid(),
        folderId: folder.id,
        name: `Recovered ${files.length + 1}${extOf(storedAs)}`,
        mime: guessMime(storedAs),
        size: info.size ?? 0,
        storedAs,
        addedAt: info.modificationTime ? Math.round(info.modificationTime * 1000) : Date.now(),
      });
    }
    const next: VaultIndex = { ...EMPTY, folders: files.length ? [folder] : [], files };
    await persistIndex(key, next);
    apply({ key, index: next, error: null });
    return files.length;
  };

  const exportBackup: Ctx["exportBackup"] = async (password, saveTo) => {
    if (!zipReady()) throw new Error(BACKUPS_UNAVAILABLE);
    await queue.current; // let pending writes finish first
    const out = CACHE + backupFileName();
    await FileSystem.deleteAsync(out, { idempotent: true });
    const src = stripFileScheme(ROOT).replace(/\/$/, "");
    const dst = stripFileScheme(out);
    // The on-phone index is encrypted with this phone's key, so a backup carries a readable copy.
    // That copy only exists inside vault/ while the zip is being made, then it is removed again.
    // Use a password to protect the backup file itself.
    await FileSystem.writeAsStringAsync(INDEX_PLAIN, JSON.stringify(latest.current));
    try {
      if (password) await zipWithPassword(src, dst, password, "AES-256" as never);
      else await zip(src, dst);
    } finally {
      await removePlainIndexes();
    }
    if (saveTo) {
      // Content URIs from Drive, Downloads etc. can't be copied to with the legacy API; write the bytes instead.
      try {
        new PickedFile(saveTo).write(await new PickedFile(out).bytes());
      } finally {
        await FileSystem.deleteAsync(out, { idempotent: true });
      }
      return;
    }
    await Sharing.shareAsync(out, { mimeType: "application/zip", dialogTitle: "Save your DocVault backup" });
  };

  const restoreBackup: Ctx["restoreBackup"] = async (pickedUri, password) => {
    if (!zipReady()) throw new Error(BACKUPS_UNAVAILABLE);
    await queue.current;
    await FileSystem.deleteAsync(RESTORE_ZIP, { idempotent: true });
    await FileSystem.deleteAsync(RESTORE_DIR, { idempotent: true });
    await FileSystem.copyAsync({ from: pickedUri, to: RESTORE_ZIP });
    await FileSystem.makeDirectoryAsync(RESTORE_DIR, { intermediates: true });

    const zipPath = stripFileScheme(RESTORE_ZIP);
    const outPath = stripFileScheme(RESTORE_DIR);
    const locked = await isPasswordProtected(zipPath);
    if (locked && !password) throw new Error(PASSWORD_REQUIRED);
    try {
      if (locked) await unzipWithPassword(zipPath, outPath, password as string);
      else await unzip(zipPath, outPath);
    } catch {
      throw new Error(locked ? "Wrong password, or the file is damaged." : "This file could not be unzipped.");
    }

    // The archive holds either index.json at the top or inside a single "vault" folder.
    let newRoot: string | null = null;
    for (const cand of [RESTORE_DIR, RESTORE_DIR + "vault/"]) {
      if (await readPlain(cand + "index.json")) {
        newRoot = cand;
        break;
      }
    }
    if (!newRoot) throw new Error("This is not a DocVault backup.");
    const incoming = (await readPlain(newRoot + "index.json")) as VaultIndex;

    // Keep only records whose file actually made it into the archive.
    const present = new Set(await FileSystem.readDirectoryAsync(newRoot + "files/").catch(() => [] as string[]));
    const cleaned: VaultIndex = { ...incoming, files: incoming.files.filter((f) => present.has(f.storedAs)) };
    await FileSystem.writeAsStringAsync(newRoot + "index.json", JSON.stringify(cleaned));
    await FileSystem.makeDirectoryAsync(newRoot + "files/", { intermediates: true });

    // Swap with rollback: the current vault is only deleted after the new one is in place.
    await FileSystem.deleteAsync(OLD_ROOT, { idempotent: true });
    await FileSystem.moveAsync({ from: ROOT, to: OLD_ROOT });
    try {
      await FileSystem.moveAsync({ from: newRoot, to: ROOT });
    } catch (e) {
      await FileSystem.moveAsync({ from: OLD_ROOT, to: ROOT });
      throw e;
    }
    await FileSystem.deleteAsync(OLD_ROOT, { idempotent: true });
    await clearTempFiles();

    // The restored plain index.json is newer than any encrypted index, so loading imports it,
    // encrypts it with this phone's key and removes the plain copy. If no key exists yet (the
    // "can't read data" case) loadVault creates one because there is no encrypted data left.
    await FileSystem.deleteAsync(INDEX_ENC, { idempotent: true });
    await FileSystem.deleteAsync(INDEX_ENC_TMP, { idempotent: true });
    apply(await loadVault());
  };

  const totalBytes = useMemo(() => index.files.reduce((s, f) => s + (f.size || 0), 0), [index.files]);

  const value: Ctx = {
    ready,
    error,
    errorDetail,
    startFresh,
    reminders: index.reminders ?? [],
    createReminder,
    updateReminder,
    deleteReminder,
    favorites,
    toggleFavorite,
    reorderFavorites,
    profile: index.profile ?? null,
    saveProfile,
    folders: index.folders,
    files: index.files,
    createFolder,
    updateFolder,
    deleteFolder,
    ensureFolder,
    addFiles,
    renameFile,
    updateFile,
    moveFile,
    moveFiles,
    deleteFile,
    deleteFiles,
    addTags,
    openFile: openVaultFile,
    fileUri,
    shareFile,
    exportFiles,
    shareFilesZip,
    canZip: zipReady(),
    exportBackup,
    restoreBackup,
    totalBytes,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside VaultProvider");
  return ctx;
}
