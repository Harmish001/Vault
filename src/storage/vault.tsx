import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { isPasswordProtected, unzip, unzipWithPassword, zip, zipWithPassword } from "react-native-zip-archive";
import { Folder, IncomingFile, Reminder, VaultFile, VaultIndex } from "../types";
import { loadKey, randomNonce } from "../security/keystore";
import { decryptString, encryptString } from "../security/crypto";

export type FilePatch = Partial<Pick<VaultFile, "notes" | "tags" | "expiresOn" | "fields">>;
import { extOf, guessMime, stripFileScheme, uid, uniqueName } from "../utils";
import { SCANNER_TMP, SCAN_OUT } from "../scan/paths";

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

type Loaded = { key: Uint8Array | null; index: VaultIndex; error: string | null };

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
  } catch {
    return { key: null, index: { ...EMPTY }, error: VAULT_UNREADABLE };
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
    if (encExists) return { key, index: { ...EMPTY }, error: VAULT_UNREADABLE };
    current = { ...EMPTY };
  }
  if (!key) return { key, index: current, error: VAULT_UNREADABLE };

  if (!encExists || importedPlain) await persistIndex(key, current);
  if (plain) await removePlainIndexes();
  return { key, index: current, error: null };
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
  reminders: Reminder[];
  createReminder: (r: Omit<Reminder, "id" | "createdAt">) => Promise<Reminder>;
  updateReminder: (id: string, patch: Partial<Omit<Reminder, "id" | "createdAt">>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
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
  deleteFile: (id: string) => Promise<void>;
  fileUri: (f: VaultFile) => string;
  shareFile: (f: VaultFile) => Promise<void>;
  exportBackup: (password?: string) => Promise<void>;
  restoreBackup: (pickedUri: string, password?: string) => Promise<void>;
  totalBytes: number;
};

const VaultContext = createContext<Ctx | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState<VaultIndex>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<VaultIndex>(EMPTY);
  const keyRef = useRef<Uint8Array | null>(null);
  const errorRef = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const apply = (l: Loaded) => {
    keyRef.current = l.key;
    errorRef.current = l.error;
    latest.current = l.index;
    setError(l.error);
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
        },
        result: undefined,
      };
    });

  const ensureFolder: Ctx["ensureFolder"] = (name, color = "#2F8FD0") =>
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

  const moveFile: Ctx["moveFile"] = (id, folderId) =>
    mutate(async (cur) => ({
      next: { ...cur, files: cur.files.map((f) => (f.id === id ? { ...f, folderId } : f)) },
      result: undefined,
    }));

  const deleteFile: Ctx["deleteFile"] = (id) =>
    mutate(async (cur) => {
      const f = cur.files.find((x) => x.id === id);
      if (f) await FileSystem.deleteAsync(FILES_DIR + f.storedAs, { idempotent: true });
      return {
        next: {
          ...cur,
          files: cur.files.filter((x) => x.id !== id),
          reminders: unlinkFile(cur.reminders, [id]),
        },
        result: undefined,
      };
    });

  const fileUri = useCallback((f: VaultFile) => FILES_DIR + f.storedAs, []);

  const shareFile: Ctx["shareFile"] = async (f) => {
    // Share under the real file name instead of the internal id.
    await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
    const tmp = SHARE_DIR + f.name.replace(/[\\/:*?"<>|]/g, "_");
    await FileSystem.deleteAsync(tmp, { idempotent: true });
    await FileSystem.copyAsync({ from: FILES_DIR + f.storedAs, to: tmp });
    await Sharing.shareAsync(tmp, { mimeType: f.mime, dialogTitle: f.name });
  };

  const exportBackup: Ctx["exportBackup"] = async (password) => {
    await queue.current; // let pending writes finish first
    const stamp = new Date().toISOString().slice(0, 10);
    const out = CACHE + `DocVault-backup-${stamp}.zip`;
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
    await Sharing.shareAsync(out, { mimeType: "application/zip", dialogTitle: "Save your DocVault backup" });
  };

  const restoreBackup: Ctx["restoreBackup"] = async (pickedUri, password) => {
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
    reminders: index.reminders ?? [],
    createReminder,
    updateReminder,
    deleteReminder,
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
    deleteFile,
    fileUri,
    shareFile,
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
