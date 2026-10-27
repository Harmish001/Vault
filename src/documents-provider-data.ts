import type { Folder, VaultFile } from "./types";
import { extOf, maskValue } from "./utils";

/**
 * Formats a clean display name for the system file picker:
 * e.g. "Aadhaar (•••• •••• 9012).pdf", keeping the file extension intact
 * so uploading apps (Chrome, bank portals) recognize the file type immediately.
 */
export function pickerDisplayName(file: VaultFile): string {
  const ext = extOf(file.name);
  const baseName = ext ? file.name.slice(0, -ext.length) : file.name;

  const primaryField = file.fields?.find((fld) => {
    const l = fld.label.toLowerCase();
    return (
      (l.includes("aadhaar") ||
        l.includes("pan") ||
        l.includes("passport") ||
        l.includes("licence") ||
        l.includes("voter") ||
        l.includes("card") ||
        l.includes("account") ||
        l.includes("policy")) &&
      fld.value.trim().length > 0
    );
  });

  if (primaryField) {
    const masked = maskValue(primaryField.value.trim());
    return `${baseName} (${masked})${ext}`;
  }

  return file.name;
}

export function buildDocumentsProviderPayload(folders: Folder[], files: VaultFile[]) {
  return {
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
    })),
    files: files.map((f) => {
      const searchTerms = [
        f.name,
        f.notes ?? "",
        ...(f.tags ?? []),
        ...(f.fields?.map((field) => `${field.label} ${field.value}`) ?? []),
      ].join(" ");

      return {
        id: f.id,
        folderId: f.folderId,
        name: f.name,
        displayName: pickerDisplayName(f),
        mime: f.mime,
        size: f.size,
        storedAs: f.storedAs,
        addedAt: f.addedAt,
        searchTerms,
      };
    }),
  };
}
