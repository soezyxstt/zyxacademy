/**
 * POST /api/quiz/attempts ; Start a new quiz attempt from a template
 * GET /api/quiz/attempts ; List this student's completed attempts
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import { quizTemplates, aiQuestionBank, studentQuizAttempts, knowledgeObjects, studentConceptMastery } from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { and, or, eq, inArray, sql, desc, notInArray } from 'drizzle-orm';
import { getAdaptiveDifficultyProportions } from '@/lib/adaptive-quiz';
import { serializeStudentQuizAttemptList } from '@/lib/assessment-serialization';
import { dualWriteQuizAttempt } from '@/lib/migrasi/repository-kompatibilitas';
import { buildStableOptionIds } from '@/lib/asesmen/attempt';
import { questionProvenanceSnapshot } from '@/lib/asesmen/question-provenance';

const StartSchema = z.object({
 templateId: z.string().min(1),
});

export async function POST(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await req.json();
 const parsed = StartSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

  const { templateId } = parsed.data;
  const studentId = session.user.id;
  const assessmentV2Enabled = true;

 const [template] = await db
 .select()
 .from(quizTemplates)
 .where(eq(quizTemplates.id, templateId))
 .limit(1);

 if (!template) {
 return NextResponse.json({ error: 'Template not found' }, { status: 404 });
 }

  const role = (session.user as { role?: string | null }).role;
  const isStaff =
    (await hasAnyPeran(session.user.id, ['admin', 'tutor'], { allowAdmin: true })) ||
    role === 'admin' ||
    role === 'teacher';
  if (template.status === 'draft' && !isStaff) {
    return NextResponse.json({ error: 'Template kuis belum dipublikasi.' }, { status: 403 });
  }

 const now = new Date();
 if (template.manualStatus === 'closed') {
   return NextResponse.json({ error: 'Kuis telah ditutup secara manual oleh admin.' }, { status: 403 });
 }
 if (template.manualStatus === 'scheduled') {
   if (template.openAt && now < new Date(template.openAt)) {
     return NextResponse.json({ error: 'Kuis belum dibuka.' }, { status: 403 });
   }
   if (template.closeAt && now > new Date(template.closeAt)) {
     return NextResponse.json({ error: 'Kuis telah ditutup.' }, { status: 403 });
   }
 }

 // Enforce max attempts
 if (template.maxAttempts !== null) {
 const [{ total }] = await db
 .select({ total: sql<number>`count(*)` })
 .from(studentQuizAttempts)
 .where(
 and(
 eq(studentQuizAttempts.studentId, studentId),
 eq(studentQuizAttempts.templateId, templateId),
 eq(studentQuizAttempts.status, 'completed'),
 ),
 );
 if (total >= template.maxAttempts) {
 return NextResponse.json({ error: 'Max attempts reached' }, { status: 409 });
 }
 }

  const rules = template.selectionRules as Record<string, any>;
  const fixedQuestionIds = rules?.fixedQuestionIds as string[] | undefined;
  const quizEligibilityCondition = or(
    eq(aiQuestionBank.origin, 'zyx_original'),
    eq(aiQuestionBank.origin, 'itb_example'),
    eq(aiQuestionBank.quizEligible, true),
  );

  let selected: any[] = [];

  if (fixedQuestionIds && fixedQuestionIds.length > 0) {
    selected = await db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          eq(aiQuestionBank.courseId, template.courseId),
          eq(aiQuestionBank.reviewStatus, 'published'),
          quizEligibilityCondition,
          inArray(aiQuestionBank.id, fixedQuestionIds)
        )
      );
    // Sort selected questions in the order of fixedQuestionIds
    selected.sort((a, b) => fixedQuestionIds.indexOf(a.id) - fixedQuestionIds.indexOf(b.id));
  } else {
    const totalCount = rules.count || 10;
    const explicitProportions = rules.difficulty_proportions as
      | { easy: number; medium: number; hard: number }
      | undefined;
    const proportions =
      explicitProportions ??
      (await getAdaptiveDifficultyProportions(studentId, template.courseId, totalCount));

    const tags = (rules.tags as string[] | undefined) || [];
    const tagConditions = tags.map(
      (tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`
    );
    const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;

    // Build question set from bank using difficulty proportions
    const questionsByDifficulty = await Promise.all(
      Object.entries(proportions).map(([diff, count]) =>
        db
          .select()
          .from(aiQuestionBank)
          .where(
            and(
              eq(aiQuestionBank.courseId, template.courseId),
              eq(aiQuestionBank.reviewStatus, 'published'),
              quizEligibilityCondition,
              eq(aiQuestionBank.difficulty, diff as 'easy' | 'medium' | 'hard'),
              tagCondition,
            ),
          )
          .orderBy(sql`RANDOM()`)
          .limit(count),
      ),
    );

    selected = questionsByDifficulty.flat();

    // Fallback: If under-fetched due to difficulty proportions count mismatch, fill from remaining questions matching tags
    if (selected.length < totalCount) {
      const selectedIds = selected.map((q) => q.id);
      const extraNeeded = totalCount - selected.length;

      const extraQuestions = await db
        .select()
        .from(aiQuestionBank)
        .where(
          and(
            eq(aiQuestionBank.courseId, template.courseId),
            eq(aiQuestionBank.reviewStatus, 'published'),
            quizEligibilityCondition,
            selectedIds.length > 0 ? notInArray(aiQuestionBank.id, selectedIds) : undefined,
            tagCondition,
          ),
        )
        .orderBy(sql`RANDOM()`)
        .limit(extraNeeded);

      selected = [...selected, ...extraQuestions];
    }

    // Shuffle selected questions
    selected = selected.sort(() => Math.random() - 0.5);
  }

 // Bump useCount so the next attempt's "prefer least-used" ordering (above) is meaningful.
 if (selected.length > 0) {
 await db
 .update(aiQuestionBank)
 .set({ useCount: sql`${aiQuestionBank.useCount} + 1` })
 .where(inArray(aiQuestionBank.id, selected.map((q) => q.id)));
 }

 if (selected.length === 0) {
 return NextResponse.json(
 { error: 'No published questions available for this template' },
 { status: 422 },
 );
 }

  // Build deep snapshot (includes answers ; stored server-side only)
  const snapshot = selected.map((q) => ({
    id: q.id,
    ...questionProvenanceSnapshot(q),
    prompt: q.prompt,
    question_type: q.questionType,
    options: q.options,
    correct_indices: q.correctIndices,
    acceptable_answers: q.acceptableAnswers,
    explanation: q.explanation,
    difficulty: q.difficulty,
    ...(assessmentV2Enabled
      ? { stable_option_ids: buildStableOptionIds(q.id, Array.isArray(q.options) ? q.options.length : 0) }
      : {}),
  }));

  // E2: snapshot current mastery for every concept this quiz covers (before/after delta).
  let masteryBefore: Record<string, number> | null = null;
  const koIds = Array.from(new Set(selected.map((q) => q.knowledgeObjectId).filter((x): x is string => !!x)));
  if (koIds.length > 0) {
    const koRows = await db
      .select({ conceptName: knowledgeObjects.conceptName })
      .from(knowledgeObjects)
      .where(inArray(knowledgeObjects.id, koIds));
    const conceptNames = Array.from(new Set(koRows.map((k) => k.conceptName.trim())));
    if (conceptNames.length > 0) {
      const masteryRows = await db
        .select({ conceptName: studentConceptMastery.conceptName, masteryScore: studentConceptMastery.masteryScore })
        .from(studentConceptMastery)
        .where(
          and(
            eq(studentConceptMastery.studentId, studentId),
            eq(studentConceptMastery.courseId, template.courseId),
            inArray(studentConceptMastery.conceptName, conceptNames),
          ),
        );
      const scoreByConcept = new Map(masteryRows.map((r) => [r.conceptName.trim(), r.masteryScore]));
      masteryBefore = {};
      for (const name of conceptNames) {
        masteryBefore[name] = scoreByConcept.get(name) ?? 0;
      }
    }
  }

 const attemptId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(studentQuizAttempts).values({
      id: attemptId,
      studentId,
      templateId,
      status: 'in_progress',
      questionsSnapshot: snapshot as unknown as Record<string, unknown>,
      answersSnapshot: null,
      masteryBefore,
      startedAt: now,
    });
    await dualWriteQuizAttempt(tx, {
      id: attemptId,
      templateId,
      studentId,
      status: 'in_progress',
      questionsSnapshot: snapshot,
      answersSnapshot: null,
      startedAt: now,
      submittedAt: null,
    }, studentId);
  });

  // Return questions WITHOUT correct_indices to the client
  const clientQuestions = selected.map((q) => ({
    id: q.id,
    ...questionProvenanceSnapshot(q),
    prompt: q.prompt,
    question_type: q.questionType,
    options: q.options,
    difficulty: q.difficulty,
    tags: q.tags,
    ...(assessmentV2Enabled
      ? { stable_option_ids: buildStableOptionIds(q.id, Array.isArray(q.options) ? q.options.length : 0) }
      : {}),
  }));

 return NextResponse.json(
 {
 attemptId,
 templateId,
 timeLimitSeconds: template.timeLimitSeconds,
 questions: clientQuestions,
 },
 { status: 201 },
 );
}

export async function GET(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const templateId = searchParams.get('templateId');

 const conditions = [eq(studentQuizAttempts.studentId, session.user.id)];
 if (templateId) conditions.push(eq(studentQuizAttempts.templateId, templateId));

 const attempts = await db
 .select()
 .from(studentQuizAttempts)
 .where(and(...conditions))
 .orderBy(desc(studentQuizAttempts.startedAt))
 .limit(50);

 return NextResponse.json(serializeStudentQuizAttemptList(attempts));
}
