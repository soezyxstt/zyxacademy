/**
 * GET /api/quiz/daily ; return a published daily quiz without answer keys.
 * POST /api/quiz/daily ; grade only the published questions resolved on the
 * server and persist the resulting attempt.
 *
 * This is a zero-provider-cost compatibility path. A daily quiz is never
 * created as a side effect of a GET, and the browser cannot submit its own
 * prompt, options, answer key, or explanation for grading.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/db";
import {
  aiQuestionBank,
  chapters,
  knowledgeObjects,
  quizTemplates,
  studentQuizAttempts,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, asc, desc, eq, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { dualWriteQuizAttempt } from "@/lib/migrasi/repository-kompatibilitas";
import {
  canAccessCourseContent,
  resolveCourseAccess,
  type CourseAccessResult,
} from "@/lib/student/course-access";

const DAILY_QUESTION_COUNT = 5;
const DAILY_CATEGORIES: ReadonlySet<string> = new Set(["daily"]);

type SelectionRules = Record<string, unknown>;

type DailyTemplateAccess = {
  access: CourseAccessResult;
  rules: SelectionRules;
  chapterIds: string[];
};

type ServerQuestion = {
  id: string;
  origin: "zyx_original" | "historical_reference" | "itb_example";
  sourceEventName: string | null;
  sourceReferenceId: string | null;
  knowledgeObjectId: string | null;
  prompt: string;
  options: unknown;
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  tags: unknown;
  correctIndices: unknown;
  acceptableAnswers: string[] | null;
  explanation: string;
};

const questionSelect = {
  id: aiQuestionBank.id,
  origin: aiQuestionBank.origin,
  sourceEventName: aiQuestionBank.sourceEventName,
  sourceReferenceId: aiQuestionBank.sourceReferenceId,
  knowledgeObjectId: aiQuestionBank.knowledgeObjectId,
  prompt: aiQuestionBank.prompt,
  options: aiQuestionBank.options,
  difficulty: aiQuestionBank.difficulty,
  questionType: aiQuestionBank.questionType,
  tags: aiQuestionBank.tags,
  correctIndices: aiQuestionBank.correctIndices,
  acceptableAnswers: aiQuestionBank.acceptableAnswers,
  explanation: aiQuestionBank.explanation,
} as const;

function parseSelectionRules(raw: unknown): SelectionRules {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as SelectionRules
        : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as SelectionRules
    : {};
}

function extractChapterScope(rules: SelectionRules): string[] | null {
  const keys = ["chapterId", "chapterIds", "chapters", "chapter_ids"];
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(rules, key));
  if (present.length !== 1) return null;

  const raw = rules[present[0]];
  const refs = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  if (refs.length < 1 || refs.length > 2 || refs.some((ref) => typeof ref !== "string")) return null;

  const normalized = refs.map((ref) => ref.trim());
  if (normalized.some((ref) => ref.length === 0)) return null;
  return [...new Set(normalized)];
}

function expandFreeChapterScope(access: CourseAccessResult, requested: readonly string[]): string[] {
  const requestedIds = new Set(requested);
  return [
    ...new Set(
      access.freeChapters
        .filter((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId].some((id) => id && requestedIds.has(id)))
        .flatMap((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

async function resolveDailyTemplateAccess(
  template: typeof quizTemplates.$inferSelect,
  userId: string,
  role: string | null | undefined,
): Promise<DailyTemplateAccess | null> {
  if (template.status !== "published" || !DAILY_CATEGORIES.has(template.category)) return null;

  const access = await resolveCourseAccess({ courseId: template.courseId, userId, roleHint: role });
  if (!access.hasCourseAccess || !access.capabilities.canStartQuiz) return null;

  const rules = parseSelectionRules(template.selectionRules);
  const requestedChapterIds = extractChapterScope(rules);
  if (access.tier === "free") {
    if (template.visibility !== "free" || !requestedChapterIds) return null;
    if (!canAccessCourseContent(access, "quiz", requestedChapterIds)) return null;
    const chapterIds = expandFreeChapterScope(access, requestedChapterIds);
    return chapterIds.length > 0 ? { access, rules, chapterIds } : null;
  }

  // Enrolled and staff users retain the compatibility course-wide behavior.
  // When a template declares a scope, bind question selection to it as well.
  return { access, rules, chapterIds: requestedChapterIds ?? [] };
}

function fixedQuestionIds(rules: SelectionRules): string[] {
  const raw = rules.fixedQuestionIds ?? rules.fixed_question_ids ?? rules.questionIds ?? rules.question_ids;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))];
}

function requestedCount(rules: SelectionRules): number {
  const value = Number(rules.count);
  if (!Number.isInteger(value) || value <= 0) return DAILY_QUESTION_COUNT;
  return Math.min(DAILY_QUESTION_COUNT, value);
}

function difficultyProportions(rules: SelectionRules): Record<"easy" | "medium" | "hard", number> {
  const raw = rules.difficulty_proportions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { easy: 2, medium: 2, hard: 1 };
  }
  const record = raw as Record<string, unknown>;
  return {
    easy: Number.isInteger(record.easy) && Number(record.easy) > 0 ? Math.min(DAILY_QUESTION_COUNT, Number(record.easy)) : 0,
    medium: Number.isInteger(record.medium) && Number(record.medium) > 0 ? Math.min(DAILY_QUESTION_COUNT, Number(record.medium)) : 0,
    hard: Number.isInteger(record.hard) && Number(record.hard) > 0 ? Math.min(DAILY_QUESTION_COUNT, Number(record.hard)) : 0,
  };
}

const quizEligibilityCondition = or(
  eq(aiQuestionBank.origin, "zyx_original"),
  eq(aiQuestionBank.origin, "itb_example"),
  eq(aiQuestionBank.quizEligible, true),
);

async function publishedQuestionsForTemplate(input: {
  template: typeof quizTemplates.$inferSelect;
  questionIds?: readonly string[];
  excludeIds?: readonly string[];
  difficulty?: "easy" | "medium" | "hard";
  chapterIds: readonly string[];
  tags?: readonly string[];
}): Promise<ServerQuestion[]> {
  const conditions: SQL<unknown>[] = [
    eq(aiQuestionBank.courseId, input.template.courseId),
    eq(aiQuestionBank.status, "active"),
    eq(aiQuestionBank.isStale, false),
    eq(aiQuestionBank.reviewStatus, "published"),
    quizEligibilityCondition,
    input.difficulty ? eq(aiQuestionBank.difficulty, input.difficulty) : undefined,
    input.questionIds && input.questionIds.length > 0 ? inArray(aiQuestionBank.id, [...input.questionIds]) : undefined,
    input.excludeIds && input.excludeIds.length > 0 ? notInArray(aiQuestionBank.id, [...input.excludeIds]) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));

  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 0) {
    const tagConditions = tags.map((tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`);
    conditions.push(or(...tagConditions) as SQL);
  }

  if (input.chapterIds.length > 0) {
    const koRows = await db
      .select({ id: knowledgeObjects.id })
      .from(knowledgeObjects)
      .innerJoin(chapters, eq(knowledgeObjects.chapterId, chapters.id))
      .where(
        and(
          eq(knowledgeObjects.courseId, input.template.courseId),
          eq(knowledgeObjects.status, "active"),
          eq(chapters.status, "published"),
          inArray(chapters.id, [...input.chapterIds]),
        ),
      );
    if (koRows.length === 0) return [];
    conditions.push(inArray(aiQuestionBank.knowledgeObjectId, koRows.map((row) => row.id)));
  }

  return await db
    .select(questionSelect)
    .from(aiQuestionBank)
    .where(and(...conditions))
    .orderBy(asc(aiQuestionBank.useCount), asc(aiQuestionBank.id)) as ServerQuestion[];
}

async function selectDailyQuestions(
  template: typeof quizTemplates.$inferSelect,
  rules: SelectionRules,
  chapterIds: readonly string[],
  requestedIds?: readonly string[],
): Promise<ServerQuestion[]> {
  const count = requestedCount(rules);
  const fixedIds = fixedQuestionIds(rules);
  const tags = Array.isArray(rules.tags)
    ? rules.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  if (requestedIds) {
    const rows = await publishedQuestionsForTemplate({
      template,
      questionIds: requestedIds,
      chapterIds,
      tags,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return requestedIds.map((id) => byId.get(id)).filter((row): row is ServerQuestion => Boolean(row));
  }

  if (fixedIds.length > 0) {
    const rows = await publishedQuestionsForTemplate({
      template,
      questionIds: fixedIds.slice(0, count),
      chapterIds,
      tags,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return fixedIds.slice(0, count).map((id) => byId.get(id)).filter((row): row is ServerQuestion => Boolean(row));
  }

  const proportions = difficultyProportions(rules);
  const selected: ServerQuestion[] = [];
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    if (selected.length >= count || proportions[difficulty] <= 0) continue;
    const rows = await publishedQuestionsForTemplate({
      template,
      difficulty,
      chapterIds,
      tags,
    });
    selected.push(...rows.slice(0, Math.min(proportions[difficulty], count - selected.length)));
  }

  if (selected.length < count) {
    const rows = await publishedQuestionsForTemplate({
      template,
      chapterIds,
      tags,
      excludeIds: selected.map((row) => row.id),
    });
    selected.push(...rows.slice(0, count - selected.length));
  }

  return selected.slice(0, count).sort(() => Math.random() - 0.5);
}

function clientQuestion(question: ServerQuestion) {
  return {
    id: question.id,
    origin: question.origin,
    sourceEventName: question.sourceEventName,
    sourceReferenceId: question.sourceReferenceId,
    prompt: question.prompt,
    // Product Bundle questions may store option objects for authoring. Only
    // project their learner-facing text, never an isCorrect/correct marker.
    options: publicOptions(question.options),
    difficulty: question.difficulty,
    questionType: question.questionType,
    tags: question.tags,
  };
}

function publicOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => {
      if (typeof option === "string") return option;
      if (option && typeof option === "object") {
        const record = option as Record<string, unknown>;
        const text = record.text ?? record.label ?? record.value;
        return typeof text === "string" ? text : "";
      }
      return typeof option === "number" ? String(option) : "";
    });
}

function submittedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0] ?? "");
  return "";
}

function isAnswerCorrect(question: ServerQuestion, submitted: unknown): boolean {
  if (question.questionType === "short_answer") {
    const answer = submittedText(submitted).trim().toLowerCase();
    return answer.length > 0 && (question.acceptableAnswers ?? []).some((expected) => expected.trim().toLowerCase() === answer);
  }
  if (question.questionType === "essay") return false;

  const submittedIndices = Array.isArray(submitted)
    ? submitted.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
    : typeof submitted === "number"
      ? Number.isInteger(submitted) && submitted >= 0 ? [submitted] : []
      : [];
  const correctIndices = Array.isArray(question.correctIndices)
    ? question.correctIndices.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
    : [];
  if (correctIndices.length === 0) return false;
  if (question.questionType === "multiple_choice") {
    return submittedIndices.length === 1 && correctIndices.length === 1 && submittedIndices[0] === correctIndices[0];
  }
  const submittedSet = [...new Set(submittedIndices)];
  const correctSet = [...new Set(correctIndices)];
  return submittedSet.length === correctSet.length
    && submittedSet.every((index) => correctSet.includes(index));
}

const SubmitSchema = z.object({
  templateId: z.string().min(1),
  answers: z.record(
    z.string(),
    z.union([z.array(z.number()), z.string(), z.array(z.string()), z.number()]),
  ),
  durationSeconds: z.number().int().min(0).optional(),
  // `questionsSnapshot` is retained as an input compatibility shape, but it
  // contains IDs only. Unknown answer-key fields are stripped by Zod and are
  // never used for grading.
  questionIds: z.array(z.string().min(1)).min(1).max(DAILY_QUESTION_COUNT).optional(),
  questionsSnapshot: z.array(z.object({ id: z.string().min(1) })).min(1).max(DAILY_QUESTION_COUNT).optional(),
}).refine((input) => Boolean(input.questionIds?.length || input.questionsSnapshot?.length), {
  message: "Question IDs are required",
  path: ["questionIds"],
});

async function loadDailyTemplates(userId: string, role: string | null | undefined) {
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(and(eq(quizTemplates.category, "daily"), eq(quizTemplates.status, "published")))
    .orderBy(desc(quizTemplates.createdAt), asc(quizTemplates.id));

  for (const template of templates) {
    const resolved = await resolveDailyTemplateAccess(template, userId, role);
    if (resolved) return { template, resolved };
  }
  return null;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const selected = await loadDailyTemplates(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );
  if (!selected) return NextResponse.json({ questions: [], templateId: null });

  const { template, resolved } = selected;
  const questions = await selectDailyQuestions(template, resolved.rules, resolved.chapterIds);
  return NextResponse.json({
    questions: questions.map(clientQuestion),
    questionIds: questions.map((question) => question.id),
    templateId: template.id,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload kuis tidak valid." }, { status: 400 });
  }
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { templateId, answers, durationSeconds } = parsed.data;
  const requestedIds = [...new Set(
    (parsed.data.questionIds ?? parsed.data.questionsSnapshot?.map((question) => question.id) ?? [])
      .map((id) => id.trim())
      .filter(Boolean),
  )];
  if (requestedIds.length === 0 || requestedIds.length > DAILY_QUESTION_COUNT) {
    return NextResponse.json({ error: "Daftar soal kuis tidak valid." }, { status: 400 });
  }

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);
  if (!template) return NextResponse.json({ error: "Kuis tidak ditemukan." }, { status: 404 });

  const resolved = await resolveDailyTemplateAccess(
    template,
    session.user.id,
    (session.user as { role?: string | null }).role,
  );
  if (!resolved) return NextResponse.json({ error: "Kuis ini belum tersedia." }, { status: 403 });

  const rules = resolved.rules;
  const fixedIds = fixedQuestionIds(rules).slice(0, requestedCount(rules));
  if (fixedIds.length > 0 && (fixedIds.length !== requestedIds.length || fixedIds.some((id) => !requestedIds.includes(id)))) {
    return NextResponse.json({ error: "Soal kuis tidak sesuai dengan template." }, { status: 403 });
  }

  const serverQuestions = await selectDailyQuestions(template, rules, resolved.chapterIds, requestedIds);
  if (serverQuestions.length !== requestedIds.length) {
    return NextResponse.json({ error: "Sebagian soal kuis sudah tidak tersedia." }, { status: 403 });
  }

  let correct = 0;
  for (const question of serverQuestions) {
    if (isAnswerCorrect(question, answers[question.id])) correct += 1;
  }
  const total = serverQuestions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const attemptId = randomUUID();
  const submittedAt = new Date();
  const serverSnapshot = serverQuestions.map((question) => ({
    id: question.id,
    origin: question.origin,
    sourceEventName: question.sourceEventName,
    sourceReferenceId: question.sourceReferenceId,
    prompt: question.prompt,
    options: question.options,
    difficulty: question.difficulty,
    question_type: question.questionType,
    tags: question.tags,
    correct_indices: question.correctIndices,
    acceptable_answers: question.acceptableAnswers,
    explanation: question.explanation,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(studentQuizAttempts).values({
      id: attemptId,
      studentId: session.user.id,
      templateId: template.id,
      score,
      durationSeconds: durationSeconds ?? null,
      status: "completed",
      questionsSnapshot: serverSnapshot as unknown as Record<string, unknown>,
      answersSnapshot: answers as unknown as Record<string, unknown>,
      submittedAt,
      startedAt: submittedAt,
    });
    await dualWriteQuizAttempt(tx, {
      id: attemptId,
      templateId: template.id,
      studentId: session.user.id,
      status: "completed",
      questionsSnapshot: serverSnapshot,
      answersSnapshot: answers,
      startedAt: submittedAt,
      submittedAt,
    }, session.user.id);

    await tx
      .update(aiQuestionBank)
      .set({ useCount: sql`${aiQuestionBank.useCount} + 1` })
      .where(inArray(aiQuestionBank.id, serverQuestions.map((question) => question.id)));
  });

  return NextResponse.json({ attemptId, score, correct, total });
}
