import {
  ensureDecryptedCopy,
  migratePlainFilesToEncrypted,
  readDecryptedBytes,
  readRawBytes,
  storeEncryptedFile,
  writeRawBytes,
} from "../src/security/fileStorage";
import { isEncryptedFile } from "../src/security/fileCrypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docvault-test-storage-"));

  try {
    const key = new Uint8Array(32).map((_, i) => (i * 17 + 3) % 256);
    const nonce = () => new Uint8Array(12).map((_, i) => (i * 23 + 7) % 256);

    // 1. writeRawBytes & readRawBytes
    const testFile = path.join(tmpDir, "plain.txt");
    const sampleData = new Uint8Array(Buffer.from("DocVault Test Plaintext"));
    await writeRawBytes(testFile, sampleData);
    const readBack = await readRawBytes(testFile);
    assert(Buffer.compare(Buffer.from(readBack), Buffer.from(sampleData)) === 0, "writeRawBytes and readRawBytes match");

    // 2. storeEncryptedFile
    const encFile = path.join(tmpDir, "doc.enc");
    const storedSize = await storeEncryptedFile(key, testFile, encFile, nonce());
    assert(storedSize > sampleData.length, "encrypted file is larger than plaintext (has header and tag)");
    const encBytes = await readRawBytes(encFile);
    assert(isEncryptedFile(encBytes), "stored file is valid encrypted file");

    // 3. readDecryptedBytes
    const decBytes = await readDecryptedBytes(key, encFile);
    assert(Buffer.compare(Buffer.from(decBytes), Buffer.from(sampleData)) === 0, "readDecryptedBytes recovers original plaintext");

    // 4. ensureDecryptedCopy
    const ephemeralFile = path.join(tmpDir, "ephemeral.txt");
    await ensureDecryptedCopy(key, encFile, ephemeralFile);
    const ephBytes = await readRawBytes(ephemeralFile);
    assert(Buffer.compare(Buffer.from(ephBytes), Buffer.from(sampleData)) === 0, "ensureDecryptedCopy creates valid plaintext copy");

    // 5. migratePlainFilesToEncrypted
    const migrationDir = path.join(tmpDir, "files_to_migrate");
    fs.mkdirSync(migrationDir, { recursive: true });

    const f1 = path.join(migrationDir, "doc1.pdf");
    const f2 = path.join(migrationDir, "doc2.jpg");
    fs.writeFileSync(f1, "%PDF-1.4 sample pdf content");
    fs.writeFileSync(f2, "JPEG simulated image content");

    assert(!isEncryptedFile(fs.readFileSync(f1)), "f1 starts plain");
    assert(!isEncryptedFile(fs.readFileSync(f2)), "f2 starts plain");

    // First migration pass: should migrate both
    const pass1 = await migratePlainFilesToEncrypted(key, migrationDir, nonce);
    assert(pass1.migrated === 2, "pass 1 migrated 2 files");
    assert(pass1.skipped === 0, "pass 1 skipped 0 files");

    assert(isEncryptedFile(fs.readFileSync(f1)), "f1 is now encrypted");
    assert(isEncryptedFile(fs.readFileSync(f2)), "f2 is now encrypted");

    // Verify content was not corrupted
    const decF1 = await readDecryptedBytes(key, f1);
    assert(Buffer.from(decF1).toString() === "%PDF-1.4 sample pdf content", "f1 decrypted matches original");

    // Second migration pass: should skip both (idempotent)
    const pass2 = await migratePlainFilesToEncrypted(key, migrationDir, nonce);
    assert(pass2.migrated === 0, "pass 2 migrated 0 files");
    assert(pass2.skipped === 2, "pass 2 skipped 2 files");

    console.log("all file storage tests passed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
