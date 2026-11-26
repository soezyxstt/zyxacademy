const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedPaths = ["packages", "public/founders", "messages", "lib"];
config.watchFolders = [...new Set([
  ...config.watchFolders,
  ...sharedPaths.map(folder => path.resolve(__dirname, "../..", folder)),
])];

// Resolve assets and native dependencies imported by shared modules from the Expo installation.
config.transformer.assetRegistryPath = require.resolve("react-native/asset-registry");
config.resolver.nodeModulesPaths = [...new Set([
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, "node_modules"),
])];

module.exports = config;
