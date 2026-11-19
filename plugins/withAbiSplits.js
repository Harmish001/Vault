// Expo config plugin: enables separate APK builds per CPU architecture (ABI splits).
// Generates lightweight (~18 MB) architecture-specific APKs (e.g. arm64-v8a)
// instead of a single bloated 50 MB universal APK.
const { withAppBuildGradle } = require("@expo/config-plugins");

const SPLITS_BLOCK = `
    splits {
        abi {
            reset()
            enable true
            universalApk true
            def archsProp = findProperty('reactNativeArchitectures') ?: 'armeabi-v7a,arm64-v8a'
            def archsList = archsProp.split(',').collect { it.trim() }.findAll { !it.isEmpty() }
            include(*archsList)
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("splits {") && src.includes("enable true")) {
      return cfg;
    }

    // Match after defaultConfig { ... }
    const anchor = /defaultConfig\s*\{[\s\S]*?\n\s{4}\}/;
    if (!anchor.test(src)) {
      console.warn("[withAbiSplits] defaultConfig block not found in build.gradle");
      return cfg;
    }

    src = src.replace(anchor, (match) => match + SPLITS_BLOCK);
    cfg.modResults.contents = src;
    return cfg;
  });
};
