/**
 * Core sharing session logic.
 *
 * Call `createShareSession` to:
 *   1. Pick a 6-digit code + 4 words and derive this session's AES-256 key from them.
 *   2. Build a ShareBundle from the selected files/notes.
 *   3. Encrypt the bundle with that key.
 *   4. Upload the ciphertext (plus code and key verifier) to the relay.
 *   5. Return the QR URL (token + key in #hash), the code + words, and expiry.
 *
 * The session can be torn down early with `stopShareSession`.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { VaultFile, Note } from "../types";
import { encryptBlob, toUrlBase64 } from "./sharingCrypto";
import { ShareBundle, ShareItem, uploadBundle, deleteBundle, buildShareUrl, CodeTakenError } from "./sharingRelay";
import { pickShareCode, pickShareWords, deriveShareKey, shareVerifier } from "./shareCode";

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
  /** 6-digit code typed on the PC instead of scanning */
  code: string;
  /** Words typed on the PC with the code; the key is derived from them */
  words: string[];
};

const MAX_CODE_TRIES = 5;

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
  const plain: (Omit<ShareItem, "encrypted"> & { bytes: Uint8Array })[] = [];

  for (const item of items) {
    if (item.kind === "file") {
      const f = item.file;
      const uri = FILES_DIR + f.storedAs;
      plain.push({
        id: f.id,
        name: f.name,
        mime: f.mime,
        bytes: await fileToUint8Array(uri),
        originalSize: f.size,
      });
    } else {
      const n = item.note;
      // Share non-secret notes only; caller should filter secret ones out.
      const text = JSON.stringify({ title: n.title, content: n.content });
      plain.push({
        id: n.id,
        name: n.title || "Untitled Note",
        mime: "application/x-docvault-note",
        bytes: new TextEncoder().encode(text),
        originalSize: text.length,
      });
    }
  }

  const words = pickShareWords(Crypto.getRandomBytes(8));

  // The key is salted with the code, so a code collision means re-encrypting.
  for (let attempt = 1; ; attempt++) {
    const code = pickShareCode(Crypto.getRandomBytes(4));
    const key = await deriveShareKey(code, words.join(" "));

    const bundle: ShareBundle = {
      v: 1,
      createdAt: new Date().toISOString(),
      items: plain.map(({ bytes, ...meta }) => ({ ...meta, encrypted: encryptBlob(key, bytes) })),
    };

    // Encrypt the bundle manifest itself so the relay never sees item names.
    const manifestBytes = new TextEncoder().encode(JSON.stringify(bundle));
    const encryptedManifest = encryptBlob(key, manifestBytes);

    try {
      const { token, expiresAt } = await uploadBundle(encryptedManifest, ttlSec, code, shareVerifier(key));
      return { url: buildShareUrl(token, toUrlBase64(key)), expiresAt, token, code, words };
    } catch (e) {
      if (!(e instanceof CodeTakenError) || attempt >= MAX_CODE_TRIES) throw e;
    }
  }
}

/**
 * Stop a share session early by deleting the relay entry.
 */
export async function stopShareSession(token: string): Promise<void> {
  await deleteBundle(token);
}
