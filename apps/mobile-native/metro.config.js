const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");
const contentCompiler = path.resolve(__dirname, "../../lib");
const localizedMessages = path.resolve(__dirname, "../../messages");

config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, contentCompiler, localizedMessages];

config.resolver.nodeModulesPaths = [
  ...config.resolver.nodeModulesPaths,
  path.resolve(__dirname, "node_modules"),
];

module.exports = config;
