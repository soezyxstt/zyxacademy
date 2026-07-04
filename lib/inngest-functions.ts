import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { vectorSyncQueue, knowledgeObjects, chapters, masterTeachingDocuments, enrollments, studentConceptMasteryHistory, studentConceptMastery, user, aiGenerationJobs } from "@/db/schema";
import { computeSnapshotPayload } from "@/lib/cohort-analytics";
import { recomputeTrends } from "@/lib/mastery-store";
import { enqueueRecompute, processQueueBatch } from "@/lib/mastery-recompute";
import { generateMistakeFeedback } from "@/lib/mistake-feedback";
import { getNs } from "@/lib/pinecone";
import { embedTexts } from "@/lib/gemini";
import { shouldMirrorToVectorize, serializeVzMetadata, vectorizeUpsert } from "@/lib/vectorize-client";
import { eq, and, or, lt, gt, sql, inArray } from "drizzle-orm";
import { generateFlashcardsForChapter } from "@/lib/flashcard-generator";
import { generateQuestionsForKO, generateQuestionsForKOBatch } from "@/lib/question-generator";
import { executeGenerationJob } from "@/lib/generation-pipeline";
import { generateMarkdownForChapter } from "@/lib/material-generator";
import { saveWebsiteMaterial } from "@/lib/material-storage";
import { VECTOR_NAMESPACES } from "@/lib/vector-store";

type VectorSyncRow = typeof vectorSyncQueue.$inferSelect;

// Retrieve configurable batch size from environment or config, defaulting to 50
const BATCH_SIZE = process.env.PINECONE_SYNC_BATCH_SIZE 
  ? parseInt(process.env.PINECONE_SYNC_BATCH_SIZE, 10) 
  : 50;

/**
 * Processes a single batch of pending outbox sync items.
 * Fetches rows, batch embeds them using text-embedding-004, upserts to Pinecone,
 * and updates their status in PostgreSQL.
 */
export async function processBatch(step: any, courseId?: string) {
  // Step 1: Fetch pending/failed queue rows from database
  const batch = await step.run("fetch-pending-batch", async () => {
    const filters = [
      or(
        eq(vectorSyncQueue.status, "pending"),
        eq(vectorSyncQueue.status, "failed")
      ),
      lt(vectorSyncQueue.attempts, 10)
    ];
    if (courseId) {
      filters.push(eq(vectorSyncQueue.courseId, courseId));
    }

    return await db
      .select()
      .from(vectorSyncQueue)
      .where(and(...filters))
      .limit(BATCH_SIZE);
  });

  if (batch.length === 0) {
    return { processed: 0, message: "No pending outbox records to process." };
  }

  const batchIds = batch.map((r: VectorSyncRow) => r.id);

  // Step 2: Mark records as processing inside DB to lock them
  await step.run("mark-records-processing", async () => {
    await db
      .update(vectorSyncQueue)
      .set({ status: "processing", updatedAt: new Date() })
      .where(inArray(vectorSyncQueue.id, batchIds));
  });

  // Step 3: Group by course namespace (to optimize embedding & Pinecone requests)
  const courseGroups: Record<string, VectorSyncRow[]> = {};
  for (const row of batch) {
    const key = `${row.courseId}:${row.namespace}`;
    if (!courseGroups[key]) {
      courseGroups[key] = [];
    }
    courseGroups[key].push(row);
  }

  let successCount = 0;
  let failCount = 0;

  for (const [key, rows] of Object.entries(courseGroups)) {
    const [cId, namespace] = key.split(":");
    const safeNamespace = namespace || VECTOR_NAMESPACES.learning;
    const sanitizeKey = `${cId}-${safeNamespace}`;
    try {
      // Step 4: Batch embed text-embedding-004
      const texts = rows.map((r: VectorSyncRow) => (r.payload as any).text);
      const embeddings = await step.run(`embed-texts-${sanitizeKey}`, async () => {
        return await embedTexts(texts);
      });

      // Step 5: Upsert to Pinecone course namespace
      const koRecords = await step.run(`upsert-pinecone-${sanitizeKey}`, async () => {
        const records = rows.map((row: VectorSyncRow, idx: number) => {
          const payload = row.payload as any;
          return {
            id: row.koId || payload.id || row.id,
            values: embeddings[idx],
            metadata: {
              courseId: row.courseId,
              chapterId: payload.metadata.chapterId || "",
              conceptId: payload.metadata.conceptId || "",
              type: payload.metadata.type || "unknown",
              bloomLevel: payload.metadata.bloomLevel || "apply",
              difficulty: payload.metadata.difficulty || "medium",
              importance: payload.metadata.importance || "medium",
              tags: payload.metadata.tags || [],
            }
          };
        });

        const ns = getNs(`${cId}_${safeNamespace}`);
        await ns.upsert({ records });
        return records;
      });

      // Step 5b: Mirror to Vectorize when VECTOR_STORE=dual|vectorize
      if (shouldMirrorToVectorize()) {
        await step.run(`upsert-vectorize-${sanitizeKey}`, async () => {
          await vectorizeUpsert(
            koRecords.map((r: { id: string; values: number[]; metadata: Record<string, unknown> }) => ({
              id: r.id,
              values: r.values,
              namespace: `course_${cId}_${safeNamespace}`,
              metadata: serializeVzMetadata(r.metadata),
            })),
          );
        });
      }

      // Step 6: Mark rows completed in database & update pineconeVectorId on KOs
      await step.run(`finalize-success-${sanitizeKey}`, async () => {
        const rowIds = rows.map((r: VectorSyncRow) => r.id);

        await db.transaction(async (tx) => {
          // Set queue rows completed
          await tx
            .update(vectorSyncQueue)
            .set({ status: "completed", updatedAt: new Date() })
            .where(inArray(vectorSyncQueue.id, rowIds));

          // Set KO pineconeVectorId to the KO ID (synced successfully) for learning namespace
          for (const row of rows) {
            if (row.koId && row.namespace === VECTOR_NAMESPACES.learning) {
              await tx
                .update(knowledgeObjects)
                .set({ pineconeVectorId: row.koId, updatedAt: new Date() })
                .where(eq(knowledgeObjects.id, row.koId));
            }
          }
        });
      });

      successCount += rows.length;
    } catch (err: any) {
      // Step 7: Handle failures for this specific group
      await step.run(`handle-failure-${sanitizeKey}`, async () => {
        const errorMessage = err?.message || String(err);
        
        for (const row of rows) {
          await db
            .update(vectorSyncQueue)
            .set({
              status: "failed", // remain in failed state to be retried by the cron/poller
              attempts: row.attempts + 1,
              lastError: errorMessage,
              updatedAt: new Date()
            })
            .where(eq(vectorSyncQueue.id, row.id));
        }
      });

      failCount += rows.length;
    }
  }

  return {
    processed: batch.length,
    success: successCount,
    failed: failCount
  };
}

/**
 * Event-driven worker listening to "vector.sync.dispatch"
 */
export const vectorSyncWorker = inngest.createFunction(
  {
    id: "vector-sync-worker",
    name: "Vector Sync Worker",
    triggers: [{ event: "vector.sync.dispatch" }]
  },
  async ({ event, step }) => {
    const { courseId } = event.data as { courseId: string };
    return await processBatch(step, courseId);
  }
);

/**
 * Scheduled cron worker running every 5 minutes
 */
export const vectorSyncCronWorker = inngest.createFunction(
  {
    id: "vector-sync-cron-worker",
    name: "Vector Sync Cron Worker",
    triggers: [{ cron: "*/5 * * * *" }]
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

      // Step 5: Sync metadata-linked vector indexes to Pinecone immediately
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
  },
  async ({ event, step }) => {
    const { studentId, courseId, reason } = event.data as { studentId: string; courseId: string; reason?: string };

    await step.run("enqueue-request", async () => {
      await enqueueRecompute(studentId, courseId, reason || "inngest_trigger");
    });

    await step.run("process-queue-batch", async () => {
      await processQueueBatch();
    });

    return { studentId, courseId };
  }
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

    let built = 0;
    let failed = 0;

    for (const courseId of activeCourseIds) {
      try {
        await step.run(`snapshot-course-${courseId}`, async () => {
          await computeSnapshotPayload(courseId);
        });
        built++;
      } catch {
        failed++;
      }
    }

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

    let flagged = 0;
    let failed = 0;

    for (const courseId of activeCourseIds) {
      try {
        const flags = await step.run(`audit-course-${courseId}`, async () => {
          const { auditCourseContentQuality } = await import("@/lib/content-quality-auditor");
          return await auditCourseContentQuality(courseId);
        });
        flagged += flags.length;
      } catch {
        failed++;
      }
    }

    return { activeCourseIds: activeCourseIds.length, flagged, failed };
  }
);

// ─── PWR: Weekly Learning Reflection Cron ────────────────────────────────────

import { computeWeeklyReflection, getPreviousWeekRange, formatDateStr } from "@/lib/reflection-service";
import { learningEvents, weeklyReflections } from "@/db/schema";
import { env } from "@/lib/env";
import { gte, lte } from "drizzle-orm";
import { resend } from "@/lib/resend";

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

    let processed = 0;
    let failed = 0;

    for (const studentId of activeStudentIds) {
      try {
        await step.run(`process-reflection-${studentId}`, async () => {
          await computeWeeklyReflection(studentId, now);
        });
        processed++;
      } catch (err) {
        console.error(`Failed to process reflection for student ${studentId}:`, err);
        failed++;
      }
    }

    const isEmailEnabled = env.FEATURE_REFLECTION_EMAIL === "1";
    if (isEmailEnabled && activeStudentIds.length <= 90) {
      for (const studentId of activeStudentIds) {
        try {
          const weekStartStr = formatDateStr(monday);
          await step.run(`send-reflection-email-${studentId}-${weekStartStr}`, async () => {
            // 1. Fetch student details
            const [student] = await db
              .select({ name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, studentId))
              .limit(1);

            if (!student || !student.email) {
              console.warn(`No email found for student ${studentId}`);
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
            const fromEmail = env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com";

            await resend.emails.send({
              from: `Zyx Academy <${fromEmail}>`,
              to: student.email,
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
          });
        } catch (err) {
          console.error(`Failed to send reflection email to student ${studentId}:`, err);
        }
      }
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

    const todayStr = now.toISOString().split("T")[0];

    const result = await step.run("snapshot-and-recompute-trends", async () => {
      const masteryRows = await db
        .select()
        .from(studentConceptMastery)
        .where(inArray(studentConceptMastery.studentId, activeStudentIds));

      if (masteryRows.length === 0) {
        return { snapshotsWritten: 0 };
      }

      const snapshotInserts = masteryRows.map((r) => ({
        id: crypto.randomUUID(),
        studentId: r.studentId,
        courseId: r.courseId,
        conceptName: r.conceptName,
        masteryScore: r.masteryScore,
        confidence: r.confidence,
        snapshotDate: todayStr,
      }));

      // Chunk write snapshots for idempotency (uq_scmh_student_concept_date unique constraint)
      for (let i = 0; i < snapshotInserts.length; i += 100) {
        await db
          .insert(studentConceptMasteryHistory)
          .values(snapshotInserts.slice(i, i + 100))
          .onConflictDoNothing();
      }

      // Recompute trend for each active student
      for (const studentId of activeStudentIds) {
        await recomputeTrends(studentId);
      }

      return { snapshotsWritten: snapshotInserts.length };
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



