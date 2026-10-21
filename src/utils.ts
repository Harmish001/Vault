import type { Folder, VaultFile } from "./types";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? "." + m[1].toLowerCase() : "";
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
};

export function guessMime(name: string, given?: string | null): string {
  if (given && given !== "application/octet-stream" && given !== "*/*") return given;
  return MIME_BY_EXT[extOf(name)] ?? "application/octet-stream";
}

export type FileKind = "image" | "pdf" | "doc" | "sheet" | "video" | "other";

export function kindOf(mime: string, name: string): FileKind {
  const ext = extOf(name);
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if ([".doc", ".docx", ".txt", ".rtf", ".odt"].includes(ext) || mime.includes("word") || mime.startsWith("text/")) return "doc";
  if ([".xls", ".xlsx", ".csv", ".ods"].includes(ext) || mime.includes("sheet") || mime.includes("excel")) return "sheet";
  return "other";
}

/** "Dad / Aadhaar" style path for a folder id. */
export function folderPath(folders: Folder[], id: string | null): string {
  const parts: string[] = [];
  let cur = id;
  let guard = 0;
  while (cur && guard++ < 50) {
    const f = folders.find((x) => x.id === cur);
    if (!f) break;
    parts.unshift(f.name);
    cur = f.parentId;
  }
  return parts.join(" / ");
}

export function uniqueName(existing: string[], wanted: string): string {
  const lower = new Set(existing.map((n) => n.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) return wanted;
  const ext = extOf(wanted);
  const base = ext ? wanted.slice(0, -ext.length) : wanted;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

export function sortFiles(files: VaultFile[]): VaultFile[] {
  return [...files].sort((a, b) => b.addedAt - a.addedAt);
}

export const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, "");

/** Counts everything inside a folder, including nested subfolders. */
export function countInside(folders: Folder[], files: VaultFile[], id: string) {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return {
    folders: ids.size - 1,
    files: files.filter((f) => ids.has(f.folderId)).length,
  };
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
