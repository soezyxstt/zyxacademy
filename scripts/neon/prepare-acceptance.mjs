import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

const target = workerTarget(process.argv[2]);
const runtime = JSON.parse(await readFile("artifacts/neon-worker/.env.runtime.json", "utf8"));
const proofPath = target.name === "production" ? "production/after.json" : "after.json";
const proof = JSON.parse(await readFile(`artifacts/worker-deployment/${proofPath}`, "utf8"));
assertWorkerEnvironment(target, runtime.environment);
assert.equal(proof.project, target.project);
assert.equal(proof.branch, target.branch);
assert.equal(proof.slug, target.slug);
assert.equal(proof.url, target.origin + "/");
assert.equal(proof.functions, 22);
assert.match(proof.checksum, /^[a-f0-9]{64}$/);
await mkdir(target.output, { recursive: true });
await writeFile(`${target.output}/.env.${target.name}.json`, JSON.stringify({
  ...runtime.environment,
  INNGEST_SERVE_ORIGIN: target.origin,
  ZYX_COMPUTE_REVISION: proof.checksum,
}), { mode: 0o600 });
console.log("Verified acceptance configuration prepared; credential values omitted.");
