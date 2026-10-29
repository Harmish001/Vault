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
import { VaultFile, Note } from "../types";
import { encryptBlob, toUrlBase64 } from "./sharingCrypto";
import { ShareBundle, ShareItem, uploadBundle, deleteBundle, buildShareUrl, CodeTakenError } from "./sharingRelay";
import { pickShareCode, pickShareWords, deriveShareKey, shareVerifier } from "./shareCode";

function getCryptoRandomBytes(count: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    return globalThis.crypto.getRandomValues(new Uint8Array(count));
  }
  const Crypto = require("expo-crypto");
  return Crypto.getRandomBytes(count);
}

export type ShareableItem =
  | { kind: "file"; file: VaultFile; customBytes?: Uint8Array; customName?: string; customMime?: string }
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

export const MAX_RELAY_PAYLOAD_BYTES = 4.2 * 1024 * 1024; // 4.2 MB (Vercel hard limit is 4.5 MB)

export class PayloadTooLargeError extends Error {
  constructor(public sizeBytes: number) {
    super(
      `Files total ${(sizeBytes / (1024 * 1024)).toFixed(1)} MB, which exceeds the web relay limit of 4 MB. Use Smart Compress or Direct Share.`
    );
    this.name = "PayloadTooLargeError";
  }
}

type SessionKeys = {
  words: string[];
  code: string;
  key: Uint8Array;
  verifier: string;
};

let cachedSessionKeys: Promise<SessionKeys> | null = null;

/**
 * Precomputes code, words, PBKDF2 key, and verifier in the background.
 * Call this as soon as the user opens the share screen or selects a file
 * so that QR generation is instant (<50ms) with zero PBKDF2 wait.
 */
export function warmShareKeys(): void {
  if (!cachedSessionKeys) {
    cachedSessionKeys = (async () => {
      const words = pickShareWords(getCryptoRandomBytes(8));
      const code = pickShareCode(getCryptoRandomBytes(4));
      const key = await deriveShareKey(code, words.join(" "));
      const verifier = shareVerifier(key);
      return { words, code, key, verifier };
    })().catch((err) => {
      cachedSessionKeys = null;
      throw err;
    });
  }
}

const MAX_CODE_TRIES = 5;

function getFilesDir(): string {
  try {
    const FileSystem = require("expo-file-system/legacy");
    return (FileSystem.documentDirectory ?? "") + "vault/files/";
  } catch {
    return "vault/files/";
  }
}

async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  try {
    const { loadKey } = await import("../security/keystore");
    const { readDecryptedBytes } = await import("../security/fileStorage");
    const key = await loadKey(false);
    if (key) {
      try {
        return await readDecryptedBytes(key, uri);
      } catch {
        // fallback
      }
    }
  } catch {
    // keystore/storage not available
  }
  const FileSystem = require("expo-file-system/legacy");
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { base64ToBytes } = await import("../scan/base64");
  return base64ToBytes(b64);
}

export type ShareProgressCallback = (stage: "reading" | "encrypting" | "uploading", percent: number, message: string) => void;

/**
 * Build, encrypt and upload a share bundle.
 *
 * @param items      Files and/or notes the user selected.
 * @param ttlSec     Session lifetime in seconds (default 300 = 5 min).
 * @param onProgress Optional callback for real-time progress updates.
 * @returns          The ready ShareSession with URL for QR and expiry for countdown.
 */
export async function createShareSession(
  items: ShareableItem[],
  ttlSec = 300,
  onProgress?: ShareProgressCallback
): Promise<ShareSession> {
  onProgress?.("reading", 15, "Reading and decrypting files...");
  const plain: (Omit<ShareItem, "encrypted"> & { bytes: Uint8Array })[] = [];

  let totalRawBytes = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      const f = item.file;
      const bytes = item.customBytes ?? (await fileToUint8Array(getFilesDir() + f.storedAs));
      totalRawBytes += bytes.length;
      plain.push({
        id: f.id,
        name: item.customName ?? f.name,
        mime: item.customMime ?? f.mime,
        bytes,
        originalSize: bytes.length,
      });
    } else {
      const n = item.note;
      // Share non-secret notes only; caller should filter secret ones out.
      const text = JSON.stringify({ title: n.title, content: n.content });
      const bytes = new TextEncoder().encode(text);
      totalRawBytes += bytes.length;
      plain.push({
        id: n.id,
        name: n.title || "Untitled Note",
        mime: "application/x-docvault-note",
        bytes,
        originalSize: text.length,
      });
    }
    const pct = Math.min(50, 15 + Math.round(((i + 1) / items.length) * 35));
    onProgress?.("reading", pct, `Loaded ${i + 1} of ${items.length} items...`);
  }

  // Pre-check raw size; base64 increases size by ~33%, so raw > 3.2MB will exceed 4.2MB
  if (totalRawBytes > MAX_RELAY_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError(totalRawBytes);
  }

  // Grab warmed keys or derive now
  let sessionKeys: SessionKeys;
  if (cachedSessionKeys) {
    try {
      sessionKeys = await cachedSessionKeys;
    } catch {
      sessionKeys = await (async () => {
        const words = pickShareWords(getCryptoRandomBytes(8));
        const code = pickShareCode(getCryptoRandomBytes(4));
        const key = await deriveShareKey(code, words.join(" "));
        return { words, code, key, verifier: shareVerifier(key) };
      })();
    } finally {
      cachedSessionKeys = null;
    }
  } else {
    onProgress?.("encrypting", 55, "Deriving encryption key...");
    const words = pickShareWords(getCryptoRandomBytes(8));
    const code = pickShareCode(getCryptoRandomBytes(4));
    const key = await deriveShareKey(code, words.join(" "));
    sessionKeys = { words, code, key, verifier: shareVerifier(key) };
  }

  // Trigger background warm-up for the next session immediately
  setTimeout(() => warmShareKeys(), 50);

  for (let attempt = 1; ; attempt++) {
    const { key, code, words, verifier } = sessionKeys;

    onProgress?.("encrypting", 70, "Encrypting with AES-256-GCM...");
    const bundle: ShareBundle = {
      v: 1,
      createdAt: new Date().toISOString(),
      items: plain.map(({ bytes, ...meta }) => ({ ...meta, encrypted: encryptBlob(key, bytes) })),
    };

    // Encrypt the bundle manifest itself so the relay never sees item names.
    const manifestBytes = new TextEncoder().encode(JSON.stringify(bundle));
    const encryptedManifest = encryptBlob(key, manifestBytes);

    if (encryptedManifest.length > MAX_RELAY_PAYLOAD_BYTES) {
      throw new PayloadTooLargeError(encryptedManifest.length);
    }

    onProgress?.("uploading", 85, "Uploading to secure relay...");
    try {
      const { token, expiresAt } = await uploadBundle(encryptedManifest, ttlSec, code, verifier);
      onProgress?.("uploading", 100, "Done!");
      return { url: buildShareUrl(token, toUrlBase64(key)), expiresAt, token, code, words };
    } catch (e) {
      if (!(e instanceof CodeTakenError) || attempt >= MAX_CODE_TRIES) throw e;
      // Collision: derive fresh keys for next attempt
      const newWords = pickShareWords(getCryptoRandomBytes(8));
      const newCode = pickShareCode(getCryptoRandomBytes(4));
      const newKey = await deriveShareKey(newCode, newWords.join(" "));
      sessionKeys = { words: newWords, code: newCode, key: newKey, verifier: shareVerifier(newKey) };
    }
  }
}

/**
 * Stop a share session early by deleting the relay entry.
 */
export async function stopShareSession(token: string): Promise<void> {
  await deleteBundle(token);
}
