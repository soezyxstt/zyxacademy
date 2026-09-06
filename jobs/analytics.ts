import { inngest } from "./client";
import { db } from "@/db";
import { enrollments, studentQuizAnalytics, studentQuizAttempts } from "@/db/schema";
import { computeSnapshotPayload } from "@/lib/cohort-analytics";
import { computeQuizAnalyticsFacts } from "@/lib/student-quiz-analytics/calculator";
import { generateStudentQuizDiagnosis } from "@/lib/student-quiz-analytics/ai-pipeline";
import { gt, sql, eq } from "drizzle-orm";

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

/**
 * Event-driven worker listening to "quiz/analytics.requested"
 * Computes deterministic facts and calls Gemini two-tier diagnosis pipeline.
 */
export const studentQuizAnalyticsWorker = inngest.createFunction(
  {
    id: "student-quiz-analytics-worker",
    name: "Student Quiz Analytics Worker",
    triggers: [{ event: "quiz/analytics.requested" }],
  },
  async ({ event, step }) => {
    const { attemptId, studentId, courseId } = event.data as {
      attemptId: string;
      studentId: string;
      courseId: string;
    };

    // Step 1: Compute facts deterministically & initialize DB row
    const metrics = await step.run("compute-facts", async () => {
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
    let aiDiagnosis: any = null;
    let errorMsg: string | undefined;

    try {
      aiDiagnosis = await step.run("generate-ai-diagnosis", async () => {
        return await generateStudentQuizDiagnosis(attemptId, metrics);
      });
    } catch (err: any) {
      errorMsg = err?.message || String(err);
      console.error("AI diagnosis step failed:", err);
    }

    // Step 3: Save diagnosis in DB
    await step.run("save-analytics-record", async () => {
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
