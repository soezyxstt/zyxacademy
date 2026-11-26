const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");
const localizedMessages = path.resolve(__dirname, "../../messages");

// Assets in watched repository folders resolve the registry from the Expo app.
config.transformer.assetRegistryPath = require.resolve("react-native/asset-registry");
config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, localizedMessages];

module.exports = config;
