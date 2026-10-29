/**
 * Secure file storage, decryption-on-demand, and auto-migration helpers.
 * Works seamlessly in React Native (Expo) and Node.js testing environments.
 */
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { decryptOrPassthrough, encryptFileBytes, isEncryptedFile } from "./fileCrypto";

const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, "");

let nodeFs: any = null;
let expoLegacyFs: any = null;
let PickedFileClass: any = null;

try {
  // In Node.js test environment, dynamically load fs without triggering Metro bundler
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const dynamicRequire = typeof eval !== "undefined" ? eval("require") : null;
    if (dynamicRequire) {
      const mod = "fs";
      nodeFs = dynamicRequire(mod);
    }
  }
} catch {
  // Not Node
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoLegacyFs = require("expo-file-system/legacy");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modernFs = require("expo-file-system");
  PickedFileClass = modernFs.File;
} catch {
  // In Node test environment
}

function normalizeUri(uri: string): string {
  return /^(file|content):\/\//.test(uri) ? uri : "file://" + uri;
}

/**
 * Reads binary bytes from a local file URI.
 */
export async function readRawBytes(uri: string): Promise<Uint8Array> {
  const norm = normalizeUri(uri);
  if (nodeFs && !norm.startsWith("content://")) {
    const rawPath = stripFileScheme(norm);
    const buf = await nodeFs.promises.readFile(rawPath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  if (PickedFileClass) {
    try {
      const f = new PickedFileClass(norm);
      if (typeof f.bytes === "function") {
        const b = await f.bytes();
        if (b && b.length !== undefined) return b;
      }
    } catch {
      // fallback to legacy
    }
  }

  if (expoLegacyFs) {
    const b64 = await expoLegacyFs.readAsStringAsync(norm, { encoding: expoLegacyFs.EncodingType.Base64 });
    return base64ToBytes(b64);
  }

  throw new Error("No filesystem driver available to read " + uri);
}

/**
 * Writes binary bytes to a local file URI.
 */
export async function writeRawBytes(uri: string, bytes: Uint8Array): Promise<void> {
  const norm = normalizeUri(uri);
  if (nodeFs && !norm.startsWith("content://")) {
    const rawPath = stripFileScheme(norm);
    await nodeFs.promises.writeFile(rawPath, Buffer.from(bytes));
    return;
  }

  if (PickedFileClass) {
    try {
      const f = new PickedFileClass(norm);
      if (typeof f.write === "function") {
        await f.write(bytes);
        return;
      }
    } catch {
      // fallback to legacy
    }
  }

  if (expoLegacyFs) {
    const b64 = bytesToBase64(bytes);
    await expoLegacyFs.writeAsStringAsync(norm, b64, { encoding: expoLegacyFs.EncodingType.Base64 });
    return;
  }

  throw new Error("No filesystem driver available to write " + uri);
}

/**
 * Encrypts a source file and writes the encrypted payload atomically to destUri.
 */
export async function storeEncryptedFile(
  key: Uint8Array,
  srcUri: string,
  destUri: string,
  nonce: Uint8Array
): Promise<number> {
  const plainBytes = await readRawBytes(srcUri);
  const encryptedBytes = encryptFileBytes(key, plainBytes, nonce);

  const tmpUri = destUri + ".tmp";
  await writeRawBytes(tmpUri, encryptedBytes);

  if (nodeFs && !destUri.startsWith("content://")) {
    await nodeFs.promises.rename(stripFileScheme(tmpUri), stripFileScheme(destUri));
  } else if (expoLegacyFs) {
    await expoLegacyFs.deleteAsync(destUri, { idempotent: true });
    await expoLegacyFs.moveAsync({ from: tmpUri, to: destUri });
  }

  return encryptedBytes.length;
}

/**
 * Decrypts a stored file to an ephemeral path for viewing, sharing, or processing.
 * Returns the ephemeral path.
 */
export async function ensureDecryptedCopy(
  key: Uint8Array,
  encryptedUri: string,
  ephemeralDestUri: string
): Promise<string> {
  if (nodeFs && !ephemeralDestUri.startsWith("content://")) {
    const p = stripFileScheme(ephemeralDestUri);
    if (nodeFs.existsSync(p)) return ephemeralDestUri;
  } else if (expoLegacyFs) {
    const info = await expoLegacyFs.getInfoAsync(ephemeralDestUri).catch(() => ({ exists: false }));
    if (info.exists) return ephemeralDestUri;
  }

  const rawBytes = await readRawBytes(encryptedUri);
  const { bytes: plainBytes } = decryptOrPassthrough(key, rawBytes);

  const tmpUri = ephemeralDestUri + ".tmp";
  await writeRawBytes(tmpUri, plainBytes);

  if (nodeFs && !ephemeralDestUri.startsWith("content://")) {
    await nodeFs.promises.rename(stripFileScheme(tmpUri), stripFileScheme(ephemeralDestUri));
  } else if (expoLegacyFs) {
    await expoLegacyFs.deleteAsync(ephemeralDestUri, { idempotent: true });
    await expoLegacyFs.moveAsync({ from: tmpUri, to: ephemeralDestUri });
  }

  return ephemeralDestUri;
}

/**
 * Reads and decrypts stored file bytes in-memory.
 */
export async function readDecryptedBytes(key: Uint8Array, encryptedUri: string): Promise<Uint8Array> {
  const rawBytes = await readRawBytes(encryptedUri);
  const { bytes: plainBytes } = decryptOrPassthrough(key, rawBytes);
  return plainBytes;
}

/**
 * Automatically migrates unencrypted legacy files in filesDir to AES-256-GCM encrypted files.
 * Idempotent: files that already carry the DVF1 header are left untouched.
 */
export async function migratePlainFilesToEncrypted(
  key: Uint8Array,
  filesDir: string,
  createNonce: () => Uint8Array
): Promise<{ migrated: number; skipped: number }> {
  let fileNames: string[] = [];
  const normDir = normalizeUri(filesDir.endsWith("/") ? filesDir : filesDir + "/");

  if (nodeFs && !normDir.startsWith("content://")) {
    const rawDir = stripFileScheme(normDir);
    if (!nodeFs.existsSync(rawDir)) return { migrated: 0, skipped: 0 };
    fileNames = await nodeFs.promises.readdir(rawDir);
  } else if (expoLegacyFs) {
    const info = await expoLegacyFs.getInfoAsync(normDir).catch(() => ({ exists: false }));
    if (!info.exists) return { migrated: 0, skipped: 0 };
    fileNames = await expoLegacyFs.readDirectoryAsync(normDir);
  }

  let migrated = 0;
  let skipped = 0;

  for (const name of fileNames) {
    if (name.endsWith(".tmp") || name.startsWith(".")) continue;
    const fileUri = normDir + name;
    try {
      const bytes = await readRawBytes(fileUri);
      if (isEncryptedFile(bytes)) {
        skipped++;
        continue;
      }

      // File is plain: encrypt it atomically
      const nonce = createNonce();
      const encrypted = encryptFileBytes(key, bytes, nonce);
      const tmpUri = fileUri + ".enc.tmp";
      await writeRawBytes(tmpUri, encrypted);

      if (nodeFs && !fileUri.startsWith("content://")) {
        await nodeFs.promises.rename(stripFileScheme(tmpUri), stripFileScheme(fileUri));
      } else if (expoLegacyFs) {
        await expoLegacyFs.deleteAsync(fileUri, { idempotent: true });
        await expoLegacyFs.moveAsync({ from: tmpUri, to: fileUri });
      }
      migrated++;
    } catch (e) {
      console.warn(`[migration] failed to migrate file ${name}:`, e);
    }
  }

  return { migrated, skipped };
}

const thumbCache = new Map<string, string>();

/**
 * Resolves a decrypted image thumbnail path for FileThumb component.
 * Decrypts to cache once and returns cached path on subsequent renders.
 */
export async function resolveDecryptedThumb(
  uri: string,
  key: Uint8Array | null
): Promise<string | null> {
  if (!uri) return null;
  // If not inside vault/files, it's already an unencrypted cache/picker image
  if (!uri.includes("vault/files/")) return uri;
  if (!key) return null;

  if (thumbCache.has(uri)) {
    const cached = thumbCache.get(uri)!;
    if (expoLegacyFs) {
      const info = await expoLegacyFs.getInfoAsync(cached).catch(() => ({ exists: false }));
      if (info.exists) return cached;
    } else if (nodeFs) {
      if (nodeFs.existsSync(stripFileScheme(cached))) return cached;
    }
  }

  try {
    const cacheDir = (expoLegacyFs?.cacheDirectory ?? "") + "ephemeral_thumbs/";
    if (expoLegacyFs) {
      await expoLegacyFs.makeDirectoryAsync(cacheDir, { intermediates: true });
    }
    const filename = uri.split("/").pop() || "thumb.jpg";
    const dest = cacheDir + filename;
    await ensureDecryptedCopy(key, uri, dest);
    thumbCache.set(uri, dest);
    return dest;
  } catch {
    return null;
  }
}

export function clearThumbCache() {
  thumbCache.clear();
}
