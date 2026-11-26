const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

function buildReadingKatexCss(dist) {
  const css = readFileSync(path.join(dist, "katex.min.css"), "utf8");
  const bundled = css.replace(/url\(fonts\/(KaTeX_[a-z0-9-]+\.woff2)\) format\("woff2"\)(?:,url\([^)]+\) format\("[^"]+"\))*/gi, (_, name) => {
    const font = readFileSync(path.join(dist, "fonts", name)).toString("base64");
    return `url("data:font/woff2;base64,${font}") format("woff2")`;
  });
  if (bundled === css || /url\((?!["']?data:)/.test(bundled) || /@import|<\/style/i.test(bundled)) {
    throw new Error("KaTeX reading styles must be self-contained");
  }
  return bundled;
}

function prepareReadingKatex() {
  const dist = path.dirname(require.resolve("katex/dist/katex.min.css"));
  const output = path.join(__dirname, "reading-katex.generated.js");
  const source = `export const readingKatexCss = ${JSON.stringify(buildReadingKatexCss(dist))};\n`;
  try {
    if (readFileSync(output, "utf8") === source) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(output, source, "utf8");
}

module.exports = { buildReadingKatexCss, prepareReadingKatex };
