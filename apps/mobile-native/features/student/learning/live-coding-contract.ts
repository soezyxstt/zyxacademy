import { z } from "zod";
import { codingProblemPublicSchema, codingSubmissionRequestSchema, codingLocatorSchema, executionResultSchema,
  type CodingProblemPublic, type CodingSubmissionRequest } from "../../../../../lib/coding/contracts";
import { liveCodingConfigSchema, type LiveCodingConfig } from "../../../../../lib/coding/live-config";
import type { StudentRequest, StudentServices } from "../contracts";

const livePolicy = liveCodingConfigSchema.pick({ maxAttempts: true, assistance: true }).extend({
  deadlineMs: z.number().int().positive(), surfaceId: z.string(),
}).strict();
const problemResponse = z.object({ problem: codingProblemPublicSchema, policy: livePolicy }).strict();
const publicCase = z.object({ testId: z.string(), passed: z.boolean(), execution: executionResultSchema }).strict();
const feedbackSchema = z.object({
  problem: codingLocatorSchema, authority: z.literal("trusted_server"), verdict: z.enum(["correct", "partial", "incorrect", "ungradable"]),
  passed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), publicCases: z.array(publicCase).max(20),
}).strict();
const historySchema = z.object({ attempts: z.array(z.object({
  id: z.string().min(1), ordinal: z.number().int().positive(), status: z.enum(["pending", "failed", "completed"]),
  code: z.string().max(64_000), feedback: feedbackSchema.nullable(),
}).strict()).max(20) }).strict();
const receiptSchema = z.object({ attemptId: z.string().min(1), ordinal: z.number().int().positive(), feedback: feedbackSchema.nullable() }).strict();
const editorSchema = z.object({ code: z.string().max(64_000), stdin: z.string().max(8_000), pending: codingSubmissionRequestSchema.optional() }).strict();

export type CodingHistory = z.infer<typeof historySchema>["attempts"];
export type LiveEditor = z.infer<typeof editorSchema>;
export type LiveCodingScope = { courseId: string; roomId: string; index: number; config: LiveCodingConfig };
export type LiveCodingProblem = z.infer<typeof problemResponse>;

export class LiveCodingError extends Error {
  constructor(readonly status: number, readonly code?: string) { super("Live coding request failed."); }
}

export const codingSurface = ({ roomId, index }: LiveCodingScope) => ({ kind: "live_quiz" as const, sessionId: roomId, questionIndex: index });
export const codingLocator = ({ problemId, version }: LiveCodingConfig) => ({ problemId, version });

function sameProblem(value: { problemId: string; version: number }, scope: LiveCodingScope) {
  return value.problemId === scope.config.problemId && value.version === scope.config.version;
}

export function liveCodingKey({ courseId, roomId, index, config }: LiveCodingScope) {
  return "coding:live:" + JSON.stringify([courseId, roomId, index, config.problemId, config.version]);
}

export function restoreLiveEditor(raw: string | null, scope: LiveCodingScope): LiveEditor | null {
  if (!raw || raw.length > 900_000) return null;
  try {
    const result = editorSchema.parse(JSON.parse(raw));
    if (result.pending && (!sameProblem(result.pending.problem, scope) ||
      result.pending.code !== result.code || result.pending.stdin !== result.stdin)) return null;
    return result;
  } catch { return null; }
}

export async function persistLiveEditor(drafts: NonNullable<StudentServices["drafts"]>, scope: LiveCodingScope,
  previous: LiveEditor, next: LiveEditor) {
  if (!drafts.update) throw new Error("Durable live coding storage is unavailable.");
  let changed = false;
  let current: LiveEditor | null = null;
  await drafts.update(liveCodingKey(scope), raw => {
    current = restoreLiveEditor(raw, scope);
    if (current?.pending?.requestId !== previous.pending?.requestId) return raw;
    changed = true;
    return JSON.stringify(next);
  });
  return { changed, current };
}

export function canStartLiveCoding({ synchronized, connected, phase, deadline, now = Date.now() }: {
  synchronized: boolean; connected: boolean; phase: string; deadline: number; now?: number;
}) {
  return synchronized && connected && phase === "question" && Number.isSafeInteger(deadline) && now < deadline;
}

export type LiveJoin = { sessionId: string; token: string; wsUrl: string | null };

export function signedLiveEndpoint(join: LiveJoin, requiredRoom?: string) {
  if (typeof join.wsUrl !== "string" || typeof join.token !== "string" || !join.token || join.token.length > 8192 || typeof join.sessionId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(join.sessionId) ||
    (requiredRoom !== undefined && requiredRoom !== join.sessionId)) return null;
  try {
    const endpoint = new URL(join.wsUrl);
    if (!["https:", "wss:"].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
      endpoint.pathname !== `/room/${encodeURIComponent(join.sessionId)}/websocket`) return null;
    endpoint.searchParams.set("token", join.token);
    return endpoint.href;
  } catch { return null; }
}

export function liveCodingHelp(scope: LiveCodingScope, policy: LiveCodingProblem["policy"], editor: LiveEditor) {
  const mode = scope.config.assistance;
  if (mode === "disabled" || policy.assistance === "disabled") return null;
  const full = mode === "full" && policy.assistance === "full";
  return { kind: "exercise", problem: codingLocator(scope.config), code: editor.code, stdin: editor.stdin,
    intent: full ? "review" : "hint", surface: codingSurface(scope) };
}

function queryFor(scope: LiveCodingScope) {
  return new URLSearchParams({ courseId: scope.courseId, version: String(scope.config.version), surface: JSON.stringify(codingSurface(scope)) });
}

async function read(request: StudentRequest, path: string, signal: AbortSignal, command?: object) {
  const response = await request(path, command
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal }
    : { signal });
  try {
    if (!response.ok) {
      const issue = await response.json().catch(() => null) as { code?: string } | null;
      throw new LiveCodingError(response.status, typeof issue?.code === "string" ? issue.code : undefined);
    }
    return await response.json();
  } finally { response.dispose?.(); }
}

export async function loadLiveProblem(request: StudentRequest, scope: LiveCodingScope, signal: AbortSignal) {
  const response = problemResponse.parse(await read(request,
    `/api/coding/problems/${encodeURIComponent(scope.config.problemId)}?${queryFor(scope)}`, signal));
  if (!sameProblem(response.problem, scope) || response.policy.surfaceId !== `live:${scope.roomId}:${scope.index}`) {
    throw new Error("Live problem scope mismatch.");
  }
  return response;
}

function validateFeedback(feedback: z.infer<typeof feedbackSchema> | null, problem: CodingProblemPublic) {
  if (!feedback) return;
  const publicTests = new Set(problem.publicTests.map(test => test.id));
  if (feedback.problem.problemId !== problem.problemId || feedback.problem.version !== problem.version ||
    feedback.passed > feedback.total || feedback.total > 20 ||
    feedback.publicCases.some(row => !publicTests.has(row.testId))) throw new Error("Invalid live coding feedback.");
}

export async function loadLiveCodingHistory(request: StudentRequest, scope: LiveCodingScope, problem: CodingProblemPublic,
  signal: AbortSignal): Promise<CodingHistory> {
  const query = queryFor(scope);
  query.set("problemId", scope.config.problemId);
  const { attempts } = historySchema.parse(await read(request, `/api/coding/submissions?${query}`, signal));
  for (const row of attempts) validateFeedback(row.feedback, problem);
  return attempts;
}

export async function submitLiveCoding(request: StudentRequest, scope: LiveCodingScope, problem: CodingProblemPublic,
  submission: CodingSubmissionRequest, signal: AbortSignal) {
  if (!sameProblem(submission.problem, scope)) throw new Error("Invalid live coding submission scope.");
  const result = receiptSchema.parse(await read(request, "/api/coding/submissions", signal,
    { courseId: scope.courseId, surface: codingSurface(scope), submission: codingSubmissionRequestSchema.parse(submission) }));
  validateFeedback(result.feedback, problem);
  return result;
}
