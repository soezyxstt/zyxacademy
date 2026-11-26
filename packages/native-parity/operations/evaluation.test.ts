import { expect, test } from "bun:test";
import { compileMarkdown } from "../../../lib/markdown-compiler";
import { createEvaluationFixtureRequest, evaluationCases } from "./evaluation-fixtures";
import { evaluationAction, evaluationRead, type GenerationJob, type QuestionBank } from "./evaluation-contract";
import { DEMO_TEMPLATES } from "./evaluation-ast-templates";
import { evaluationRoutes, matchEvaluationRoute, type EvaluationRedirect } from "./evaluation-routes";

test("all 13 operations evaluation routes have three unique deterministic cases", () => {
  expect(evaluationRoutes).toHaveLength(13);
  expect(evaluationCases).toHaveLength(39);
  expect(new Set(evaluationCases.map((item) => item.id)).size).toBe(39);
  for (const item of evaluationCases) expect(matchEvaluationRoute(item.route)).toBeDefined();
  expect(matchEvaluationRoute("/admin/quizzes/invalid%ZZ/edit")).toBeUndefined();
  expect(matchEvaluationRoute("/admin/courses/mekanika-dasar/quizzes/new")).toBeUndefined();
});

test("quiz aliases use server identity, preserve new-quiz tags and retain not found", async () => {
  const request = createEvaluationFixtureRequest();
  const alias = (path: string) => request<EvaluationRedirect>(evaluationRead(path));
  expect(await alias("/admin/quiz-insights/kuis-energi")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/analytics/kuis-energi" });
  expect(await alias("/admin/quizzes/kuis-energi/edit?courseId=other&returnUrl=%2Felsewhere")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/quizzes/kuis-energi/edit" });
  expect(await alias("/admin/quizzes/new?courseSlug=mekanika-legacy&tags=a%2Fb%2Cenergi")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/quizzes/new?tags=a%2Fb%2Cenergi" });
  expect(await alias("/admin/quizzes/new?courseId=invalid&courseSlug=mekanika-legacy")).toEqual({ kind: "redirect", href: "/admin/courses" });
  expect(await alias("/admin/quiz-insights?courseId=mekanika-legacy")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/analytics" });
  expect(await alias("/admin/leaderboard?courseId=mekanika-legacy")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/leaderboard" });
  expect(await alias("/admin/quizzes?courseId=mekanika-legacy&tags=ignore")).toEqual({ kind: "redirect", href: "/admin/courses/mekanika-dasar/quizzes" });
  await expect(alias("/admin/quiz-insights/missing")).rejects.toMatchObject({ status: 404 });
  await expect(alias("/admin/quizzes/missing/edit")).rejects.toMatchObject({ status: 404 });
});

test("retired assessments and diktat entry points redirect to their current workflows", async () => {
  const request = createEvaluationFixtureRequest();
  expect(await request<EvaluationRedirect>(evaluationRead("/admin/assessments/legacy-id"))).toEqual({ kind: "redirect", href: "/admin/questions" });
  expect(await request<EvaluationRedirect>(evaluationRead("/admin/assessments"))).toEqual({ kind: "redirect", href: "/admin/questions" });
  expect(await request<EvaluationRedirect>(evaluationRead("/admin/diktats"))).toEqual({ kind: "redirect", href: "/admin/materials/review?section=product" });
});

test("fixture exercises job validation, pending, processing, completion and logs", async () => {
  const request = createEvaluationFixtureRequest("empty");
  const create = evaluationAction("generation-jobs");
  await expect(request(create, { method: "POST", body: { courseId: "wrong", chapterId: "bab-usaha" } })).rejects.toMatchObject({ status: 400 });
  const { jobId } = await request<{ jobId: string }>(create, { method: "POST", body: { courseId: "mekanika-dasar", chapterId: "bab-usaha", koId: "all" } });
  const status = evaluationAction("generation-job", jobId);
  expect((await request<GenerationJob>(status)).status).toBe("processing");
  const completed = await request<GenerationJob>(status);
  expect(completed).toMatchObject({ generatedCount: 1, status: "completed" });
  expect((completed.promptParameters as { logs: string[] }).logs).toHaveLength(2);
});

test("fixture filters question reads, reviews eligible historical entries and recovers after failure", async () => {
  const request = createEvaluationFixtureRequest("recovery");
  const endpoint = evaluationRead("/admin/questions");
  await expect(request(endpoint)).rejects.toMatchObject({ status: 503 });
  expect((await request<QuestionBank>(endpoint)).total).toBe(1);
  expect((await request<QuestionBank>(evaluationRead("/admin/questions?qSearch=unknown"))).total).toBe(0);
  const history = evaluationRead("/admin/questions?tab=historical");
  const data = await request<QuestionBank>(history);
  expect(data.total).toBe(0);
  expect(data.historicalQuestions).toMatchObject([{ id: "referensi-usaha", reviewStatus: "reviewed" }]);
  await request(evaluationAction("questions"), { method: "PUT", body: { ids: ["referensi-usaha"], reviewStatus: "published" } });
  expect((await request<QuestionBank>(history)).historicalQuestions[0]?.reviewStatus).toBe("published");
  const denied = createEvaluationFixtureRequest("denied");
  await expect(denied(endpoint)).rejects.toMatchObject({ status: 403 });
  await expect(denied(evaluationAction("questions"), { method: "DELETE" })).rejects.toMatchObject({ status: 403 });
});

test("AST Inspector uses the common compiler and all three web templates", () => {
  const standard = compileMarkdown(DEMO_TEMPLATES.standard, "chapter-debug", "course-debug");
  const leakage = compileMarkdown(DEMO_TEMPLATES.leakage, "chapter-debug", "course-debug");
  const visual = compileMarkdown(DEMO_TEMPLATES.visual, "chapter-debug", "course-debug");
  expect(standard.ast.blocks.length).toBeGreaterThan(0);
  expect(leakage.diagnostics.some((item) => item.code === "FORMULA_IN_CONCEPT")).toBe(true);
  expect(visual.ast.blocks.some((item) => item.type === "visual")).toBe(true);
});
