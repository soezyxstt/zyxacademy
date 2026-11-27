const { buildSync } = require("esbuild");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

// Build the existing browser renderer once per Metro start. Keep Three outside the native JS runtime.
module.exports = function preparePetScene() {
  const app = path.resolve(__dirname, "../../..");
  const result = buildSync({
    entryPoints: [path.join(__dirname, "scene.browser.js")],
    nodePaths: [path.join(app, "node_modules")],
    tsconfig: path.join(app, "tsconfig.json"),
    bundle: true, write: false, minify: true, legalComments: "inline",
    format: "iife", platform: "browser", target: ["chrome100", "safari16"],
  });
  const output = path.join(__dirname, "scene.generated.js");
  const source = "export const petSceneScript = " + JSON.stringify(result.outputFiles[0].text) + ";\n";
  try {
    if (readFileSync(output, "utf8") === source) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(output, source);
};
