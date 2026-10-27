import { buildDocumentsProviderPayload, pickerDisplayName } from "../src/documents-provider-data";
import type { Folder, VaultFile } from "../src/types";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

console.log("running documents provider tests...");

const folders: Folder[] = [
  { id: "dad", name: "Dad", parentId: null, color: "#065F46", createdAt: 0 },
  { id: "me", name: "Me", parentId: null, color: "#1D4ED8", createdAt: 0 },
];

const aadhaarFile: VaultFile = {
  id: "f1",
  folderId: "dad",
  name: "Aadhaar.pdf",
  mime: "application/pdf",
  size: 1024,
  storedAs: "f1.pdf",
  addedAt: 1000,
  fields: [{ id: "fld1", label: "Aadhaar number", value: "1234 5678 9012" }],
};

const panFile: VaultFile = {
  id: "f2",
  folderId: "me",
  name: "PAN Card.jpg",
  mime: "image/jpeg",
  size: 2048,
  storedAs: "f2.jpg",
  addedAt: 2000,
  fields: [{ id: "fld2", label: "PAN", value: "ABCDE1234F" }],
};

const plainFile: VaultFile = {
  id: "f3",
  folderId: "bills",
  name: "Electricity Bill.pdf",
  mime: "application/pdf",
  size: 512,
  storedAs: "f3.pdf",
  addedAt: 3000,
};

const aadhaarName = pickerDisplayName(aadhaarFile);
assert(aadhaarName.includes("Aadhaar (") && aadhaarName.endsWith(".pdf"), "Aadhaar display name has masked value and pdf extension");
assert(aadhaarName.includes("9012"), "Aadhaar display name retains last 4 digits unmasked");

const panName = pickerDisplayName(panFile);
assert(panName.includes("PAN Card (") && panName.endsWith(".jpg"), "PAN display name has masked value and jpg extension");
assert(panName.includes("234F"), "PAN display name retains last characters unmasked");

const plainName = pickerDisplayName(plainFile);
assert(plainName === "Electricity Bill.pdf", "File without identifying fields keeps original file name");

const payload = buildDocumentsProviderPayload(folders, [aadhaarFile, panFile, plainFile]);
assert(payload.folders.length === 2, "Payload contains all folders");
assert(payload.files.length === 3, "Payload contains all files");
assert(payload.files[0].displayName === aadhaarName, "Payload file carries formatted picker display name");
assert(payload.files[0].searchTerms.includes("1234 5678 9012"), "Payload file search terms index field values");

console.log("All documents provider tests passed successfully!");
