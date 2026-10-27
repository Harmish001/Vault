import { webcrypto } from "crypto";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  SHARE_CODE_ITERATIONS,
  SHARE_WORD_COUNT,
  deriveShareKey,
  normalizeWords,
  pickShareCode,
  pickShareWords,
  shareVerifier,
} from "../src/sharing/shareCode";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

// Same derivation the vault-share web page runs with Web Crypto in the browser.
async function webDerive(code: string, words: string) {
  const utf8 = (s: string) => new TextEncoder().encode(s);
  const base = await webcrypto.subtle.importKey("raw", utf8(words), "PBKDF2", false, ["deriveBits"]);
  const key = new Uint8Array(
    await webcrypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: utf8("docvault-share-v1:" + code), iterations: SHARE_CODE_ITERATIONS },
      base,
      256,
    ),
  );
  const hk = await webcrypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await webcrypto.subtle.sign("HMAC", hk, utf8("docvault-share-verify")));
  return { key, verifier: Buffer.from(sig).toString("hex") };
}

(async () => {
  assert(pickShareCode(new Uint8Array([0, 0, 0, 7])) === "000007", "code is zero-padded to 6 digits");
  assert(pickShareCode(new Uint8Array([255, 255, 255, 255])) === "967295", "code wraps into 6 digits");

  const words = pickShareWords(webcrypto.getRandomValues(new Uint8Array(8)));
  assert(words.length === SHARE_WORD_COUNT && words.every((w) => wordlist.includes(w)), "words come from the BIP39 list");
  assert(pickShareWords(new Uint8Array(8))[0] === wordlist[0], "word index 0 maps to first word");

  assert(normalizeWords("  Tiger-LAMP,ocean\n river ") === "tiger lamp ocean river", "typed words are normalized");

  const code = "482913";
  const phrase = "tiger lamp ocean river";
  const key = await deriveShareKey(code, phrase);
  const web = await webDerive(code, phrase);
  assert(key.length === 32, "key is 32 bytes");
  assert(Buffer.compare(Buffer.from(key), Buffer.from(web.key)) === 0, "phone key matches Web Crypto key");
  assert(shareVerifier(key) === web.verifier, "phone verifier matches Web Crypto verifier");
  assert(/^[0-9a-f]{64}$/.test(shareVerifier(key)), "verifier is 64 hex chars");

  const sloppy = await deriveShareKey(code, "Tiger  LAMP ocean-river");
  assert(Buffer.compare(Buffer.from(sloppy), Buffer.from(key)) === 0, "case and separators don't change the key");

  const otherCode = await deriveShareKey("482914", phrase);
  assert(Buffer.compare(Buffer.from(otherCode), Buffer.from(key)) !== 0, "different code gives a different key");
  const otherWords = await deriveShareKey(code, "tiger lamp ocean rivet");
  assert(shareVerifier(otherWords) !== shareVerifier(key), "one wrong word gives a different verifier");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
