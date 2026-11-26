const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");

config.watchFolders = [...config.watchFolders, sharedSources];

module.exports = config;
