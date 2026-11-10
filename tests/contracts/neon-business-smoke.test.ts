import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = resolve("scripts/neon/smoke-business-workers.ts");

test("business smoke requires an exact explicit environment before reading credentials", () => {
  for (const args of [[], ["production "], ["prod"]]) {
    const result = Bun.spawnSync([process.execPath, script, ...args]);
    const error = result.stderr.toString();
    expect(result.exitCode).not.toBe(0);
    expect(error).toContain("COMPUTE_ENVIRONMENT_REQUIRED");
    expect(error).not.toContain("ENOENT");
    expect(error).not.toContain("fetch failed");
  }
});

test("production fixture writes require resource, key and deployed revision preflights", () => {
  const source = readFileSync(script, "utf8");
  const firstWrite = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", "assert.equal(environments.data[0].id, target.inngestEnvironment)",
    "Inngest event key target mismatch", "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)",
    'assert.equal(database.rows[0].name, "neondb")']) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(firstWrite);
  }
  expect(source).toContain('`${target.output}/.env.${target.name}.json`');
  expect(source).toContain('`${target.output}/business-smoke.json`');
  expect(source).toContain('`${target.output}/business-retained.json`');
  expect(source).toContain("if (fixturesCreated && !pending)");
});
