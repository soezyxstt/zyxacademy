import { afterAll, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
// PGlite exposes one connection. Simulate the independent advisory-lock
// connection while exercising checkpoint writes in the real migrated schema.
let busyCalendar = false;
const lockKeys: string[] = [];
const lockConnection = { execute: async (query: SQL) => {
  const key = new PgDialect().sqlToQuery(query).params[0] as string;
  lockKeys.push(key);
  return { rows: [{ acquired: !(busyCalendar && key.startsWith("queue:google-calendar:")) }] };
} };
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

test("calendar requests with different delivery IDs share the target lock", async () => {
  let runs = 0;
  queueJobs.set("test.calendar", {
    definition: { id: "google-calendar-sync", triggers: [] },
    run: async () => { runs++; },
  });
  busyCalendar = true;
  await expect(runQueueJob("test.calendar", { target: "user:fixture" }, "calendar-manual", 0, 4)).rejects.toThrow("QUEUE_JOB_BUSY");
  expect(runs).toBe(0);
  busyCalendar = false;
  await runQueueJob("test.calendar", { target: "user:fixture" }, "calendar-daily", 0, 4);
  expect(runs).toBe(1);
  expect(lockKeys.filter(key => key === "queue:google-calendar:user:fixture")).toHaveLength(2);
  await expect(runQueueJob("test.calendar", {}, "calendar-invalid", 0, 4)).rejects.toThrow("QUEUE_CALENDAR_TARGET_REQUIRED");
});
