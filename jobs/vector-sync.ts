import { inngest } from "./client";
import { db } from "@/db";
import { vectorSyncQueue } from "@/db/schema";
import {
  vectorizeCanonicalDelete,
  vectorizeCanonicalUpsert,
} from "@/lib/vectorize-client";
import { eq, and, or, lt, sql, inArray, isNotNull } from "drizzle-orm";
import { embedWorkerVectorDocuments } from "@/lib/compute/vector-embeddings";
import { canonicalOutboxPayload } from "@/lib/vectorize/outbox";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import { embeddingKey, reconcileVectorRows, validateQueuedVectorRow, type ReconciledVector } from "@/lib/vectorize/reconcile";

type VectorSyncRow = typeof vectorSyncQueue.$inferSelect;
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes lease window

/** Executes an async mapper across an array with bounded concurrency. */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

const BATCH_SIZE = Number(process.env.VECTOR_SYNC_BATCH_SIZE ?? 50);
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 50) {
  throw new Error("VECTOR_SYNC_BATCH_SIZE_MUST_BE_1_TO_50");
}

function ownedLease(row: VectorSyncRow) {
  if (!row.leaseId) throw new Error("VECTOR_SYNC_LEASE_MISSING");
  return and(eq(vectorSyncQueue.id, row.id), eq(vectorSyncQueue.leaseId, row.leaseId), eq(vectorSyncQueue.status, "processing"));
}

type CanonicalBatchResult = { processed: number; success: number; failed: number; provider: "canonical-content-v2"; retryableFailure?: boolean };

async function processCanonicalBatch(step: any, rows: VectorSyncRow[]): Promise<CanonicalBatchResult> {
  try {
    // Each cached value travels with the vector identity and exact embedding
    // input. A different plan after a withdrawal cannot reuse an array offset.
    const embeddings: Array<{ key: string; values: number[] }> = await step.run("canonical-vectorize-embeddings-v2", async () => {
      const toEmbed = await db.transaction(async tx => {
        const operations = await reconcileVectorRows(tx, rows);
        const owned = await tx.select({ id: vectorSyncQueue.id }).from(vectorSyncQueue).where(or(...rows.map(ownedLease)));
        if (owned.length !== rows.length) throw new Error("VECTOR_SYNC_LEASE_LOST");
        return groupOperations(operations).flatMap(group => {
          const operation = group[0];
          return operation.outbox.operation === "upsert" && group.some(item => item.row.action === "upsert")
            ? [{ key: embeddingKey(operation.outbox, operation.title), title: operation.title, content: operation.outbox.content }] : [];
        });
      });
      // Provider quota waits and embedding latency must not hold canonical locks.
      // The write transaction below rechecks content and lease ownership.
      if (!toEmbed.length) return [];
      const values = await embedWorkerVectorDocuments(toEmbed.map(({ title, content }) => ({ title, content })));
      if (values.length !== toEmbed.length) throw new Error("VECTOR_SYNC_EMBEDDING_COUNT_MISMATCH");
      return toEmbed.map((item, index) => ({ key: item.key, values: values[index] }));
    });

    // Keep canonical locks, lease row locks, the provider writes and completion
    // in one transaction. Every actual retry rechecks state under the locks.
    await step.run("canonical-vectorize-write-and-finalize-v2", () => db.transaction(async tx => {
      const operations = await reconcileVectorRows(tx, rows);
      const owned = await tx.select({ id: vectorSyncQueue.id }).from(vectorSyncQueue)
        .where(or(...rows.map(ownedLease))).orderBy(vectorSyncQueue.id).for("update");
      if (owned.length !== rows.length) throw new Error("VECTOR_SYNC_LEASE_LOST");
      const cached = new Map(embeddings.map(item => [item.key, item.values]));
      const groups = groupOperations(operations);
      const upserts: Array<{ id: string; values: number[]; metadata: Extract<ReconciledVector["outbox"], { operation: "upsert" }>["metadata"] }> = [];
      const deletes: string[] = [];
      const outcomes = new Map<string, "upsert" | "delete" | "skipped">();
      for (const group of groups) {
        const operation = group[0];
        if (operation.outbox.operation === "delete") {
          deletes.push(operation.outbox.vectorId);
          outcomes.set(operation.outbox.vectorId, "delete");
        } else if ((operation.managed || operation.authoritative) && group.every(item => item.row.action === "delete")) {
          // An old delete must not remove an entity still owned by a published import.
          outcomes.set(operation.outbox.vectorId, "skipped");
        } else {
          const values = cached.get(embeddingKey(operation.outbox, operation.title));
          if (!values) throw new Error("VECTOR_SYNC_EMBEDDING_STALE");
          upserts.push({ id: operation.outbox.vectorId, values, metadata: operation.outbox.metadata });
          outcomes.set(operation.outbox.vectorId, "upsert");
        }
      }
      if (upserts.length) await vectorizeCanonicalUpsert({ profileId: CANONICAL_VECTOR_PROFILE.id, vectors: upserts });
      if (deletes.length) await vectorizeCanonicalDelete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: deletes });
      for (const group of groups) {
        const actual = group[0].outbox;
        const outcome = outcomes.get(actual.vectorId)!;
        const completion = {
          operation: outcome,
          vectorId: actual.vectorId,
          profileId: actual.profileId,
          dimensions: 768,
          indexedContentHash: outcome === "upsert" && actual.operation === "upsert" ? actual.metadata.contentHash ?? null : null,
        };
        for (const operation of group) {
          const existingPayload = rowPayload(operation.row.payload);
          const finalized = await tx
            .update(vectorSyncQueue)
            .set({
              status: "completed",
              lastError: null,
              leaseId: null,
              leaseExpiresAt: null,
              payload: { ...existingPayload, providerNeutralOutbox: actual, vectorizeCompletion: completion },
              updatedAt: new Date(),
            })
            .where(ownedLease(operation.row))
            .returning({ id: vectorSyncQueue.id });
          if (finalized.length !== 1) throw new Error("VECTOR_SYNC_LEASE_LOST");
        }
      }
    }));
    return { processed: rows.length, success: rows.length, failed: 0, provider: "canonical-content-v2" as const };
  } catch (error: any) {
    // An exhausted provider batch may contain one rejected record. Split by
    // vector identity before consuming any row's retry budget. Equal identities
    // stay together; each child rechecks canonical state and its own lease.
    const groups = new Map<string, VectorSyncRow[]>();
    for (const row of rows) {
      const identity = canonicalOutboxPayload({ ...row, action: "delete" }).vectorId;
      const group = groups.get(identity) ?? [];
      group.push(row); groups.set(identity, group);
    }
    if (groups.size > 1) {
      const identities = [...groups.values()];
      const midpoint = Math.ceil(identities.length / 2);
      const partitions = [identities.slice(0, midpoint).flat(), identities.slice(midpoint).flat()];
      let success = 0, failed = 0;
      for (const [index, partition] of partitions.entries()) {
        const childStep = { run: (name: string, callback: () => Promise<unknown>) => step.run(`isolate-${index}-${name}`, callback) };
        try {
          const result = await processCanonicalBatch(childStep, partition);
          success += result.success; failed += result.failed;
        } catch {
          // Only this indivisible identity consumed attempts in its failure step.
          failed += partition.length;
        }
      }
      return { processed: rows.length, success, failed, provider: "canonical-content-v2", ...(failed ? { retryableFailure: true } : {}) };
    }
    await step.run("canonical-vectorize-failure", async () => {
      for (const row of rows) await db
        .update(vectorSyncQueue)
        .set({
          status: "failed",
          attempts: sql`${vectorSyncQueue.attempts} + 1`,
          lastError: error?.message || String(error),
          leaseId: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(ownedLease(row));
    });
    throw error;
  }
}

/** A canonical identity has one authoritative operation regardless of queue order. */
function groupOperations(operations: ReconciledVector[]): ReconciledVector[][] {
  const groups = new Map<string, ReconciledVector[]>();
  for (const operation of operations) {
    const group = groups.get(operation.outbox.vectorId) ?? [];
    group.push(operation);
    groups.set(operation.outbox.vectorId, group);
  }
  for (const group of groups.values()) group.sort((a, b) => Number(b.managed) - Number(a.managed));
  return [...groups.values()];
}

function rowPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Processes pending outbox rows through the canonical 768-dimensional path with atomic lease claiming. */
export async function processBatch(step: any, courseId?: string) {
  const claimed: VectorSyncRow[] = await step.run("claim-pending-batch", async () => {
    const workerId = crypto.randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    const filters = [
      or(
        eq(vectorSyncQueue.status, "pending"),
        and(eq(vectorSyncQueue.status, "failed"), lt(vectorSyncQueue.attempts, 10)),
        and(eq(vectorSyncQueue.status, "processing"), lt(vectorSyncQueue.leaseExpiresAt, now))
      ),
    ];
    if (courseId) filters.push(eq(vectorSyncQueue.courseId, courseId));

    const candidates = await db
      .select({ id: vectorSyncQueue.id })
      .from(vectorSyncQueue)
      .where(and(...filters))
      .orderBy(vectorSyncQueue.createdAt, vectorSyncQueue.id)
      .limit(BATCH_SIZE);

    if (candidates.length === 0) return [];

    const candidateIds = candidates.map((row) => row.id);

    // Atomically claim candidate rows
    await db
      .update(vectorSyncQueue)
      .set({
        status: "processing",
        leaseId: workerId,
        leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          inArray(vectorSyncQueue.id, candidateIds),
          or(
            eq(vectorSyncQueue.status, "pending"),
            and(eq(vectorSyncQueue.status, "failed"), lt(vectorSyncQueue.attempts, 10)),
            and(eq(vectorSyncQueue.status, "processing"), lt(vectorSyncQueue.leaseExpiresAt, now))
          )
        )
      );

    // Return only rows successfully leased by this workerId
    return await db
      .select()
      .from(vectorSyncQueue)
      .where(and(inArray(vectorSyncQueue.id, candidateIds), eq(vectorSyncQueue.leaseId, workerId)));
  });

  if (claimed.length === 0) return { processed: 0, message: "No pending outbox records to process." };

  const validIds: string[] = await step.run("validate-claimed-batch", async () => {
    const valid: string[] = [];
    for (const row of claimed) {
      try { validateQueuedVectorRow(row); valid.push(row.id); }
      catch (error) {
        // Permanent row-local contract errors are quarantined. Preserve the
        // row for repair, but do not spend another row's retry allowance.
        await db.update(vectorSyncQueue).set({ status: "failed", attempts: 10,
          lastError: error instanceof Error && error.message === "VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED" ? error.message : "VECTOR_SYNC_INVALID_PAYLOAD", leaseId: null, leaseExpiresAt: null, updatedAt: new Date(),
        }).where(ownedLease(row));
      }
    }
    return valid;
  });
  const valid = claimed.filter(row => validIds.includes(row.id));
  let result;
  try { result = valid.length ? await processCanonicalBatch(step, valid) : { processed: 0, success: 0, failed: 0 }; }
  catch (cause) {
    const error = cause instanceof Error ? cause : new Error("VECTOR_SYNC_BATCH_FAILED", { cause });
    Object.assign(error, { vectorBatchSize: claimed.length });
    throw error;
  }
  return { ...result, processed: claimed.length, failed: result.failed + claimed.length - valid.length };
}

/** Bounded durable drain; continuation prevents large imports waiting for cron. */
export async function drainVectorQueue(step: any, courseId?: string) {
  let processed = 0, success = 0, failed = 0;
  const batchLimit = 5;
  for (let index = 0; index < batchLimit; index++) {
    const batchStep = { run: (name: string, callback: () => Promise<unknown>) => step.run(`batch-${index}-${name}`, callback) };
    let result;
    try { result = await processBatch(batchStep, courseId); }
    catch (error) {
      // A failed durable step must not bypass recovery for later batches.
      // Row attempts still cap automatic retries at ten; sleep is checkpointed.
      const batchFailed = error && typeof error === "object" && "vectorBatchSize" in error ? Number(error.vectorBatchSize) : 0;
      failed += batchFailed;
      processed += batchFailed;
      await step.sleep("vector-failure-backoff", "30s");
      await step.sendEvent("retry-vector-sync", { name: "vector.sync.dispatch", data: courseId ? { courseId } : {} });
      return { processed, success, failed, continuation: true, retryScheduled: true };
    }
    processed += result.processed;
    if ("success" in result) success += result.success ?? 0;
    if ("failed" in result) failed += result.failed ?? 0;
    if ("retryableFailure" in result && result.retryableFailure) {
      await step.sleep("vector-failure-backoff", "30s");
      await step.sendEvent("retry-vector-sync", { name: "vector.sync.dispatch", data: courseId ? { courseId } : {} });
      return { processed, success, failed, continuation: true, retryScheduled: true };
    }
    if (!result.processed) return { processed, success, failed, continuation: await scheduleVectorContinuation(step, courseId) };
  }
  return { processed, success, failed, continuation: await scheduleVectorContinuation(step, courseId) };
}

async function scheduleVectorContinuation(step: any, courseId?: string): Promise<boolean> {
  const next: { ready: boolean; leaseExpiry?: string } = await step.run("check-vector-continuation", async () => {
    const filters = [or(eq(vectorSyncQueue.status, "pending"), and(eq(vectorSyncQueue.status, "failed"), lt(vectorSyncQueue.attempts, 10)), and(eq(vectorSyncQueue.status, "processing"), lt(vectorSyncQueue.leaseExpiresAt, new Date())))];
    if (courseId) filters.push(eq(vectorSyncQueue.courseId, courseId));
    if ((await db.select({ id: vectorSyncQueue.id }).from(vectorSyncQueue).where(and(...filters)).limit(1)).length) return { ready: true };
    const leased = [eq(vectorSyncQueue.status, "processing"), isNotNull(vectorSyncQueue.leaseExpiresAt)];
    if (courseId) leased.push(eq(vectorSyncQueue.courseId, courseId));
    const [row] = await db.select({ expiry: vectorSyncQueue.leaseExpiresAt }).from(vectorSyncQueue).where(and(...leased)).orderBy(vectorSyncQueue.leaseExpiresAt).limit(1);
    return { ready: false, ...(row?.expiry ? { leaseExpiry: row.expiry.toISOString() } : {}) };
  });
  if (!next.ready && !next.leaseExpiry) return false;
  // A crash or failed lease-release write must not depend on the six-hour cron.
  if (next.leaseExpiry && Date.parse(next.leaseExpiry) > Date.now()) await step.sleepUntil("wait-vector-lease-expiry", new Date(next.leaseExpiry));
  await step.sendEvent("continue-vector-sync", { name: "vector.sync.dispatch", data: courseId ? { courseId } : {} });
  return true;
}

/**
 * Event-driven worker listening to "vector.sync.dispatch"
 */
export const vectorSyncWorker = inngest.createFunction(
  {
    id: "vector-sync-worker",
    name: "Vector Sync Worker",
    triggers: [{ event: "vector.sync.dispatch" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ event, step }) => {
    const { courseId } = event.data as { courseId: string };
    return await drainVectorQueue(step, courseId);
  }
);

/**
 * Scheduled fallback cron worker running every 6 hours to catch stranded syncs
 */
export const vectorSyncCronWorker = inngest.createFunction(
  {
    id: "vector-sync-cron-worker",
    name: "Vector Sync Cron Worker",
    triggers: [{ cron: "0 */6 * * *" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ step }) => {
    return await drainVectorQueue(step);
  }
);
