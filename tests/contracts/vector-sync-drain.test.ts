import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const embed = mock(async (documents: readonly unknown[]) => documents.map(() => Array(768).fill(0.5)));
const upsert = mock(async (_request: unknown) => ({}));
const remove = mock(async (_request: unknown) => ({}));
const dispatch = mock(async () => undefined);
mock.module("../../db", () => ({ db: testDb }));
mock.module("../../jobs/client", () => ({ inngest: { createFunction: () => ({}) } }));
mock.module("../../lib/compute/vector-embeddings", () => ({ embedWorkerVectorDocuments: embed }));
mock.module("../../lib/vectorize-client", () => ({ vectorizeCanonicalUpsert: upsert, vectorizeCanonicalDelete: remove }));
mock.module("../../lib/vector-sync-dispatch", () => ({ dispatchVectorSync: dispatch }));
const { drainVectorQueue } = await import("../../jobs/vector-sync");
afterAll(async () => { await client.close(); });

beforeEach(async () => {
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah CASCADE');
  await testDb.insert(schema.courses).values({ id: "drain-course", title: "Course", category: "Test" }).onConflictDoNothing();
  embed.mockReset(); upsert.mockReset(); remove.mockReset(); dispatch.mockClear();
  embed.mockImplementation(async (documents: readonly unknown[]) => documents.map(() => Array(768).fill(0.5)));
  remove.mockImplementation(async () => ({}));
  upsert.mockImplementation(async () => ({}));
});

async function queue(count: number) {
  await testDb.insert(schema.vectorSyncQueue).values(Array.from({ length: count }, (_, index) => ({
    id: `queue-${String(index).padStart(4, "0")}`, courseId: "drain-course", namespace: "admin_ops_knowledge", action: "upsert" as const,
    payload: { entityId: `concept-${index}`, version: 1, text: `Public concept ${index}` }, createdAt: new Date(0),
  })));
}

function steps() {
  const cache = new Map<string, unknown>();
  const names: string[] = [];
  const events: unknown[] = [];
  const delays: string[] = [];
  const deadlines: Date[] = [];
  return {
    names, events, delays, deadlines,
    run: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      if (cache.has(name)) return cache.get(name) as T;
      names.push(name);
      const result = await callback(); cache.set(name, result); return result;
    },
    sendEvent: async (name: string, event: unknown) => {
      if (cache.has(name)) return;
      events.push(event); cache.set(name, true);
    },
    sleep: async (name: string, delay: string) => {
      if (cache.has(name)) return;
      names.push(name); delays.push(delay); cache.set(name, true);
    },
    sleepUntil: async (name: string, deadline: Date) => {
      if (cache.has(name)) return;
      deadlines.push(deadline); cache.set(name, true);
    },
  };
}

test("one dispatch drains 51 rows with unique durable batch steps", async () => {
  await queue(51);
  const step = steps();
  expect(await drainVectorQueue(step, "drain-course")).toEqual({ processed: 51, success: 51, failed: 0, continuation: false });
  expect((await testDb.select().from(schema.vectorSyncQueue)).every(row => row.status === "completed")).toBe(true);
  expect(step.names.filter(name => name.endsWith("claim-pending-batch"))).toEqual(["batch-0-claim-pending-batch", "batch-1-claim-pending-batch", "batch-2-claim-pending-batch"]);
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(step.events).toEqual([]);
});

test("a bounded run schedules durable continuation and the next run completes the remainder", async () => {
  await queue(251);
  const step = steps();
  const first = await drainVectorQueue(step, "drain-course");
  expect(first).toEqual({ processed: 250, success: 250, failed: 0, continuation: true });
  expect(step.events).toEqual([{ name: "vector.sync.dispatch", data: { courseId: "drain-course" } }]);
  expect((await testDb.select().from(schema.vectorSyncQueue).where(eq(schema.vectorSyncQueue.status, "pending"))).length).toBe(1);
  expect(await drainVectorQueue(step, "drain-course")).toEqual(first);
  expect(step.events).toHaveLength(1);
  expect(upsert).toHaveBeenCalledTimes(5);
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 1, success: 1, failed: 0, continuation: false });
});

test("a permanent malformed row cannot exhaust valid rows at their last retry", async () => {
  await queue(3);
  await testDb.update(schema.vectorSyncQueue).set({ attempts: 9 });
  await testDb.update(schema.vectorSyncQueue).set({ payload: { entityId: "invalid", version: 1 } }).where(eq(schema.vectorSyncQueue.id, "queue-0000"));
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 3, success: 2, failed: 1, continuation: false });
  const rows = await testDb.select().from(schema.vectorSyncQueue).orderBy(schema.vectorSyncQueue.id);
  expect(rows[0]).toMatchObject({ status: "failed", attempts: 10, lastError: "VECTOR_SYNC_INVALID_PAYLOAD", leaseId: null });
  expect(rows.slice(1).map(row => ({ status: row.status, attempts: row.attempts }))).toEqual([{ status: "completed", attempts: 9 }, { status: "completed", attempts: 9 }]);
  expect(upsert).toHaveBeenCalledTimes(1);
});

test("malformed managed identities are quarantined without deleting fallback vector IDs", async () => {
  await queue(3);
  for (const [index, payload] of [{}, { entityId: "intended", version: "1" }, { entityId: "intended", version: 1, metadata: { entityId: "other" } }].entries()) {
    await testDb.update(schema.vectorSyncQueue).set({ namespace: "canonical_ideas", payload }).where(eq(schema.vectorSyncQueue.id, `queue-${String(index).padStart(4, "0")}`));
  }
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 3, success: 0, failed: 3, continuation: false });
  expect((await testDb.select().from(schema.vectorSyncQueue)).every(row => row.status === "failed" && row.attempts === 10)).toBe(true);
  expect(upsert).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});

test("an exhausted provider step schedules backoff and continuation for failed and later pending work", async () => {
  await queue(51);
  upsert.mockImplementation(async (request: any) => { if (request.vectors.some((vector: { id: string }) => vector.id.includes("concept-0:"))) throw new Error("REJECTED_RECORD"); return {}; });
  const step = steps();
  expect(await drainVectorQueue(step, "drain-course")).toEqual({ processed: 50, success: 49, failed: 1, continuation: true, retryScheduled: true });
  expect(step.delays).toEqual(["30s"]);
  expect(step.events).toEqual([{ name: "vector.sync.dispatch", data: { courseId: "drain-course" } }]);
  expect((await testDb.select().from(schema.vectorSyncQueue).where(eq(schema.vectorSyncQueue.status, "pending"))).length).toBe(1);
  upsert.mockImplementation(async () => ({}));
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 2, success: 2, failed: 0, continuation: false });
});

test("a cohort reaching its retry limit still schedules the remaining pending batch", async () => {
  await queue(51);
  await testDb.update(schema.vectorSyncQueue).set({ attempts: 9 });
  upsert.mockImplementation(async (request: any) => { if (request.vectors.some((vector: { id: string }) => vector.id.includes("concept-0:"))) throw new Error("REJECTED_RECORD"); return {}; });
  await drainVectorQueue(steps(), "drain-course");
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 1, success: 1, failed: 0, continuation: false });
});

test("a stranded processing lease schedules a wakeup and is recovered after its deadline", async () => {
  await queue(1);
  const expiry = new Date(Date.now() + 60_000);
  await testDb.update(schema.vectorSyncQueue).set({ status: "processing", leaseId: "crashed-worker", leaseExpiresAt: expiry });
  const step = steps();
  expect(await drainVectorQueue(step, "drain-course")).toEqual({ processed: 0, success: 0, failed: 0, continuation: true });
  expect(step.deadlines).toEqual([expiry]);
  expect(step.events).toHaveLength(1);
  await testDb.update(schema.vectorSyncQueue).set({ leaseExpiresAt: new Date(0) });
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 1, success: 1, failed: 0, continuation: false });
});

test("an older compatibility batch cannot overwrite a newer completed snapshot", async () => {
  await queue(2);
  await testDb.update(schema.vectorSyncQueue).set({ status: "processing", leaseId: "other", leaseExpiresAt: new Date(Date.now() + 60_000), payload: { entityId: "same", text: "Old content" } }).where(eq(schema.vectorSyncQueue.id, "queue-0000"));
  await testDb.update(schema.vectorSyncQueue).set({ createdAt: new Date(1), payload: { entityId: "same", text: "Current content" } }).where(eq(schema.vectorSyncQueue.id, "queue-0001"));
  expect((await drainVectorQueue(steps(), "drain-course")).success).toBe(1);
  await testDb.update(schema.vectorSyncQueue).set({ status: "pending", leaseId: null, leaseExpiresAt: null }).where(eq(schema.vectorSyncQueue.id, "queue-0000"));
  expect((await drainVectorQueue(steps(), "drain-course")).success).toBe(1);
  expect(embed.mock.calls.map(call => call[0])).toEqual([[{ title: "queue-0001", content: "Current content" }], [{ title: "queue-0001", content: "Current content" }]]);
});

test("coalescing differing compatibility payloads uses the latest snapshot", async () => {
  await queue(2);
  await testDb.update(schema.vectorSyncQueue).set({ payload: { entityId: "same", text: "Old content" } }).where(eq(schema.vectorSyncQueue.id, "queue-0000"));
  await testDb.update(schema.vectorSyncQueue).set({ createdAt: new Date(1), payload: { entityId: "same", text: "Current content" } }).where(eq(schema.vectorSyncQueue.id, "queue-0001"));
  expect((await drainVectorQueue(steps(), "drain-course")).success).toBe(2);
  expect(embed).toHaveBeenCalledWith([{ title: "queue-0001", content: "Current content" }]);
  expect(upsert).toHaveBeenCalledTimes(1);
});

test("retired namespaces cannot overwrite or delete canonical vectors", async () => {
  for (const [index, namespace] of ["learning", "practice", "past_exams", "idea", "product"].entries()) {
    await testDb.insert(schema.vectorSyncQueue).values({ id: `retired-${index}`, courseId: "drain-course", namespace,
      action: index % 2 ? "delete" : "upsert", payload: { entityId: "canonical-owner", version: 1, text: "Old content" } });
  }
  expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 5, success: 0, failed: 5, continuation: false });
  expect((await testDb.select().from(schema.vectorSyncQueue)).every(row => row.lastError === "VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED" && row.attempts === 10)).toBe(true);
  expect(embed).not.toHaveBeenCalled(); expect(upsert).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});

for (const phase of ["embedding", "upsert", "delete"] as const) {
  test(`a persistent ${phase} rejection at the retry limit cannot exhaust independent upserts or deletes`, async () => {
    await queue(3);
    await testDb.update(schema.vectorSyncQueue).set({ attempts: 9 });
    if (phase === "embedding") embed.mockImplementation(async (documents: readonly any[]) => {
      if (documents.some(document => document.content === "Public concept 0")) throw new Error("REJECTED_EMBEDDING");
      return documents.map(() => Array(768).fill(0.5));
    });
    if (phase === "upsert") upsert.mockImplementation(async (request: any) => {
      if (request.vectors.some((vector: { id: string }) => vector.id.includes("concept-0:"))) throw new Error("REJECTED_UPSERT");
      return {};
    });
    await testDb.update(schema.vectorSyncQueue).set({ action: "delete" }).where(eq(schema.vectorSyncQueue.id, phase === "delete" ? "queue-0000" : "queue-0002"));
    if (phase === "delete") remove.mockImplementation(async (request: any) => {
      if (request.ids.some((id: string) => id.includes("concept-0:"))) throw new Error("REJECTED_DELETE");
      return {};
    });
    expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 3, success: 2, failed: 1, continuation: true, retryScheduled: true });
    const rows = await testDb.select().from(schema.vectorSyncQueue).orderBy(schema.vectorSyncQueue.id);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 10, leaseId: null });
    expect(rows.slice(1).map(row => ({ status: row.status, attempts: row.attempts }))).toEqual([{ status: "completed", attempts: 9 }, { status: "completed", attempts: 9 }]);
    expect(await drainVectorQueue(steps(), "drain-course")).toEqual({ processed: 0, success: 0, failed: 0, continuation: false });
  });
}
