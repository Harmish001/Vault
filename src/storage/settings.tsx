import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { DEFAULT_SETTINGS, Settings } from "../types";

const SETTINGS_FILE = (FileSystem.documentDirectory ?? "") + "settings.json";

type Ctx = {
  ready: boolean;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const SettingsContext = createContext<Ctx | null>(null);

export async function readSettings(): Promise<Settings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
    if (info.exists) return { ...DEFAULT_SETTINGS, ...JSON.parse(await FileSystem.readAsStringAsync(SETTINGS_FILE)) };
  } catch {
    // fall back to defaults (lock ON)
  }
  return DEFAULT_SETTINGS;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const latest = useRef(settings);

  useEffect(() => {
    (async () => {
      const merged = await readSettings();
      latest.current = merged;
      setSettings(merged);
      setReady(true);
    })();
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    try {
      await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(next));
    } catch {
      // non-fatal: setting still applies for this session
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ ready, settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
