import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, mataKuliah, questions, submissions } from "@/db/schema";
import { normalizeQuestionProvenance } from "@/lib/asesmen/question-provenance";
import { checkCourseMatch, isSqliteBusyError, isUniqueConstraintError } from "@/lib/tutor/assessment-policy";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { studentAssessmentRequestId } from "./assessment-idempotency";

export class TryoutSubmissionError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 422) {
    super(message);
  }
}

/** Both the web action and native handler supply userId from their validated session. */
export async function submitStudentTryout({ courseId, examId, userId, answers, requestId, validateAnswers }: {
  courseId: string;
  examId: string;
  userId: string;
  answers: Record<string, unknown>;
  requestId?: string;
  validateAnswers?: (rows: (typeof questions.$inferSelect)[]) => Record<string, unknown>;
}) {
  const [examRecord] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!examRecord) throw new TryoutSubmissionError("Tryout tidak ditemukan.", 404);

  const [canonicalCourse] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const canonicalId = canonicalCourse?.id ?? courseId;
  const legacyId = canonicalCourse?.legacyCourseId ?? courseId;

  if (!checkCourseMatch(examRecord.courseId, canonicalId, legacyId) || examRecord.type !== "tryout") {
    throw new TryoutSubmissionError("Tryout tidak sesuai dengan kelas.", 404);
  }

  const access = await resolveCourseAccess({ courseId: examRecord.courseId, userId });
  if (!access.hasFullContentAccess) throw new TryoutSubmissionError("Akses mata kuliah tidak tersedia.", 403);

  const submissionId = `sub-tutor-${requestId ? studentAssessmentRequestId("tryout", userId, examId, requestId) : randomUUID()}`;
  const sameSubmission = and(eq(submissions.id, submissionId), eq(submissions.userId, userId), eq(submissions.examId, examId));
  const alreadySubmitted = async () => Boolean(requestId && (await db.select({ id: submissions.id }).from(submissions).where(sameSubmission).limit(1)).length);
  if (await alreadySubmitted()) {
    return { success: true, submissionId };
  }

  if (examRecord.status !== "published") {
    throw new TryoutSubmissionError("Tryout belum dipublikasikan atau sudah ditutup.", 409);
  }

  const now = new Date();
  if (examRecord.openAt && now < new Date(examRecord.openAt)) {
    throw new TryoutSubmissionError("Tryout belum dibuka.", 409);
  }
  if (examRecord.closeAt && now > new Date(examRecord.closeAt)) {
    throw new TryoutSubmissionError("Tryout sudah ditutup.", 409);
  }

  const settings = typeof examRecord.settings === "string"
    ? JSON.parse(examRecord.settings)
    : (examRecord.settings as Record<string, any> | null);
  const maxAttempts = settings?.maxAttempts;

  const dbQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examId))
    .orderBy(asc(questions.order));

  if (validateAnswers) answers = validateAnswers(dbQuestions);

  const hasEssay = dbQuestions.some((q) => q.type === "essay");
  const status = hasEssay ? "pending_review" : "completed";

  let correctCount = 0;
  let autoGradedCount = 0;

  const questionsSnapshot = dbQuestions.map((q) => {
    const qContent = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
    const answer = answers[q.id] as { index?: number; indices?: number[]; text?: string } | undefined;

    if (q.type === "multiple_choice") {
      autoGradedCount++;
      const isCorrect = answer && answer.index === qContent.correctIndex;
      if (isCorrect) correctCount++;
    } else if (q.type === "multiple_choices") {
      autoGradedCount++;
      const submitted = answer?.indices || [];
      const correct = qContent.correctIndices || [];
      const isCorrect =
        submitted.length === correct.length &&
        submitted.every((idx: number) => correct.includes(idx));
      if (isCorrect) correctCount++;
    } else if (q.type === "short_answer") {
      autoGradedCount++;
      const submittedText = (answer?.text || "").trim().toLowerCase();
      const acceptable = (qContent.acceptableAnswers || []).map((a: string) =>
        a.trim().toLowerCase()
      );
      const isCorrect = acceptable.includes(submittedText);
      if (isCorrect) correctCount++;
    }

    return {
      id: q.id,
      ...(typeof qContent.bankQuestionId === "string" ? { bankQuestionId: qContent.bankQuestionId } : {}),
      order: q.order,
      type: q.type,
      prompt: qContent.prompt,
      options: qContent.options || [],
      correctIndex: qContent.correctIndex,
      correctIndices: qContent.correctIndices || [],
      acceptsImage: qContent.acceptsImage,
      acceptsFile: qContent.acceptsFile,
      acceptableAnswers: qContent.acceptableAnswers || [],
      explanation: qContent.explanation || "",
      ...normalizeQuestionProvenance(qContent),
    };
  });

  const autoGradedScore = autoGradedCount > 0 ? Math.round((correctCount / autoGradedCount) * 100) : 100;
  const score = hasEssay ? null : autoGradedScore;

  const maxSubmitRetries = 6;
  for (let retry = 0; retry < maxSubmitRetries; retry++) {
    try {
      await db.transaction(async (tx) => {
        if (requestId && (await tx.select({ id: submissions.id }).from(submissions).where(sameSubmission).limit(1)).length) return;
        const [attemptsResult] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              eq(submissions.examId, examId),
            ),
          );
        const attemptCount = Number(attemptsResult?.count ?? 0);
        if (typeof maxAttempts === "number" && maxAttempts > 0 && attemptCount >= maxAttempts) {
          throw new TryoutSubmissionError("Batas maksimum percobaan tryout telah tercapai.", 409);
        }

        const attemptNumber = attemptCount + 1;
        if (typeof maxAttempts === "number" && maxAttempts > 0 && attemptNumber > maxAttempts) {
          throw new TryoutSubmissionError("Batas maksimum percobaan tryout telah tercapai.", 409);
        }

        await tx.insert(submissions).values({
          id: submissionId,
          userId,
          examId,
          status,
          score,
          answersSnapshot: answers,
          questionsSnapshot,
          submittedAt: new Date(),
          attemptNumber,
        });
      });
      break;
    } catch (err) {
      if (await alreadySubmitted()) return { success: true, submissionId };
      const isRetryable = isUniqueConstraintError(err) || isSqliteBusyError(err);
      if (isRetryable && retry < maxSubmitRetries - 1) {
        const jitter = Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** retry + jitter));
        continue;
      }
      if (isUniqueConstraintError(err)) {
        throw new TryoutSubmissionError("Batas maksimum percobaan tryout telah tercapai.", 409);
      }
      throw err;
    }
  }

  return { success: true, submissionId };
}
