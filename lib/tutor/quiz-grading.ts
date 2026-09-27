import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  studentQuizAttempts,
  quizTemplates,
  jawabanMurid,
  itemAsesmen,
  percobaanAsesmen,
  buktiIdeJawaban,
  soalIde,
  ide,
  user,
  pengguna,
} from "@/db/schema";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { checkCourseMatch } from "@/lib/tutor/assessment-policy";
import { recordTutorMutationAudit } from "@/lib/audit/mutasi";
import {
  LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
  legacyAnswerEvidenceId,
  legacyAnswerId,
  legacyItemId,
  type LegacyQuizQuestionSnapshot,
  buildLegacyRenderedQuestionSnapshot,
} from "@/lib/asesmen/live-idea-evidence";
import { requestIdeaMasteryRecompute } from "@/lib/pemahaman/evidence";
import { answerToStableOptionIds, gradeStableOptionAnswer } from "@/lib/asesmen/attempt";
import { normalizeDate } from "@/lib/date-utils";
import { isShortAnswerCorrect } from "@/lib/quiz/short-answer";

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

function safeResponseSnapshot(
  question: LegacyQuizQuestionSnapshot,
  answer: unknown,
): Record<string, unknown> {
  const stableOptionIds = question.stable_option_ids ?? [];
  let mappedStableOptionIds: string[] = [];

  if (stableOptionIds.length > 0) {
    try {
      mappedStableOptionIds = answerToStableOptionIds(stableOptionIds, answer);
    } catch {
      mappedStableOptionIds = [];
    }
  }

  return {
    value: answer ?? null,
    stableOptionIds: mappedStableOptionIds,
  };
}

/**
 * Evaluates if a submitted answer is deterministically correct for supported question types.
 */
export function checkDeterministicCorrectness(q: LegacyQuizQuestionSnapshot, submitted: unknown): boolean {
  const qType = q.question_type || q.questionType;
  if (qType === "short_answer" || (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0)) {
    return isShortAnswerCorrect(submitted, q.acceptable_answers);
  }
  if (qType === "essay") {
    return false;
  }
  const indices = Array.isArray(submitted)
    ? submitted
    : typeof submitted === "number"
    ? [submitted]
    : [];
  const correct = Array.isArray(q.correct_indices) ? q.correct_indices : [];
  if (correct.length === 0) return false;
  const isMultiple = qType === "multiple_choices" || correct.length > 1;
  if (Array.isArray(q.stable_option_ids)) {
    return gradeStableOptionAnswer({
      stableOptionIds: q.stable_option_ids,
      correctIndices: correct,
      submitted,
      questionType: isMultiple ? "multiple_choices" : qType,
    });
  }
  if (!isMultiple && (qType === "multiple_choice" || !qType)) {
    const firstIdx = indices[0];
    return firstIdx !== undefined && correct.includes(firstIdx);
  }
  return indices.length === correct.length && indices.every((i: number) => correct.includes(i));
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

  const affectedIdeaIds = new Set<string>();
  const now = new Date();
  let finalCalculatedScore: number | null = null;
  let nextGradingStatus: "pending" | "graded" = "pending";

  await db.transaction(async (tx) => {
    // 5. Fetch current canonical jawabanMurid for this attempt to verify CAS
    const existingAnswers = await tx
      .select({
        id: jawabanMurid.id,
        itemAsesmenId: jawabanMurid.itemAsesmenId,
        score: jawabanMurid.score,
        status: jawabanMurid.status,
        reviewRevision: jawabanMurid.reviewRevision,
      })
      .from(jawabanMurid)
      .where(eq(jawabanMurid.percobaanAsesmenId, attemptId));

    // Ensure student pengguna exists
    await tx.insert(pengguna).values({
      id: attempt.studentId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    // Ensure percobaanAsesmen exists for this attempt
    await tx.insert(percobaanAsesmen).values({
      id: attemptId,
      asesmenId: attempt.templateId,
      penggunaId: attempt.studentId,
      status: "submitted",
      renderedQuestionSnapshot: (attempt.questionsSnapshot ?? {}) as Record<string, unknown>,
      optionOrderSnapshot: {},
      gradingPolicySnapshot: { source: "legacy" },
      contentVersion: 1,
      startedAt: normalizeDate(attempt.startedAt),
      submittedAt: normalizeDate(attempt.submittedAt ?? attempt.startedAt),
    }).onConflictDoNothing();

    const existingAnswerMap = new Map(existingAnswers.map((a) => [a.id, a]));

    // 6. Ensure itemAsesmen and jawabanMurid rows exist, and apply updates with CAS
    for (const question of questions) {
      const qId = question.id;
      const itemId = legacyItemId(attempt.templateId, qId);
      const answerId = legacyAnswerId(attemptId, qId);
      const qType = question.question_type || question.questionType;
      const submittedAnswer = answers[qId];
      const deterministicCorrect = checkDeterministicCorrectness(question, submittedAnswer);

      // Ensure itemAsesmen row exists
      await tx.insert(itemAsesmen).values({
        id: itemId,
        asesmenId: attempt.templateId,
        soalId: qId,
        orderIndex: questions.findIndex((q) => q.id === qId),
        renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question),
        optionOrderSnapshot: question.stable_option_ids ?? [],
        gradingPolicySnapshot: { questionType: qType },
        contentVersion: 1,
        generationHash: `legacy-review:${attempt.templateId}:${qId}`,
      }).onConflictDoNothing();

      // Ensure jawabanMurid row exists
      const existing = existingAnswerMap.get(answerId);
      if (!existing) {
        const initialScore = qType === "essay" ? null : deterministicCorrect ? 1 : 0;
        const initialStatus = qType === "essay" ? "needs_review" : deterministicCorrect ? "correct" : "incorrect";
        await tx.insert(jawabanMurid).values({
          id: answerId,
          percobaanAsesmenId: attemptId,
          itemAsesmenId: itemId,
          renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question),
          optionOrderSnapshot: question.stable_option_ids ?? [],
          responseSnapshot: safeResponseSnapshot(question, submittedAnswer),
          gradingPolicySnapshot: { questionType: qType },
          contentVersion: 1,
          score: initialScore,
          status: initialStatus,
          reviewRevision: 0,
          answeredAt: normalizeDate(attempt.submittedAt ?? attempt.startedAt),
        }).onConflictDoNothing();
      }

      // If this item is being graded now:
      const gradeItem = itemsMap.get(qId);
      if (gradeItem) {
        // CAS check
        const currentRevision = existing ? existing.reviewRevision : 0;
        if (gradeItem.expectedRevision !== currentRevision) {
          throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
        }

        const normalizedScore = gradeItem.score / 100;
        const newStatus = gradeItem.score === 100 ? "correct" : gradeItem.score === 0 ? "incorrect" : "partial";
        const nextRevision = currentRevision + 1;

        const updatedRows = await tx
          .update(jawabanMurid)
          .set({
            score: normalizedScore,
            status: newStatus,
            reviewerId: tutorPenggunaId,
            reviewNotes: gradeItem.reviewNotes?.trim() || null,
            reviewedAt: now,
            reviewRevision: nextRevision,
          })
          .where(
            and(
              eq(jawabanMurid.id, answerId),
              eq(jawabanMurid.reviewRevision, gradeItem.expectedRevision),
            ),
          )
          .returning({ id: jawabanMurid.id });

        if (updatedRows.length === 0) {
          throw new Error(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);
        }

        // Check canonical Idea mapping for this question
        const ideaLinks = await tx
          .select({
            ideaId: soalIde.ideId,
            weight: soalIde.weight,
            ideaStatus: ide.status,
          })
          .from(soalIde)
          .innerJoin(ide, eq(soalIde.ideId, ide.id))
          .where(eq(soalIde.soalId, qId));

        if (ideaLinks.length > 0 && ideaLinks.every((l) => l.ideaStatus === "published")) {
          for (const link of ideaLinks) {
            affectedIdeaIds.add(link.ideaId);
            const evidenceId = legacyAnswerEvidenceId(answerId, link.ideaId);

            const [existingEvidence] = await tx
              .select({ id: buktiIdeJawaban.id })
              .from(buktiIdeJawaban)
              .where(
                and(
                  eq(buktiIdeJawaban.jawabanMuridId, answerId),
                  eq(buktiIdeJawaban.ideId, link.ideaId),
                ),
              )
              .limit(1);

            if (existingEvidence) {
              await tx
                .update(buktiIdeJawaban)
                .set({
                  scoreContribution: normalizedScore,
                  derivationStatus: "reviewed",
                  ambiguous: false,
                  affectsMastery: true,
                  confidence: 100,
                  evidenceSource: "tutor_rubric",
                })
                .where(eq(buktiIdeJawaban.id, existingEvidence.id));
            } else {
              await tx.insert(buktiIdeJawaban).values({
                id: evidenceId,
                jawabanMuridId: answerId,
                ideId: link.ideaId,
                scoreContribution: normalizedScore,
                weight: link.weight,
                confidence: 100,
                evidenceSource: "tutor_rubric",
                rubricVersion: LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
                derivationStatus: "reviewed",
                ambiguous: false,
                affectsMastery: true,
                createdAt: now,
              }).onConflictDoNothing();
            }
          }
        }
      }
    }

    // 7. Check if all essay questions have been reviewed
    // Reload answers state from DB
    const refreshedAnswers = await tx
      .select({
        id: jawabanMurid.id,
        score: jawabanMurid.score,
        status: jawabanMurid.status,
      })
      .from(jawabanMurid)
      .where(eq(jawabanMurid.percobaanAsesmenId, attemptId));

    const refreshedAnswerMap = new Map(refreshedAnswers.map((a) => [a.id, a]));

    const essayQuestions = questions.filter((q) => (q.question_type || q.questionType) === "essay");
    const allEssaysReviewed = essayQuestions.every((q) => {
      const answerId = legacyAnswerId(attemptId, q.id);
      const ans = refreshedAnswerMap.get(answerId);
      return ans && ans.score !== null && ans.status !== "needs_review";
    });

    if (allEssaysReviewed) {
      // Finalize attempt
      nextGradingStatus = "graded";
      let totalNormalizedScore = 0;

      for (const question of questions) {
        const qId = question.id;
        const qType = question.question_type || question.questionType;
        const answerId = legacyAnswerId(attemptId, qId);
        const ans = refreshedAnswerMap.get(answerId);

        if (qType === "essay") {
          totalNormalizedScore += ans?.score ?? 0;
        } else if (qType === "short_answer") {
          // If manually reviewed, use ans.score; otherwise deterministic
          if (ans && ans.score !== null && ans.status !== "needs_review") {
            totalNormalizedScore += ans.score;
          } else {
            const isCorrect = checkDeterministicCorrectness(question, answers[qId]);
            totalNormalizedScore += isCorrect ? 1 : 0;
          }
        } else {
          const isCorrect = checkDeterministicCorrectness(question, answers[qId]);
          totalNormalizedScore += isCorrect ? 1 : 0;
        }
      }

      finalCalculatedScore = questions.length > 0
        ? Math.round((totalNormalizedScore / questions.length) * 100)
        : 0;

      await tx
        .update(studentQuizAttempts)
        .set({
          gradingStatus: "graded",
          score: finalCalculatedScore,
        })
        .where(eq(studentQuizAttempts.id, attemptId));

      await tx
        .update(percobaanAsesmen)
        .set({
          status: "graded",
        })
        .where(eq(percobaanAsesmen.id, attemptId));
    } else {
      // Partial save: keep pending and score null
      nextGradingStatus = "pending";
      finalCalculatedScore = null;

      await tx
        .update(studentQuizAttempts)
        .set({
          gradingStatus: "pending",
          score: null,
        })
        .where(eq(studentQuizAttempts.id, attemptId));
    }

    // 8. Record sanitized mutation audit
    await recordTutorMutationAudit(
      {
        actorId: tutorPenggunaId,
        actorRoles: tutorRoles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_attempt",
        entityId: attemptId,
        entityVersion: 1,
        requestId: `req-grade-${attemptId}-${randomUUID()}`,
        action: "quiz_attempt:grade",
        outcome: "success",
        reason: allEssaysReviewed ? "Quiz attempt graded and finalized" : "Quiz attempt partially graded",
        before: {
          attemptId,
          gradingStatus: attempt.gradingStatus,
          score: attempt.score,
        },
        after: {
          attemptId,
          gradingStatus: nextGradingStatus,
          score: finalCalculatedScore,
          reviewedCount: items.length,
        },
      },
      tx,
    );
  });

  // 9. After commit: trigger per-Idea mastery recomputation for affected ideas
  if (affectedIdeaIds.size > 0) {
    await Promise.all(
      [...affectedIdeaIds].map((ideaId) =>
        requestIdeaMasteryRecompute({
          penggunaId: attempt.studentId,
          ideId: ideaId,
          evidenceId: `${attemptId}:${ideaId}`,
        }),
      ),
    );
  }

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
          itemAsesmenId: jawabanMurid.itemAsesmenId,
          score: jawabanMurid.score,
          status: jawabanMurid.status,
        })
        .from(jawabanMurid)
        .where(inArray(jawabanMurid.percobaanAsesmenId, attemptIds))
    : [];

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
    const answerMap = new Map(attemptAnswers.map((a) => [a.itemAsesmenId, a]));

    const remainingEssayCount = essayQuestions.filter((q) => {
      const itemId = legacyItemId(r.templateId, q.id);
      const ans = answerMap.get(itemId);
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

  const canonicalAnswers = await db
    .select({
      id: jawabanMurid.id,
      itemAsesmenId: jawabanMurid.itemAsesmenId,
      score: jawabanMurid.score,
      status: jawabanMurid.status,
      reviewerId: jawabanMurid.reviewerId,
      reviewNotes: jawabanMurid.reviewNotes,
      reviewedAt: jawabanMurid.reviewedAt,
      reviewRevision: jawabanMurid.reviewRevision,
    })
    .from(jawabanMurid)
    .where(eq(jawabanMurid.percobaanAsesmenId, attemptId));

  const canonicalMap = new Map(canonicalAnswers.map((a) => [a.id, a]));

  const questionDetails = questions.map((q, idx) => {
    const qId = q.id;
    const qType = q.question_type || q.questionType || "multiple_choice";
    const answerId = legacyAnswerId(attemptId, qId);
    const existing = canonicalMap.get(answerId);
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
