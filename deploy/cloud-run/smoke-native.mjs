import assert from "node:assert/strict";
import { existsSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(join(process.cwd(), "package.json"));
const exists = (file) => assert.ok(existsSync(file), `Missing runtime asset: ${file}`);
assert.equal(process.platform, "linux");
assert.equal(process.arch, "x64");
assert.notEqual(process.getuid(), 0, "Runtime must run as a non-root user");
for (const name of ["SENTRY_AUTH_TOKEN", "SKIP_ENV_VALIDATION", "DATABASE_URL", "ZYX_POSTGRES_BUILD_PLACEHOLDER"]) {
  assert.equal(process.env[name], undefined, `Build-only variable leaked: ${name}`);
}
for (const file of ["server.js", ".next/BUILD_ID", "lib/coding/frame.html", "dist/skills/manifest.json",
  "node_modules/pdfjs-dist/standard_fonts", "node_modules/katex/dist/fonts", "public/coding/worker.js"]) {
  exists(file);
}
assert.ok(!existsSync(".env") && !existsSync(".git") && !existsSync("tests"));

const { createCanvas, DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const canvas = createCanvas(8, 8);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#dd4400";
ctx.fillRect(0, 0, 8, 8);
const png = canvas.toBuffer("image/png");
assert.equal(png.subarray(1, 4).toString(), "PNG");

const sharp = require("sharp");
const webp = await sharp(png).resize(4).webp().toBuffer();
assert.equal(webp.subarray(8, 12).toString(), "WEBP");

const { getPath } = await import("pdf-parse/worker");
const worker = getPath();
exists(worker);
const { PDFParse } = await import("pdf-parse");
PDFParse.setWorker(pathToFileURL(worker).href);
const pdf = new PDFParse({ data: new Uint8Array(readFileSync("public/v4/diktat.pdf")) });
try {
  const screenshots = await pdf.getScreenshot({ first: 1, desiredWidth: 96, imageBuffer: true, imageDataUrl: false });
  assert.ok(screenshots.pages[0]?.data?.byteLength, "PDF page raster must have image bytes");
} finally {
  await pdf.destroy();
}

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
assert.equal(pdfjs.version, "5.4.296");
exists("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");

const pyodide = require.resolve("pyodide");
assert.ok(basename(pyodide).startsWith("pyodide."));
const wasm = openSync("node_modules/pyodide/pyodide.asm.wasm", "r");
try {
  const magic = Buffer.alloc(4);
  assert.equal(readSync(wasm, magic, 0, 4, 0), 4);
  assert.equal(magic.toString("hex"), "0061736d");
} finally {
  closeSync(wasm);
}
console.log("Packaged canvas, sharp, PDF rendering, Pyodide, and authoring assets passed.");
