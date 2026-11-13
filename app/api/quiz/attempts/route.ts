/**
 * POST /api/quiz/attempts ; Start a new quiz attempt from a template
 * GET /api/quiz/attempts ; List this student's completed attempts
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import { quizTemplates, aiQuestionBank, studentQuizAttempts, knowledgeObjects, studentConceptMastery, chapters, bab } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, or, eq, inArray, sql, desc, notInArray } from 'drizzle-orm';
import { canAccessStudentQuizTemplate } from '@/lib/quiz/student-access';
import { getAdaptiveDifficultyProportions } from '@/lib/adaptive-quiz';
import { canViewAttemptDiscussion } from '@/lib/quiz/review-release';
import { serializeStudentQuizAttempt } from '@/lib/assessment-serialization';
import { dualWriteQuizAttempt } from '@/lib/migrasi/repository-kompatibilitas';
import { buildStableOptionIds } from '@/lib/asesmen/attempt';
import { questionProvenanceSnapshot } from '@/lib/asesmen/question-provenance';
import { matchesCourseIdentity, resolveCourseIdentity } from '@/lib/admin/course-identity';
import {
  canAccessCourseContent,
  resolveCourseAccess,
  type CourseAccessResult,
  type CourseAccessTier,
} from '@/lib/student/course-access';

const StartSchema = z.object({
 courseId: z.string().trim().min(1),
 templateId: z.string().min(1),
});

const FREE_QUIZ_CATEGORIES: ReadonlySet<string> = new Set(['daily', 'weekly', 'chapter']);

type FreeQuizPolicy = {
  fullContent?: boolean;
  tier: CourseAccessTier;
  allowed: boolean;
  chapterIds: string[];
  error?: string;
};

function publicOptionTexts(value: unknown): string[] {
  const options = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object" || Array.isArray(option)) return null;
      const record = option as Record<string, unknown>;
      for (const key of ["text", "label", "value", "content"]) {
        if (typeof record[key] === "string") return record[key];
      }
      return null;
    })
    .filter((option): option is string => option !== null);
}

const ANSWER_MARKER_KEYS = new Set([
  "isCorrect",
  "correct",
  "answer",
  "correctIndex",
  "correct_indices",
  "correctIndices",
  "acceptableAnswer",
  "acceptable_answers",
  "acceptableAnswers",
  "correctOption",
  "correctOptions",
  "correct_stable_option_ids",
  "correctStableOptionIds",
  "gradingRubric",
  "gradingPolicy",
  "evidenceMappings",
  "evidence_mapping",
  "holdoutContent",
  "holdout_content",
  "explanation",
]);

/** Strip answer-bearing keys from values crossing the student API boundary. */
function stripAnswerMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAnswerMarkers);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !ANSWER_MARKER_KEYS.has(key))
      .map(([key, nested]) => [key, stripAnswerMarkers(nested)]),
  );
}

function parseSelectionRules(raw: unknown): Record<string, any> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  return {};
}

/**
 * Free quizzes must name one or both of the first two chapters. Multiple
 * references are allowed when every reference remains inside that boundary;
 * a mixed free and locked scope is rejected by the central access resolver.
 */
function extractChapterScope(rules: Record<string, unknown>): string[] | null {
  const keys = ['chapterId', 'chapterIds', 'chapters', 'chapter_ids'];
  const values = keys
    .filter((key) => Object.prototype.hasOwnProperty.call(rules, key))
    .map((key) => rules[key]);
  if (values.length !== 1) return null;

  const value = values[0];
  const refs = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  if (refs.length < 1 || refs.length > 2 || refs.some((ref) => typeof ref !== 'string')) return null;

  const chapterIds = refs.map((ref) => ref.trim());
  if (chapterIds.some((chapterId) => !chapterId)) return null;
  return [...new Set(chapterIds)];
}

/**
 * Questions still point at legacy `chapters` rows while a canonical template
 * may scope itself with `bab` IDs. Expand only the logical chapters already
 * approved by the central policy so the question query works for both IDs.
 */
function expandFreeChapterScope(
  access: CourseAccessResult,
  chapterIds: readonly string[],
): string[] {
  const requested = new Set(chapterIds);
  return [
    ...new Set(
      access.freeChapters
        .filter((chapter) =>
          [chapter.id, chapter.canonicalId, chapter.legacyId].some(
            (id) => typeof id === 'string' && requested.has(id),
          ),
        )
        .flatMap((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

async function resolveFreeQuizPolicy(
  template: typeof quizTemplates.$inferSelect,
  access: CourseAccessResult,
): Promise<FreeQuizPolicy> {
  if (access.hasCourseAccess && (access.hasFullContentAccess || access.tier === 'enrolled' || access.tier === 'staff')) {
    if (access.tier === 'free') {
      if (!canAccessStudentQuizTemplate(access, template)) return { tier: access.tier, allowed: false, chapterIds: [], error: 'Kuis ini belum tersedia.' };
      const rules = parseSelectionRules(template.selectionRules);
      const key = ['chapterId', 'chapterIds', 'chapters', 'chapter_ids'].find((item) => Object.prototype.hasOwnProperty.call(rules, item));
      const requested: string[] = key ? (typeof rules[key] === 'string' ? [rules[key]] : rules[key]) : [];
      const rows = key && access.canonicalCourseId ? await db.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(and(
        eq(bab.mataKuliahId, access.canonicalCourseId), eq(bab.status, 'active'),
        or(inArray(bab.id, requested), inArray(bab.legacyChapterId, requested)),
      )) : [];
      const chapterIds = key ? [...new Set([...requested, ...rows.flatMap((row) => [row.id, row.legacyId].filter((id): id is string => Boolean(id)))])] : access.scopedChapterIds;
      return { tier: access.tier, allowed: true, chapterIds, fullContent: true };
    }
    return { tier: access.tier, allowed: true, chapterIds: [], fullContent: true };
  }

  if (access.tier !== 'free' || !access.hasCourseAccess) {
    return {
      tier: access.tier,
      allowed: false,
      chapterIds: [],
      error: 'Akses mata kuliah ini belum tersedia.',
    };
  }

  if (template.status !== 'published') {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Kuis belum dipublikasi.',
    };
  }

  if (!FREE_QUIZ_CATEGORIES.has(template.category)) {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Paket Free hanya mendukung kuis harian, mingguan, atau per bab.',
    };
  }

  if (template.visibility !== 'free') {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Kuis ini hanya tersedia untuk paket berbayar.',
    };
  }

  const rules = parseSelectionRules(template.selectionRules);
  const assessmentTypes = [rules.assessmentType, rules.assessment_type]
    .filter((value) => value !== undefined);
  if (assessmentTypes.some((value) => value !== 'quiz')) {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Paket Free tidak mendukung tryout atau simulasi.',
    };
  }

  const chapterIds = extractChapterScope(rules);
  if (!chapterIds || !canAccessCourseContent(access, 'quiz', chapterIds)) {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Kuis Free harus terkait satu atau dua bab pertama.',
    };
  }

  const resolvedChapterIds = expandFreeChapterScope(access, chapterIds);
  if (resolvedChapterIds.length === 0) {
    return {
      tier: 'free',
      allowed: false,
      chapterIds: [],
      error: 'Kuis Free tidak memiliki relasi bab yang valid.',
    };
  }

  return { tier: 'free', allowed: true, chapterIds: resolvedChapterIds };
}

async function resolveFreeQuestionIds(courseId: string, chapterIds: readonly string[]): Promise<string[]> {
  if (chapterIds.length === 0) return [];

  const rows = await db
    .select({ questionId: aiQuestionBank.id })
    .from(aiQuestionBank)
    .innerJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
    .innerJoin(chapters, eq(knowledgeObjects.chapterId, chapters.id))
    .where(
      and(
        eq(aiQuestionBank.courseId, courseId),
        eq(aiQuestionBank.status, 'active'),
        eq(aiQuestionBank.isStale, false),
        eq(aiQuestionBank.reviewStatus, 'published'),
        eq(knowledgeObjects.status, 'active'),
        eq(chapters.status, 'published'),
        inArray(chapters.id, [...chapterIds]),
      ),
    );

  return rows.map((row) => row.questionId);
}

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

  const { courseId, templateId } = parsed.data;
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

  // The client-supplied course is only a binding claim. Resolve it against the
  // canonical/legacy identity and reject a template from another course before
  // reading or writing any student attempt state.
  const courseIdentity = await resolveCourseIdentity(courseId);
  if (!courseIdentity || !matchesCourseIdentity(template.courseId, courseIdentity)) {
    return NextResponse.json(
      { error: 'Forbidden: Template does not belong to this course' },
      { status: 403 },
    );
  }

  const role = (session.user as { role?: string | null }).role;
  // The bound, active course is the authorization boundary. In particular,
  // a session role must never grant staff access without the central resolver
  // confirming an admin role or an active tutor assignment for this course.
  const access = await resolveCourseAccess({
    courseId: courseIdentity.primaryId,
    userId: studentId,
    roleHint: role,
  });
  const isStaff = access.tier === 'staff';
  if (!access.hasCourseAccess) {
    return NextResponse.json({ error: 'Akses mata kuliah ini belum tersedia.' }, { status: 403 });
  }
  let freeQuizPolicy: FreeQuizPolicy | null = null;
  if (!isStaff) {
    freeQuizPolicy = await resolveFreeQuizPolicy(template, access);
    if (!freeQuizPolicy.allowed) {
      return NextResponse.json({ error: freeQuizPolicy.error }, { status: 403 });
    }
  }
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

  const rules = parseSelectionRules(template.selectionRules);
  const rawFixedQuestionIds = rules?.fixedQuestionIds
    ?? rules?.fixed_question_ids
    ?? rules?.questionIds
    ?? rules?.question_ids;
  const declaredFixedQuestionIds = Array.isArray(rawFixedQuestionIds)
    ? rawFixedQuestionIds.map((id) => typeof id === 'string' ? id.trim() : '')
    : null;
  const hasMalformedFixedQuestionIds = rawFixedQuestionIds !== undefined
    && (!declaredFixedQuestionIds
      || declaredFixedQuestionIds.some((id) => !id)
      || new Set(declaredFixedQuestionIds).size !== declaredFixedQuestionIds.length);
  if (hasMalformedFixedQuestionIds) {
    return NextResponse.json(
      { error: 'Daftar soal tetap kuis tidak valid.' },
      { status: 422 },
    );
  }
  const fixedQuestionIds = declaredFixedQuestionIds ? [...new Set(declaredFixedQuestionIds)] : [];
  const quizEligibilityCondition = or(
    eq(aiQuestionBank.origin, 'zyx_original'),
    eq(aiQuestionBank.origin, 'itb_example'),
    eq(aiQuestionBank.quizEligible, true),
  );
  const freePolicy = freeQuizPolicy;
  const isFreeQuiz = freePolicy?.tier === 'free';
  const freeQuestionIds = isFreeQuiz
    ? await resolveFreeQuestionIds(template.courseId, freePolicy.chapterIds)
    : null;
  const freeQuestionCondition = isFreeQuiz
    ? freeQuestionIds && freeQuestionIds.length > 0
      ? inArray(aiQuestionBank.id, freeQuestionIds)
      : sql`1 = 0`
    : undefined;
  const freeQuestionStateCondition = isFreeQuiz
    ? and(eq(aiQuestionBank.status, 'active'), eq(aiQuestionBank.isStale, false))
    : undefined;

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
          inArray(aiQuestionBank.id, fixedQuestionIds),
          freeQuestionCondition,
          freeQuestionStateCondition,
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
      (tag) => sql`exists (select 1 from jsonb_array_elements_text(${aiQuestionBank.tags}::jsonb) as tag_value where tag_value = ${tag})`
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
              freeQuestionCondition,
              freeQuestionStateCondition,
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
            freeQuestionCondition,
            freeQuestionStateCondition,
          ),
        )
        .orderBy(sql`RANDOM()`)
        .limit(extraNeeded);

      selected = [...selected, ...extraQuestions];
    }

    // Shuffle selected questions
    selected = selected.sort(() => Math.random() - 0.5);
  }

  if (isFreeQuiz) {
    const allowedQuestionIds = new Set(freeQuestionIds ?? []);
    selected = selected.filter((question) => allowedQuestionIds.has(question.id));
  }

  if (fixedQuestionIds.length > 0 && selected.length !== fixedQuestionIds.length) {
    return NextResponse.json(
      { error: 'Sebagian soal tetap kuis sudah tidak tersedia.' },
      { status: 422 },
    );
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
    options: publicOptionTexts(q.options),
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

  // Return questions WITHOUT correct_indices, correctIndex, correctIndices,
  // acceptableAnswers, or option-level answer markers to the client.
  const clientQuestions = selected.map((q) => ({
    id: q.id,
    ...questionProvenanceSnapshot(q),
    prompt: q.prompt,
    question_type: q.questionType,
    options: publicOptionTexts(q.options),
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

  const templateIds = [...new Set(attempts.map((attempt) => attempt.templateId))];
  if (templateId) templateIds.push(templateId);
  const templates = templateIds.length > 0
    ? await db
      .select()
      .from(quizTemplates)
      .where(inArray(quizTemplates.id, [...new Set(templateIds)]))
    : [];
  const role = (session.user as { role?: string | null }).role;
  const policyEntries = await Promise.all(
    templates.map(async (template) => [
      template.id,
      await (async (): Promise<FreeQuizPolicy> => {
        // Resolve staff access against the template's already bound active
        // course. A tutor assignment is required; raw session role strings do
        // not grant access to another course's attempts.
        const access = await resolveCourseAccess({
          courseId: template.courseId,
          userId: session.user.id,
          roleHint: role,
        });
        const isStaff = access.tier === 'staff';
        if (!access.hasCourseAccess) {
          return {
            tier: access.tier,
            allowed: false,
            chapterIds: [],
            error: 'Akses mata kuliah ini belum tersedia.',
          };
        }
        if (template.status === 'draft' && !isStaff) {
          return {
            tier: access.tier,
            allowed: false,
            chapterIds: [],
            error: 'Template kuis belum dipublikasi.',
          };
        }
        if (isStaff) {
          return { tier: 'staff', allowed: true, chapterIds: [] };
        }
        return await resolveFreeQuizPolicy(template, access);
      })(),
    ] as const),
  );
  const policyByTemplate = new Map(policyEntries);
  const requestedPolicy = templateId ? policyByTemplate.get(templateId) : undefined;
  if (requestedPolicy && !requestedPolicy.allowed) {
    return NextResponse.json({ error: requestedPolicy.error }, { status: 403 });
  }

  const visibleAttempts = attempts.filter((attempt) => {
    const policy = policyByTemplate.get(attempt.templateId);
    return policy?.allowed === true;
  });

 const templateById = new Map(templates.map((template) => [template.id, template]));
 const serializedAttempts = visibleAttempts.map((attempt) => serializeStudentQuizAttempt(attempt, {
   releaseState: canViewAttemptDiscussion(templateById.get(attempt.templateId), attempt.status) ? 'released' : 'hidden',
 }));
 return NextResponse.json(serializedAttempts.map(stripAnswerMarkers));
}
