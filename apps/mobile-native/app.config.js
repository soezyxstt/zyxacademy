const { readStagingFirebase } = require('./plugins/staging-firebase-config');
const withStagingFirebase = require('./plugins/with-staging-firebase');
const { withExpoStagingIosPush } = require('./plugins/staging-ios-push');
const { withExpoStagingAppLinks } = require('./plugins/staging-app-links');

module.exports = ({ config }) => {
  const { googleServicesFile, ...androidBase } = config.android ?? {};
  const versionName = process.env.EXPO_ANDROID_VERSION_NAME?.trim();
  const rawVersionCode = process.env.EXPO_ANDROID_VERSION_CODE?.trim();
  const parsedVersionCode = rawVersionCode && /^[1-9][0-9]{0,9}$/.test(rawVersionCode) ? Number(rawVersionCode) : undefined;
  const android = parsedVersionCode !== undefined ? { ...androidBase, versionCode: parsedVersionCode } : androidBase;
  const baseConfig = versionName ? { ...config, version: versionName } : config;
  // Expo's public config retains android.googleServicesFile. Keep it in the native mod closure.
  const nativeConfig = withStagingFirebase(withExpoStagingIosPush({ ...baseConfig, android: withExpoStagingAppLinks(android, process.env) }, process.env), onGoogleIdentity => readStagingFirebase(__dirname, {
    ...android, googleServicesFile,
  }, onGoogleIdentity));
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== '1') return nativeConfig;
  return { ...nativeConfig, plugins: [...(nativeConfig.plugins ?? []), './plugins/with-parity-loopback'] };
};
