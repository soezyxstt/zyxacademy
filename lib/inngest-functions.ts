import { inngest } from "@/lib/inngest";
import { daysAgo, todayUtc } from "@/lib/date-utils";
import { db } from "@/db";
import { vectorSyncQueue, knowledgeObjects, chapters, masterTeachingDocuments, enrollments, studentConceptMasteryHistory, studentConceptMastery, user, aiGenerationJobs, searchDocuments } from "@/db/schema";
import { computeSnapshotPayload } from "@/lib/cohort-analytics";
import { recomputeTrends } from "@/lib/mastery-store";
import { enqueueRecompute, processQueueBatch } from "@/lib/mastery-recompute";
import { recomputePerIdeaMastery } from "@/lib/mastery-recompute";
import { generateMistakeFeedback } from "@/lib/mistake-feedback";
import {
  vectorizeCanonicalDelete,
  vectorizeCanonicalUpsert,
} from "@/lib/vectorize-client";
import { eq, and, or, lt, gt, sql, inArray, ne } from "drizzle-orm";
import { generateFlashcardsForChapter } from "@/lib/flashcard-generator";
import { generateQuestionsForKOBatch } from "@/lib/question-generator";
import { executeGenerationJob } from "@/lib/generation-pipeline";
import { generateMarkdownForChapter } from "@/lib/material-generator";
import { saveWebsiteMaterial } from "@/lib/material-storage";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { canonicalOutboxPayload, canonicalOutboxTitle } from "@/lib/vectorize/outbox";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import { generateProductDiktatPdfEvidence } from "@/lib/bundle/product-diktat-pdf";

type VectorSyncRow = typeof vectorSyncQueue.$inferSelect;
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes lease window

/** Executes an async mapper across an array with bounded concurrency. */
async function mapConcurrent<T, R>(
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

export const productDiktatPdfWorker = inngest.createFunction(
  {
    id: "product-diktat-pdf-worker",
    name: "Product Diktat PDF Worker",
    triggers: [{ event: "product.diktat.pdf.requested" }],
    retries: 2,
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const data = event.data as { importId: string; requestedBy: string };
    return step.run("render-product-diktat-pdf", () => generateProductDiktatPdfEvidence({ ...data, throwOnFailure: true }));
  },
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

/**
 * Event-driven worker listening to "ai.bulk.chapter.generate"
 */
export const bulkChapterGenerator = inngest.createFunction(
  {
    id: "bulk-chapter-generator",
    name: "Bulk Chapter Generator",
    triggers: [{ event: "ai.bulk.chapter.generate" }]
  },
  async ({ event, step }) => {
    const { chapterId } = event.data as { chapterId: string };

    try {
      // Step 1: Identify chapter and course
      const info = await step.run("fetch-chapter-info", async () => {
        const [chapterRec] = await db
          .select()
          .from(chapters)
          .where(eq(chapters.id, chapterId));
        return chapterRec || null;
      });

      if (!info) {
        throw new Error(`Chapter ${chapterId} not found`);
      }

      // Fetch active KOs first so we can initialize the questionsTotal count
      const activeKOs = await step.run("fetch-active-kos", async () => {
        return await db
          .select({ id: knowledgeObjects.id, title: knowledgeObjects.title, mtdId: knowledgeObjects.mtdId })
          .from(knowledgeObjects)
          .where(
            and(
              eq(knowledgeObjects.chapterId, chapterId),
              eq(knowledgeObjects.status, "active")
            )
          );
      });

      // Initialize status & progress in chapters table
      await step.run("init-progress", async () => {
        await db
          .update(chapters)
          .set({
            assetGenStatus: "generating",
            assetGenFlashcardsTotal: 0,
            assetGenFlashcardsCurrent: 0,
            assetGenQuestionsTotal: activeKOs.length,
            assetGenQuestionsCurrent: 0,
            assetGenError: null,
            updatedAt: new Date(),
          })
          .where(eq(chapters.id, chapterId));
      });

      // Step 2: Generate Flashcards for target Mastery Units
      const fcCount = await step.run("generate-flashcards", async () => {
        return await generateFlashcardsForChapter(chapterId);
      });

      // Update flashcards progress
      await step.run("update-flashcard-progress", async () => {
        await db
          .update(chapters)
          .set({
            assetGenFlashcardsTotal: fcCount,
            assetGenFlashcardsCurrent: fcCount,
            updatedAt: new Date(),
          })
          .where(eq(chapters.id, chapterId));
      });

      let questionCount = 0;
      let currentIdx = 0;
      const BATCH_SIZE_Q = 5;
      for (let i = 0; i < activeKOs.length; i += BATCH_SIZE_Q) {
        const koBatch = activeKOs.slice(i, i + BATCH_SIZE_Q);
        const koIds = koBatch.map(ko => ko.id);

        const qRes = await step.run(`generate-questions-ko-batch-${i}`, async () => {
          return await generateQuestionsForKOBatch(koIds);
        });

        for (const result of qRes.results) {
          if (result.success) {
            questionCount += result.insertedCount;
          }
          currentIdx++;
        }

        // Update question progress
        await step.run(`update-question-progress-batch-${i}`, async () => {
          await db
            .update(chapters)
            .set({
              assetGenQuestionsCurrent: currentIdx,
              updatedAt: new Date(),
            })
            .where(eq(chapters.id, chapterId));
        });
      }

      // Step 4: Generate Website Material Markdown and compile Website Material
      await step.run("generate-website-material", async () => {
        const compiledMarkdown = await generateMarkdownForChapter(chapterId);

        const mtdId = activeKOs[0]?.mtdId;
        const [mtd] = mtdId
          ? await db
              .select()
              .from(masterTeachingDocuments)
              .where(eq(masterTeachingDocuments.id, mtdId))
          : await db
              .select()
              .from(masterTeachingDocuments)
              .where(eq(masterTeachingDocuments.courseId, info.courseId));

        const authorId = mtd?.createdById || "system";

        await saveWebsiteMaterial(
          chapterId,
          compiledMarkdown,
          authorId,
          "AI Automatic Curation Bulk Generation",
          true // isAiGenerated
        );
      });

      // Step 5: Sync metadata-linked vector indexes through the canonical outbox
      const syncRes = await processBatch(step, info.courseId);

      // Set completed status
      await step.run("complete-progress", async () => {
        await db
          .update(chapters)
          .set({
            assetGenStatus: "completed",
            updatedAt: new Date(),
          })
          .where(eq(chapters.id, chapterId));
      });

      return {
        success: true,
        flashcardsGenerated: fcCount,
        questionsGenerated: questionCount,
        vectorSync: syncRes,
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      await step.run("fail-progress", async () => {
        await db
          .update(chapters)
          .set({
            assetGenStatus: "failed",
            assetGenError: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(chapters.id, chapterId));
      });
      return { success: false, error: errorMessage };
    }
  }
);

// ─── P1A: Mastery recompute worker ────────────────────────────────────────────

export const masteryRecomputeWorker = inngest.createFunction(
  {
    id: "mastery-recompute-worker",
    name: "Mastery Recompute Worker",
    triggers: [{ event: "mastery/recompute.requested" }],
    debounce: {
      key: "event.data.studentId",
      period: "30s",
    },
  },
  async ({ event, step }) => {
    const { studentId, courseId, reason } = event.data as { studentId: string; courseId: string; reason?: string };

    await step.run("process-recompute-job", async () => {
      await enqueueRecompute(studentId, courseId, reason || "inngest_trigger");
      await processQueueBatch();
    });

    return { studentId, courseId };
  }
);

export const ideaMasteryRecomputeWorker = inngest.createFunction(
  {
    id: "idea-mastery-recompute-v1",
    name: "Per-Idea Mastery Recompute V1",
    triggers: [{ event: "mastery/idea-recompute.requested.v1" }],
    debounce: {
      key: "event.data.studentId",
      period: "30s",
    },
  },
  async ({ event, step }) => {
    const { studentId, ideaId, idempotencyKey } = event.data as {
      studentId: string;
      ideaId: string;
      idempotencyKey: string;
    };
    const stepKey = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return step.run(`recompute-idea-${stepKey}`, async () => {
      const result = await recomputePerIdeaMastery(studentId, ideaId, {
        mode: "incremental",
        reason: "idea_mastery_event_v1",
      });
      return {
        status: "processed" as const,
        ideaId,
        changed: result.changed,
        stateHash: result.stateHash,
      };
    });
  },
);

export const feedbackWorker = inngest.createFunction(
  {
    id: "quiz-feedback-worker",
    name: "Quiz Feedback Worker",
    triggers: [{ event: "quiz/feedback.requested" }],
  },
  async ({ event, step }) => {
    const { attemptId } = event.data as { attemptId: string };

    await step.run("generate-feedback", async () => {
      await generateMistakeFeedback(attemptId);
    });

    return { attemptId };
  }
);

// ─── P6B: Daily course analytics snapshot cron ───────────────────────────────
// Runs once per day at 02:00 UTC.
// P1B placeholder: when P1B ships, add the per-student mastery history loop here
// BEFORE the per-course snapshot loop so trends are current.

export const courseAnalyticsSnapshotCron = inngest.createFunction(
  {
    id: "course-analytics-snapshot-cron",
    name: "Course Analytics Snapshot Cron",
    triggers: [{ cron: "0 2 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();

    // Fetch all courses that have at least one active enrollment
    const activeCourseIds = await step.run("fetch-active-courses", async () => {
      const rows = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(gt(enrollments.expiresAt, now))
        .groupBy(enrollments.courseId)
        .having(sql`COUNT(*) > 0`);
      return rows.map((r) => r.courseId);
    });

    const { built, failed } = await step.run("snapshot-active-courses", async () => {
      let b = 0;
      let f = 0;
      for (const courseId of activeCourseIds) {
        try {
          await computeSnapshotPayload(courseId);
          b++;
        } catch {
          f++;
        }
      }
      return { built: b, failed: f };
    });

    return { activeCourseIds: activeCourseIds.length, built, failed };
  }
);

// ─── Continuous Improvement: daily content-quality audit cron ────────────────
// Runs once per day at 03:00 UTC, after the analytics snapshot above so any
// just-recomputed mastery/attempt data is current. See lib/content-quality-auditor.ts.

export const contentQualityAuditCron = inngest.createFunction(
  {
    id: "content-quality-audit-cron",
    name: "Content Quality Audit Cron",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();

    const activeCourseIds = await step.run("fetch-active-courses", async () => {
      const rows = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(gt(enrollments.expiresAt, now))
        .groupBy(enrollments.courseId)
        .having(sql`COUNT(*) > 0`);
      return rows.map((r) => r.courseId);
    });

    const { flagged, failed } = await step.run("audit-active-courses", async () => {
      const { auditCourseContentQuality } = await import("@/lib/content-quality-auditor");
      let totalFlagged = 0;
      let totalFailed = 0;
      for (const courseId of activeCourseIds) {
        try {
          const flags = await auditCourseContentQuality(courseId);
          totalFlagged += flags.length;
        } catch {
          totalFailed++;
        }
      }
      return { flagged: totalFlagged, failed: totalFailed };
    });

    return { activeCourseIds: activeCourseIds.length, flagged, failed };
  }
);

// ─── PWR: Weekly Learning Reflection Cron ────────────────────────────────────

import { computeWeeklyReflection, getPreviousWeekRange, formatDateStr } from "@/lib/reflection-service";
import { learningEvents, weeklyReflections } from "@/db/schema";
import { env } from "@/lib/env";
import { gte, lte } from "drizzle-orm";
import { sendOptionalEmail } from "@/lib/email-preferences/send";

export const weeklyReflectionCron = inngest.createFunction(
  {
    id: "weekly-reflection-cron",
    name: "Weekly Reflection Cron",
    triggers: [{ cron: "0 6 * * 1" }], // Monday 06:00 UTC
  },
  async ({ step }) => {
    const now = new Date();
    const { monday, sunday } = getPreviousWeekRange(now);

    // Fetch all student IDs who have had >= 1 learning event during this week
    const activeStudentIds = await step.run("fetch-active-students", async () => {
      const rows = await db
        .selectDistinct({ studentId: learningEvents.studentId })
        .from(learningEvents)
        .where(
          and(
            gte(learningEvents.createdAt, monday),
            lte(learningEvents.createdAt, sunday)
          )
        );
      return rows.map((r) => r.studentId);
    });

    const { processed, failed } = await step.run("process-reflections-batch", async () => {
      let p = 0;
      let f = 0;
      for (const studentId of activeStudentIds) {
        try {
          await computeWeeklyReflection(studentId, now);
          p++;
        } catch (err) {
          console.error(`Failed to process reflection for student ${studentId}:`, err);
          f++;
        }
      }
      return { processed: p, failed: f };
    });

    const isEmailEnabled = env.FEATURE_REFLECTION_EMAIL === "1";
    if (isEmailEnabled && activeStudentIds.length > 0) {
      await step.run("send-reflection-emails-batch", async () => {
        const weekStartStr = formatDateStr(monday);
        // Process in bounded waves to respect email throughput without arbitrary <=90 cutoff (P1-12)
        await mapConcurrent(activeStudentIds, 5, async (studentId) => {
          try {
            // 1. Fetch student details
            const [student] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, studentId))
              .limit(1);

            if (!student) {
              console.warn(`No account found for student ${studentId}`);
              return;
            }

            // 2. Fetch weekly reflection row
            const [reflection] = await db
              .select()
              .from(weeklyReflections)
              .where(
                and(
                  eq(weeklyReflections.studentId, studentId),
                  eq(weeklyReflections.weekStart, weekStartStr)
                )
              )
              .limit(1);

            if (!reflection) {
              console.warn(`No reflection row found for student ${studentId} and week ${weekStartStr}`);
              return;
            }

            const payload = reflection.payload;
            const completed = payload.completed;
            const streak = payload.streak;

            // 3. Construct email html and send
            await sendOptionalEmail({
              userId: studentId,
              category: "learning_reminders",
              subject: `Weekly Learning Reflection: ${weekStartStr}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
                  <h1 style="font-family: 'Lexend', sans-serif; font-size: 24px; color: #0f172a; margin-top: 0; font-weight: 700;">Halo ${student.name},</h1>
                  <p style="font-size: 16px; line-height: 1.5; color: #475569;">Berikut adalah ringkasan pembelajaran kamu untuk minggu yang dimulai pada <strong>${weekStartStr}</strong>.</p>
                  
                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Aktivitas Terhitung:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Kuis diselesaikan: <strong>${completed.quizzes}</strong></li>
                      <li>Kartu hafalan dipelajari: <strong>${completed.flashcards}</strong></li>
                      <li>Modul diselesaikan: <strong>${completed.modules}</strong></li>
                    </ul>
                  </div>

                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Kemajuan Materi:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Pertumbuhan Pemahaman: <strong>${payload.masteryGrowth > 0 ? "+" : ""}${payload.masteryGrowth}%</strong></li>
                      ${payload.mostImproved ? `<li>Topik Paling Meningkat: <strong>${payload.mostImproved}</strong></li>` : ""}
                    </ul>
                  </div>

                  <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                    <h2 style="font-family: 'Lexend', sans-serif; font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Streak Belajar:</h2>
                    <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <li>Streak Saat Ini: <strong>${streak.currentStreak} hari</strong></li>
                      <li>Streak Terpanjang: <strong>${streak.longestStreak} hari</strong></li>
                    </ul>
                  </div>

                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                  <p style="font-size: 14px; color: #64748b; line-height: 1.4; margin-bottom: 0; text-align: center;">
                    Terus tingkatkan belajarmu di <strong>Zyx Academy</strong>!
                  </p>
                </div>
              `
            });
          } catch (err) {
            console.error(`Failed to send reflection email to student ${studentId}:`, err);
          }
        });
      });
    }

    return {
      activeStudents: activeStudentIds.length,
      processed,
      failed,
    };
  }
);

/**
 * Daily cron running off-peak (19:00 UTC) to snapshot student mastery
 * and update trend directions.
 */
export const masterySnapshotCron = inngest.createFunction(
  {
    id: "mastery-snapshot-cron",
    name: "Mastery Snapshot Cron",
    triggers: [{ cron: "0 19 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();
    // Compliance with AGENTS.md date guidelines (P1-14)
    const thirtyDaysAgo = daysAgo(30, now);

    const activeStudentIds = await step.run("fetch-active-students", async () => {
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.role, "student"),
            gt(user.lastActivityAt, thirtyDaysAgo)
          )
        );
      return rows.map((r) => r.id);
    });

    if (activeStudentIds.length === 0) {
      return { activeStudents: 0, snapshotsWritten: 0 };
    }

    const todayStr = todayUtc();

    const result = await step.run("snapshot-and-recompute-trends", async () => {
      // Chunk processing across active students to avoid unbounded in-memory allocations (P1-13)
      let snapshotsWritten = 0;
      for (let i = 0; i < activeStudentIds.length; i += 50) {
        const studentChunk = activeStudentIds.slice(i, i + 50);
        const masteryRows = await db
          .select()
          .from(studentConceptMastery)
          .where(inArray(studentConceptMastery.studentId, studentChunk));

        if (masteryRows.length > 0) {
          const snapshotInserts = masteryRows.map((r) => ({
            id: crypto.randomUUID(),
            studentId: r.studentId,
            courseId: r.courseId,
            conceptName: r.conceptName,
            masteryScore: r.masteryScore,
            confidence: r.confidence,
            snapshotDate: todayStr,
          }));

          for (let j = 0; j < snapshotInserts.length; j += 100) {
            await db
              .insert(studentConceptMasteryHistory)
              .values(snapshotInserts.slice(j, j + 100))
              .onConflictDoNothing();
          }
          snapshotsWritten += snapshotInserts.length;
        }

        for (const studentId of studentChunk) {
          await recomputeTrends(studentId);
        }
      }

      return { snapshotsWritten };
    });

    return {
      activeStudents: activeStudentIds.length,
      snapshotsWritten: result.snapshotsWritten,
    };
  }
);

/**
 * Event-driven worker for the KO question-generation pipeline.
 * Replaces the old fire-and-forget promise in generation-pipeline.ts, which
 * was terminated by Vercel the moment the HTTP response returned.
 */
export const questionGenerationWorker = inngest.createFunction(
  {
    id: "question-generation-worker",
    name: "Question Generation Worker",
    triggers: [{ event: "ai.generation.job.start" }],
  },
  async ({ event, step }) => {
    const { jobId, params } = event.data as {
      jobId: string;
      params: Parameters<typeof executeGenerationJob>[2];
    };

    try {
      return await executeGenerationJob(step, jobId, params);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      await step.run("fail-job", async () => {
        await db
          .update(aiGenerationJobs)
          .set({ status: "failed", errorMessage, updatedAt: new Date() })
          .where(eq(aiGenerationJobs.id, jobId));
      });
      return { success: false, error: errorMessage };
    }
  }
);

export const assessmentIngestWorker = inngest.createFunction(
  {
    id: "assessment-ingest-worker",
    name: "Assessment Ingest Worker",
    triggers: [{ event: "assessment.ingest" }]
  },
  async ({ event, step }) => {
    const { sourceId } = event.data as { sourceId: string };

    await step.run("extract-assessment-objects", async () => {
      const { extractAssessmentObjectsForSource } = await import("@/lib/assessment-extractor");
      await extractAssessmentObjectsForSource(sourceId);
    });

    return { sourceId };
  }
);

/**
 * Event-driven worker listening to "quiz/analytics.requested"
 * Computes deterministic facts and calls Gemini two-tier diagnosis pipeline.
 */
export const studentQuizAnalyticsWorker = inngest.createFunction(
  {
    id: "student-quiz-analytics-worker",
    name: "Student Quiz Analytics Worker",
    triggers: [{ event: "quiz/analytics.requested" }]
  },
  async ({ event, step }) => {
    const { attemptId, studentId, courseId } = event.data as {
      attemptId: string;
      studentId: string;
      courseId: string;
    };

    // Step 1: Compute facts deterministically & initialize DB row
    const metrics = await step.run("compute-facts", async () => {
      const { computeQuizAnalyticsFacts } = await import("@/lib/student-quiz-analytics/calculator");
      const { studentQuizAnalytics, studentQuizAttempts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const { db } = await import("@/db");

      const facts = await computeQuizAnalyticsFacts(attemptId);

      // Check existing row
      const [existing] = await db
        .select({ id: studentQuizAnalytics.id })
        .from(studentQuizAnalytics)
        .where(eq(studentQuizAnalytics.attemptId, attemptId))
        .limit(1);

      const [attempt] = await db
        .select({ templateId: studentQuizAttempts.templateId })
        .from(studentQuizAttempts)
        .where(eq(studentQuizAttempts.id, attemptId))
        .limit(1);

      const templateId = attempt?.templateId || "";
      const recordId = existing?.id || `sqa_${attemptId}`;

      if (existing) {
        await db
          .update(studentQuizAnalytics)
          .set({
            status: "processing",
            computedMetrics: facts as any,
            updatedAt: new Date(),
          })
          .where(eq(studentQuizAnalytics.id, existing.id));
      } else {
        await db.insert(studentQuizAnalytics).values({
          id: recordId,
          attemptId,
          studentId,
          templateId,
          courseId,
          status: "processing",
          computedMetrics: facts as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return facts;
    });

    // Step 2: Generate AI diagnosis using Gemini two-tier pipeline
    let aiDiagnosis = null;
    let errorMsg: string | undefined;

    try {
      aiDiagnosis = await step.run("generate-ai-diagnosis", async () => {
        const { generateStudentQuizDiagnosis } = await import("@/lib/student-quiz-analytics/ai-pipeline");
        return await generateStudentQuizDiagnosis(attemptId, metrics);
      });
    } catch (err: any) {
      errorMsg = err?.message || String(err);
      console.error("AI diagnosis step failed:", err);
    }

    // Step 3: Save diagnosis in DB
    await step.run("save-analytics-record", async () => {
      const { studentQuizAnalytics } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const { db } = await import("@/db");

      if (aiDiagnosis) {
        await db
          .update(studentQuizAnalytics)
          .set({
            status: "completed",
            aiDiagnosis: aiDiagnosis as any,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(studentQuizAnalytics.attemptId, attemptId));
      } else {
        await db
          .update(studentQuizAnalytics)
          .set({
            status: "failed",
            errorMessage: errorMsg || "Gagal menghasilkan diagnosis AI.",
            updatedAt: new Date(),
          })
          .where(eq(studentQuizAnalytics.attemptId, attemptId));
      }
    });

    return { attemptId, status: aiDiagnosis ? "completed" : "failed" };
  }
);

/**
 * Background worker synchronizing unsynced search documents into Vectorize.
 */
export const syncSearchDocuments = inngest.createFunction(
  {
    id: "sync-search-documents",
    name: "Sync Search Documents",
    triggers: [{ event: "search.documents.sync" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ step }) => {
    const pending = await step.run("claim-unsynced-search-docs", async () => {
      const workerId = crypto.randomUUID();
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

      const candidates = await db
        .select({ id: searchDocuments.id })
        .from(searchDocuments)
        .where(
          or(
            and(eq(searchDocuments.isSynced, false), ne(searchDocuments.syncStatus, "processing")),
            and(eq(searchDocuments.syncStatus, "processing"), lt(searchDocuments.leaseExpiresAt, now))
          )
        )
        .limit(BATCH_SIZE);

      if (candidates.length === 0) return [];

      const candidateIds = candidates.map((d) => d.id);

      await db
        .update(searchDocuments)
        .set({
          syncStatus: "processing",
          leaseId: workerId,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(
          and(
            inArray(searchDocuments.id, candidateIds),
            or(
              ne(searchDocuments.syncStatus, "processing"),
              lt(searchDocuments.leaseExpiresAt, now)
            )
          )
        );

      return await db
        .select()
        .from(searchDocuments)
        .where(and(inArray(searchDocuments.id, candidateIds), eq(searchDocuments.leaseId, workerId)));
    });

    if (pending.length === 0) {
      return { synced: 0, message: "No unsynced search documents to process." };
    }

    try {
      await step.run("embed-and-upsert-search-docs", async () => {
        const { embedSearchDocument, upsertSearchVectors } = await import("@/lib/search/service");

        const vectors = await mapConcurrent(pending, 5, async (doc) => {
          const textContent = doc.searchableText?.trim() || doc.title;
          const values = await embedSearchDocument(doc.title, textContent);

          let category = "Navigasi";
          if (doc.entityType === "course") {
            category = "Course & Modul";
          } else if (
            doc.entityType === "chapter" ||
            doc.entityType === "material" ||
            doc.entityType === "blog"
          ) {
            category = "Materi & Artikel";
          } else if (doc.entityType === "quiz" || doc.entityType === "exam") {
            category = "Kuis & Evaluasi";
          }

          return {
            id: doc.id,
            values,
            metadata: {
              title: doc.title,
              href: doc.path,
              category,
              entity_type: doc.entityType,
              entity_id: doc.entityId ?? "",
              course_id: doc.courseId ?? "",
              min_role: doc.minRole ?? 0,
            },
          };
        });

        if (vectors.length > 0) {
          await upsertSearchVectors(vectors);
        }
      });

      await step.run("mark-search-docs-synced", async () => {
        const ids = pending.map((doc) => doc.id);
        await db
          .update(searchDocuments)
          .set({
            isSynced: true,
            syncStatus: "completed",
            leaseId: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(searchDocuments.id, ids));
      });

      return { synced: pending.length, message: `Successfully synced ${pending.length} search documents.` };
    } catch (err: any) {
      await step.run("mark-search-docs-failed", async () => {
        const ids = pending.map((doc) => doc.id);
        await db
          .update(searchDocuments)
          .set({
            syncStatus: "failed",
            leaseId: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(searchDocuments.id, ids));
      });
      throw err;
    }
  }
);

/**
 * Inngest Worker for Admin Ops Knowledge synchronization.
 * Computes deterministic diffs, updates catalog, and syncs vectors to admin_ops_knowledge.
 */
export const adminOpsKnowledgeSyncWorker = inngest.createFunction(
  {
    id: "admin-ops-knowledge-sync-worker",
    name: "Admin Ops Knowledge Sync Worker",
    triggers: [{ event: "admin/knowledge.sync" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ step }: any) => {
    const result = await step.run("execute-knowledge-sync", async () => {
      const { executeAdminKnowledgeSync } = await import("@/lib/admin-ops-ai/admin-knowledge-sync");
      const { getCanonicalContentV2EmbeddingAdapter } = await import("@/lib/vectorize/runtime");
      const adapter = await getCanonicalContentV2EmbeddingAdapter();

      return await executeAdminKnowledgeSync({
        dryRun: false,
        embeddingAdapter: adapter,
      });
    });

    return {
      success: true,
      sourcesTotal: result.sources.total,
      chunksTotal: result.chunks.total,
      manifestHash: result.manifestHash,
    };
  }
);
