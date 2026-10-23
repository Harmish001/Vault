// Expo config plugin: lets CI sign the release APK with your own keystore.
// If DOCVAULT_KEYSTORE_FILE is not set, the build falls back to the template's debug keystore
// (installable, but NOT suitable for Play Store uploads).
const { withAppBuildGradle } = require("@expo/config-plugins");

const SIGNING_BLOCK = `
        release {
            if (System.getenv('DOCVAULT_KEYSTORE_FILE')) {
                storeFile file(System.getenv('DOCVAULT_KEYSTORE_FILE'))
                storePassword System.getenv('DOCVAULT_KEYSTORE_PASSWORD')
                keyAlias System.getenv('DOCVAULT_KEY_ALIAS')
                keyPassword System.getenv('DOCVAULT_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("DOCVAULT_KEYSTORE_FILE")) return cfg;

    const signingAnchor = /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s{8}\}/;
    const releaseAnchor =
      /(signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/;

    if (!signingAnchor.test(src) || !releaseAnchor.test(src)) {
      console.warn("[withReleaseSigning] build.gradle template changed; release signing patch skipped.");
      return cfg;
    }
    src = src.replace(signingAnchor, (m) => m + SIGNING_BLOCK);
    src = src.replace(
      releaseAnchor,
      "$1signingConfig System.getenv('DOCVAULT_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug"
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
