import type { Profile } from "./types";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** What the lock screen may show. Never document numbers; address and medical follow the owner's choice. */
export function cardLines(p: Profile) {
  const lines = p.contacts
    .filter((c) => c.phone.trim())
    .map((c) => ({ label: c.relation.trim() ? `Call · ${c.relation.trim()}` : "Call", value: `${c.name.trim()}  ${c.phone.trim()}`.trim() }));
  if (p.showMedical) {
    lines.push(
      { label: "Blood group", value: p.bloodGroup ?? "" },
      { label: "Allergies", value: p.allergies ?? "" },
      { label: "Medical conditions", value: p.conditions ?? "" },
      { label: "Medicines", value: p.medicines ?? "" }
    );
  }
  if (p.showAddress) lines.push({ label: "Address", value: [p.address, p.pincode].filter((x) => x?.trim()).join(" - ") });
  return lines.filter((l) => l.value.trim());
}
