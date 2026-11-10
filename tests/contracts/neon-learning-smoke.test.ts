import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = resolve("scripts/neon/smoke-learning-workers.ts");

test("learning smoke rejects missing or invalid environment before reading private settings", () => {
  for (const args of [[], ["prod"], ["production "]]) {
    const result = Bun.spawnSync([process.execPath, script, ...args]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("COMPUTE_ENVIRONMENT_REQUIRED");
    expect(result.stderr.toString()).not.toContain("ENOENT");
  }
});

test("learning smoke guards targets, retains failed acceptance, and deletes only independently derived owned vectors", () => {
  const source = readFileSync(script, "utf8");
  const write = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", 'assert.equal(database.rows[0].name, "neondb")',
    "assert.equal(environments.data[0].id, target.inngestEnvironment)", "Inngest event key target mismatch",
    "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)"]) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(write);
  }
  expect(source).toContain("if (fixturesCreated && accepted)");
  expect(source).toContain("learning-retained.json");
  expect(source).toContain("assert.equal(completion.vectorId, canonicalOutboxPayload(row).vectorId)");
  expect(source.indexOf('await run("vector-sync-worker"')).toBeLessThan(source.indexOf("await vectorizeCanonicalDelete("));
});
