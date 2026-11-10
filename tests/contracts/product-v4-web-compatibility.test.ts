import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import manifest from "../../lib/compute/product-v4-web-compatibility.json";
import { productV4TargetRuntime, productV4CompatibilityEvidence } from "../../lib/compute/product-v4-web-compatibility";
import { assertProductV4RuntimeFingerprint, resolveProductV4LoadedRuntime, PRODUCT_V4_RUNTIME_FILES } from "../../lib/compute/product-v4-runtime-binding";

const executor = { ...manifest.webRuntime, rendererChecksum: "a".repeat(64), contractChecksum: "b".repeat(64) };
const environment: NodeJS.ProcessEnv = { NODE_ENV: "production", ZYX_COMPUTE_RUNTIME: "neon", NEXT_PUBLIC_APP_URL: manifest.origin,
  AUTHORING_VERIFICATION_BROWSER_PROVIDER: "cloudflare", ZYX_COMPUTE_REVISION: "c".repeat(64) };
const scope = { ...manifest.scope, sourceFigureCount: 0 };

test("production bridge separates a pinned live web identity from the embedded executor", async () => {
  const loaded = await resolveProductV4LoadedRuntime(executor, async () => ({ ...executor }));
  const target = productV4TargetRuntime(loaded, scope, environment);
  expect(target).toEqual(manifest.webRuntime);
  expect(target.rendererChecksum).not.toBe(loaded.rendererChecksum);
  await expect(resolveProductV4LoadedRuntime(executor, async () => ({ ...executor, contractChecksum: "d".repeat(64) }))).rejects.toThrow("RUNTIME_MISMATCH");
  expect(() => assertProductV4RuntimeFingerprint(target, { ...target, rendererChecksum: "d".repeat(64) })).toThrow("RUNTIME_MISMATCH");
  for (const key of ["fontChecksum", "playbookChecksum", "printProfile"] as const) {
    expect(() => productV4TargetRuntime({ ...executor, [key]: "changed" }, scope, environment)).toThrow("COMPATIBILITY_MISMATCH");
  }
  expect(() => productV4TargetRuntime(executor, scope, { ...environment, AUTHORING_VERIFICATION_BROWSER_PROVIDER: "steel" })).toThrow("BROWSER_MISMATCH");
  expect(productV4TargetRuntime(executor, scope, { ...environment, NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com" })).toBe(executor);
  expect(productV4TargetRuntime(executor, scope, { ...environment, ZYX_COMPUTE_RUNTIME: "deno" })).toBe(executor);
  expect(productV4TargetRuntime(executor, { ...scope, importId: "another" }, environment)).toBe(executor);
  expect(productV4TargetRuntime(executor, undefined, environment)).toBe(executor);
  expect(() => productV4TargetRuntime(executor, { ...scope, sourceFigureCount: 1 }, environment)).toThrow("SOURCE_FIGURE_UNSUPPORTED");
  const evidence = productV4CompatibilityEvidence(executor, scope, environment)!;
  expect(evidence.executor.runtime).toEqual(executor);
  expect(evidence.executor.archiveChecksum).toBe(environment.ZYX_COMPUTE_REVISION);
  expect(evidence.targetWeb.webRuntime).toEqual(target);
});

test("compatibility pins the complete reviewed source closure and both deployment provenance and public asset", () => {
  const expected = [...new Set([...PRODUCT_V4_RUNTIME_FILES.filter(path => path !== "lib/compute/product-v4-web-compatibility.json"), "package.json", "bun.lock", "scripts/neon/deploy-worker.mjs"])].sort();
  expect(manifest.sourceFiles.map(file => file.path).sort()).toEqual(expected);
  for (const file of manifest.sourceFiles) {
    expect(createHash("sha256").update(readFileSync(file.path, "utf8").replace(/\r\n/g, "\n")).digest("hex")).toBe(file.executorChecksum);
  }
  expect(manifest.webSourceRevision).toBe("75e27c0b265eb4f364efc413d9d5bd40c468dcaa");
  expect(manifest.observedWebDeploymentId).toBe("dpl_6q9mwweTtbdtUnUvkcUozowGFaPf");
  expect(manifest.asset.path).toMatch(/^\/_next\/static\/immutable\/chunks\/[\w.-]+\.js$/);
  expect(manifest.asset.checksum).toMatch(/^[a-f0-9]{64}$/);
});
