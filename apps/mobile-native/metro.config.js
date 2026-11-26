const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedSources = path.resolve(__dirname, "../../packages");
const galleryPortraits = path.resolve(__dirname, "../../public/founders");

const contentCompiler = path.resolve(__dirname, "../../lib");

const messages = path.resolve(__dirname, "../../messages");

config.watchFolders = [...config.watchFolders, sharedSources, galleryPortraits, contentCompiler, messages];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  zod: path.resolve(__dirname, "node_modules/zod"),
};

module.exports = config;
