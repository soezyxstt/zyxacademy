import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitForContentOutbox } from "../../scripts/neon/smoke-content-workers";

const script = resolve("scripts/neon/smoke-content-workers.ts");
test("content smoke rejects invalid environments before private settings are read", () => {
  for (const args of [[], ["prod"], ["production "]]) {
    const result = Bun.spawnSync([process.execPath, script, ...args]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("COMPUTE_ENVIRONMENT_REQUIRED");
    expect(result.stderr.toString()).not.toContain("ENOENT");
  }
}, 20_000);
test("content smoke rejects malformed resume arguments before private settings are read", () => {
  for (const args of [["--resume"], ["--resume", "other-fixture"], ["--resume", "neon-content-292ee7da-99d2-41de-88d6-58bb111aad13", "extra"]]) {
    const result = Bun.spawnSync([process.execPath, script, "production", ...args]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("CONTENT_SMOKE_ARGUMENTS_INVALID");
    expect(result.stderr.toString()).not.toContain("ENOENT");
  }
}, 20_000);
test("content vector acceptance waits for processing rows before returning", async () => {
  const states = ["pending", "processing", "completed"];
  let reads = 0, pauses = 0;
  const result = await waitForContentOutbox(async () => [{ status: states[reads++] }], async () => { pauses++; });
  expect(result).toEqual([{ status: "completed" }]);
  expect(reads).toBe(3);
  expect(pauses).toBe(2);
});
test("failed or indefinitely processing content vectors never pass acceptance", async () => {
  await expect(waitForContentOutbox(async () => [{ status: "failed" }])).rejects.toThrow("CONTENT_SMOKE_VECTOR_OUTBOX_FAILED");
  let reads = 0, pauses = 0;
  await expect(waitForContentOutbox(async () => { reads++; return [{ status: "processing" }]; }, async () => { pauses++; }))
    .rejects.toThrow("CONTENT_SMOKE_VECTOR_OUTBOX_PENDING");
  expect(reads).toBe(160);
  expect(pauses).toBe(159);
});
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
  expect(source).toContain('if (!resume) await run("bulk-chapter-generator"');
  expect(source.indexOf("CONTENT_SMOKE_RESUME_OWNER_MISMATCH")).toBeLessThan(source.indexOf("fixturesCreated = true"));
  expect(source.indexOf("CONTENT_SMOKE_RESUME_COURSE_MISMATCH")).toBeLessThan(source.indexOf("fixturesCreated = true"));
  expect(source.indexOf("await waitForContentOutbox(")).toBeLessThan(source.indexOf("await vectorizeCanonicalDelete("));
});
