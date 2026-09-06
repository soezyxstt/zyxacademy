import { inngest } from "./client";
import { db } from "@/db";
import { vectorSyncQueue } from "@/db/schema";
import {
  vectorizeCanonicalDelete,
  vectorizeCanonicalUpsert,
} from "@/lib/vectorize-client";
import { eq, and, or, lt, sql, inArray } from "drizzle-orm";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
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

// Retrieve configurable batch size from environment or config, defaulting to 50
const BATCH_SIZE = process.env.VECTOR_SYNC_BATCH_SIZE
  ? parseInt(process.env.VECTOR_SYNC_BATCH_SIZE, 10)
  : 50;

async function processCanonicalBatch(step: any, rows: VectorSyncRow[]) {
  const operations = rows.map((row) => ({
    rowId: row.id,
    title: canonicalOutboxTitle(row),
    outbox: canonicalOutboxPayload(row as {
      id: string;
      koId?: string | null;
      action: "upsert" | "delete";
      namespace: string;
      courseId: string;
      payload: unknown;
    }),
  }));

  try {
    await step.run("canonical-vectorize-upsert", async () => {
      const adapter = await getCanonicalContentV2EmbeddingAdapter();
      const deletes: string[] = [];
      const toEmbed: Array<{
        title: string;
        vectorId: string;
        content: string;
        metadata: any;
      }> = [];

      for (const operation of operations) {
        if (operation.outbox.operation === "delete") {
          deletes.push(operation.outbox.vectorId);
        } else if (operation.outbox.operation === "upsert") {
          toEmbed.push({
            title: operation.title,
            vectorId: operation.outbox.vectorId,
            content: operation.outbox.content,
            metadata: operation.outbox.metadata,
          });
        }
      }

      // Bounded concurrency embedding (concurrency = 5) prevents serial latency while respecting Gemini quota
      const upserts = await mapConcurrent(toEmbed, 5, async (item) => {
        const values = await adapter.embedDocument(item.title, item.content);
        return {
          id: item.vectorId,
          values,
          metadata: item.metadata,
        };
      });

      if (upserts.length > 0) {
        await vectorizeCanonicalUpsert({
          profileId: CANONICAL_VECTOR_PROFILE.id,
          vectors: upserts.map((vector) => ({
            id: vector.id,
            values: vector.values,
            metadata: vector.metadata,
          })),
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
          const existingPayload = rowPayload(rows.find((row) => row.id === operation.rowId)?.payload);
          await tx
            .update(vectorSyncQueue)
            .set({
              status: "completed",
              leaseId: null,
              leaseExpiresAt: null,
              payload: { ...existingPayload, providerNeutralOutbox: operation.outbox, vectorizeCompletion: completion },
              updatedAt: new Date(),
            })
            .where(eq(vectorSyncQueue.id, operation.rowId));
        }
      });
    });
    return { processed: rows.length, success: rows.length, failed: 0, provider: "canonical-content-v2" as const };
  } catch (error: any) {
    await step.run("canonical-vectorize-failure", async () => {
      const rowIds = rows.map((r) => r.id);
      await db
        .update(vectorSyncQueue)
        .set({
          status: "failed",
          attempts: sql`${vectorSyncQueue.attempts} + 1`,
          lastError: error?.message || String(error),
          leaseId: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(inArray(vectorSyncQueue.id, rowIds));
    });
    return { processed: rows.length, success: 0, failed: rows.length, provider: "canonical-content-v2" as const };
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
            eq(vectorSyncQueue.status, "failed"),
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
