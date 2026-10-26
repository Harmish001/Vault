import type { Profile } from "./types";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** What the lock screen may show. Never document numbers; address is shown instead of blood group. */
export function cardLines(p: Profile) {
  const lines = p.contacts
    .filter((c) => c.phone.trim())
    .map((c) => ({
      label: c.relation.trim() ? `Call · ${c.relation.trim()}` : "Call",
      value: `${c.name.trim()}  ${c.phone.trim()}`.trim(),
    }));

  // Address is shown instead of blood group
  const addr = [p.address, p.pincode].filter((x) => x?.trim()).join(" - ");
  if (addr && p.showAddress !== false) {
    lines.push({ label: "Address", value: addr });
  }

  if (p.showMedical) {
    // Blood group is not shown as of now
    lines.push(
      { label: "Allergies", value: p.allergies ?? "" },
      { label: "Medical conditions", value: p.conditions ?? "" },
      { label: "Medicines", value: p.medicines ?? "" }
    );
  }
  return lines.filter((l) => l.value.trim());
}
