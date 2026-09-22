/**
 * POST /api/quiz/attempts/[id]/submit ; Submit answers and grade the attempt
 * GET /api/quiz/attempts/[id] ; Get attempt details (student's own)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { studentQuizAttempts, aiQuestionBank, quizTemplates, knowledgeObjects, attemptFeedback, soal, soalIde, ide, itemAsesmen, jawabanMurid, buktiIdeJawaban } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recordLearningEvents } from '@/lib/learning-events';
import { inngest } from '@/lib/inngest';
import { markRecommendationDone, buildPlanForConcepts } from '@/lib/recommendation-service';
import { recordQuestionOptionStats } from '@/lib/option-stats';
import { buildRemediation } from '@/lib/remediation';
import { PKA_COURSE_ID } from '@/lib/pka-config';
import { normalizeDate } from '@/lib/date-utils';
import { serializeStudentQuizAttempt } from '@/lib/assessment-serialization';
import { dualWriteQuizAttempt } from '@/lib/migrasi/repository-kompatibilitas';
import { gradeStableOptionAnswer } from '@/lib/asesmen/attempt';
import { quizAttachmentPrefix } from '@/lib/storage/keys';
import { isShortAnswerCorrect } from '@/lib/quiz/short-answer';
import {
  buildLegacyGradingPolicySnapshot,
  buildLegacyRenderedQuestionSnapshot,
  buildLegacyResponseSnapshot,
  deriveLegacyAnswerEvidence,
  isCanonicalIdeaEvidenceEnabled,
  legacyAnswerEvidenceId,
  legacyAnswerId,
  legacyItemId,
  mapLegacyQuizSnapshotToCanonicalIdeas,
  type CanonicalQuestionForLegacyEvidence,
  type LegacyQuizQuestionSnapshot,
} from '@/lib/asesmen/live-idea-evidence';
import { requestIdeaMasteryRecompute } from '@/lib/pemahaman/evidence';

type Context = { params: Promise<{ id: string }> };

async function loadCanonicalQuestionsForEvidence(questionIds: readonly string[]): Promise<CanonicalQuestionForLegacyEvidence[]> {
  if (questionIds.length === 0) return [];
  const [questionRows, linkRows] = await Promise.all([
    db
      .select({
        id: soal.id,
        status: soal.status,
        version: soal.version,
        questionType: soal.questionType,
        generationHash: soal.generationHash,
      })
      .from(soal)
      .where(inArray(soal.id, [...new Set(questionIds)])),
    db
      .select({
        questionId: soalIde.soalId,
        ideaId: soalIde.ideId,
        weight: soalIde.weight,
        role: soalIde.role,
        ideaStatus: ide.status,
        ideaVersion: ide.version,
      })
      .from(soalIde)
      .innerJoin(ide, eq(soalIde.ideId, ide.id))
      .where(inArray(soalIde.soalId, [...new Set(questionIds)])),
  ]);
  const linksByQuestion = new Map<string, CanonicalQuestionForLegacyEvidence['ideaLinks'][number][]>();
  const orderedLinkRows = [...linkRows].sort(
    (left, right) => left.questionId.localeCompare(right.questionId) || left.ideaId.localeCompare(right.ideaId),
  );
  for (const row of orderedLinkRows) {
    const links = linksByQuestion.get(row.questionId) ?? [];
    links.push({
      ideaId: row.ideaId,
      weight: row.weight,
      role: row.role,
      ideaStatus: row.ideaStatus,
      ideaVersion: row.ideaVersion,
    });
    linksByQuestion.set(row.questionId, links);
  }
  return questionRows.map((row) => ({
    id: row.id,
    status: row.status,
    version: row.version,
    questionType: row.questionType,
    generationHash: row.generationHash,
    ideaLinks: linksByQuestion.get(row.id) ?? [],
  }));
}

export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [attempt] = await db
  .select()
  .from(studentQuizAttempts)
  .where(
  and(
  eq(studentQuizAttempts.id, id),
  eq(studentQuizAttempts.studentId, session.user.id),
  ),
  )
  .limit(1);

  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const feedbackRows = await db
  .select()
  .from(attemptFeedback)
  .where(eq(attemptFeedback.attemptId, id));

  // E2: deterministic remediation (mastery delta + root cause + misconceptions)
  let remediation = null;
  if (attempt.status === "completed") {
    const [tpl] = await db
      .select({ courseId: quizTemplates.courseId })
      .from(quizTemplates)
      .where(eq(quizTemplates.id, attempt.templateId))
      .limit(1);
    if (tpl?.courseId) {
      remediation = await buildRemediation(
        {
          id: attempt.id,
          studentId: attempt.studentId,
          masteryBefore: attempt.masteryBefore as Record<string, number> | null,
          weakAreas: attempt.weakAreas as string[] | null,
        },
        tpl.courseId,
      ).catch((err) => {
        console.error("buildRemediation failed:", err);
        return null;
      });
    }
  }

  const rawPayload = {
    ...attempt,
    feedback: feedbackRows,
    remediation,
  };

  return NextResponse.json(serializeStudentQuizAttempt(rawPayload));
}

const AnswerValueSchema = z.union([
  z.number(),
  z.string(),
  z.array(z.number()),
  z.array(z.string()),
  z.object({
    text: z.string().optional().default(""),
    fileName: z.string().nullable().optional(),
    fileSize: z.string().optional(),
    fileKey: z.string().nullable().optional(),
  }),
]);

const SubmitSchema = z.object({
  answers: z.record(
    z.string(),
    AnswerValueSchema
  ),
  durationSeconds: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest, { params }: Context) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await params;

 const [attempt] = await db
 .select()
 .from(studentQuizAttempts)
 .where(
 and(
 eq(studentQuizAttempts.id, id),
 eq(studentQuizAttempts.studentId, session.user.id),
 eq(studentQuizAttempts.status, 'in_progress'),
 ),
 )
 .limit(1);

  if (!attempt) {
  return NextResponse.json({ error: 'Attempt not found or already submitted' }, { status: 404 });
  }

  const [templateMeta] = await db
    .select({ timeLimitSeconds: quizTemplates.timeLimitSeconds })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  if (templateMeta?.timeLimitSeconds != null) {
    const startedMs = normalizeDate(attempt.startedAt).getTime();
    const expiryGraceSeconds = 120;
    const expiresAtMs = startedMs + (templateMeta.timeLimitSeconds + expiryGraceSeconds) * 1000;
    if (Date.now() > expiresAtMs) {
      return NextResponse.json(
        {
          error: 'Waktu pengerjaan kuis telah berakhir. Jawaban tidak dapat dikumpulkan.',
          code: 'QUIZ_TIME_EXPIRED',
        },
        { status: 403 },
      );
    }
  }

 const body = await req.json();
 const parsed = SubmitSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

  const { answers, durationSeconds } = parsed.data;

  // Validate that any attached fileKey belongs to this quiz template and was registered by this attempt
  const expectedAttachmentPrefix = quizAttachmentPrefix(attempt.templateId);
  const currentSnap = (attempt.answersSnapshot as Record<string, any>) || {};
  const registeredAttachments = (currentSnap._attachments as Record<string, any>) || {};

  for (const [qId, ansVal] of Object.entries(answers)) {
    if (ansVal && typeof ansVal === "object" && !Array.isArray(ansVal) && "fileKey" in ansVal) {
      const fileKey = (ansVal as { fileKey?: unknown }).fileKey;
      if (typeof fileKey === "string" && fileKey.trim().length > 0) {
        if (!fileKey.startsWith(expectedAttachmentPrefix) || !registeredAttachments[fileKey]) {
          return NextResponse.json(
            { error: `Kunci berkas lampiran tidak valid untuk soal ${qId}.` },
            { status: 400 },
          );
        }
      }
    }
  }

  const snapshot = attempt.questionsSnapshot as LegacyQuizQuestionSnapshot[];

  /**
   * Evaluates if a submitted answer is deterministically correct for supported question types.
   */
  function checkAnswerCorrectness(q: any, submitted: any): boolean {
    const qType = q.question_type || q.questionType;
    if (qType === "short_answer" || (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0)) {
      return isShortAnswerCorrect(submitted, q.acceptable_answers);
    }
    if (qType === "essay") {
      return false;
    }
    const indices = Array.isArray(submitted) ? submitted : [];
    const correct = Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [];
    if (correct.length === 0) return false;
    if (Array.isArray(q.stable_option_ids)) {
      return gradeStableOptionAnswer({
        stableOptionIds: q.stable_option_ids,
        correctIndices: correct,
        submitted,
        questionType: qType,
      });
    }
    if (qType === "multiple_choice") {
      const firstIdx = indices[0];
      return firstIdx !== undefined && correct.includes(firstIdx);
    }
    return indices.length === correct.length && indices.every((i: number) => correct.includes(i));
  }

  // Auto-grade
  let correct = 0;
  for (const q of snapshot) {
    const submitted = answers[q.id];
    if (checkAnswerCorrectness(q, submitted)) correct++;
  }

  const hasEssay = snapshot.some((q) => {
    const qType = q.question_type || q.questionType;
    return qType === "essay";
  });
  const gradingStatus = hasEssay ? "pending" : "not_required";
  const score = hasEssay ? null : (snapshot.length > 0 ? Math.round((correct / snapshot.length) * 100) : 0);

  // Increment use counts + collect KO data for learning events
  const questionIds = snapshot.map((q) => q.id);
  const questionKoMap: Map<string, { koId: string; conceptName: string | null }> = new Map();
  if (questionIds.length > 0) {
    const [, bankRows] = await Promise.all([
      db
        .update(aiQuestionBank)
        .set({ useCount: sql`${aiQuestionBank.useCount} + 1` })
        .where(inArray(aiQuestionBank.id, questionIds)),
      db
        .select({
          id: aiQuestionBank.id,
          koId: aiQuestionBank.knowledgeObjectId,
          conceptName: knowledgeObjects.conceptName,
        })
        .from(aiQuestionBank)
        .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
        .where(inArray(aiQuestionBank.id, questionIds)),
    ]);
    for (const row of bankRows) {
      if (row.koId) {
        questionKoMap.set(row.id, { koId: row.koId, conceptName: row.conceptName ?? null });
      }
    }
  }

  // Group questions by conceptName and compute strong/weak areas
  const conceptResults: Record<string, { total: number; correct: number }> = {};
  for (const q of snapshot) {
    const ko = questionKoMap.get(q.id);
    if (!ko || !ko.conceptName) continue;
    const conceptName = ko.conceptName.trim();
    if (!conceptResults[conceptName]) {
      conceptResults[conceptName] = { total: 0, correct: 0 };
    }
    const submitted = answers[q.id];
    const isCorrect = checkAnswerCorrectness(q, submitted);
    conceptResults[conceptName].total++;
    if (isCorrect) conceptResults[conceptName].correct++;
  }

 const strongAreas: string[] = [];
 const weakAreas: string[] = [];
 for (const [conceptName, res] of Object.entries(conceptResults)) {
 if (res.correct === res.total) {
 strongAreas.push(conceptName);
 } else {
 weakAreas.push(conceptName);
 }
 }

 // Get courseId via template
 const [template] = await db
 .select({ courseId: quizTemplates.courseId })
 .from(quizTemplates)
 .where(eq(quizTemplates.id, attempt.templateId))
 .limit(1);

  const courseId = template?.courseId || "calc-1";

  const canonicalEvidenceEnabled = isCanonicalIdeaEvidenceEnabled();
  let canonicalEvidencePlan: ReturnType<typeof mapLegacyQuizSnapshotToCanonicalIdeas> | null = null;
  if (canonicalEvidenceEnabled) {
    try {
      const canonicalQuestions = await loadCanonicalQuestionsForEvidence(snapshot.map((question) => question.id));
      canonicalEvidencePlan = mapLegacyQuizSnapshotToCanonicalIdeas({ questions: snapshot, canonicalQuestions });
      if (canonicalEvidencePlan.status === "blocked") {
        console.warn("Canonical Idea evidence skipped for legacy quiz attempt", { attemptId: id, issues: canonicalEvidencePlan.issues });
      }
    } catch (error) {
      console.error("Canonical Idea evidence lookup failed; preserving legacy quiz submission", error);
    }
  }

  const canonicalEvidenceIdeaIds = new Set<string>();

  // Build recommended next steps
 const nextSteps = weakAreas.length > 0
 ? await buildPlanForConcepts(attempt.studentId, courseId, weakAreas)
 : [];

  const now = new Date();
  const startedMs = normalizeDate(attempt.startedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedMs) / 1000));
  const finalDurationSeconds = durationSeconds !== undefined ? Math.min(durationSeconds, elapsedSeconds) : elapsedSeconds;

  await db.transaction(async (tx) => {
    await tx
      .update(studentQuizAttempts)
      .set({
        status: 'completed',
        gradingStatus,
        score,
        durationSeconds: finalDurationSeconds,
        answersSnapshot: {
          ...answers,
          _attachments: registeredAttachments,
        } as unknown as Record<string, unknown>,
        submittedAt: now,
        strongAreas,
        weakAreas,
        recommendedNextSteps: nextSteps,
      })
      .where(eq(studentQuizAttempts.id, id));
    await dualWriteQuizAttempt(tx, {
      id,
      templateId: attempt.templateId,
      studentId: attempt.studentId,
      status: 'completed',
      questionsSnapshot: snapshot,
      answersSnapshot: {
        ...answers,
        _attachments: registeredAttachments,
      },
      startedAt: normalizeDate(attempt.startedAt),
      submittedAt: now,
    }, attempt.studentId);

    if (canonicalEvidencePlan?.status === "mapped") {
      const questionById = new Map(snapshot.map((question) => [question.id, question]));
      for (const mapping of canonicalEvidencePlan.mappings) {
        const question = questionById.get(mapping.questionId);
        if (!question) continue;
        const itemId = legacyItemId(attempt.templateId, question.id);
        const answerId = legacyAnswerId(id, question.id);
        const submitted = answers[question.id];
        const isCorrect = checkAnswerCorrectness(question, submitted);
        const derived = deriveLegacyAnswerEvidence({ question, mapping, isCorrect });
        const questionType = mapping.questionType;
        const isEssay = questionType === "essay";

        await tx.insert(itemAsesmen).values({
          id: itemId,
          asesmenId: attempt.templateId,
          soalId: mapping.questionId,
          orderIndex: snapshot.findIndex((candidate) => candidate.id === question.id),
          renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question),
          optionOrderSnapshot: question.stable_option_ids ?? [],
          gradingPolicySnapshot: buildLegacyGradingPolicySnapshot(question, mapping),
          contentVersion: mapping.questionVersion,
          generationHash: mapping.generationHash,
        }).onConflictDoNothing();

        await tx.insert(jawabanMurid).values({
          id: answerId,
          percobaanAsesmenId: id,
          itemAsesmenId: itemId,
          renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question),
          optionOrderSnapshot: question.stable_option_ids ?? [],
          responseSnapshot: buildLegacyResponseSnapshot(question, submitted),
          gradingPolicySnapshot: buildLegacyGradingPolicySnapshot(question, mapping),
          contentVersion: mapping.questionVersion,
          score: isEssay ? null : isCorrect ? 1 : 0,
          status: isEssay ? "needs_review" : isCorrect ? "correct" : "incorrect",
          reviewRevision: 0,
          answeredAt: now,
        }).onConflictDoNothing();

        if (derived.status !== "derived") continue;
        for (const contribution of derived.contributions) {
          canonicalEvidenceIdeaIds.add(contribution.ideaId);
          await tx.insert(buktiIdeJawaban).values({
            id: legacyAnswerEvidenceId(answerId, contribution.ideaId),
            jawabanMuridId: answerId,
            ideId: contribution.ideaId,
            scoreContribution: contribution.scoreContribution,
            weight: contribution.weight,
            confidence: contribution.confidence,
            evidenceSource: contribution.evidenceSource,
            rubricVersion: contribution.rubricVersion,
            derivationStatus: contribution.derivationStatus,
            ambiguous: contribution.ambiguous,
            affectsMastery: contribution.affectsMastery,
          }).onConflictDoNothing();
        }
      }
    }
  });

  if (canonicalEvidenceIdeaIds.size > 0) {
    await Promise.all([...canonicalEvidenceIdeaIds].map((ideaId) => requestIdeaMasteryRecompute({
      penggunaId: attempt.studentId,
      ideId: ideaId,
      evidenceId: `${id}:${ideaId}`,
    })));
  }

  if (template) {
    const events = snapshot.map((q) => {
      const submitted = answers[q.id];
      const isCorrect = checkAnswerCorrectness(q, submitted);
      const ko = questionKoMap.get(q.id);
      return {
        studentId: attempt.studentId,
        courseId: template.courseId,
        eventType: 'quiz_answer' as const,
        koId: ko?.koId ?? null,
        conceptName: ko?.conceptName ?? null,
        correctness: isCorrect ? 1 : 0,
      };
    });

  const recomputePromise = inngest
    .send({
      name: "mastery/recompute.requested",
      data: { studentId: attempt.studentId, courseId: template.courseId },
    })
    .catch((err) => {
      console.error("Failed to trigger mastery recompute:", err);
    });

  await Promise.all([
    recordLearningEvents(events),
    recomputePromise,
  ]);
  }

  // E1: aggregate distractor analytics (once per attempt, deterministic)
  {
    const answered = snapshot.map((q) => {
      const rawSel = answers[q.id];
      const selectedOptions: number[] = Array.isArray(rawSel)
        ? rawSel.map(Number).filter((n) => !isNaN(n))
        : typeof rawSel === "number"
        ? [rawSel]
        : [];
      return {
        questionId: q.id,
        selectedOptions,
      };
    });
    await recordQuestionOptionStats(courseId, answered).catch((err) => {
      console.error("recordQuestionOptionStats failed:", err);
    });
  }

  // Fire mistake feedback generation background event (skip for PKA course)
  if (template.courseId !== PKA_COURSE_ID) {
    await inngest
      .send({
        name: "quiz/feedback.requested",
        data: { attemptId: id },
      })
      .catch((err) => {
        console.error("Failed to trigger mistake feedback:", err);
      });
  }

  // Fire student quiz analytics & learning diagnosis background worker (all courses, including PKA)
  await inngest
    .send({
      name: "quiz/analytics.requested",
      data: {
        attemptId: id,
        studentId: attempt.studentId,
        courseId,
      },
    })
    .catch((err) => {
      console.error("Failed to trigger student quiz analytics:", err);
    });

  // Auto-complete today's quiz recommendation when student passes
  if (score !== null && score >= 70) {
    markRecommendationDone(attempt.templateId, attempt.studentId).catch(() => {});
  }

  return NextResponse.json({ score, correct, total: snapshot.length, gradingStatus });
}
