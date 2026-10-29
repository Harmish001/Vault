/**
 * AES-256-GCM for vault document files (PDFs, images, scans, and attachments).
 *
 * File structure on disk:
 *  - Bytes [0..3]:   Magic header 'DVF1' (0x44, 0x56, 0x46, 0x31)
 *  - Bytes [4..15]:  12-byte random nonce / IV
 *  - Bytes [16..]:   Ciphertext + 16-byte GCM authentication tag
 *
 * Additional Authenticated Data (AAD): 'docvault-file-v1'
 *
 * Pure functions so they run seamlessly in React Native, Expo, and Node unit tests.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { utf8Encode } from "./crypto";

export const FILE_MAGIC = new Uint8Array([0x44, 0x56, 0x46, 0x31]); // "DVF1"
export const FILE_MAGIC_LEN = 4;
export const FILE_NONCE_LEN = 12;
export const FILE_TAG_LEN = 16;
export const FILE_HEADER_LEN = FILE_MAGIC_LEN + FILE_NONCE_LEN; // 16 bytes
export const MIN_ENCRYPTED_FILE_LEN = FILE_HEADER_LEN + FILE_TAG_LEN; // 32 bytes

export const FILE_AAD = utf8Encode("docvault-file-v1");

/**
 * Checks whether a byte buffer starts with the DocVault encrypted file signature (DVF1)
 * and meets the minimum length requirement.
 */
export function isEncryptedFile(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < MIN_ENCRYPTED_FILE_LEN) return false;
  return (
    bytes[0] === FILE_MAGIC[0] &&
    bytes[1] === FILE_MAGIC[1] &&
    bytes[2] === FILE_MAGIC[2] &&
    bytes[3] === FILE_MAGIC[3]
  );
}

/**
 * Encrypts arbitrary file bytes (PDF, JPEG, PNG, etc.) with AES-256-GCM.
 * Nonce must be 12 fresh cryptographically secure random bytes for every call.
 */
export function encryptFileBytes(key: Uint8Array, plaintext: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("Key must be 32 bytes");
  if (nonce.length !== FILE_NONCE_LEN) throw new Error(`Nonce must be ${FILE_NONCE_LEN} bytes`);

  const ct = gcm(key, nonce, FILE_AAD).encrypt(plaintext);
  const packed = new Uint8Array(FILE_HEADER_LEN + ct.length);
  packed.set(FILE_MAGIC, 0);
  packed.set(nonce, FILE_MAGIC_LEN);
  packed.set(ct, FILE_HEADER_LEN);
  return packed;
}

/**
 * Decrypts an encrypted file buffer.
 * Throws if the file is not encrypted, corrupted, tampered with, or decrypted with the wrong key.
 */
export function decryptFileBytes(key: Uint8Array, encrypted: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("Key must be 32 bytes");
  if (!isEncryptedFile(encrypted)) {
    throw new Error("Not an encrypted DocVault file");
  }

  const nonce = encrypted.subarray(FILE_MAGIC_LEN, FILE_HEADER_LEN);
  const ct = encrypted.subarray(FILE_HEADER_LEN);
  return gcm(key, nonce, FILE_AAD).decrypt(ct);
}

/**
 * Seamlessly decrypts if encrypted, or returns the original bytes untouched if it was plain.
 * Essential for backwards compatibility and zero-downtime auto-migration of existing user files.
 */
export function decryptOrPassthrough(
  key: Uint8Array,
  bytes: Uint8Array
): { bytes: Uint8Array; wasEncrypted: boolean } {
  if (isEncryptedFile(bytes)) {
    return { bytes: decryptFileBytes(key, bytes), wasEncrypted: true };
  }
  return { bytes, wasEncrypted: false };
}

/**
 * Helpers for base64 representation when bridging with legacy React Native APIs.
 */
export function encryptBase64ToFileBytes(key: Uint8Array, base64Plaintext: string, nonce: Uint8Array): Uint8Array {
  const plainBytes = base64ToBytes(base64Plaintext);
  return encryptFileBytes(key, plainBytes, nonce);
}

export function decryptFileBytesToBase64(key: Uint8Array, encrypted: Uint8Array): string {
  const decrypted = decryptFileBytes(key, encrypted);
  return bytesToBase64(decrypted);
}
