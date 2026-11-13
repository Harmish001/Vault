/**
 * Share Bundles: Pre-saved document sets for one-tap sharing.
 * KYC docs, Rental docs, Insurance claim docs, etc.
 */
import { useCallback, useMemo } from "react";
import { useSettings } from "../storage/settings";
import { useVault } from "../storage/vault";
import { ShareBundle, VaultFile } from "../types";
import { uid } from "../utils";

const PRESET_BUNDLES: { name: string; description: string; keywords: string[] }[] = [
  {
    name: "KYC Documents",
    description: "Aadhaar, PAN, Photo, Address proof",
    keywords: ["aadhaar", "pan", "photo", "passport", "address"],
  },
  {
    name: "Rental Application",
    description: "ID proof, address, employment letter",
    keywords: ["aadhaar", "pan", "salary", "employment", "address", "police"],
  },
  {
    name: "Insurance Claim",
    description: "Policy, ID, bills, photos",
    keywords: ["policy", "insurance", "bill", "receipt", "hospital"],
  },
  {
    name: "Bank KYC",
    description: "PAN, Aadhaar, photo, signature",
    keywords: ["pan", "aadhaar", "photo", "signature", "cheque"],
  },
];

export function useShareBundles() {
  const { settings, update } = useSettings();
  const { files, shareFilesZip } = useVault();

  const bundles = settings.shareBundles ?? [];

  const createBundle = useCallback(
    async (name: string, description: string, fileIds: string[]) => {
      const bundle: ShareBundle = {
        id: uid(),
        name,
        description,
        fileIds,
        createdAt: Date.now(),
      };
      const next = [...bundles, bundle];
      await update({ shareBundles: next });
      return bundle;
    },
    [bundles, update]
  );

  const updateBundle = useCallback(
    async (id: string, patch: Partial<Pick<ShareBundle, "name" | "description" | "fileIds">>) => {
      const next = bundles.map((b) => (b.id === id ? { ...b, ...patch } : b));
      await update({ shareBundles: next });
    },
    [bundles, update]
  );

  const deleteBundle = useCallback(
    async (id: string) => {
      const next = bundles.filter((b) => b.id !== id);
      await update({ shareBundles: next });
    },
    [bundles, update]
  );

  const shareBundle = useCallback(
    async (bundleId: string) => {
      const bundle = bundles.find((b) => b.id === bundleId);
      if (!bundle) throw new Error("Bundle not found");
      const bundleFiles = bundle.fileIds
        .map((id) => files.find((f) => f.id === id))
        .filter((f): f is VaultFile => !!f);
      if (bundleFiles.length === 0) throw new Error("No files in bundle");
      await shareFilesZip(bundleFiles);
    },
    [bundles, files, shareFilesZip]
  );

  // Suggest files for a preset bundle based on keywords
  const suggestFilesForPreset = useCallback(
    (presetIndex: number): VaultFile[] => {
      const preset = PRESET_BUNDLES[presetIndex];
      if (!preset) return [];
      return files.filter((f) => {
        const text = (f.name + " " + (f.tags?.join(" ") ?? "") + " " + (f.notes ?? "")).toLowerCase();
        return preset.keywords.some((kw) => text.includes(kw));
      });
    },
    [files]
  );

  // Get files for a bundle
  const getBundleFiles = useCallback(
    (bundleId: string): VaultFile[] => {
      const bundle = bundles.find((b) => b.id === bundleId);
      if (!bundle) return [];
      return bundle.fileIds
        .map((id) => files.find((f) => f.id === id))
        .filter((f): f is VaultFile => !!f);
    },
    [bundles, files]
  );

  return {
    bundles,
    presets: PRESET_BUNDLES,
    createBundle,
    updateBundle,
    deleteBundle,
    shareBundle,
    suggestFilesForPreset,
    getBundleFiles,
  };
}
