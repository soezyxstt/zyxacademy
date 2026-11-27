const policy = require('../../../packages/native-session/expo-staging-app-links.json');

const sha256Fingerprint = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i;
const dynamicSegment = /\[[A-Za-z][A-Za-z0-9]*\]/g;

function withExpoStagingAppLinks(android, env) {
  const configured = env[policy.fingerprintVariable]?.split(',').some(value => sha256Fingerprint.test(value.trim()));
  if (!configured || android.package !== policy.androidPackage ||
    (env.ZYX_ENVIRONMENT && env.ZYX_ENVIRONMENT !== 'staging') ||
    [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL].some(value => value && value !== policy.origin)) return android;

  const host = new URL(policy.origin).hostname;
  const data = Object.keys(policy.routes).map(path => ({
    scheme: 'https',
    host,
    ...(path.includes('[') ? { pathAdvancedPattern: path.replace(dynamicSegment, policy.segmentPattern) } : { path }),
  }));

  // The single filter has literal paths for Android versions below API 31,
  // which ignore the advanced matchers. The host never gets a bare filter.
  return { ...android, intentFilters: [...(android.intentFilters ?? []), {
    action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'], data,
  }] };
}

module.exports = { withExpoStagingAppLinks };
