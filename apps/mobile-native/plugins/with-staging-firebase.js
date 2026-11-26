const { access, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod, withProjectBuildGradle } = require('expo/config-plugins');
const { CAPABILITY } = require('./staging-firebase-config');

const GRADLE_CONFIG = { android: { googleServicesFile: 'google-services.json' } };
const MANAGED = '// @zyx-staging-firebase';

function configureGradle(mod, enabled, apply, pattern) {
  if (mod.modResults.language !== 'groovy') {
    if (enabled) throw new Error('Expo Android Firebase requires the generated Groovy build files.');
    return mod;
  }
  const source = mod.modResults.contents;
  if (!enabled) {
    mod.modResults.contents = source.replace(/^.* \/\/ @zyx-staging-firebase\r?\n?/gm, '');
    return mod;
  }
  const configured = apply(GRADLE_CONFIG, source);
  mod.modResults.contents = configured === source ? source : configured.replace(pattern, `$& ${MANAGED}`);
  return mod;
}

module.exports = function withStagingFirebase(config, readClient) {
  let client;
  const getClient = () => client === undefined ? (client = readClient()) : client;
  const google = AndroidConfig.GoogleServices;
  config = withProjectBuildGradle(config, mod => configureGradle(mod, Boolean(getClient()), google.setClassPath,
    /classpath ['"]com\.google\.gms:google-services:[^'"\r\n]+['"]/));
  config = withAppBuildGradle(config, mod => configureGradle(mod, Boolean(getClient()), google.applyPlugin,
    /apply plugin: ['"]com\.google\.gms\.google-services['"]/));
  config = withAndroidManifest(config, mod => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const validated = getClient();
    if (validated) AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, CAPABILITY, validated.client[0].client_info.mobilesdk_app_id);
    else AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(application, CAPABILITY);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = join(mod.modRequest.platformProjectRoot, 'app');
    const target = join(root, 'google-services.json');
    const owner = join(root, '.zyx-staging-firebase');
    const validated = getClient();
    try {
      if (validated) {
        await writeFile(owner, '', { mode: 0o600 });
        await writeFile(target, JSON.stringify(validated), { mode: 0o600 });
      } else {
        const owned = await access(owner).then(() => true, error => {
          if (error.code === 'ENOENT') return false;
          throw error;
        });
        if (owned) {
          await rm(target, { force: true });
          await rm(owner, { force: true });
        }
      }
    } catch {
      throw new Error('Expo Android Firebase could not update the generated client configuration.');
    }
    return mod;
  }]);
};
