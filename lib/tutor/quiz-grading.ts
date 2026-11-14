import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  studentQuizAttempts,
  quizTemplates,
  jawabanMurid,
  itemAsesmen,
  percobaanAsesmen,
  user,
  pengguna,
} from "@/db/schema";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { checkCourseMatch } from "@/lib/tutor/assessment-policy";
import { recordTutorMutationAudit } from "@/lib/audit/mutasi";
import {
  legacyAnswerId,
  type LegacyQuizQuestionSnapshot,
  buildLegacyRenderedQuestionSnapshot,
} from "@/lib/asesmen/live-idea-evidence";
import { normalizeDate } from "@/lib/date-utils";
import { recordAuthorizedStaffAttemptDisclosures } from "@/lib/gamification/question-exposure";
import { checkAnswerCorrectness } from "@/lib/gamification/question-grading";

export const TUTOR_QUIZ_GRADING_ERRORS = {
  UNAUTHORIZED: "Unauthorized: Silakan masuk terlebih dahulu.",
  ACCESS_DENIED: "TUTOR_ACCESS_DENIED",
  ATTEMPT_NOT_FOUND: "TUTOR_QUIZ_GRADING_ERROR: ATTEMPT_NOT_FOUND",
  TEMPLATE_NOT_FOUND: "TUTOR_QUIZ_GRADING_ERROR: TEMPLATE_NOT_FOUND",
  COURSE_MISMATCH: "TUTOR_QUIZ_GRADING_ERROR: COURSE_MISMATCH",
  OBJECTIVE_OVERRIDE_FORBIDDEN: "TUTOR_QUIZ_GRADING_ERROR: OBJECTIVE_OVERRIDE_FORBIDDEN",
  QUESTION_NOT_IN_ATTEMPT: "TUTOR_QUIZ_GRADING_ERROR: QUESTION_NOT_IN_ATTEMPT",
  INVALID_SCORE: "TUTOR_QUIZ_GRADING_ERROR: INVALID_SCORE",
  CAS_CONFLICT: "TUTOR_QUIZ_GRADING_ERROR: CAS_CONFLICT",
  ESSAY_REVIEW_REQUIRED: "TUTOR_QUIZ_GRADING_ERROR: ESSAY_REVIEW_REQUIRED",
} as const;

export const gradeAnswerItemSchema = z.object({
  questionId: z.string().min(1),
  score: z.number().min(0).max(100),
  reviewNotes: z.string().max(2000).optional().nullable(),
  expectedRevision: z.number().int().min(0),
});

export type GradeAnswerItem = z.infer<typeof gradeAnswerItemSchema>;

export const gradeQuizAttemptSchema = z.object({
  courseId: z.string().min(1),
  attemptId: z.string().min(1),
  items: z.array(gradeAnswerItemSchema).min(1),
});

export type GradeQuizAttemptInput = z.infer<typeof gradeQuizAttemptSchema>;

function parseJsonSafe<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

type TutorReview = {
  score: number;
  status: "correct" | "incorrect" | "partial";
  reviewRevision: number;
  reviewerId: string;
  reviewNotes: string | null;
};

// This server-owned policy is stored on the mirrored attempt, never in the
// student-supplied answers snapshot. It preserves reviews when no safe item
// exists without attributing a legacy answer to a current canonical version.
function tutorReviews(policy: unknown): Partial<Record<string, TutorReview>> {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return {};
  const value = (policy as Record<string, unknown>).tutorReviews;
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, TutorReview> } : {};
}

/**
 * Evaluates if a submitted answer is deterministically correct for supported question types.
 */
export function checkDeterministicCorrectness(q: LegacyQuizQuestionSnapshot, submitted: unknown): boolean {
  return checkAnswerCorrectness(q, submitted);
}

export async function gradeQuizAttempt(
  tutorPenggunaId: string,
  tutorRoles: string[],
  input: GradeQuizAttemptInput,
) {
  const parsed = gradeQuizAttemptSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Validasi gagal: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
  }

  const { courseId, attemptId, items } = parsed.data;

  // 1. Authorize tutor course access strictly with allowAdmin: false
  const access = await requireTutorCourseAccess(tutorPenggunaId, courseId, { allowAdmin: false });

  // 2. Fetch attempt with template
  const [attempt] = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      templateId: studentQuizAttempts.templateId,
      status: studentQuizAttempts.status,
      gradingStatus: studentQuizAttempts.gradingStatus,
      score: studentQuizAttempts.score,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      startedAt: studentQuizAttempts.startedAt,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    throw new Error(TUTOR_QUIZ_GRADING_ERRORS.ATTEMPT_NOT_FOUND);
  }

  const [template] = await db
    .select({
      id: quizTemplates.id,
      courseId: quizTemplates.courseId,
      title: quizTemplates.title,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  if (!template) {
    throw new Error(TUTOR_QUIZ_GRADING_ERRORS.TEMPLATE_NOT_FOUND);
  }

  // Cross-check course ownership
  const isCourseMatched = checkCourseMatch(
    template.courseId,
    access.courseId!,
    access.legacyCourseId,
  );
  if (!isCourseMatched) {
    throw new Error(TUTOR_QUIZ_GRADING_ERRORS.COURSE_MISMATCH);
  }

  const questions = parseJsonSafe<LegacyQuizQuestionSnapshot[]>(attempt.questionsSnapshot, []);
  const questionMap = new Map<string, LegacyQuizQuestionSnapshot>(questions.map((q) => [q.id, q]));
  const answers = parseJsonSafe<Record<string, unknown>>(attempt.answersSnapshot, {});

  // 3. Cross-check items: must be in snapshot and must NOT be objective
  const itemsMap = new Map<string, GradeAnswerItem>();
  for (const item of items) {
    const question = questionMap.get(item.questionId);
    if (!question) {
      throw new Error(TUTOR_QUIZ_GRADING_ERRORS.QUESTION_NOT_IN_ATTEMPT);
    }
    const qType = question.question_type || question.questionType;
    if (qType !== "essay" && qType !== "short_answer") {
      throw new Error(TUTOR_QUIZ_GRADING_ERRORS.OBJECTIVE_OVERRIDE_FORBIDDEN);
    }
    itemsMap.set(item.questionId, item);
  }

  // 4. Ensure canonical pengguna exists for reviewer
  const [reviewerPengguna] = await db
    .select({ id: pengguna.id })
    .from(pengguna)
    .where(eq(pengguna.id, tutorPenggunaId))
    .limit(1);

  if (!reviewerPengguna) {
    await db.insert(pengguna).values({
      id: tutorPenggunaId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  const now = new Date();
  let finalCalculatedScore: number | null = null;
  let nextGradingStatus: "pending" | "graded" = "pending";

  await db.transaction(async (tx) => {
    // Acquire the viewer lock and question locks before any grading row locks.
    // Disclosure failure therefore rolls back the review and its revision.
    await recordAuthorizedStaffAttemptDisclosures(tx, {
      userId: tutorPenggunaId, attemptOwnerId: attempt.studentId, courseId: template.courseId,
      attemptId, questionIds: questions.map(q => q.id), occurredAt: now, requestId: randomUUID(),
    });
    const [lockedAttempt] = await tx.select().from(studentQuizAttempts)
      .where(eq(studentQuizAttempts.id, attemptId)).for("update");
    if (!lockedAttempt || lockedAttempt.studentId !== attempt.studentId || lockedAttempt.templateId !== attempt.templateId
      || lockedAttempt.status !== "completed" || !isDeepStrictEqual(lockedAttempt.questionsSnapshot, attempt.questionsSnapshot)
      || !isDeepStrictEqual(lockedAttempt.answersSnapshot, attempt.answersSnapshot)) {
      throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
    }

    await tx.insert(pengguna).values({ id: attempt.studentId, status: "active", createdAt: now, updatedAt: now }).onConflictDoNothing();
    await tx.insert(percobaanAsesmen).values({
      id: attemptId, asesmenId: attempt.templateId, penggunaId: attempt.studentId, status: "submitted",
      renderedQuestionSnapshot: (attempt.questionsSnapshot ?? {}) as Record<string, unknown>,
      optionOrderSnapshot: {}, gradingPolicySnapshot: { source: "legacy" }, contentVersion: 1,
      startedAt: normalizeDate(attempt.startedAt), submittedAt: normalizeDate(attempt.submittedAt ?? attempt.startedAt),
    }).onConflictDoNothing();
    const [mirror] = await tx.select().from(percobaanAsesmen).where(eq(percobaanAsesmen.id, attemptId)).for("update");
    if (!mirror || mirror.asesmenId !== attempt.templateId || mirror.penggunaId !== attempt.studentId) {
      throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
    }
    const reviews = tutorReviews(mirror.gradingPolicySnapshot);
    // An existing answer is usable only when its actual item and immutable
    // rendered snapshot identify this question. Never assume a generated item ID
    // survived an order or identity conflict during submission.
    const existing = await tx.select({ answer: jawabanMurid, item: itemAsesmen })
      .from(jawabanMurid).innerJoin(itemAsesmen, eq(jawabanMurid.itemAsesmenId, itemAsesmen.id))
      .where(eq(jawabanMurid.percobaanAsesmenId, attemptId));
    const answerByQuestion = new Map(existing.flatMap(({ answer, item }) => {
      const question = questionMap.get(item.soalId);
      return question && item.asesmenId === attempt.templateId && answer.id === legacyAnswerId(attemptId, question.id)
        && isDeepStrictEqual(answer.renderedQuestionSnapshot, buildLegacyRenderedQuestionSnapshot(question))
        ? [[question.id, answer] as const] : [];
    }));

    for (const [questionId, grade] of itemsMap) {
      const answer = answerByQuestion.get(questionId);
      const prior = reviews[questionId];
      const revision = prior?.reviewRevision ?? answer?.reviewRevision ?? 0;
      if (grade.expectedRevision !== revision) throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
      const score = grade.score / 100;
      const status = grade.score === 100 ? "correct" : grade.score === 0 ? "incorrect" : "partial";
      const review: TutorReview = { score, status, reviewRevision: revision + 1, reviewerId: tutorPenggunaId, reviewNotes: grade.reviewNotes?.trim() || null };
      if (answer && !prior) {
        const updated = await tx.update(jawabanMurid).set({ ...review, reviewedAt: now })
          .where(and(eq(jawabanMurid.id, answer.id), eq(jawabanMurid.reviewRevision, revision))).returning({ id: jawabanMurid.id });
        if (!updated.length) throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
        answerByQuestion.set(questionId, { ...answer, ...review, reviewedAt: now });
      } else {
        reviews[questionId] = review;
      }
      // Legacy free-response snapshots have no server-proven canonical version.
      // A manual grade is valid, but cannot be assigned to today's Idea links.
    }
    const policy = { ...mirror.gradingPolicySnapshot, tutorReviews: reviews };
    const allEssaysReviewed = questions.filter(q => (q.question_type || q.questionType) === "essay")
      .every(q => reviews[q.id]?.score != null || (answerByQuestion.get(q.id)?.score != null && answerByQuestion.get(q.id)?.status !== "needs_review"));
    if (allEssaysReviewed) {
      nextGradingStatus = "graded";
      const total = questions.reduce((sum, q) => {
        const type = q.question_type || q.questionType;
        const reviewed = reviews[q.id] ?? answerByQuestion.get(q.id);
        if (type === "essay") return sum + (reviewed?.score ?? 0);
        if (type === "short_answer" && reviewed?.score != null && reviewed.status !== "needs_review") return sum + reviewed.score;
        return sum + (checkDeterministicCorrectness(q, answers[q.id]) ? 1 : 0);
      }, 0);
      finalCalculatedScore = questions.length ? Math.round(total / questions.length * 100) : 0;
    }
    await tx.update(studentQuizAttempts).set({ gradingStatus: nextGradingStatus, score: finalCalculatedScore })
      .where(eq(studentQuizAttempts.id, attemptId));
    await tx.update(percobaanAsesmen).set({ gradingPolicySnapshot: policy, ...(allEssaysReviewed ? { status: "graded" as const } : {}) })
      .where(eq(percobaanAsesmen.id, attemptId));
    await recordTutorMutationAudit({
      actorId: tutorPenggunaId, actorRoles: tutorRoles, courseId: access.courseId ?? courseId,
      entityType: "quiz_attempt", entityId: attemptId, entityVersion: 1,
      requestId: `req-grade-${attemptId}-${randomUUID()}`, action: "quiz_attempt:grade", outcome: "success",
      reason: allEssaysReviewed ? "Quiz attempt graded and finalized" : "Quiz attempt partially graded",
      before: { attemptId, gradingStatus: lockedAttempt.gradingStatus, score: lockedAttempt.score },
      after: { attemptId, gradingStatus: nextGradingStatus, score: finalCalculatedScore, reviewedCount: items.length },
    }, tx);
  });

  return {
    success: true,
    attemptId,
    gradingStatus: nextGradingStatus as "pending" | "graded",
    score: finalCalculatedScore as number | null,
    reviewedItemsCount: items.length,
  };
}

export async function getCoursePendingQuizAttempts(
  courseId: string,
  tutorPenggunaId: string,
) {
  const access = await requireTutorCourseAccess(tutorPenggunaId, courseId, { allowAdmin: false });

  const courseIdsToQuery = [courseId];
  if (access.courseId && !courseIdsToQuery.includes(access.courseId)) {
    courseIdsToQuery.push(access.courseId);
  }
  if (access.legacyCourseId && !courseIdsToQuery.includes(access.legacyCourseId)) {
    courseIdsToQuery.push(access.legacyCourseId);
  }

  const rows = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      studentEmail: user.email,
      templateId: studentQuizAttempts.templateId,
      quizTitle: quizTemplates.title,
      submittedAt: studentQuizAttempts.submittedAt,
      startedAt: studentQuizAttempts.startedAt,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      gradingStatus: studentQuizAttempts.gradingStatus,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(
      and(
        inArray(quizTemplates.courseId, courseIdsToQuery),
        eq(studentQuizAttempts.status, "completed"),
        eq(studentQuizAttempts.gradingStatus, "pending"),
      ),
    );

  // For each attempt, count total questions, essay count, and remaining unscored essays
  const attemptIds = rows.map((r) => r.id);
  const answers = attemptIds.length > 0
    ? await db
        .select({
          percobaanAsesmenId: jawabanMurid.percobaanAsesmenId,
          id: jawabanMurid.id,
          questionId: itemAsesmen.soalId,
          assessmentId: itemAsesmen.asesmenId,
          rendered: jawabanMurid.renderedQuestionSnapshot,
          score: jawabanMurid.score,
          status: jawabanMurid.status,
        })
        .from(jawabanMurid)
        .innerJoin(itemAsesmen, eq(jawabanMurid.itemAsesmenId, itemAsesmen.id))
        .where(inArray(jawabanMurid.percobaanAsesmenId, attemptIds))
    : [];

  const mirrors = attemptIds.length ? await db.select({ id: percobaanAsesmen.id, policy: percobaanAsesmen.gradingPolicySnapshot }).from(percobaanAsesmen).where(inArray(percobaanAsesmen.id, attemptIds)) : [];
  const policies = new Map(mirrors.map(row => [row.id, tutorReviews(row.policy)]));
  const answersByAttempt = new Map<string, typeof answers>();
  for (const a of answers) {
    const list = answersByAttempt.get(a.percobaanAsesmenId) ?? [];
    list.push(a);
    answersByAttempt.set(a.percobaanAsesmenId, list);
  }

  return rows.map((r) => {
    const questions = parseJsonSafe<LegacyQuizQuestionSnapshot[]>(r.questionsSnapshot, []);
    const essayQuestions = questions.filter((q) => (q.question_type || q.questionType) === "essay");
    const attemptAnswers = answersByAttempt.get(r.id) ?? [];
    const answerMap = new Map(attemptAnswers.map((a) => [a.id, a]));
    const reviews = policies.get(r.id) ?? {};

    const remainingEssayCount = essayQuestions.filter((q) => {
      const candidate = answerMap.get(legacyAnswerId(r.id, q.id));
      const ans = reviews[q.id] ?? (candidate && candidate.questionId === q.id && candidate.assessmentId === r.templateId && isDeepStrictEqual(candidate.rendered, buildLegacyRenderedQuestionSnapshot(q)) ? candidate : undefined);
      return !ans || ans.score === null || ans.status === "needs_review";
    }).length;

    return {
      id: r.id,
      studentId: r.studentId,
      studentName: r.studentName,
      studentEmail: r.studentEmail,
      templateId: r.templateId,
      quizTitle: r.quizTitle,
      submittedAt: r.submittedAt ? normalizeDate(r.submittedAt) : normalizeDate(r.startedAt),
      totalQuestions: questions.length,
      essayCount: essayQuestions.length,
      remainingEssayCount,
    };
  });
}

export async function getQuizAttemptDetailsForGrading(
  courseId: string,
  attemptId: string,
  tutorPenggunaId: string,
) {
  const access = await requireTutorCourseAccess(tutorPenggunaId, courseId, { allowAdmin: false });

  const [attempt] = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      templateId: studentQuizAttempts.templateId,
      status: studentQuizAttempts.status,
      gradingStatus: studentQuizAttempts.gradingStatus,
      score: studentQuizAttempts.score,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      submittedAt: studentQuizAttempts.submittedAt,
      startedAt: studentQuizAttempts.startedAt,
      studentName: user.name,
      studentEmail: user.email,
    })
    .from(studentQuizAttempts)
    .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) return null;

  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      courseId: quizTemplates.courseId,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  if (!template) return null;

  const isCourseMatched = checkCourseMatch(
    template.courseId,
    access.courseId!,
    access.legacyCourseId,
  );
  if (!isCourseMatched) return null;

  const questions = parseJsonSafe<LegacyQuizQuestionSnapshot[]>(attempt.questionsSnapshot, []);
  const answers = parseJsonSafe<Record<string, unknown>>(attempt.answersSnapshot, {});

  const [mirror] = await db.select({ policy: percobaanAsesmen.gradingPolicySnapshot }).from(percobaanAsesmen).where(eq(percobaanAsesmen.id, attemptId)).limit(1);
  const reviews = tutorReviews(mirror?.policy);
  const canonicalAnswers = await db
    .select({
      id: jawabanMurid.id,
      itemAsesmenId: jawabanMurid.itemAsesmenId,
      questionId: itemAsesmen.soalId,
      assessmentId: itemAsesmen.asesmenId,
      rendered: jawabanMurid.renderedQuestionSnapshot,
      score: jawabanMurid.score,
      status: jawabanMurid.status,
      reviewerId: jawabanMurid.reviewerId,
      reviewNotes: jawabanMurid.reviewNotes,
      reviewedAt: jawabanMurid.reviewedAt,
      reviewRevision: jawabanMurid.reviewRevision,
    })
    .from(jawabanMurid)
    .innerJoin(itemAsesmen, eq(jawabanMurid.itemAsesmenId, itemAsesmen.id))
    .where(eq(jawabanMurid.percobaanAsesmenId, attemptId));

  const canonicalMap = new Map(canonicalAnswers.map((a) => [a.id, a]));

  const questionDetails = questions.map((q, idx) => {
    const qId = q.id;
    const qType = q.question_type || q.questionType || "multiple_choice";
    const answerId = legacyAnswerId(attemptId, qId);
    const candidate = canonicalMap.get(answerId);
    const existing = reviews[qId] ?? (candidate && candidate.questionId === qId && candidate.assessmentId === attempt.templateId && isDeepStrictEqual(candidate.rendered, buildLegacyRenderedQuestionSnapshot(q)) ? candidate : undefined);
    const submitted = answers[qId];
    const isDeterministicCorrect = checkDeterministicCorrectness(q, submitted);

    let submittedText = "";
    let fileName: string | null = null;
    let fileKey: string | null = null;
    let fileSize: string | null = null;

    if (typeof submitted === "string") {
      submittedText = submitted;
    } else if (submitted && typeof submitted === "object" && !Array.isArray(submitted)) {
      const subObj = submitted as Record<string, unknown>;
      submittedText = typeof subObj.text === "string" ? subObj.text : "";
      fileName = typeof subObj.fileName === "string" ? subObj.fileName : null;
      fileKey = typeof subObj.fileKey === "string" ? subObj.fileKey : null;
      fileSize = typeof subObj.fileSize === "string" ? subObj.fileSize : null;
    } else if (Array.isArray(submitted)) {
      if (qType === "multiple_choice" || qType === "multiple_choices") {
        const opts = Array.isArray(q.options) ? q.options : [];
        submittedText = submitted
          .map((idx) => {
            const option = typeof idx === "number" ? opts[idx] : undefined;
            return typeof option === "string" ? option : `Pilihan ${String(idx)}`;
          })
          .join(", ");
      } else {
        submittedText = submitted.join(", ");
      }
    } else if (typeof submitted === "number") {
      const opts = Array.isArray(q.options) ? q.options : [];
      const option = opts[submitted];
      submittedText = typeof option === "string" ? option : `Pilihan ${submitted}`;
    }

    return {
      index: idx + 1,
      id: qId,
      prompt: q.prompt ?? "",
      questionType: qType,
      options: q.options,
      acceptableAnswers: q.acceptable_answers,
      submittedAnswer: submitted,
      submittedText,
      fileName,
      fileKey,
      fileSize,
      isDeterministicCorrect,
      currentScore: existing?.score !== null && existing?.score !== undefined ? Math.round(existing.score * 100) : null,
      currentStatus: existing?.status ?? (qType === "essay" ? "needs_review" : isDeterministicCorrect ? "correct" : "incorrect"),
      reviewNotes: existing?.reviewNotes ?? "",
      reviewRevision: existing?.reviewRevision ?? 0,
      reviewerId: existing?.reviewerId ?? null,
      isFreeResponse: qType === "essay" || qType === "short_answer",
      isEssay: qType === "essay",
      isShortAnswer: qType === "short_answer",
    };
  });

  await db.transaction(tx => recordAuthorizedStaffAttemptDisclosures(tx, {
    userId: tutorPenggunaId, attemptOwnerId: attempt.studentId, courseId: template.courseId,
    attemptId, questionIds: questions.map(q => q.id), occurredAt: new Date(), requestId: randomUUID(),
  }));

  return {
    attemptId: attempt.id,
    templateId: template.id,
    quizTitle: template.title,
    studentName: attempt.studentName,
    studentEmail: attempt.studentEmail,
    submittedAt: attempt.submittedAt ? normalizeDate(attempt.submittedAt) : normalizeDate(attempt.startedAt),
    gradingStatus: attempt.gradingStatus,
    score: attempt.score,
    questions: questionDetails,
  };
}
