module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== '1') return config;
  return { ...config, plugins: [...(config.plugins ?? []), './plugins/with-parity-loopback'] };
};
