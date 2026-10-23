import { PREFIX, decryptString, encryptString, utf8Decode, utf8Encode } from "../src/security/crypto";
import { createCipheriv, createDecipheriv } from "crypto";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const text = "PAN ABCDE1234F, ₹499/month, नमस्ते, 🙂 emoji, Aadhaar 2363 1234 5678";
assert(utf8Decode(utf8Encode(text)) === text, "UTF-8 round-trip incl. rupee sign, Hindi and emoji");
assert(Buffer.compare(Buffer.from(utf8Encode(text)), Buffer.from(text, "utf8")) === 0, "UTF-8 matches Node");

const key = new Uint8Array(32).map((_, i) => i * 7 + 1);
const nonce = new Uint8Array(12).map((_, i) => 200 - i);
const big = JSON.stringify({ files: Array.from({ length: 400 }, (_, i) => ({ id: i, name: "Scan " + i, fields: [{ label: "PAN", value: "ABCDE1234F" }] })) });

const enc = encryptString(key, big, nonce);
assert(enc.startsWith(PREFIX), "payload has version prefix");
assert(!enc.includes("ABCDE1234F") && !enc.includes("Scan 1"), "ciphertext does not leak plaintext");
assert(decryptString(key, enc) === big, "round-trip of a large index");

const other = new Uint8Array(32).map((_, i) => i + 9);
assert(throws(() => decryptString(other, enc)), "wrong key is rejected");

const body = Buffer.from(enc.slice(PREFIX.length), "base64");
body[body.length - 20] ^= 1;
assert(throws(() => decryptString(key, PREFIX + body.toString("base64"))), "tampered data is rejected");
assert(throws(() => decryptString(key, "plain text")), "non-encrypted input is rejected");

// Interop: Node's own AES-256-GCM must read what we wrote (proves it is standard GCM, with our associated data)
const raw = Buffer.from(enc.slice(PREFIX.length), "base64");
const d = createDecipheriv("aes-256-gcm", Buffer.from(key), raw.subarray(0, 12));
d.setAAD(Buffer.from("docvault-index-v1"));
d.setAuthTag(raw.subarray(raw.length - 16));
const viaNode = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
assert(viaNode === big, "standard AES-256-GCM: Node decrypts our output");

const c = createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(nonce));
c.setAAD(Buffer.from("docvault-index-v1"));
const ct = Buffer.concat([c.update("hello ₹", "utf8"), c.final()]);
const packed = Buffer.concat([Buffer.from(nonce), ct, c.getAuthTag()]);
assert(decryptString(key, PREFIX + packed.toString("base64")) === "hello ₹", "we decrypt Node's AES-256-GCM output");

assert(throws(() => encryptString(new Uint8Array(16), "x", nonce)), "rejects a short key");
assert(throws(() => encryptString(key, "x", new Uint8Array(8))), "rejects a short nonce");
console.log("all crypto tests passed");
