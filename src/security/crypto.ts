/**
 * AES-256-GCM for the vault index (folder/file names, tags, notes, saved numbers, reminders).
 * Pure functions so they can be tested on a computer. The key itself lives in keystore.ts.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";

export const PREFIX = "DVE1:";
const NONCE_LEN = 12;

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    if (cp >= 0x10000) {
      cp -= 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else s += String.fromCharCode(cp);
  }
  return s;
}

const AAD = utf8Encode("docvault-index-v1");

/** nonce must be 12 fresh random bytes for every call. */
export function encryptString(key: Uint8Array, plaintext: string, nonce: Uint8Array): string {
  if (key.length !== 32) throw new Error("Key must be 32 bytes");
  if (nonce.length !== NONCE_LEN) throw new Error("Nonce must be 12 bytes");
  const ct = gcm(key, nonce, AAD).encrypt(utf8Encode(plaintext));
  const packed = new Uint8Array(NONCE_LEN + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, NONCE_LEN);
  return PREFIX + bytesToBase64(packed);
}

/** Throws if the key is wrong or the data was altered (GCM authenticates everything). */
export function decryptString(key: Uint8Array, payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error("Not an encrypted DocVault index");
  const packed = base64ToBytes(trimmed.slice(PREFIX.length));
  if (packed.length < NONCE_LEN + 16) throw new Error("Encrypted data is too short");
  const nonce = packed.slice(0, NONCE_LEN);
  const ct = packed.slice(NONCE_LEN);
  return utf8Decode(gcm(key, nonce, AAD).decrypt(ct));
}
