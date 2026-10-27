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

/**
 * Formats emergency contacts and critical medical info into an offline text payload
 * encoded directly into the lock-screen emergency QR code.
 * Standard camera scanners (Google Lens, iOS, Samsung) parse phone numbers for 1-tap calling.
 */
export function buildEmergencyQrText(p: Profile): string {
  const sections: string[] = [];

  const name = p.name.trim();
  sections.push(`EMERGENCY MEDICAL & CONTACT INFO\nName: ${name || "Unknown"}`);

  const contacts = p.contacts.filter((c) => c.phone.trim());
  if (contacts.length > 0) {
    const contactLines = contacts.map((c) => {
      const rel = c.relation.trim() ? ` (${c.relation.trim()})` : "";
      return `• ${c.name.trim()}${rel}: ${c.phone.trim()}`;
    });
    sections.push(`EMERGENCY CONTACTS:\n${contactLines.join("\n")}`);
  }

  if (p.bloodGroup?.trim()) {
    sections.push(`Blood Group: ${p.bloodGroup.trim()}`);
  }

  if (p.showMedical !== false) {
    const med: string[] = [];
    if (p.allergies?.trim()) med.push(`• Allergies: ${p.allergies.trim()}`);
    if (p.conditions?.trim()) med.push(`• Conditions: ${p.conditions.trim()}`);
    if (p.medicines?.trim()) med.push(`• Regular Medicines: ${p.medicines.trim()}`);
    if (med.length > 0) {
      sections.push(`MEDICAL DETAILS:\n${med.join("\n")}`);
    }
  }

  if (p.showAddress !== false) {
    const addr = [p.address, p.pincode].filter((x) => x?.trim()).join(" - ");
    if (addr) {
      sections.push(`Address:\n${addr}`);
    }
  }

  if (p.note?.trim()) {
    sections.push(`Finder Note:\n${p.note.trim()}`);
  }

  return sections.join("\n\n");
}
