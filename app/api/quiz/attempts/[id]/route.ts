/**
 * POST /api/quiz/attempts/[id]/submit ; Submit answers and grade the attempt
 * GET /api/quiz/attempts/[id] ; Get attempt details (student's own)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { lockCanonicalQuestions, lockQuestionExposureUser, lockQuestionExposures, recordAttemptDisclosures } from '@/lib/gamification/question-exposure';
import { lockQuestionBankRows } from '@/lib/question-row-locks';
import { studentQuizAttempts, aiQuestionBank, quizTemplates, knowledgeObjects, attemptFeedback, soal, soalIde, ide } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { recordLearningEvents } from '@/lib/learning-events';
import { inngest } from '@/lib/inngest';
import { markRecommendationDone, buildPlanForConcepts } from '@/lib/recommendation-service';
import { recordQuestionOptionStats } from '@/lib/option-stats';
import { buildRemediation } from '@/lib/remediation';
import { PKA_COURSE_ID } from '@/lib/pka-config';
import { normalizeDate } from '@/lib/date-utils';
import { canViewAttemptDiscussion } from '@/lib/quiz/review-release';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { canAccessStudentQuizTemplate } from '@/lib/quiz/student-access';
import { canAccessQuizSnapshot } from '@/lib/quiz/question-scope';
import { serializeStudentQuizAttempt } from '@/lib/assessment-serialization';
import { dualWriteQuizAttempt } from '@/lib/migrasi/repository-kompatibilitas';
import { checkAnswerCorrectness } from '@/lib/gamification/question-grading';
import { writeQuestionRewards } from '@/lib/gamification/question-writer';
import { quizAttachmentPrefix } from '@/lib/storage/keys';
import {
  canonicalEvidenceValidMappings,
  isCanonicalIdeaEvidenceEnabled,
  mapLegacyQuizSnapshotToCanonicalIdeas,
  type CanonicalQuestionForLegacyEvidence,
  type LegacyQuizQuestionSnapshot,
} from '@/lib/asesmen/live-idea-evidence';
import { requestIdeaMasteryRecompute } from '@/lib/pemahaman/evidence';
import { writeLegacyIdeaEvidence } from '@/lib/asesmen/write-legacy-idea-evidence';

type Context = { params: Promise<{ id: string }> };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadCanonicalQuestionsForEvidence(executor: typeof db | Tx, questionIds: readonly string[], lockIdeas = false): Promise<CanonicalQuestionForLegacyEvidence[]> {
  if (questionIds.length === 0) return [];
  const ids = [...new Set(questionIds)];
  if (lockIdeas) {
    const links = await executor.select({ id: soalIde.ideId }).from(soalIde).where(inArray(soalIde.soalId, ids));
    const ideaIds = [...new Set(links.map(link => link.id))].sort();
    if (ideaIds.length) await executor.select({ id: ide.id }).from(ide).where(inArray(ide.id, ideaIds)).orderBy(asc(ide.id)).for('share');
  }
  const questionRows = await executor
      .select({
        id: soal.id,
        status: soal.status,
        version: soal.version,
        questionType: soal.questionType,
        generationHash: soal.generationHash,
      })
      .from(soal)
      .where(inArray(soal.id, ids));
  const linkRows = await executor
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
      .where(inArray(soalIde.soalId, ids));
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

  const [template] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, attempt.templateId)).limit(1);
  const access = template && await resolveCourseAccess({ courseId: template.courseId, userId: session.user.id });
  if (!template || !access || !canAccessStudentQuizTemplate(access, template) || !await canAccessQuizSnapshot(access, attempt.questionsSnapshot)) return NextResponse.json({ error: "Akses kuis tidak tersedia." }, { status: 403 });
  const released = canViewAttemptDiscussion(template, attempt.status);
  const feedbackRows = released
    ? await db.select().from(attemptFeedback).where(eq(attemptFeedback.attemptId, id))
    : [];

  let remediation = null;
  if (released && template?.courseId) {
    remediation = await buildRemediation({
      id: attempt.id,
      studentId: attempt.studentId,
      masteryBefore: attempt.masteryBefore as Record<string, number> | null,
      weakAreas: attempt.weakAreas as string[] | null,
    }, template.courseId).catch(() => null);
  }

  const rawPayload = {
    ...attempt,
    feedback: feedbackRows,
    remediation,
  };

  const payload = serializeStudentQuizAttempt(rawPayload, { releaseState: released ? 'released' : 'hidden' });
  if (released) {
    const questionIds = Array.isArray(payload.questionsSnapshot) ? payload.questionsSnapshot.flatMap(q => q && typeof q === 'object' && typeof q.id === 'string' ? [q.id] : []) : [];
    try {
      await db.transaction(tx => recordAttemptDisclosures(tx, { userId: session.user.id, attemptId: id, questionIds, occurredAt: new Date(), requestId: crypto.randomUUID() }));
    } catch {
      return NextResponse.json({ error: 'Pembahasan belum tersedia. Coba lagi.' }, { status: 503 });
    }
  }
  return NextResponse.json(payload);
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
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);
  const access = templateMeta && await resolveCourseAccess({ courseId: templateMeta.courseId, userId: session.user.id });
  if (!templateMeta || !access || !canAccessStudentQuizTemplate(access, templateMeta) || !await canAccessQuizSnapshot(access, attempt.questionsSnapshot)) return NextResponse.json({ error: "Akses kuis tidak tersedia." }, { status: 403 });

 const body = await req.json();
 const parsed = SubmitSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

  const { answers } = parsed.data;

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
    const bankRows = await db
        .select({
          id: aiQuestionBank.id,
          koId: aiQuestionBank.knowledgeObjectId,
          conceptName: knowledgeObjects.conceptName,
        })
        .from(aiQuestionBank)
        .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
        .where(inArray(aiQuestionBank.id, questionIds));
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
      const canonicalQuestions = await loadCanonicalQuestionsForEvidence(db, questionIds);
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

  const submitted = await db.transaction(async (tx) => {
    await lockQuestionExposureUser(tx, session.user.id);
    const [locked] = await tx.select().from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, id), eq(studentQuizAttempts.studentId, session.user.id))).for('update');
    if (!locked || locked.status !== 'in_progress') return false;
    if (JSON.stringify(locked.questionsSnapshot) !== JSON.stringify(attempt.questionsSnapshot) || JSON.stringify(locked.answersSnapshot) !== JSON.stringify(attempt.answersSnapshot)) return false;
    await lockQuestionExposures(tx, session.user.id, snapshot.map(q => q.id));
    const lockedCanonical = await lockCanonicalQuestions(tx, questionIds);
    const heldCanonical = { ids: questionIds, rows: lockedCanonical };
    let validMappings: ReturnType<typeof canonicalEvidenceValidMappings> = [];
    // A plan built before the transaction is only a candidate. Rebuild it while
    // the canonical and linked Idea rows are held, and reject any version drift.
    if (canonicalEvidencePlan) {
      const current = mapLegacyQuizSnapshotToCanonicalIdeas({ questions: snapshot, canonicalQuestions: await loadCanonicalQuestionsForEvidence(tx, lockedCanonical.map(row => row.id), true) });
      validMappings = canonicalEvidenceValidMappings({ initial: canonicalEvidencePlan, current, questions: snapshot, canonicalRows: lockedCanonical });
    }
    await lockQuestionBankRows(tx, questionIds);
    if (questionIds.length) await tx.update(aiQuestionBank).set({ useCount: sql`${aiQuestionBank.useCount} + 1` }).where(inArray(aiQuestionBank.id, questionIds));
    const now = new Date();
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - normalizeDate(attempt.startedAt).getTime()) / 1000));
    const finalDurationSeconds = templateMeta.timeLimitSeconds != null ? Math.min(elapsedSeconds, templateMeta.timeLimitSeconds) : elapsedSeconds;
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
    await writeQuestionRewards(tx, { userId: session.user.id, attemptId: id, snapshot, answers, occurredAt: now, heldCanonical });
    // The returned score and correct count can reveal answers through repeated attempts.
    await recordAttemptDisclosures(tx, { userId: session.user.id, attemptId: id, questionIds, occurredAt: now, requestId: 'submission-result', heldCanonical });
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
    }, attempt.studentId, { heldCanonicalRows: lockedCanonical });

    const evidenceIdeas = await writeLegacyIdeaEvidence(tx, { assessmentId: attempt.templateId, attemptId: id, snapshot, answers, mappings: validMappings, canonicalRows: lockedCanonical, now });
    evidenceIdeas.forEach(ideaId => canonicalEvidenceIdeaIds.add(ideaId));
    return true;
  });
  if (!submitted) return NextResponse.json({ error: 'Attempt not found or already submitted' }, { status: 404 });

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
        // The transaction already handled canonical Idea evidence against held versions.
        canonicalIdeaEvidenceHandled: true,
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
