import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Bundle application aliases for Node; imported CLI modules must not run their own entrypoints.
const output = resolve("artifacts/v4-local-verifier.mjs");
await mkdir("artifacts", { recursive: true });
await build({
  entryPoints: ["scripts/authoring/verify-product-v4-local.ts"], bundle: true,
  packages: "external", platform: "node", format: "esm", target: "node24", outfile: output,
  define: { "import.meta.main": "false" },
  footer: { js: "runProductV4LocalVerification().catch(reportProductV4LocalFailure);" },
});
const child = spawnSync(process.execPath, [output, ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = child.status ?? 1;
