/**
 * Sharing-specific crypto helpers.
 *
 * Each share session gets its own ephemeral 32-byte AES-256-GCM key that is
 * completely separate from the vault master key. The key is encoded into the
 * QR URL's #hash fragment so it NEVER reaches the relay server.
 *
 * Output format (base64url, no padding):
 *   <12-byte nonce> | <ciphertext+16-byte GCM tag>
 */
import { gcm } from "@noble/ciphers/aes.js";
import * as Crypto from "expo-crypto";
import { bytesToBase64, base64ToBytes } from "../scan/base64";

export function generateShareKey(): Uint8Array {
  return Crypto.getRandomBytes(32);
}

export function generateNonce(): Uint8Array {
  return Crypto.getRandomBytes(12);
}

/** Encode bytes as URL-safe base64 (no padding). */
export function toUrlBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode URL-safe base64 back to bytes. */
export function fromUrlBase64(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const rem = padded.length % 4;
  const b64 = rem ? padded + "=".repeat(4 - rem) : padded;
  return base64ToBytes(b64);
}

const AAD_SHARE = new TextEncoder !== undefined
  ? new TextEncoder().encode("docvault-share-v1")
  : Uint8Array.from("docvault-share-v1".split("").map((c) => c.charCodeAt(0)));

/**
 * Encrypt arbitrary binary data with a one-off key.
 * Returns URL-safe base64 string: nonce(12) | ciphertext+tag.
 */
export function encryptBlob(key: Uint8Array, data: Uint8Array): string {
  const nonce = generateNonce();
  const ct = gcm(key, nonce, AAD_SHARE).encrypt(data);
  const packed = new Uint8Array(12 + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, 12);
  return toUrlBase64(packed);
}

/**
 * Encrypt a UTF-8 string (e.g. JSON of note/file metadata).
 */
export function encryptText(key: Uint8Array, text: string): string {
  const bytes = Uint8Array.from(text.split("").map((c) => c.charCodeAt(0)));
  // Proper UTF-8 encode
  const enc = new TextEncoder !== undefined
    ? new TextEncoder().encode(text)
    : bytes;
  return encryptBlob(key, enc);
}
