import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../../../../../db/schema";
import { assessmentEvidence } from "./assessment-data";

export const assessmentResultCases = {
  completed: assessmentEvidence.finished,
  pendingTryout: assessmentEvidence.submission,
  gradedTryout: "assessment-evidence-tryout-graded",
  gradedTryoutScore: 95,
  gradedTryoutNote: "Uraikan alasan pilihan jawaban sebelum menulis kesimpulan.",
  missingAnalytics: "assessment-evidence-quiz-diagnosis-unavailable",
  pendingQuiz: "assessment-evidence-quiz-grading-pending",
  heldQuiz: "assessment-evidence-quiz-discussion-held",
  heldTemplate: "assessment-evidence-limit-quiz-unreleased",
  heldTitle: "Latihan limit dengan pembahasan tertunda",
  heldScore: 60,
  heldExplanation: "Pembahasan khusus yang belum dirilis untuk percobaan ini.",
} as const;

async function seed() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/student_evidence") {
    throw new Error("Expected the disposable loopback Student evidence database");
  }
  const client = new Client({ connectionString: url.href });
  await client.connect();
  try {
    await drizzle(client).transaction(async tx => {
      const [baseline] = await tx.select().from(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.id, assessmentEvidence.finished));
      const [template] = await tx.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, assessmentEvidence.quiz));
      const [submission] = await tx.select().from(schema.submissions).where(eq(schema.submissions.id, assessmentEvidence.submission));
      assert.ok(baseline && template && submission, "Run assessment-seed.ts before the result-specific seed");
      assert.ok(Array.isArray(baseline.questionsSnapshot));
      const peer = `student-evidence-${assessmentEvidence.accounts[1]}`;
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      const [canonical] = await tx.select({ id: schema.mataKuliah.id }).from(schema.mataKuliah)
        .where(eq(schema.mataKuliah.legacyCourseId, assessmentEvidence.course));
      assert.ok(canonical);
      // The foreign participant has the same active enrollment as the owner.
      await tx.insert(schema.enrollments).values({
        id: peer, userId: peer, courseId: assessmentEvidence.course, enrolledAt: new Date(0), expiresAt,
      }).onConflictDoUpdate({ target: schema.enrollments.id, set: { expiresAt } });
      await tx.insert(schema.pendaftaranMurid).values({
        id: peer, penggunaId: peer, mataKuliahId: canonical.id, endAt: expiresAt,
      }).onConflictDoUpdate({ target: schema.pendaftaranMurid.id, set: { endAt: expiresAt } });

      const rules = { ...template.selectionRules as Record<string, unknown>, explanationRelease: "after_close" };
      await tx.insert(schema.quizTemplates).values({
        id: assessmentResultCases.heldTemplate, title: assessmentResultCases.heldTitle, courseId: assessmentEvidence.course,
        category: template.category, visibility: template.visibility, status: "published", manualStatus: "open",
        selectionRules: rules, timeLimitSeconds: template.timeLimitSeconds, maxAttempts: template.maxAttempts,
      }).onConflictDoNothing();
      await tx.insert(schema.submissions).values({ ...submission, id: assessmentResultCases.gradedTryout,
        attemptNumber: 2, status: "graded", score: assessmentResultCases.gradedTryoutScore, teacherNotes: assessmentResultCases.gradedTryoutNote,
      }).onConflictDoNothing();
      const { studentId, startedAt, submittedAt, answersSnapshot, durationSeconds } = baseline;
      const common = { studentId, startedAt, submittedAt, answersSnapshot, durationSeconds, status: "completed" as const };
      await tx.insert(schema.studentQuizAttempts).values([
        { ...common, id: assessmentResultCases.missingAnalytics, templateId: template.id,
          gradingStatus: "graded", score: 70, questionsSnapshot: baseline.questionsSnapshot },
        { ...common, id: assessmentResultCases.pendingQuiz, templateId: template.id,
          gradingStatus: "pending", score: null, questionsSnapshot: baseline.questionsSnapshot },
        { ...common, id: assessmentResultCases.heldQuiz, templateId: assessmentResultCases.heldTemplate,
          gradingStatus: "graded", score: assessmentResultCases.heldScore,
          questionsSnapshot: baseline.questionsSnapshot.map((question, index) => index === 0
            ? { ...question, explanation: assessmentResultCases.heldExplanation } : question) },
      ]).onConflictDoNothing();
      await tx.insert(schema.studentQuizAnalytics).values([
        { id: `${assessmentResultCases.pendingQuiz}-analytics`, attemptId: assessmentResultCases.pendingQuiz, studentId,
          courseId: assessmentEvidence.course, templateId: template.id, status: "processing" },
        { id: `${assessmentResultCases.missingAnalytics}-analytics`, attemptId: assessmentResultCases.missingAnalytics, studentId,
          courseId: assessmentEvidence.course, templateId: template.id, status: "failed" },
      ]).onConflictDoNothing();
    });
    console.log("Seeded enrolled peer and pending/held quiz result cases");
  } finally {
    await client.end();
  }
}

if (import.meta.main) await seed();
