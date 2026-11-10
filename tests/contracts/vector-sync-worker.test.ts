import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { vectorSyncQueue } from "../../db/schema";

type Row = typeof vectorSyncQueue.$inferSelect;
const dialect = new PgDialect();
let stored: Row[] = [];
const updates: Array<{ values: Partial<Row>; query: { sql: string; params: unknown[] } }> = [];
function matching(condition: SQL) {
  const query = dialect.sqlToQuery(condition);
  return stored.filter(row => query.params.some((value, index) => value === row.id
    && query.params[index + 1] === row.leaseId && query.params[index + 2] === row.status));
}
const database = {
  select: () => ({ from: () => ({ where: async (condition: SQL) => matching(condition).map(row => ({ id: row.id })) }) }),
  update: () => ({ set: (values: Partial<Row>) => ({ where: (condition: SQL) => {
    updates.push({ values, query: dialect.sqlToQuery(condition) });
    const matches = matching(condition);
    for (const row of matches) Object.assign(row, values);
    const result = Promise.resolve(matches.map(row => ({ id: row.id })));
    return Object.assign(result, { returning: () => result });
  } }) }),
  transaction: async (callback: (tx: Pick<typeof database, "select" | "update">) => Promise<void>): Promise<void> => {
    const before = structuredClone(stored);
    try { await callback(database); } catch (error) { stored = before; throw error; }
  },
};
const embed = mock(async (documents: readonly unknown[]) => documents.map(() => Array(768).fill(0.5)));
const upsert = mock(async (_request: unknown) => ({}));
const remove = mock(async (_request: unknown) => ({}));
const embeddingModule = { ...await import("../../lib/compute/vector-embeddings") };
mock.module("../../db", () => ({ db: database }));
mock.module("../../jobs/client", () => ({ inngest: { createFunction: () => ({}) } }));
mock.module("../../lib/compute/vector-embeddings", () => ({ ...embeddingModule, embedWorkerVectorDocuments: embed }));
mock.module("../../lib/vectorize-client", () => ({ vectorizeCanonicalUpsert: upsert, vectorizeCanonicalDelete: remove }));
const { processBatch, mapConcurrent } = await import("../../jobs/vector-sync");

function row(overrides: Partial<Row> = {}): Row {
  return { id: "outbox-1", courseId: "course-1", koId: null, action: "upsert", namespace: "canonical_ideas",
    payload: { entityId: "idea-1", entityType: "idea", version: 1, title: "Addition", text: "Two plus three is five.", metadata: { status: "published" } },
    status: "processing", attempts: 2, lastError: "old failure", leaseId: "lease-1", leaseExpiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(), updatedAt: new Date(), ...overrides };
}
function steps(claimed: Row[], retryWrite = false) {
  const cache = new Map<string, unknown>();
  return { run: async (name: string, callback: () => Promise<unknown>) => {
    if (name === "claim-pending-batch") return claimed;
    if (cache.has(name)) return cache.get(name);
    let result;
    try { result = await callback(); } catch (error) {
      // Inngest retries a step before exposing its exhausted error to the handler.
      if (name !== "canonical-vectorize-upsert" || !retryWrite) throw error;
      result = await callback();
    }
    cache.set(name, result);
    return result;
  } };
}
beforeEach(() => {
  stored = [row()]; updates.length = 0;
  embed.mockClear(); upsert.mockReset(); remove.mockClear();
  upsert.mockImplementation(async () => ({}));
});

test("canonical batch checkpoints embeddings across a transient vector-write retry", async () => {
  upsert.mockImplementationOnce(async () => { throw new Error("temporary vector outage"); });
  const result = await processBatch(steps(structuredClone(stored), true));
  expect(result).toMatchObject({ processed: 1, success: 1, failed: 0 });
  expect(embed).toHaveBeenCalledTimes(1);
  expect(embed).toHaveBeenCalledWith([{ title: "Addition", content: "Two plus three is five." }]);
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(stored[0]).toMatchObject({ status: "completed", leaseId: null, lastError: null });
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { vectorId: "v2:idea:idea-1:1", dimensions: 768 } });
  const finalize = updates.find(update => update.values.status === "completed")!;
  expect(finalize.query.sql).toContain('"lease_id"');
  expect(finalize.query.params).toEqual(["outbox-1", "lease-1", "processing"]);
});

test("malformed payload releases its owned lease and fails the run", async () => {
  stored = [row({ payload: { entityId: "idea-1", version: 1 } })];
  await expect(processBatch(steps(structuredClone(stored)))).rejects.toThrow("has no content");
  expect(stored[0]).toMatchObject({ status: "failed", leaseId: null });
  expect(updates[0].query.params).toEqual(["outbox-1", "lease-1", "processing"]);
  expect(embed).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
});

test("a cached stale claim cannot write vectors or overwrite another lease", async () => {
  const claimed = structuredClone(stored);
  stored[0].leaseId = "new-owner";
  await expect(processBatch(steps(claimed))).rejects.toThrow("VECTOR_SYNC_LEASE_LOST");
  expect(stored[0]).toMatchObject({ status: "processing", leaseId: "new-owner", attempts: 2 });
  expect(upsert).not.toHaveBeenCalled();
  expect(updates[0].query.params).toEqual(["outbox-1", "lease-1", "processing"]);
});

test("finalization cannot complete a lease claimed during the vector write", async () => {
  upsert.mockImplementation(async () => { stored[0].leaseId = "new-owner"; return {}; });
  await expect(processBatch(steps(structuredClone(stored)))).rejects.toThrow("VECTOR_SYNC_LEASE_LOST");
  expect(stored[0]).toMatchObject({ status: "processing", leaseId: "new-owner", attempts: 2 });
  expect(stored[0].payload).not.toHaveProperty("vectorizeCompletion");
  expect(updates.map(update => update.query.params)).toEqual([
    ["outbox-1", "lease-1", "processing"], ["outbox-1", "lease-1", "processing"],
  ]);
});

test("delete-only batches preserve the canonical ID without vector upserts", async () => {
  stored = [row({ action: "delete" })];
  await processBatch(steps(structuredClone(stored)));
  expect(remove).toHaveBeenCalledWith({ profileId: "canonical-content-v2", ids: ["v2:idea:idea-1:1"] });
  expect(upsert).not.toHaveBeenCalled();
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { indexedContentHash: null } });
});

test("the shared concurrency mapper still preserves ordered results", async () => {
  expect(await mapConcurrent([3, 1, 2], 2, async value => value * 2)).toEqual([6, 2, 4]);
});
