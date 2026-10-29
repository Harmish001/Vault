import {
  FILE_AAD,
  FILE_HEADER_LEN,
  FILE_MAGIC,
  FILE_MAGIC_LEN,
  decryptFileBytes,
  decryptOrPassthrough,
  encryptBase64ToFileBytes,
  encryptFileBytes,
  isEncryptedFile,
} from "../src/security/fileCrypto";
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

// 1. Magic header and detection
assert(FILE_MAGIC[0] === 0x44 && FILE_MAGIC[1] === 0x56 && FILE_MAGIC[2] === 0x46 && FILE_MAGIC[3] === 0x31, "magic header is DVF1");
assert(!isEncryptedFile(new Uint8Array(20)), "short buffer is not encrypted");
assert(!isEncryptedFile(Buffer.from("%PDF-1.4 simulated pdf")), "plain pdf is not encrypted");

// 2. Encryption & Decryption round-trip
const key = new Uint8Array(32).map((_, i) => (i * 13 + 5) % 256);
const nonce = new Uint8Array(12).map((_, i) => (250 - i * 3) % 256);

// Simulate binary PDF content
const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF");
const pdfBytes = new Uint8Array(pdfHeader);

const encPdf = encryptFileBytes(key, pdfBytes, nonce);
assert(isEncryptedFile(encPdf), "encrypted output has DVF1 header");
assert(encPdf.length === FILE_HEADER_LEN + pdfBytes.length + 16, "encrypted length has 16 header + 16 tag overhead");

const decPdf = decryptFileBytes(key, encPdf);
assert(Buffer.compare(Buffer.from(decPdf), pdfHeader) === 0, "decrypted PDF matches original byte-for-byte");

// 3. decryptOrPassthrough handles both encrypted and legacy plain files
const plainPass = decryptOrPassthrough(key, pdfBytes);
assert(!plainPass.wasEncrypted, "plain file identified as wasEncrypted: false");
assert(Buffer.compare(Buffer.from(plainPass.bytes), pdfHeader) === 0, "plain bytes passed through intact");

const encPass = decryptOrPassthrough(key, encPdf);
assert(encPass.wasEncrypted, "encrypted file identified as wasEncrypted: true");
assert(Buffer.compare(Buffer.from(encPass.bytes), pdfHeader) === 0, "encrypted file decrypted via passthrough");

// 4. Base64 helpers
const sampleText = "DocVault Confidential Aadhaar Card 1234-5678-9012";
const base64Input = Buffer.from(sampleText).toString("base64");
const encFromB64 = encryptBase64ToFileBytes(key, base64Input, nonce);
assert(isEncryptedFile(encFromB64), "encFromB64 produces valid encrypted file");
const decFromB64 = decryptFileBytes(key, encFromB64);
assert(Buffer.from(decFromB64).toString() === sampleText, "decrypted base64 matches original string");

// 5. Tampering and security checks
const badKey = new Uint8Array(32).map((_, i) => (i + 1) % 256);
assert(throws(() => decryptFileBytes(badKey, encPdf)), "decrypt with wrong key is rejected");

const tampered = new Uint8Array(encPdf);
tampered[tampered.length - 1] ^= 1; // alter authentication tag
assert(throws(() => decryptFileBytes(key, tampered)), "tampered ciphertext/tag is rejected");

const corruptedHeader = new Uint8Array(encPdf);
corruptedHeader[0] = 0x00; // destroy magic header
assert(throws(() => decryptFileBytes(key, corruptedHeader)), "corrupted magic header throws");

// 6. Cross-verification with standard Node.js crypto
// Node decrypts our output
const rawNonce = encPdf.subarray(FILE_MAGIC_LEN, FILE_HEADER_LEN);
const rawCiphertextWithTag = encPdf.subarray(FILE_HEADER_LEN);
const rawTag = rawCiphertextWithTag.subarray(rawCiphertextWithTag.length - 16);
const rawCiphertext = rawCiphertextWithTag.subarray(0, rawCiphertextWithTag.length - 16);

const nodeDecipher = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(rawNonce));
nodeDecipher.setAAD(Buffer.from(FILE_AAD));
nodeDecipher.setAuthTag(Buffer.from(rawTag));
const nodePlain = Buffer.concat([nodeDecipher.update(Buffer.from(rawCiphertext)), nodeDecipher.final()]);
assert(Buffer.compare(nodePlain, pdfHeader) === 0, "standard Node.js crypto decrypts our encrypted file");

// We decrypt Node's output
const nodeCipher = createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(nonce));
nodeCipher.setAAD(Buffer.from(FILE_AAD));
const nodeCt = Buffer.concat([nodeCipher.update(pdfHeader), nodeCipher.final()]);
const nodeTag = nodeCipher.getAuthTag();

const nodePacked = new Uint8Array(FILE_HEADER_LEN + nodeCt.length + nodeTag.length);
nodePacked.set(FILE_MAGIC, 0);
nodePacked.set(nonce, FILE_MAGIC_LEN);
nodePacked.set(new Uint8Array(nodeCt), FILE_HEADER_LEN);
nodePacked.set(new Uint8Array(nodeTag), FILE_HEADER_LEN + nodeCt.length);

const ourDecFromNode = decryptFileBytes(key, nodePacked);
assert(Buffer.compare(Buffer.from(ourDecFromNode), pdfHeader) === 0, "we decrypt standard Node.js AES-256-GCM file");

console.log("all file crypto tests passed");
