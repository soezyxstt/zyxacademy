import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { traceNativePackages, zipFunctionBundle } from "@neon/config-runtime/v1";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const output = resolve(process.argv[2] || "artifacts/neon-worker");
const packages = ["katex", "playwright-core", "sharp"];
const fingerprint = JSON.parse(await readFile("artifacts/authoring-verification/web-runtime.json", "utf8"));
const chromium = JSON.parse(await readFile(join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"), "utf8")).browsers.find(browser => browser.name === "chromium");
const nativeDeps = process.platform === "win32" ? {
  async install(cwd, specs) {
    const npm = process.env.NPM_CLI_PATH;
    if (!npm) throw new Error("NPM_CLI_PATH_REQUIRED_ON_WINDOWS");
    await promisify(execFile)(process.execPath, [npm, "install", "--cpu=arm64", "--os=linux", "--libc=glibc", "--ignore-scripts", "--no-audit", "--no-fund", ...specs], { cwd, maxBuffer: 4 * 1024 * 1024 });
  },
} : undefined;
const bundled = await build({ entryPoints: ["workers/neon-background/main.ts"], bundle: true, write: false, minify: true, format: "esm", platform: "node", target: "node24", outfile: "index.mjs", external: [...packages, "@napi-rs/canvas", "pdf-parse", "pdfjs-dist"], define: { "process.env.ZYX_COMPUTE_RUNTIME": JSON.stringify("neon"), "__ZYX_VERIFICATION_BUILD_RUNTIME__": JSON.stringify({ fingerprint, chromium: { browserVersion: chromium.browserVersion, revision: chromium.revision } }) },
  // Deno's nested npm cache must not contribute a second SDK with different internal Symbols.
  plugins: [{ name: "shared-worker-sdk", setup(build) { build.onResolve({ filter: /^(inngest|hono)(\/.*)?$/ }, args => ({ path: fileURLToPath(import.meta.resolve(args.path)) })); } }],
  banner: { js: "import{createRequire as ___cr}from'node:module';const require=___cr(import.meta.url);" } });
const traced = await traceNativePackages({ slug: "zyxcompute", packages, projectDir: process.cwd(), ...(nativeDeps ? { deps: nativeDeps } : {}) });
const files = { "index.mjs": bundled.outputFiles[0].contents, ...traced.entries };
// The admin knowledge job reads its curated documents from the deployed filesystem.
const registryBundle = await build({ entryPoints: ["lib/admin-ops-ai/admin-knowledge-sources.ts"], bundle: true, write: false, format: "esm", platform: "node", target: "node24" });
const registry = await import(`data:text/javascript;base64,${Buffer.from(registryBundle.outputFiles[0].contents).toString("base64")}`);
for (const source of registry.CURATED_ADMIN_KNOWLEDGE_ALLOWLIST.filter(item => !item.isVirtual)) {
  if (!/^docs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.md$/.test(source.sourcePath)) throw new Error("NEON_ADMIN_KNOWLEDGE_PATH_INVALID");
  registry.assertPathAllowedForAdminKnowledge(source.sourcePath);
  files[source.sourcePath] = new Uint8Array(await readFile(source.sourcePath));
}
console.log(JSON.stringify({ nativeWarnings: traced.warnings.length, largestCompressed: Object.entries(files).map(([name, bytes]) => ({ name, gzipBytes: gzipSync(bytes).length })).sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 8) }));
// These assets are resolved through filesystem paths and cannot be inferred from a minified bundle.
async function includeTree(packageName, subpath) {
  const root = dirname(require.resolve(`${packageName}/package.json`));
  async function visit(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files[`node_modules/${packageName}/${path.replaceAll("\\", "/")}`] = new Uint8Array(await readFile(join(root, path)));
    }
  }
  await visit(subpath);
}
await includeTree("katex", "dist/fonts");
await includeTree("katex", "dist/contrib");
files["node_modules/katex/dist/katex.min.css"] = new Uint8Array(await readFile(join(dirname(require.resolve("katex/package.json")), "dist/katex.min.css")));
const parserRoot = resolve(dirname(require.resolve("pdf-parse")), "../../..");
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const fonts = {};
for (const folder of ["standard_fonts", "cmaps", "wasm"]) {
  for (const name of await readdir(join(pdfjsRoot, folder))) fonts[`${folder}/${name}`] = (await readFile(join(pdfjsRoot, folder, name))).toString("base64");
}
files["pdf-assets.json"] = Buffer.from(JSON.stringify({ parser: await readFile(join(parserRoot, "dist/pdf-parse/web/pdf-parse.es.js"), "utf8"),
  worker: await readFile(join(parserRoot, "dist/worker/pdf.worker.mjs"), "utf8"), pdfjs: await readFile(join(pdfjsRoot, "legacy/build/pdf.mjs"), "utf8"), fonts }));
const code = Buffer.from(files["index.mjs"]).toString("utf8");
if (/(?:import\(|require\()["'](?:@napi-rs\/canvas|pdf-parse|pdfjs-dist)/.test(code)) {
  console.error([...code.matchAll(/(?:import\(|require\()["'](?:@napi-rs\/canvas|pdf-parse|pdfjs-dist)[^)]*\)/g)].map(match => match[0]));
  throw new Error("NEON_NATIVE_PDF_IMPORT_LEAK");
}
const finalZip = await zipFunctionBundle("zyxcompute", files);
await mkdir(output, { recursive: true });
await writeFile(join(output, "worker.zip"), finalZip);
await writeFile(join(output, "pdf-assets.json"), files["pdf-assets.json"]);
await writeFile(join(output, "inventory.json"), JSON.stringify({ files: Object.keys(files).sort(), zipBytes: finalZip.length,
  extractedBytes: Object.values(files).reduce((total, bytes) => total + bytes.length, 0), packages: Object.fromEntries(packages.map(name => [name, require(`${name}/package.json`).version])) }, null, 2));
console.log(JSON.stringify({ archive: join(output, "worker.zip"), zipBytes: finalZip.length, files: Object.keys(files).length }));
