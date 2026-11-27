const policy = require('../../../packages/notifications/expo-ios-push.json');

function withExpoStagingIosPush(config, env) {
  const environment = env.EXPO_IOS_APNS_ENVIRONMENT;
  if ((environment !== 'development' && environment !== 'production') ||
    config.ios?.bundleIdentifier !== policy.bundleId ||
    (env.ZYX_ENVIRONMENT && env.ZYX_ENVIRONMENT !== 'staging') ||
    [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL].some(value => value && value !== policy.origin)) return config;
  const plugins = (config.plugins ?? []).map(plugin =>
    Array.isArray(plugin) && plugin[0] === 'expo-notifications'
      ? [plugin[0], { ...plugin[1], mode: environment, enableRemoteNotifications: true }] : plugin);
  return {
    ...config,
    plugins,
    ios: { ...config.ios, entitlements: { ...config.ios.entitlements, 'aps-environment': environment } },
    extra: { ...config.extra, zyxExpoIosApnsEnvironment: environment },
  };
}

module.exports = { withExpoStagingIosPush };
