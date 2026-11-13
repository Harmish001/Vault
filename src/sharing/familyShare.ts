/**
 * Family Sharing: Export a folder (with all files) as an encrypted bundle
 * that another family member's phone can import into their DocVault.
 * 
 * Flow:
 * 1. User A selects folder → exports as .dvault file
 * 2. User A shares file via any method (WhatsApp, Drive, Bluetooth, USB)
 * 3. User B receives file → opens with DocVault → imports folder
 * 
 * File format: ZIP with structure:
 *   - folder.json (encrypted) - folder metadata
 *   - files/ - encrypted file blobs with original filenames
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Folder, VaultFile, IncomingFile } from "../types";
import { encryptBlob, decryptBlob, toUrlBase64, fromUrlBase64 } from "./sharingCrypto";
import { pickShareCode, pickShareWords, deriveShareKey, shareVerifier } from "./shareCode";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { uid } from "../utils";

const ZipArchive = require("react-native-zip-archive");

const FAMILY_DIR = FileSystem.cacheDirectory + "family-share/";

function getCryptoRandomBytes(count: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    return globalThis.crypto.getRandomValues(new Uint8Array(count));
  }
  const Crypto = require("expo-crypto");
  return Crypto.getRandomBytes(count);
}

export type FolderExportResult = {
  packagePath: string;
  code: string;
  words: string[];
  folderName: string;
  fileCount: number;
};

type ExportManifest = {
  v: 1;
  folder: { name: string; color: string };
  files: {
    id: string;
    name: string;
    mime: string;
    size: number;
    storedAs: string;
    notes?: string;
    tags?: string[];
    expiresOn?: string;
  }[];
  exportedAt: string;
  verifier: string; // HMAC to verify correct password
};

/**
 * Export a folder with all its files as an encrypted .dvault package.
 */
export async function exportFolder(
  folder: Folder,
  files: VaultFile[],
  getDecryptedUri: (f: VaultFile) => Promise<string>,
  onProgress?: (msg: string, pct: number) => void
): Promise<FolderExportResult> {
  const sessionId = uid();
  const workDir = FAMILY_DIR + sessionId + "/";
  const filesDir = workDir + "files/";

  await FileSystem.makeDirectoryAsync(filesDir, { intermediates: true });

  onProgress?.("Generating encryption key...", 5);

  // Generate code + words + key
  const words = pickShareWords(getCryptoRandomBytes(8));
  const code = pickShareCode(getCryptoRandomBytes(4));
  const key = await deriveShareKey(code, words.join(" "));
  const verifier = shareVerifier(key);

  const folderFiles = files.filter((f) => f.folderId === folder.id);

  // Build manifest
  const manifest: ExportManifest = {
    v: 1,
    folder: { name: folder.name, color: folder.color },
    files: [],
    exportedAt: new Date().toISOString(),
    verifier,
  };

  // Export each file
  for (let i = 0; i < folderFiles.length; i++) {
    const f = folderFiles[i];
    onProgress?.(`Encrypting ${f.name}...`, 10 + Math.round((i / folderFiles.length) * 70));

    try {
      const uri = await getDecryptedUri(f);
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(b64);
      const encrypted = encryptBlob(key, bytes);

      const encFilename = `${f.id}.enc`;
      await FileSystem.writeAsStringAsync(filesDir + encFilename, encrypted);

      manifest.files.push({
        id: f.id,
        name: f.name,
        mime: f.mime,
        size: f.size,
        storedAs: encFilename,
        notes: f.notes,
        tags: f.tags,
        expiresOn: f.expiresOn,
      });
    } catch (e) {
      console.warn(`Failed to export ${f.name}:`, e);
    }
  }

  onProgress?.("Creating package...", 85);

  // Encrypt and save manifest
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const encryptedManifest = encryptBlob(key, manifestBytes);
  await FileSystem.writeAsStringAsync(workDir + "manifest.enc", encryptedManifest);

  // Create readme
  const readme = `DocVault Family Share
======================

Folder: ${folder.name}
Files: ${manifest.files.length}
Exported: ${new Date().toLocaleString()}

To import this folder:
1. Open DocVault on the other phone
2. Go to Settings → Import Shared Folder
3. Select this file
4. Enter the code: ${code.slice(0, 3)} ${code.slice(3)}
5. Enter the words: ${words.join(" ")}

Keep the code and words safe - they're needed to open the files.
`;
  await FileSystem.writeAsStringAsync(workDir + "README.txt", readme);

  // Create ZIP with .dvault extension
  const zipPath = FAMILY_DIR + `${folder.name.replace(/[^a-zA-Z0-9]/g, "-")}-${sessionId}.dvault`;
  await ZipArchive.zip(workDir, zipPath);

  onProgress?.("Done!", 100);

  // Cleanup work directory
  await FileSystem.deleteAsync(workDir, { idempotent: true });

  return {
    packagePath: zipPath,
    code,
    words,
    folderName: folder.name,
    fileCount: manifest.files.length,
  };
}

/**
 * Share the exported folder using the system share sheet.
 */
export async function shareFolderPackage(packagePath: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(packagePath, {
    mimeType: "application/octet-stream",
    dialogTitle: "Share folder",
    UTI: "public.data",
  });
}

export type FolderImportResult = {
  folderName: string;
  folderColor: string;
  files: IncomingFile[];
};

/**
 * Pick a .dvault file to import.
 */
export async function pickFolderPackage(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0].uri;
  } catch {
    return null;
  }
}

/**
 * Import a .dvault folder package.
 * Returns the folder metadata and files ready to be added to the vault.
 */
export async function importFolder(
  packageUri: string,
  code: string,
  words: string,
  onProgress?: (msg: string, pct: number) => void
): Promise<FolderImportResult> {
  const sessionId = uid();
  const workDir = FAMILY_DIR + "import-" + sessionId + "/";

  onProgress?.("Extracting package...", 10);

  // Extract ZIP
  await ZipArchive.unzip(packageUri, workDir);

  onProgress?.("Deriving key...", 20);

  // Derive key from code + words
  const key = await deriveShareKey(code.replace(/\s/g, ""), words);

  onProgress?.("Reading manifest...", 30);

  // Read and decrypt manifest
  const encryptedManifest = await FileSystem.readAsStringAsync(workDir + "manifest.enc");
  let manifest: ExportManifest;
  try {
    const manifestBytes = decryptBlob(key, encryptedManifest);
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("Wrong code or words. Check and try again.");
  }

  // Verify
  const expectedVerifier = shareVerifier(key);
  if (manifest.verifier !== expectedVerifier) {
    throw new Error("Wrong code or words. Check and try again.");
  }

  onProgress?.("Decrypting files...", 40);

  // Decrypt files
  const incomingFiles: IncomingFile[] = [];
  const filesDir = workDir + "files/";

  for (let i = 0; i < manifest.files.length; i++) {
    const f = manifest.files[i];
    onProgress?.(`Decrypting ${f.name}...`, 40 + Math.round((i / manifest.files.length) * 50));

    try {
      const encrypted = await FileSystem.readAsStringAsync(filesDir + f.storedAs);
      const bytes = decryptBlob(key, encrypted);
      
      // Save decrypted file
      const outPath = workDir + "decrypted/" + f.id + "-" + f.name;
      await FileSystem.makeDirectoryAsync(workDir + "decrypted/", { intermediates: true });
      await FileSystem.writeAsStringAsync(outPath, bytesToBase64(bytes), {
        encoding: FileSystem.EncodingType.Base64,
      });

      incomingFiles.push({
        uri: outPath,
        name: f.name,
        mime: f.mime,
        size: f.size,
        meta: {
          notes: f.notes,
          tags: f.tags,
          expiresOn: f.expiresOn,
        },
      });
    } catch (e) {
      console.warn(`Failed to decrypt ${f.name}:`, e);
    }
  }

  onProgress?.("Done!", 100);

  return {
    folderName: manifest.folder.name,
    folderColor: manifest.folder.color,
    files: incomingFiles,
  };
}

/**
 * Cleanup temporary files.
 */
export async function cleanupFamilyShare(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(FAMILY_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(FAMILY_DIR, { idempotent: true });
    }
  } catch {
    // ignore
  }
}
