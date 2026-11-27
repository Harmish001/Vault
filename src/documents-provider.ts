import { requireOptionalNativeModule } from "expo";
import type { Folder, VaultFile } from "./types";
import { buildDocumentsProviderPayload } from "./documents-provider-data";
import { getCachedKey } from "./security/keystore";
import { bytesToBase64 } from "./scan/base64";

export { buildDocumentsProviderPayload, pickerDisplayName } from "./documents-provider-data";

const native = requireOptionalNativeModule<{
  isSupported(): boolean;
  sync(json: string, enabled: boolean, masterKeyBase64?: string | null): void;
  clear(): void;
  shareMultiple?(uris: string[], mimeType: string, dialogTitle: string): Promise<void>;
}>("VaultDocuments");

export const documentsProviderSupported = () => native?.isSupported() ?? false;

/**
 * Synchronizes the vault folders, files, and master key (encrypted via AndroidKeyStore)
 * with the native DocumentsProvider so they can be decrypted when picked from external apps.
 */
export function syncDocumentsProvider(folders: Folder[], files: VaultFile[], enabled = true) {
  try {
    if (!enabled) {
      native?.clear();
      return;
    }

    const payload = buildDocumentsProviderPayload(folders, files);
    const key = getCachedKey();
    const keyB64 = key ? bytesToBase64(key) : null;
    native?.sync(JSON.stringify(payload), enabled, keyB64);
  } catch {
    // Keystore or native issues shouldn't break the app
  }
}

export function clearDocumentsProvider() {
  try {
    native?.clear();
  } catch {
    // already cleared
  }
}

export async function shareMultipleNative(
  contentUris: string[],
  mimeType: string,
  dialogTitle: string
): Promise<boolean> {
  if (!native?.shareMultiple) return false;
  await native.shareMultiple(contentUris, mimeType, dialogTitle);
  return true;
}
