import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
// PGlite exposes one connection. Simulate the independent advisory-lock
// connection while exercising checkpoint writes in the real migrated schema.
const lockConnection = { execute: async () => ({ rows: [{ acquired: true }] }) };
mock.module("@/db", () => ({ db: {
  transaction: (run: (tx: typeof lockConnection) => Promise<unknown>) => run(lockConnection),
  select: testDb.select.bind(testDb), insert: testDb.insert.bind(testDb), delete: testDb.delete.bind(testDb),
} }));
const { queueJobs } = await import("@/jobs/define-job");
const { runQueueJob } = await import("@/lib/queue/run-job");
afterAll(async () => { await client.close(); });

test("a redelivery resumes completed steps and terminal failure is recorded once", async () => {
  let executions = 0, failures = 0;
  queueJobs.set("test.retry", {
    definition: { id: "test.retry", retries: 2, triggers: [], onFailure: async () => { failures++; } },
    run: async ({ step }) => {
      const value = await step.run("first", async () => ++executions);
      expect(value).toBe(1);
      throw new Error("synthetic failure");
    },
  });
  for (const retry of [0, 1]) {
    await expect(runQueueJob("test.retry", {}, "fixture-retry", retry, 3)).rejects.toThrow("synthetic failure");
    expect(failures).toBe(0);
  }
  await runQueueJob("test.retry", {}, "fixture-retry", 2, 3);
  await runQueueJob("test.retry", {}, "fixture-retry", 2, 3);
  expect(executions).toBe(1);
  expect(failures).toBe(1);
});
