const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");
const localizedMessages = path.resolve(__dirname, "../../messages");

config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, localizedMessages];

module.exports = config;
