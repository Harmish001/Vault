// Expo config plugin: enables separate APK builds per CPU architecture (ABI splits).
// Generates lightweight (~18 MB) architecture-specific APKs (e.g. arm64-v8a)
// instead of a single bloated 45 MB universal APK.
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("def enableSeparateBuildPerCPUArchitecture = true")) {
      return cfg;
    }
    src = src.replace(
      /def enableSeparateBuildPerCPUArchitecture = false/,
      "def enableSeparateBuildPerCPUArchitecture = true"
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
