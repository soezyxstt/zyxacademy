const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const messages = path.resolve(__dirname, "../../messages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");

config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, messages];

// Assets in the shared watch folders resolve the native asset registry from the Expo app.
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.join(__dirname, "node_modules")];

module.exports = config;
