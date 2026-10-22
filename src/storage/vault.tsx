import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { isPasswordProtected, unzip, unzipWithPassword, zip, zipWithPassword } from "react-native-zip-archive";
import { Folder, IncomingFile, VaultFile, VaultIndex } from "../types";

export type FilePatch = Partial<Pick<VaultFile, "notes" | "tags" | "expiresOn" | "fields">>;
import { extOf, guessMime, stripFileScheme, uid, uniqueName } from "../utils";
import { SCANNER_TMP, SCAN_OUT } from "../scan/paths";

const DOC = FileSystem.documentDirectory ?? "";
const CACHE = FileSystem.cacheDirectory ?? "";
const ROOT = DOC + "vault/";
const FILES_DIR = ROOT + "files/";
const INDEX = ROOT + "index.json";
const INDEX_TMP = ROOT + "index.json.tmp";
const SHARE_DIR = CACHE + "share/";
const RESTORE_ZIP = CACHE + "restore.zip";
const RESTORE_DIR = CACHE + "restore/";
const OLD_ROOT = DOC + "vault_old/";

const EMPTY: VaultIndex = { version: 1, folders: [], files: [] };

export const PASSWORD_REQUIRED = "PASSWORD_REQUIRED";

async function exists(uri: string) {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

async function readJson(uri: string): Promise<VaultIndex | null> {
  try {
    if (!(await exists(uri))) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri));
    if (parsed && parsed.version === 1 && Array.isArray(parsed.folders) && Array.isArray(parsed.files)) {
      return parsed as VaultIndex;
    }
  } catch {
    // corrupt — caller tries the next candidate
  }
  return null;
}

async function loadIndex(): Promise<VaultIndex> {
  await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  // index.json first; index.json.tmp covers a crash between "delete old" and "move new".
  return (await readJson(INDEX)) ?? (await readJson(INDEX_TMP)) ?? { ...EMPTY };
}

async function persistIndex(idx: VaultIndex) {
  await FileSystem.writeAsStringAsync(INDEX_TMP, JSON.stringify(idx));
  await FileSystem.deleteAsync(INDEX, { idempotent: true });
  await FileSystem.moveAsync({ from: INDEX_TMP, to: INDEX });
}

function normalizeUri(uri: string) {
  return /^(file|content):\/\//.test(uri) ? uri : "file://" + uri;
}

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
  folders: Folder[];
  files: VaultFile[];
  createFolder: (name: string, parentId: string | null, color: string) => Promise<Folder>;
  updateFolder: (id: string, patch: Partial<Pick<Folder, "name" | "color">>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  addFiles: (folderId: string, incoming: IncomingFile[]) => Promise<{ added: number; failed: string[] }>;
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
  const latest = useRef<VaultIndex>(EMPTY);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    (async () => {
      await clearTempFiles();
      const idx = await loadIndex();
      latest.current = idx;
      setIndex(idx);
      setReady(true);
    })();
  }, []);

  /** Serialises all writes so two quick taps can't interleave and lose data. */
  const mutate = useCallback(<T,>(fn: (cur: VaultIndex) => Promise<{ next: VaultIndex; result: T }>) => {
    const run = queue.current.then(async () => {
      const { next, result } = await fn(latest.current);
      await persistIndex(next);
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
      await Promise.all(gone.map((f) => FileSystem.deleteAsync(FILES_DIR + f.storedAs, { idempotent: true })));
      return {
        next: {
          ...cur,
          folders: cur.folders.filter((f) => !doomed.has(f.id)),
          files: cur.files.filter((f) => !doomed.has(f.folderId)),
        },
        result: undefined,
      };
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
          });
        } catch {
          failed.push(item.name);
        }
      }
      return { next: { ...cur, files: [...cur.files, ...added] }, result: { added: added.length, failed } };
    });

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
      return { next: { ...cur, files: cur.files.filter((x) => x.id !== id) }, result: undefined };
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
    if (password) await zipWithPassword(src, dst, password, "AES-256" as never);
    else await zip(src, dst);
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
      if (await readJson(cand + "index.json")) {
        newRoot = cand;
        break;
      }
    }
    if (!newRoot) throw new Error("This is not a DocVault backup.");
    const incoming = (await readJson(newRoot + "index.json")) as VaultIndex;

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

    const fresh = await loadIndex();
    latest.current = fresh;
    setIndex(fresh);
  };

  const totalBytes = useMemo(() => index.files.reduce((s, f) => s + (f.size || 0), 0), [index.files]);

  const value: Ctx = {
    ready,
    folders: index.folders,
    files: index.files,
    createFolder,
    updateFolder,
    deleteFolder,
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
