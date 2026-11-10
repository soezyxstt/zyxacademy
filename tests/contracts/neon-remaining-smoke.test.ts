import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { remainingSmokeArguments, readRemainingRun, waitForOwnedSearchVector, assertDeterministicOutput } from "../../scripts/neon/smoke-remaining-workers";

test("remaining acceptance accepts only explicit production and optional deterministic recomputation", () => {
  for (const args of [[], ["prod"], ["staging"], ["production", "--all"], ["production", "--deterministic", "extra"]]) {
    expect(() => remainingSmokeArguments(args)).toThrow();
  }
  expect(remainingSmokeArguments(["production"]).deterministic).toBe(false);
  expect(remainingSmokeArguments(["production", "--deterministic"]).deterministic).toBe(true);
  const id = "neon-remaining-715cf391-a6bd-40a6-ab58-9e3fe98bab14";
  expect(remainingSmokeArguments(["production", "--deterministic", "--resume", id]).resume).toBe(id);
  expect(remainingSmokeArguments(["production", "--deterministic", "--skip-search", "--resume", id])).toMatchObject({ resume: id, deterministic: true, skipSearch: true });
  for (const args of [["production", "--skip-search"], ["production", "--deterministic", "--skip-search"],
    ["production", "--skip-search", "--resume", id], ["production", "--deterministic", "--resume", id, "--skip-search"]]) {
    expect(() => remainingSmokeArguments(args)).toThrow();
  }
  expect(() => remainingSmokeArguments(["production", "--resume", "foreign-fixture"])).toThrow();
});

test("run polling recovers missing single-run summaries from exact function run list", async () => {
  const seen: string[] = [];
  const owned = { id: "owned-run", status: "COMPLETED", function: { id: "function" }, output: { synced: 1 } };
  const run = await readRemainingRun(async path => {
    seen.push(path);
    return seen.length === 1 ? undefined : { data: [{ ...owned, id: "foreign-run" }, owned] };
  }, "function", "owned-run");
  expect(run).toEqual(owned);
  expect(seen).toEqual(["/runs/owned-run?include=output", "/apps/zyx-academy/functions/function/runs?include=output&limit=100"]);
  expect(await readRemainingRun(async () => undefined, "function", "missing")).toBeUndefined();
  let calls = 0;
  expect(await readRemainingRun(async () => ++calls === 1
    ? { data: { id: "owned-run", status: "COMPLETED", function: { id: "function" } } }
    : { data: [owned] }, "function", "owned-run")).toEqual(owned);
  await expect(readRemainingRun(async () => { throw new Error("HTTP_401"); }, "function", "owned-run")).rejects.toThrow("HTTP_401");
});

test("search acceptance waits for exact owned vector and validates access metadata", async () => {
  const id = "owned";
  const match = { id, metadata: { course_id: id, entity_id: id, min_role: 3 } };
  let reads = 0;
  await waitForOwnedSearchVector(async () => ++reads === 1 ? [] : [match], id, true, async () => {});
  expect(reads).toBe(2);
  await expect(waitForOwnedSearchVector(async () => [{ ...match, id: "foreign" }], id, true)).rejects.toThrow("REMAINING_SEARCH_FOREIGN_RESULT");
  await expect(waitForOwnedSearchVector(async () => [{ id, metadata: { ...match.metadata, min_role: 0 } }], id, true))
    .rejects.toThrow("REMAINING_SEARCH_METADATA_MISMATCH");
});

test("search deletion requires observed absence and never hides port errors", async () => {
  let reads = 0;
  await waitForOwnedSearchVector(async () => ++reads === 1 ? [{ id: "owned" }] : [], "owned", false, async () => {});
  expect(reads).toBe(2);
  await expect(waitForOwnedSearchVector(async () => { throw new Error("HTTP_FAILURE"); }, "owned", false)).rejects.toThrow("HTTP_FAILURE");
  await expect(waitForOwnedSearchVector(async () => [], "owned", true, async () => {})).rejects.toThrow("REMAINING_SEARCH_VECTOR_MISSING");
  await expect(waitForOwnedSearchVector(async () => [{ id: "owned" }], "owned", false, async () => {})).rejects.toThrow("REMAINING_SEARCH_VECTOR_DELETE_PENDING");
});

test("completed cron with partial failure or no business evidence cannot pass", () => {
  expect(() => assertDeterministicOutput("course-analytics-snapshot-cron", { activeCourseIds: 2, built: 1, failed: 1 })).toThrow();
  expect(() => assertDeterministicOutput("course-analytics-snapshot-cron", { activeCourseIds: 2, built: 1, failed: 0 })).toThrow();
  expect(() => assertDeterministicOutput("content-quality-audit-cron", { activeCourseIds: 0, flagged: 0, failed: 0 })).toThrow();
  expect(() => assertDeterministicOutput("content-quality-audit-cron", { activeCourseIds: 1, flagged: 0, failed: 0 })).toThrow();
  expect(() => assertDeterministicOutput("mastery-snapshot-cron", { activeStudents: 1, snapshotsWritten: 0 })).toThrow();
  assertDeterministicOutput("course-analytics-snapshot-cron", { activeCourseIds: 1, built: 1, failed: 0 });
  assertDeterministicOutput("content-quality-audit-cron", { activeCourseIds: 1, flagged: 2, failed: 0 });
  assertDeterministicOutput("mastery-snapshot-cron", { activeStudents: 1, snapshotsWritten: 1 });
});

test("production identity and queue guards precede fixture writes, cleanup follows physical acceptance", () => {
  const source = readFileSync("scripts/neon/smoke-remaining-workers.ts", "utf8");
  const firstWrite = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", 'assert.equal(database.rows[0].name, "neondb")',
    "assert.equal(environments.data[0].id, target.inngestEnvironment)", "Inngest event key target mismatch",
    "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)", "REMAINING_SEARCH_GLOBAL_QUEUE_NOT_EMPTY",
    "REMAINING_MASTERY_GLOBAL_QUEUE_NOT_EMPTY", "REMAINING_SEARCH_TARGET_MISMATCH"]) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(firstWrite);
  }
  expect(source).toContain('body: JSON.stringify({ data, idempotencyKey: `${id}-${functionId}` })');
  expect(source.indexOf("await waitForOwnedSearchVector(readMatches, id, true)")).toBeLessThan(source.indexOf('searchPost("/v2/search/delete"'));
  expect(source.indexOf("await waitForOwnedSearchVector(readMatches, id, false)")).toBeLessThan(source.indexOf("accepted = true"));
  expect(source.indexOf("accepted = true")).toBeLessThan(source.indexOf("await tx.delete("));
  expect(source).toContain("if (fixturesCreated && !cleanupComplete)");
  expect(source).toContain("remaining-retained.json");
  expect(source).toContain("REMAINING_SMOKE_RESUME_EVIDENCE_MISMATCH");
  expect(source).toContain("REMAINING_SMOKE_RESUME_OWNER_MISMATCH");
  expect(source).toContain("REMAINING_SMOKE_RESUME_COURSE_MISMATCH");
  expect(source).toContain("let item = evidence.find(entry => entry.functionId === functionId)");
  expect(source).toContain("if (!item)");
  expect(source).toContain("if (resume)");
  expect(source).toContain("if (!skipSearch)");
  expect(source).toContain('checks.search = { status: "not_verified"');
  const independent = source.indexOf("independentAccepted = true");
  expect(independent).toBeGreaterThan(source.indexOf("checks.deterministic ="));
  expect(source.slice(independent, source.indexOf('stage = "delete-exact-owned-search-vector"'))).toContain("return;");
  expect(source.slice(independent, source.indexOf('stage = "delete-exact-owned-search-vector"'))).toContain('stage = "search-blocked"');
  expect(source).not.toContain('run("weekly-reflection-cron"');
  expect(source).not.toContain("sendOptionalEmail");
  expect(source).not.toContain("bun run build");
});
