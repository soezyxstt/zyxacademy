import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = resolve("scripts/neon/smoke-content-workers.ts");
test("content smoke rejects invalid environments before private settings are read", () => {
  for (const args of [[], ["prod"], ["production "]]) {
    const result = Bun.spawnSync([process.execPath, script, ...args]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("COMPUTE_ENVIRONMENT_REQUIRED");
    expect(result.stderr.toString()).not.toContain("ENOENT");
  }
}, 20_000);
test("content smoke isolates bulk output and leaves global assessment ingestion uninvoked", () => {
  const source = readFileSync(script, "utf8");
  const write = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", 'assert.equal(database.rows[0].name, "neondb")',
    "assert.equal(environments.data[0].id, target.inngestEnvironment)", "Inngest event key target mismatch",
    "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)"]) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(write);
  }
  expect(source).toContain("if (fixturesCreated && accepted)");
  expect(source).toContain("content-retained.json");
  expect(source).toContain("Vector must belong to a generated fixture question");
  expect(source).toContain('assert.equal(materials[0].status, "draft")');
  expect(source).not.toContain('"assessment.ingest"');
});
