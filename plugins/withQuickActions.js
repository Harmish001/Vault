// Expo config plugin: Scan / Add document / Add reminder when the launcher icon is long-pressed.
// Each shortcut opens a docvault://quick/... link; App.tsx acts on it after the usual unlock.
const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require("@expo/config-plugins");

// Feather icon paths (24x24, stroked)
const SHORTCUTS = [
  {
    id: "scan",
    label: "Scan",
    long: "Scan a document",
    glyph: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M16 13a4 4 0 1 1-8 0a4 4 0 1 1 8 0z",
  },
  {
    id: "add",
    label: "Add document",
    long: "Add a document",
    glyph: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6",
  },
  {
    id: "reminder",
    label: "Add reminder",
    long: "Add a reminder",
    glyph: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  },
];

const icon = (glyph, color) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48">
  <path android:fillColor="${color}" android:pathData="M24 2a22 22 0 1 1 0 44a22 22 0 1 1 0-44z" />
  <group android:translateX="12" android:translateY="12">
    <path android:pathData="${glyph}" android:fillColor="#00000000" android:strokeColor="#FFFFFF"
        android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />
  </group>
</vector>
`;

const shortcutsXml = (pkg, scheme) => `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map(
  (s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@drawable/shortcut_${s.id}"
      android:shortcutShortLabel="@string/shortcut_${s.id}" android:shortcutLongLabel="@string/shortcut_${s.id}_long">
    <intent android:action="android.intent.action.VIEW" android:data="${scheme}://quick/${s.id}"
        android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity" />
  </shortcut>`
).join("\n")}
</shortcuts>
`;

module.exports = function withQuickActions(config, { color } = {}) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color ?? "")) throw new Error("withQuickActions: pass { color: '#RRGGBB' }");

  config = withStringsXml(config, (cfg) => {
    const items = SHORTCUTS.flatMap((s) => [
      { $: { name: `shortcut_${s.id}` }, _: s.label },
      { $: { name: `shortcut_${s.id}_long` }, _: s.long },
    ]);
    cfg.modResults = AndroidConfig.Strings.setStringItem(items, cfg.modResults);
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity["meta-data"] = [
      ...(activity["meta-data"] ?? []).filter((m) => m.$["android:name"] !== "android.app.shortcuts"),
      { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } },
    ];
    return cfg;
  });

  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res");
      fs.mkdirSync(path.join(res, "xml"), { recursive: true });
      fs.mkdirSync(path.join(res, "drawable"), { recursive: true });
      const scheme = Array.isArray(cfg.scheme) ? cfg.scheme[0] : cfg.scheme;
      fs.writeFileSync(path.join(res, "xml", "shortcuts.xml"), shortcutsXml(cfg.android.package, scheme));
      for (const s of SHORTCUTS) {
        fs.writeFileSync(path.join(res, "drawable", `shortcut_${s.id}.xml`), icon(s.glyph, color));
      }
      return cfg;
    },
  ]);
};
