import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { vectorSyncQueue } from "../../db/schema";
import { createHash } from "node:crypto";
import { canonicalOutboxPayload, canonicalOutboxTitle } from "../../lib/vectorize/outbox";

type Row = typeof vectorSyncQueue.$inferSelect;
const dialect = new PgDialect();
let stored: Row[] = [];
let transactionActive = false;
const updates: Array<{ values: Partial<Row>; query: { sql: string; params: unknown[] } }> = [];
function matching(condition: SQL) {
  const query = dialect.sqlToQuery(condition);
  return stored.filter(row => query.params.some((value, index) => value === row.id
    && query.params[index + 1] === row.leaseId && query.params[index + 2] === row.status));
}
const queries = {
  select: () => ({ from: () => ({ where: (condition: SQL) => {
    const result = Promise.resolve(matching(condition).map(row => ({ id: row.id })));
    return Object.assign(result, { orderBy: () => ({ for: () => result }) });
  } }) }),
  update: () => ({ set: (values: Partial<Row>) => ({ where: (condition: SQL) => {
    updates.push({ values, query: dialect.sqlToQuery(condition) });
    const matches = matching(condition);
    for (const row of matches) Object.assign(row, values);
    const result = Promise.resolve(matches.map(row => ({ id: row.id })));
    return Object.assign(result, { returning: () => result });
  } }) }),
};
const database = {
  ...queries,
  transaction: async <T>(callback: (tx: typeof queries) => Promise<T>): Promise<T> => {
    const before = structuredClone(stored);
    transactionActive = true;
    try { return await callback(database); } catch (error) { stored = before; throw error; } finally { transactionActive = false; }
  },
};
const embed = mock(async (documents: readonly unknown[]) => documents.map(() => Array(768).fill(0.5)));
const upsert = mock(async (_request: unknown) => ({}));
const remove = mock(async (_request: unknown) => ({}));
const embeddingModule = { ...await import("../../lib/compute/vector-embeddings") };
const reconciliationModule = { ...await import("../../lib/vectorize/reconcile") };
const current = new Map<string, { active: boolean; text?: string; title?: string }>();
const reconcile = mock(async (_tx: unknown, rows: Row[]) => rows.map(row => {
  const state = current.get(row.id);
  const managed = !!state;
  const adjusted = state ? { ...row, action: state.active ? "upsert" as const : "delete" as const,
    payload: { ...(row.payload as object), ...(state.text === undefined ? {} : { text: state.text }) } } : row;
  return { row, managed, outbox: canonicalOutboxPayload(adjusted), title: state?.title ?? canonicalOutboxTitle(adjusted) };
}));
mock.module("../../db", () => ({ db: database }));
mock.module("../../jobs/client", () => ({ inngest: { createFunction: () => ({}) } }));
mock.module("../../lib/compute/vector-embeddings", () => ({ ...embeddingModule, embedWorkerVectorDocuments: embed }));
mock.module("../../lib/vectorize-client", () => ({ vectorizeCanonicalUpsert: upsert, vectorizeCanonicalDelete: remove }));
mock.module("../../lib/vectorize/reconcile", () => ({
  reconcileVectorRows: reconcile,
  validateQueuedVectorRow: reconciliationModule.validateQueuedVectorRow,
  embeddingKey: (outbox: { vectorId: string; metadata: { contentHash?: string } }, title: string) =>
    createHash("sha256").update(JSON.stringify([outbox.vectorId, outbox.metadata.contentHash, title])).digest("hex"),
}));
const { processBatch, mapConcurrent } = await import("../../jobs/vector-sync");

function row(overrides: Partial<Row> = {}): Row {
  return { id: "outbox-1", courseId: "course-1", koId: null, action: "upsert", namespace: "canonical_ideas",
    payload: { entityId: "idea-1", entityType: "idea", version: 1, title: "Addition", text: "Two plus three is five.", metadata: { status: "published" } },
    status: "processing", attempts: 2, lastError: "old failure", leaseId: "lease-1", leaseExpiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(), updatedAt: new Date(), ...overrides };
}
function steps(claimed: Row[], retryWrite = false, beforeWrite?: () => void, beforeRetry?: () => void) {
  const cache = new Map<string, unknown>();
  return { run: async (name: string, callback: () => Promise<unknown>) => {
    if (name === "claim-pending-batch") return claimed;
    if (cache.has(name)) return cache.get(name);
    if (name === "canonical-vectorize-write-and-finalize-v2") beforeWrite?.();
    let result;
    try { result = await callback(); } catch (error) {
      // Inngest retries a step before exposing its exhausted error to the handler.
      if (name !== "canonical-vectorize-write-and-finalize-v2" || !retryWrite) throw error;
      beforeRetry?.();
      result = await callback();
    }
    cache.set(name, result);
    return result;
  } };
}
beforeEach(() => {
  stored = [row()]; updates.length = 0;
  current.clear(); reconcile.mockClear();
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

test("malformed compatibility payload is quarantined without calling providers", async () => {
  stored = [row({ namespace: "admin_ops_knowledge", payload: { entityId: "idea-1", version: 1 } })];
  expect(await processBatch(steps(structuredClone(stored)))).toMatchObject({ processed: 1, failed: 1, success: 0 });
  expect(stored[0]).toMatchObject({ status: "failed", attempts: 10, leaseId: null, lastError: "VECTOR_SYNC_INVALID_PAYLOAD" });
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

test("a lease superseded after embedding cannot reach the vector write", async () => {
  await expect(processBatch(steps(structuredClone(stored), false, () => { stored[0].leaseId = "new-owner"; }))).rejects.toThrow("VECTOR_SYNC_LEASE_LOST");
  expect(stored[0]).toMatchObject({ status: "processing", leaseId: "new-owner", attempts: 2 });
  expect(stored[0].payload).not.toHaveProperty("vectorizeCompletion");
  expect(upsert).not.toHaveBeenCalled();
  expect(updates.map(update => update.query.params)).toEqual([["outbox-1", "lease-1", "processing"]]);
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

test("a delayed upsert after withdrawal deletes the vector without embedding queued content", async () => {
  current.set("outbox-1", { active: false });
  await processBatch(steps(structuredClone(stored)));
  expect(embed).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith({ profileId: "canonical-content-v2", ids: ["v2:idea:idea-1:1"] });
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { operation: "delete", indexedContentHash: null } });
});

test("withdrawal after embedding changes the write into a delete", async () => {
  current.set("outbox-1", { active: true });
  await processBatch(steps(structuredClone(stored), false, () => current.set("outbox-1", { active: false })));
  expect(embed).toHaveBeenCalledTimes(1);
  expect(upsert).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { operation: "delete" } });
});

test("a lost provider response retries against current state", async () => {
  current.set("outbox-1", { active: true });
  upsert.mockImplementationOnce(async () => { throw new Error("response lost"); });
  await processBatch(steps(structuredClone(stored), true, undefined, () => current.set("outbox-1", { active: false })));
  expect(upsert).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { operation: "delete" } });
});

test("the provider write and lease completion run inside the reconciliation transaction", async () => {
  current.set("outbox-1", { active: true });
  upsert.mockImplementationOnce(async () => {
    expect(transactionActive).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(2);
    return {};
  });
  await processBatch(steps(structuredClone(stored)));
  expect(stored[0].status).toBe("completed");
});

test("embedding quota waits do not hold the canonical transaction", async () => {
  current.set("outbox-1", { active: true });
  embed.mockImplementationOnce(async documents => {
    expect(transactionActive).toBe(false);
    current.set("outbox-1", { active: false });
    return documents.map(() => Array(768).fill(0.5));
  });
  await processBatch(steps(structuredClone(stored)));
  expect(upsert).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { operation: "delete" } });
});

test("an obsolete delete for an active shared entity is skipped", async () => {
  stored = [row({ action: "delete" })];
  current.set("outbox-1", { active: true });
  await processBatch(steps(structuredClone(stored)));
  expect(embed).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(stored[0].payload).toMatchObject({ vectorizeCompletion: { operation: "skipped", indexedContentHash: null } });
});

test("conflicting queue rows for one active vector produce one upsert", async () => {
  stored = [row(), row({ id: "outbox-2", action: "delete" })];
  for (const item of stored) current.set(item.id, { active: true });
  await processBatch(steps(structuredClone(stored)));
  expect(embed).toHaveBeenCalledTimes(1);
  expect(upsert).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  expect(stored.map(item => (item.payload as any).vectorizeCompletion.operation)).toEqual(["upsert", "upsert"]);
});

test("cached embeddings remain bound to identity when another vector is withdrawn", async () => {
  stored = [row(), row({ id: "outbox-2", payload: { entityId: "idea-2", version: 1, text: "Second concept", title: "Second" } })];
  for (const item of stored) current.set(item.id, { active: true });
  embed.mockImplementationOnce(async () => [Array(768).fill(0.1), Array(768).fill(0.9)]);
  await processBatch(steps(structuredClone(stored), false, () => current.set("outbox-1", { active: false })));
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ vectors: [expect.objectContaining({ id: "v2:idea:idea-2:1", values: Array(768).fill(0.9) })] }));
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ ids: ["v2:idea:idea-1:1"] }));
});

test("content drift fails the lease instead of writing a stale embedding", async () => {
  current.set("outbox-1", { active: true });
  await expect(processBatch(steps(structuredClone(stored), false, () => current.set("outbox-1", { active: true, text: "Changed concept" })))).rejects.toThrow("VECTOR_SYNC_EMBEDDING_STALE");
  expect(upsert).not.toHaveBeenCalled();
  expect(stored[0]).toMatchObject({ status: "failed", leaseId: null });
});
