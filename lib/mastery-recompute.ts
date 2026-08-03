import { db } from "@/db";
import { masteryRecomputeQueue } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { MasteryEngine } from "./mastery-engine";
import {
  recomputeIdeaMastery,
  type IdeaMasteryRecomputeResult,
} from "./pemahaman/evidence";

export type IdeaRecomputeMode = "full" | "incremental";

/** Replays append-only per-Idea evidence without touching legacy concept rows. */
export async function recomputePerIdeaMastery(
  studentId: string,
  ideaId: string,
  options: { mode?: IdeaRecomputeMode; asOf?: Date; reason?: string } = {},
): Promise<IdeaMasteryRecomputeResult> {
  return recomputeIdeaMastery(studentId, ideaId, {
    asOf: options.asOf,
    reason: options.reason ?? `idea_mastery_${options.mode ?? "full"}`,
  });
}

/**
 * Enqueues a mastery recomputation request for a student and course.
 * Deduplicates multiple pending requests to prevent redundant runs.
 */
export async function enqueueRecompute(
  studentId: string,
  courseId: string,
  reason: string
): Promise<void> {
  const now = new Date();

  // Deduplicate: check if a pending job already exists
  const existingPending = await db.query.masteryRecomputeQueue.findFirst({
    where: and(
      eq(masteryRecomputeQueue.studentId, studentId),
      eq(masteryRecomputeQueue.courseId, courseId),
      eq(masteryRecomputeQueue.status, "pending")
    ),
  });

  if (existingPending) {
    return;
  }

  await db.insert(masteryRecomputeQueue).values({
    id: `req-${randomUUID()}`,
    studentId,
    courseId,
    status: "pending",
    reason,
    retries: 0,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Grabs the next pending batch from the queue, executes the calculations,
 * and updates status to completed or failed (with retry increment).
 */
export async function processQueueBatch(limit: number = 10): Promise<void> {
  const batch = await db
    .select()
    .from(masteryRecomputeQueue)
    .where(eq(masteryRecomputeQueue.status, "pending"))
    .limit(limit);

  if (batch.length === 0) return;

  const batchIds = batch.map((r) => r.id);

  // Mark all batch records as processing
  await db
    .update(masteryRecomputeQueue)
    .set({ status: "processing", updatedAt: new Date() })
    .where(inArray(masteryRecomputeQueue.id, batchIds));

  for (const job of batch) {
    try {
      await MasteryEngine.recomputeAll(job.studentId, job.courseId);
      
      await db
        .update(masteryRecomputeQueue)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(masteryRecomputeQueue.id, job.id));
    } catch (error) {
      console.error(`Failed processing recompute job ${job.id}:`, error);
      const nextRetries = job.retries + 1;
      const status = nextRetries >= 3 ? "failed" : "pending"; // retry again later or fail completely
      
      await db
        .update(masteryRecomputeQueue)
        .set({
          status,
          retries: nextRetries,
          updatedAt: new Date(),
        })
        .where(eq(masteryRecomputeQueue.id, job.id));
    }
  }
}
