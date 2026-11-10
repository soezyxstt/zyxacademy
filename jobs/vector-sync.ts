import { inngest } from "./client";
import { db } from "@/db";
import { vectorSyncQueue } from "@/db/schema";
import {
  vectorizeCanonicalDelete,
  vectorizeCanonicalUpsert,
} from "@/lib/vectorize-client";
import { eq, and, or, lt, sql, inArray } from "drizzle-orm";
import { embedWorkerVectorDocuments } from "@/lib/compute/vector-embeddings";
import { canonicalOutboxPayload, canonicalOutboxTitle } from "@/lib/vectorize/outbox";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";

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

async function processCanonicalBatch(step: any, rows: VectorSyncRow[]) {
  try {
    const operations = rows.map((row) => ({ row, title: canonicalOutboxTitle(row), outbox: canonicalOutboxPayload(row) }));
    const toEmbed = operations.flatMap(operation => operation.outbox.operation === "upsert"
      ? [{ title: operation.title, ...operation.outbox }] : []);
    const values = await step.run("canonical-vectorize-embeddings", () => embedWorkerVectorDocuments(toEmbed.map(({ title, content }) => ({ title, content }))));

    await step.run("canonical-vectorize-upsert", async () => {
      // A replay can retain the claim step after a different run has taken its lease.
      const owned = await db.select({ id: vectorSyncQueue.id }).from(vectorSyncQueue).where(or(...rows.map(ownedLease)));
      if (owned.length !== rows.length) throw new Error("VECTOR_SYNC_LEASE_LOST");
      const upserts = toEmbed.map((operation, index) => ({
        id: operation.vectorId,
        values: values[index],
        metadata: operation.metadata,
      }));
      const deletes = operations.filter(operation => operation.outbox.operation === "delete").map(operation => operation.outbox.vectorId);
      if (upserts.length > 0) {
        await vectorizeCanonicalUpsert({
          profileId: CANONICAL_VECTOR_PROFILE.id,
          vectors: upserts,
        });
      }
      if (deletes.length > 0) {
        await vectorizeCanonicalDelete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: deletes });
      }
    });

    await step.run("canonical-vectorize-finalize", async () => {
      await db.transaction(async (tx) => {
        for (const operation of operations) {
          const completion = operation.outbox.operation === "upsert"
            ? {
              vectorId: operation.outbox.vectorId,
              profileId: operation.outbox.profileId,
              dimensions: 768,
              indexedContentHash: operation.outbox.metadata.contentHash ?? null,
            }
            : {
              vectorId: operation.outbox.vectorId,
              profileId: operation.outbox.profileId,
              dimensions: 768,
              indexedContentHash: null,
            };
          const existingPayload = rowPayload(operation.row.payload);
          const finalized = await tx
            .update(vectorSyncQueue)
            .set({
              status: "completed",
              lastError: null,
              leaseId: null,
              leaseExpiresAt: null,
              payload: { ...existingPayload, providerNeutralOutbox: operation.outbox, vectorizeCompletion: completion },
              updatedAt: new Date(),
            })
            .where(ownedLease(operation.row))
            .returning({ id: vectorSyncQueue.id });
          if (finalized.length !== 1) throw new Error("VECTOR_SYNC_LEASE_LOST");
        }
      });
    });
    return { processed: rows.length, success: rows.length, failed: 0, provider: "canonical-content-v2" as const };
  } catch (error: any) {
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

function rowPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Processes pending outbox rows through the canonical 768-dimensional path with atomic lease claiming. */
export async function processBatch(step: any, courseId?: string) {
  const claimed = await step.run("claim-pending-batch", async () => {
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

  return processCanonicalBatch(step, claimed);
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
    return await processBatch(step, courseId);
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
    return await processBatch(step);
  }
);
