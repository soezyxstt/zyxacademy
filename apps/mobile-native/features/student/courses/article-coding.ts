import { z } from "zod";
import { codingProblemPublicSchema, codingSubmissionRequestSchema, executionResultSchema, codingLocatorSchema } from "../../../../../lib/coding/contracts";
import { nativeArticleCodingHeaders, type NativeArticleCodingScope } from "../../../../../lib/coding/native-article-contract";
import type { StudentRequest, StudentServices, StudentSession } from "../contracts";

const feedbackSchema = z.object({
  problem: codingLocatorSchema, authority: z.literal("trusted_server"),
  verdict: z.enum(["correct", "partial", "incorrect", "ungradable"]),
  passed: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
  publicCases: z.array(z.object({ testId: z.string(), passed: z.boolean(), execution: executionResultSchema }).strict()).max(20),
}).strict().nullable();
const receipt = z.object({
  attemptId: z.string().min(1), ordinal: z.number().int().positive(), feedback: feedbackSchema,
}).strict();
const history = z.object({ attempts: z.array(z.object({
  id: z.string().min(1), ordinal: z.number().int().positive(), status: z.enum(["pending", "failed", "completed"]),
  code: z.string().max(64_000), feedback: feedbackSchema,
}).strict()).max(20) }).strict();
type Problem = z.infer<typeof codingProblemPublicSchema>;

function checkFeedback(problem: Problem, feedback: z.infer<typeof feedbackSchema>) {
  if (feedback && (feedback.problem.problemId !== problem.problemId || feedback.problem.version !== problem.version ||
    feedback.passed > feedback.total || feedback.total > 20 ||
    feedback.publicCases.some(row => !problem.publicTests.some(test => test.id === row.testId)))) throw new Error("Coding feedback identity mismatch.");
}

export function articleCodingRequest(request: StudentRequest, session: StudentSession, scope: NativeArticleCodingScope): StudentRequest {
  return (path, init) => {
    if (!session.sessionId || session.role !== "student") throw new Error("Article coding requires an active Student session.");
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(nativeArticleCodingHeaders(scope, session.sessionId))) headers.set(name, value);
    headers.set("x-student-id", session.userId);
    return request(path, { ...init, headers });
  };
}

export class ArticleCodingError extends Error {
  constructor(readonly status: number, readonly code?: string) { super("Article coding request failed."); }
}

export function articleCodingApi(request: StudentRequest, courseId: string, articleId: string, articleVersion: number, partId: string) {
  const surface = { kind: "article" as const, articleId, articleVersion, partId };
  async function read(path: string, signal: AbortSignal, input?: object) {
    const response = await request(path, input ? { signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : { signal });
    try {
      if (response.ok) return await response.json();
      const issue = await response.json().catch(() => null);
      throw new ArticleCodingError(response.status, typeof issue?.code === "string" ? issue.code : undefined);
    } finally { response.dispose?.(); }
  }
  return {
    async problem(locator: z.infer<typeof codingLocatorSchema>, signal: AbortSignal) {
      const query = new URLSearchParams({ courseId, version: String(locator.version), surface: JSON.stringify(surface) });
      const { problem } = z.object({ problem: codingProblemPublicSchema }).strict().parse(
        await read(`/api/coding/problems/${encodeURIComponent(locator.problemId)}?${query}`, signal));
      if (problem.problemId !== locator.problemId || problem.version !== locator.version) throw new Error("Problem identity mismatch.");
      return problem;
    },
    async history(problem: Problem, signal: AbortSignal) {
      const query = new URLSearchParams({ courseId, problemId: problem.problemId, version: String(problem.version), surface: JSON.stringify(surface) });
      const { attempts } = history.parse(await read(`/api/coding/submissions?${query}`, signal));
      for (const row of attempts) checkFeedback(problem, row.feedback);
      return attempts;
    },
    async submit(problem: Problem, input: z.infer<typeof codingSubmissionRequestSchema>, signal: AbortSignal) {
      if (problem.problemId !== input.problem.problemId || problem.version !== input.problem.version) throw new Error("Submission identity mismatch.");
      const result = receipt.parse(await read("/api/coding/submissions", signal, { courseId, surface, submission: codingSubmissionRequestSchema.parse(input) }));
      checkFeedback(problem, result.feedback);
      return result;
    },
  };
}

type Submission = z.infer<typeof codingSubmissionRequestSchema>;
export function restoreArticleSubmission(raw: string | null | undefined, expected?: { problemId: string; version: number }) {
  if (!raw || raw.length > 500_000 || !expected) return undefined;
  try {
    const input = codingSubmissionRequestSchema.parse(JSON.parse(raw));
    if (input.problem.problemId === expected.problemId && input.problem.version === expected.version) return input;
  } catch { return undefined; }
}

export async function reserveArticleSubmission(drafts: NonNullable<StudentServices["drafts"]>, key: string, proposed: Submission) {
  if (!drafts.update) throw new Error("Durable submission storage is unavailable.");
  let current = proposed;
  await drafts.update(key, raw => {
    current = restoreArticleSubmission(raw, proposed.problem) ?? proposed;
    return JSON.stringify(current);
  });
  return current;
}

export async function releaseArticleSubmission(drafts: NonNullable<StudentServices["drafts"]>, key: string, confirmed: Submission) {
  if (!drafts.update) throw new Error("Durable submission storage is unavailable.");
  await drafts.update(key, raw => restoreArticleSubmission(raw, confirmed.problem)?.requestId === confirmed.requestId ? null : raw);
}
