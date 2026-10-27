/**
 * Core sharing session logic.
 *
 * Call `createShareSession` to:
 *   1. Generate a fresh AES-256 key for this session only.
 *   2. Build a ShareBundle from the selected files/notes.
 *   3. Encrypt the bundle with that key.
 *   4. Upload the ciphertext to the relay.
 *   5. Return the QR URL (token + key in #hash) and expiry.
 *
 * The session can be torn down early with `stopShareSession`.
 */
import * as FileSystem from "expo-file-system/legacy";
import { VaultFile, Note } from "../types";
import { generateShareKey, encryptBlob, encryptText, toUrlBase64 } from "./sharingCrypto";
import { ShareBundle, ShareItem, uploadBundle, deleteBundle, buildShareUrl } from "./sharingRelay";

export type ShareableItem =
  | { kind: "file"; file: VaultFile }
  | { kind: "note"; note: Note };

export type ShareSession = {
  /** The full URL to encode in the QR code */
  url: string;
  /** Epoch ms when this session expires on the relay */
  expiresAt: number;
  /** The relay token — needed for early deletion */
  token: string;
};

/** Files live inside the vault/files/ directory. */
const FILES_DIR =
  (FileSystem.documentDirectory ?? "") + "vault/files/";

async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  // expo-file-system returns base64; decode it to bytes.
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Reuse the existing base64 decoder
  const { base64ToBytes } = await import("../scan/base64");
  return base64ToBytes(b64);
}

/**
 * Build, encrypt and upload a share bundle.
 *
 * @param items     Files and/or notes the user selected.
 * @param ttlSec    Session lifetime in seconds (default 300 = 5 min).
 * @returns         The ready ShareSession with URL for QR and expiry for countdown.
 */
export async function createShareSession(
  items: ShareableItem[],
  ttlSec = 300
): Promise<ShareSession> {
  const key = generateShareKey();
  const keyB64 = toUrlBase64(key);

  const bundleItems: ShareItem[] = [];

  for (const item of items) {
    if (item.kind === "file") {
      const f = item.file;
      const uri = FILES_DIR + f.storedAs;
      const bytes = await fileToUint8Array(uri);
      bundleItems.push({
        id: f.id,
        name: f.name,
        mime: f.mime,
        encrypted: encryptBlob(key, bytes),
        originalSize: f.size,
      });
    } else {
      const n = item.note;
      // Share non-secret notes only; caller should filter secret ones out.
      const text = JSON.stringify({ title: n.title, content: n.content });
      const bytes = new TextEncoder().encode(text);
      bundleItems.push({
        id: n.id,
        name: n.title || "Untitled Note",
        mime: "application/x-docvault-note",
        encrypted: encryptBlob(key, bytes),
        originalSize: text.length,
      });
    }
  }

  const bundle: ShareBundle = {
    v: 1,
    createdAt: new Date().toISOString(),
    items: bundleItems,
  };

  // Encrypt the bundle manifest itself so the relay never sees item names.
  const manifestJson = JSON.stringify(bundle);
  const manifestBytes = new TextEncoder().encode(manifestJson);
  const encryptedManifest = encryptBlob(key, manifestBytes);

  const { token, expiresAt } = await uploadBundle(encryptedManifest, ttlSec);
  const url = buildShareUrl(token, keyB64);

  return { url, expiresAt, token };
}

/**
 * Stop a share session early by deleting the relay entry.
 */
export async function stopShareSession(token: string): Promise<void> {
  await deleteBundle(token);
}
