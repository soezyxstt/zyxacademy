import { type NextRequest, NextResponse } from "next/server";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getCanonicalCourseSlug, resolveCourseIdentity, resolveQuizCourseIdentity } from "@/lib/admin/course-identity";
import { readQuestionBank } from "@/app/(admin)/admin/(eval)/questions/question-bank-read-model";
import { normalizeHistoricalQuery, normalizeQuestionQuery, questionParamsFromUrl } from "@/app/(admin)/admin/(eval)/questions/question-query-state";
import {
  getAuthoringChapters,
  getAuthoringIdeas,
  matchingActiveQuestionIds,
  matchingHistoricalQuestionItems,
} from "@/app/(admin)/admin/(eval)/questions/selection-actions";
import { readGenerationJobs } from "@/app/(admin)/admin/(eval)/jobs/jobs-read-model";
import { readDistractors } from "@/app/(admin)/admin/(eval)/distractors/distractors-read-model";
import type { GenerationJobs, QuestionBank } from "@/packages/native-parity/operations/evaluation-contract";
import { matchEvaluationRoute, resolveEvaluationAlias } from "@/packages/native-parity/operations/evaluation-routes";

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function legacyArray<Item>(value: unknown, isItem: (item: unknown) => item is Item): Item[] {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed.filter(isItem) : [];
}

const isText = (item: unknown): item is string => typeof item === "string";
const isIndex = (item: unknown): item is number => typeof item === "number" && Number.isInteger(item) && item >= 0;

export async function GET(request: NextRequest) {
  const admin = await getNativeOperationsAdmin();
  if (!admin.ok) return reply({ error: admin.status === 401 ? "Unauthorized" : "Forbidden" }, admin.status);
  const userId = admin.user.id;

  const match = matchEvaluationRoute(request.nextUrl.searchParams.get("href") ?? "");
  if (!match) return reply({ error: "Not found" }, 404);

  if (match.route.kind === "alias") {
    const result = await resolveEvaluationAlias(match.route.id, match.id, match.search, {
      course: async (id) => {
        const identity = await resolveCourseIdentity(id);
        return identity ? getCanonicalCourseSlug(identity) : null;
      },
      quiz: async (id) => {
        const identity = await resolveQuizCourseIdentity(id);
        return identity ? getCanonicalCourseSlug(identity) : null;
      },
    });
    return reply(result, result.kind === "not-found" ? 404 : 200);
  }

  const view = request.nextUrl.searchParams.get("view");
  if (match.route.id === "questions") {
    const params = questionParamsFromUrl(match.search);
    if (view === "selection") {
      const active = normalizeQuestionQuery(params);
      return reply(active.tab === "historical"
        ? await matchingHistoricalQuestionItems(normalizeHistoricalQuery(params))
        : await matchingActiveQuestionIds(active));
    }
    if (view === "chapters") return reply(await getAuthoringChapters(match.search.get("courseId") ?? ""));
    if (view === "ideas") return reply(await getAuthoringIdeas(match.search.get("courseId") ?? "", match.search.get("chapterId") ?? ""));
    if (!view) {
      const data = await readQuestionBank(userId, params);
      return reply({
        ...data,
        questions: data.questions.map((question) => ({
          ...question,
          tags: legacyArray(question.tags, isText),
          options: legacyArray(question.options, isText),
          correctIndices: legacyArray(question.correctIndices, isIndex),
          acceptableAnswers: legacyArray(question.acceptableAnswers, isText),
          createdAt: question.createdAt.toISOString(),
        })),
      } satisfies QuestionBank);
    }
  }
  if (view) return reply({ error: "Not found" }, 404);
  if (match.route.id === "jobs") {
    const data = await readGenerationJobs();
    return reply({
      ...data,
      jobs: data.jobs.map((job) => ({ ...job, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString() })),
    } satisfies GenerationJobs);
  }
  if (match.route.id === "distractors") return reply(await readDistractors(userId));
  return reply({ authorized: true });
}
