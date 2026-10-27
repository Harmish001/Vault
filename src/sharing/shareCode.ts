/**
 * Typed-code sharing for PCs without a camera.
 *
 * The phone shows a 6-digit code and 4 BIP39 words. The share key is derived
 * from them, so the words never reach the relay:
 *   key      = PBKDF2-SHA256(words, "docvault-share-v1:" + code, 50 000 iters, 32 bytes)
 *   verifier = hex(HMAC-SHA256(key, "docvault-share-verify"))
 * The relay stores the verifier so it can reject wrong words (and rate-limit)
 * without ever learning the key.
 *
 * Must stay byte-for-byte identical to vault-share's src/lib/shareCode.ts.
 */
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export const SHARE_CODE_ITERATIONS = 50_000;
export const SHARE_WORD_COUNT = 4;

const utf8 = (s: string) => new TextEncoder().encode(s);

/** 6-digit code from 4 random bytes. */
export function pickShareCode(rand: Uint8Array): string {
  const n = ((rand[0] << 24) | (rand[1] << 16) | (rand[2] << 8) | rand[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

/** SHARE_WORD_COUNT words from 2 random bytes each (2048 divides 65536, so no bias). */
export function pickShareWords(rand: Uint8Array): string[] {
  const words: string[] = [];
  for (let i = 0; i < SHARE_WORD_COUNT; i++) {
    words.push(wordlist[((rand[i * 2] << 8) | rand[i * 2 + 1]) % 2048]);
  }
  return words;
}

export function normalizeWords(input: string): string {
  return input.toLowerCase().split(/[^a-z]+/).filter(Boolean).join(" ");
}

export async function deriveShareKey(code: string, words: string): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8(normalizeWords(words)), utf8("docvault-share-v1:" + code), {
    c: SHARE_CODE_ITERATIONS,
    dkLen: 32,
  });
}

export function shareVerifier(key: Uint8Array): string {
  return bytesToHex(hmac(sha256, key, utf8("docvault-share-verify")));
}
