const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");
const localizedMessages = path.resolve(__dirname, "../../messages");

config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, localizedMessages];

// Assets outside the app resolve the native registry from its installation.
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.join(__dirname, "node_modules")];

module.exports = config;
