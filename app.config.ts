import { readFileSync } from "fs";
import { join } from "path";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Expo only transpiles this file, not its imports, so the brand colors are read from src/theme.ts as text.
const theme = readFileSync(join(__dirname, "src", "theme.ts"), "utf8");
const color = (name: string) => {
  const hit = theme.match(new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`));
  if (!hit) throw new Error(`src/theme.ts: colors.${name} must be a 6-digit hex color`);
  return hit[1];
};

const PLUGIN_COLORS: Record<string, Record<string, string>> = {
  "expo-splash-screen": { backgroundColor: color("primaryDark") },
  "expo-notifications": { color: color("primary") },
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    adaptiveIcon: { ...config.android?.adaptiveIcon, backgroundColor: color("primaryDark") },
  },
  plugins: config.plugins?.map((p) => {
    const [name, options] = (typeof p === "string" ? [p] : p) as [string?, object?];
    const patch = name ? PLUGIN_COLORS[name] : undefined;
    return name && patch ? [name, { ...options, ...patch }] : p;
  }),
});
