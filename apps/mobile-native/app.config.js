const { readStagingFirebase } = require('./plugins/staging-firebase-config');
const withStagingFirebase = require('./plugins/with-staging-firebase');
const { withExpoStagingAppLinks } = require('./plugins/staging-app-links');

module.exports = ({ config }) => {
  const { googleServicesFile, ...android } = config.android ?? {};
  // Expo's public config retains android.googleServicesFile. Keep it in the native mod closure.
  const nativeConfig = withStagingFirebase({ ...config, android: withExpoStagingAppLinks(android, process.env) }, onGoogleIdentity => readStagingFirebase(__dirname, {
    ...android, googleServicesFile,
  }, onGoogleIdentity));
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== '1') return nativeConfig;
  return { ...nativeConfig, plugins: [...(nativeConfig.plugins ?? []), './plugins/with-parity-loopback'] };
};
