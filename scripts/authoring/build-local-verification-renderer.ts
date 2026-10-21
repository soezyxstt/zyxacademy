import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expectedChromiumRuntime, readProductV4RuntimeFingerprint } from "../../lib/compute/product-v4-runtime-binding";

const outdir = resolve("artifacts/authoring-verification");
const fingerprint = await readProductV4RuntimeFingerprint();
const chromium = expectedChromiumRuntime();
mkdirSync(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve("scripts/authoring/verification-renderer.ts")], outdir,
  target: "node", format: "esm", packages: "external", naming: "renderer.mjs",
  plugins: [{ name: "workspace-aliases", setup(build) {
    build.onResolve({ filter: /^@\// }, ({ path }) => {
      const base = resolve(path.replace(/^@\//, ""));
      const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, resolve(base, "index.ts"), resolve(base, "index.tsx")].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (!file) throw new Error(`VERIFICATION_RENDERER_ALIAS_NOT_FOUND:${path}`);
      return { path: file, external: false };
    });
  } }],
  define: { __ZYX_VERIFICATION_BUILD_RUNTIME__: JSON.stringify({ fingerprint, chromium }) },
});
if (!result.success) throw new AggregateError(result.logs, "VERIFICATION_RENDERER_BUILD_FAILED");
const output = resolve(outdir, "renderer.mjs");
const bytes = readFileSync(output);
const source = bytes.toString("utf8");
if (!source.includes(fingerprint.rendererChecksum) || source.includes("__ZYX_VERIFICATION_BUILD_RUNTIME__")) throw new Error("VERIFICATION_RENDERER_ATTESTATION_NOT_EMBEDDED");
if (/(?:from\s*|import\s*\(|require\s*\()\s*["']@\//.test(source)) throw new Error("VERIFICATION_RENDERER_UNRESOLVED_ALIAS");
const receipt = { output, checksum: createHash("sha256").update(bytes).digest("hex"), fingerprint, chromium };
writeFileSync(resolve(outdir, "renderer-build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
