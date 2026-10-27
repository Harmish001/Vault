import { requireOptionalNativeModule } from "expo";
import type { Folder, VaultFile } from "./types";
import { buildDocumentsProviderPayload, pickerDisplayName } from "./documents-provider-data";

export { buildDocumentsProviderPayload, pickerDisplayName } from "./documents-provider-data";

const native = requireOptionalNativeModule<{
  isSupported(): boolean;
  sync(json: string, enabled: boolean): void;
  clear(): void;
}>("VaultDocuments");

export const documentsProviderSupported = () => native?.isSupported() ?? false;

/**
 * Synchronizes the vault folders and files with the native DocumentsProvider
 * so they appear directly in the Android system "Choose file" dialog.
 */
export function syncDocumentsProvider(folders: Folder[], files: VaultFile[], enabled = true) {
  try {
    if (!enabled) {
      native?.clear();
      return;
    }

    const payload = buildDocumentsProviderPayload(folders, files);
    native?.sync(JSON.stringify(payload), enabled);
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
