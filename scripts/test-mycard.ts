import { buildFillProfiles, kindOfDetail } from "../src/autofill-data";
import { buildEmergencyQrText, cardLines } from "../src/emergency-card";
import type { Folder, Profile, VaultFile } from "../src/types";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

assert(kindOfDetail("Aadhaar number") === "aadhaar" && kindOfDetail("Adhar no") === "aadhaar", "aadhaar labels, common spellings");
assert(kindOfDetail("PAN") === "pan" && kindOfDetail("Company") === null, "PAN only as a whole word");
assert(kindOfDetail("Driving licence no") === "licence" && kindOfDetail("DL") === "licence", "licence labels");
assert(kindOfDetail("Date of birth") === "dob" && kindOfDetail("Name on card") === "name", "dob and name labels");
assert(kindOfDetail("Name on PAN card") === "name" && kindOfDetail("Name on passport") === "name", "name on a document is a name, not its number");
assert(kindOfDetail("Passport issue date") === null && kindOfDetail("Licence valid till") === null, "dates about a document are not its number");
assert(kindOfDetail("Issued by", ["passport"]) === null && kindOfDetail("Vehicle registration date") === null, "issuer and dates never fill number fields");
assert(kindOfDetail("Document number", ["voter-id"]) === "voter", "generic number takes its kind from the scan tag");
assert(kindOfDetail("Document number", ["receipt"]) === null && kindOfDetail("Notes", ["pan"]) === null, "unknown tags and non-number labels are ignored");

const folders: Folder[] = [
  { id: "dad", name: "Dad", parentId: null, color: "#065F46", createdAt: 0 },
  { id: "dad-ids", name: "IDs", parentId: "dad", color: "#065F46", createdAt: 0 },
  { id: "me", name: "Me", parentId: null, color: "#1D4ED8", createdAt: 0 },
  { id: "bills", name: "Bills", parentId: null, color: "#B45309", createdAt: 0 },
];
const file = (id: string, folderId: string, addedAt: number, fields: [string, string][], tags?: string[]): VaultFile => ({
  id,
  folderId,
  name: id + ".jpg",
  mime: "image/jpeg",
  size: 1,
  storedAs: id + ".bin",
  addedAt,
  tags,
  fields: fields.map(([label, value], i) => ({ id: id + i, label, value })),
});
const files = [
  file("old-pan", "dad-ids", 1, [["PAN", "OLDPN1234A"]]),
  file("pan", "dad-ids", 5, [["PAN number", " ABCDE1234F "]]),
  file("aadhaar", "dad", 2, [["Document number", "1234 5678 9012"]], ["aadhaar"]),
  file("my-pp", "me", 3, [["Passport no", "K1234567"], ["Name on passport", "Riya Shah"]]),
  file("bill", "bills", 4, [["Amount", "450"], ["Account number", "99"]]),
  file("blank", "me", 6, [["Voter ID", "  "]]),
];

const noOwner = buildFillProfiles(folders, files, null);
assert(noOwner.map((p) => p.name).join() === "Dad,Me", "one suggestion per top-level folder with numbers, sorted by name");
const dad = noOwner[0].values;
assert(dad.pan === "ABCDE1234F", "newest document wins and values are trimmed");
assert(dad.aadhaar === "1234 5678 9012", "sub-folder documents count for the top-level person");
assert(noOwner[1].values.voter === undefined, "blank values are skipped");

const owner: Profile = {
  name: " Riya ",
  folderId: "me",
  phone: "98765 43210",
  email: "riya@example.com",
  address: "",
  contacts: [],
  showMedical: true,
  showAddress: false,
};
const withOwner = buildFillProfiles(folders, files, owner);
assert(withOwner.map((p) => p.name).join() === "Riya,Dad", "owner comes first and replaces their folder's entry");
assert(withOwner[0].values.passport === "K1234567" && withOwner[0].values.phone === "98765 43210", "owner gets their folder's numbers plus profile details");
assert(withOwner[0].values.name === "Riya", "profile name (trimmed) beats the name read off a document");
assert(!("address" in withOwner[0].values), "empty profile details are not offered");
assert(buildFillProfiles(folders, files, { ...owner, name: "  " }).length === 2, "a profile without a name is ignored");
assert(buildFillProfiles(folders, [], { ...owner, folderId: undefined })[0].values.email === "riya@example.com", "owner without a folder still gets a suggestion");

const card: Profile = {
  name: "Riya",
  address: "12 MG Road",
  pincode: "380001",
  bloodGroup: "O+",
  allergies: "Penicillin",
  conditions: " ",
  contacts: [
    { id: "1", name: "Amit", relation: "Husband", phone: "99999 11111" },
    { id: "2", name: "No phone", relation: "Friend", phone: " " },
    { id: "3", name: "Mom", relation: "", phone: "88888 22222" },
  ],
  note: "Reward if returned",
  showMedical: true,
  showAddress: true,
};
const lines = cardLines(card);
assert(lines[0].label === "Call · Husband" && lines[0].value === "Amit  99999 11111", "contacts show relation and number");
assert(lines[1].label === "Call" && lines.length === 4, "contacts without a phone and empty medical lines are dropped");
assert(lines.some((l) => l.value === "Penicillin"), "medical details shown by default");
assert(!lines.some((l) => l.label === "Blood group"), "blood group is not shown as of now");
assert(lines.some((l) => l.label === "Address" && l.value === "12 MG Road - 380001"), "address shown instead of blood group");
const withoutAddress = cardLines({ ...card, showAddress: false });
assert(!withoutAddress.some((l) => l.label === "Address"), "address can be hidden if turned off");
assert(cardLines({ ...card, contacts: [], showMedical: false, showAddress: false }).length === 0, "nothing to show gives no lines");

const qrText = buildEmergencyQrText(card);
assert(qrText.includes("Name: Riya"), "QR text includes owner name");
assert(qrText.includes("Amit (Husband): 99999 11111"), "QR text formats emergency contact with relationship");
assert(qrText.includes("Mom: 88888 22222"), "QR text formats emergency contact without relationship");
assert(!qrText.includes("No phone"), "QR text drops contact without phone number");
assert(qrText.includes("Blood Group: O+"), "QR text includes blood group");
assert(qrText.includes("Penicillin"), "QR text includes allergies");
assert(qrText.includes("12 MG Road - 380001"), "QR text includes address");
assert(qrText.includes("Reward if returned"), "QR text includes finder note");

const qrWithoutMedOrAddr = buildEmergencyQrText({ ...card, showMedical: false, showAddress: false });
assert(!qrWithoutMedOrAddr.includes("Penicillin"), "QR text excludes medical details when showMedical is false");
assert(!qrWithoutMedOrAddr.includes("12 MG Road"), "QR text excludes address when showAddress is false");
assert(qrWithoutMedOrAddr.includes("Amit (Husband): 99999 11111"), "QR text still keeps emergency contacts when medical/address hidden");

import { DEFAULT_SETTINGS } from "../src/types";
assert(DEFAULT_SETTINGS.lockCardMode === "qr", "default lockscreen card mode is QR code");
assert(DEFAULT_SETTINGS.lockCardSize === "medium", "default lockscreen card size is medium");

console.log("\nAll My card tests passed.");
