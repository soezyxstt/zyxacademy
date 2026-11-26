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
import { matchEvaluationRoute, resolveEvaluationAlias } from "@/packages/native-parity/operations/evaluation-routes";

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

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
    if (!view) return reply(await readQuestionBank(userId, params));
  }
  if (view) return reply({ error: "Not found" }, 404);
  if (match.route.id === "jobs") return reply(await readGenerationJobs());
  if (match.route.id === "distractors") return reply(await readDistractors(userId));
  return reply({ authorized: true });
}
