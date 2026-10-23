import type { Folder, Profile, VaultFile } from "./types";

/** Kinds of form field the Android side recognises (modules/vault-autofill FieldMatcher). */
export type FillKind =
  | "name"
  | "phone"
  | "email"
  | "address"
  | "pincode"
  | "dob"
  | "aadhaar"
  | "pan"
  | "passport"
  | "licence"
  | "voter"
  | "vehicle";

export type FillProfile = { name: string; values: Partial<Record<FillKind, string>> };

const DOC_KIND: [RegExp, FillKind][] = [
  [/aa?dh?aa?r/i, "aadhaar"],
  [/\bpan\b/i, "pan"],
  [/passport/i, "passport"],
  [/licen[cs]e|\bdl\b/i, "licence"],
  [/voter|\bepic\b/i, "voter"],
  [/vehicle|registration/i, "vehicle"],
];
// "Passport issue date" or "Licence issued by" describe the document, they are not its number.
const NOT_A_NUMBER = /date|issue|expir|valid|place|address|father|mother|gender|class|type|authority|photo/i;

// Scan tags (src/ocr/parse DOC_TAG) decide what a generic "Document number" belongs to.
const TAG_KIND: Record<string, FillKind> = {
  aadhaar: "aadhaar",
  pan: "pan",
  passport: "passport",
  licence: "licence",
  "voter-id": "voter",
  vehicle: "vehicle",
};

export function kindOfDetail(label: string, tags: string[] = []): FillKind | null {
  if (/^name\b|name on/i.test(label)) return "name";
  if (/birth|\bdob\b/i.test(label)) return "dob";
  if (NOT_A_NUMBER.test(label)) return null;
  const hit = DOC_KIND.find(([re]) => re.test(label));
  if (hit) return hit[1];
  if (!/number|\bno\b/i.test(label)) return null;
  for (const t of tags) {
    const k = TAG_KIND[t.toLowerCase()];
    if (k) return k;
  }
  return null;
}

/**
 * One suggestion per person: each top-level folder (Dad, Mom...) with the numbers saved on its
 * documents, newest document winning. The owner's own details join their chosen folder and come first.
 */
export function buildFillProfiles(folders: Folder[], files: VaultFile[], profile: Profile | null): FillProfile[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const rootOf = (id: string | undefined) => {
    let f = id ? byId.get(id) : undefined;
    while (f?.parentId) f = byId.get(f.parentId);
    return f;
  };

  const people = new Map<string, FillProfile>();
  for (const file of [...files].sort((a, b) => a.addedAt - b.addedAt)) {
    const root = rootOf(file.folderId);
    if (!root) continue;
    for (const d of file.fields ?? []) {
      const kind = kindOfDetail(d.label, file.tags);
      if (!kind || !d.value.trim()) continue;
      const p = people.get(root.id) ?? { name: root.name, values: {} };
      p.values[kind] = d.value.trim();
      people.set(root.id, p);
    }
  }

  const out = [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (profile?.name.trim()) {
    const own: Partial<Record<FillKind, string>> = {
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      pincode: profile.pincode,
      dob: profile.dob,
    };
    for (const k of Object.keys(own) as FillKind[]) {
      const v = own[k]?.trim();
      if (v) own[k] = v;
      else delete own[k];
    }
    const mine = rootOf(profile.folderId)?.id;
    const docs = out.find(([id]) => id === mine)?.[1].values ?? {};
    const me: [string, FillProfile] = [mine ?? "", { name: profile.name.trim(), values: { ...docs, ...own } }];
    return [me, ...out.filter(([id]) => id !== mine)].map(([, p]) => p);
  }
  return out.map(([, p]) => p);
}
