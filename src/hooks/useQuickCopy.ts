/**
 * Quick Copy: Track recently copied values for instant access.
 * Copied values appear on home dashboard for one-tap re-copy.
 */
import { useCallback } from "react";
import * as Clipboard from "expo-clipboard";
import { ToastAndroid } from "react-native";
import { useSettings } from "../storage/settings";
import { RecentCopy } from "../types";
import { maskValue } from "../utils";

const MAX_RECENT = 10;

export function useQuickCopy() {
  const { settings, update } = useSettings();

  const copyValue = useCallback(
    async (
      label: string,
      value: string,
      sourceId: string,
      sourceKind: "file" | "note" | "reminder"
    ) => {
      await Clipboard.setStringAsync(value);
      ToastAndroid.show(`${label} copied`, ToastAndroid.SHORT);

      const entry: RecentCopy = {
        label,
        value,
        sourceId,
        sourceKind,
        copiedAt: Date.now(),
      };

      const existing = settings.recentCopies ?? [];
      // Remove duplicate (same label+sourceId)
      const filtered = existing.filter(
        (r) => !(r.label === label && r.sourceId === sourceId)
      );
      // Add to front, cap at MAX
      const next = [entry, ...filtered].slice(0, MAX_RECENT);
      await update({ recentCopies: next });
    },
    [settings.recentCopies, update]
  );

  const recentCopies = settings.recentCopies ?? [];

  const clearRecent = useCallback(async () => {
    await update({ recentCopies: [] });
  }, [update]);

  return { copyValue, recentCopies, clearRecent };
}

/** Format a value for display (masked) */
export function displayValue(value: string): string {
  if (value.length <= 6) return value;
  return maskValue(value);
}
