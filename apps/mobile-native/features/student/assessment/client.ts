import type { StudentRequest, StudentRoute } from "../contracts";
import { assessmentApiPath, type Answer, type Answers, type AssessmentPlayer, type AssessmentQuestion, type TryoutAnswer } from "../../../../../packages/native-parity/student/assessment/contract";

export class AssessmentRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function assessmentRequest<T>(request: StudentRequest, path: string, init?: RequestInit): Promise<T> {
  const scoped = init && { ...init, requiredRole: "murid" as const };
  const response = await request(assessmentApiPath(path), scoped);
  try {
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = data && typeof data === "object" && "error" in data ? data.error : null;
      throw new AssessmentRequestError(response.status, typeof problem === "string" ? problem : "");
    }
    if (!data || typeof data !== "object") throw new AssessmentRequestError(502, "");
    return data as T;
  } finally {
    response.dispose?.();
  }
}

export function jsonBody(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function assessmentCoursePath(route: StudentRoute) {
  return `/courses/${encodeURIComponent(route.params.id)}`;
}

export function assessmentRoutePath(route: StudentRoute) {
  const { attemptId, viewDiscussion, access } = route.query;
  const params = new URLSearchParams();
  if (attemptId) params.set("attemptId", attemptId);
  if (viewDiscussion === "true") params.set("viewDiscussion", "true");
  if (access === "free" || access === "premium") params.set("access", access);
  const query = params.toString();
  return `${route.path.split(/[?#]/, 1)[0]}${query ? `?${query}` : ""}`;
}

export function pkaReturnPath(value: string | undefined): string | undefined {
  return value && /^\/courses\/tutorial-pka\/simulasi\/(?:matematika|fisika|kimia)\/[123]$/.test(value) ? value : undefined;
}

export function quizAttemptPath(base: string, attemptId: string, pkaStage?: string) {
  return `${base}?attemptId=${encodeURIComponent(attemptId)}${pkaStage ? `&pkaStage=${encodeURIComponent(pkaStage)}` : ""}`;
}

export const draftKey = (kind: "quiz" | "tryout" | "start", course: string, id: string) => `assessment:${kind}:${course}:${id}`;

export interface AssessmentDraft {
  version: 1;
  requestId: string;
  startedAt: number;
  index: number;
  enteredAt: number;
  flags: Record<string, boolean>;
  answers: Answers;
  pending: boolean;
  frozenAnswers?: Record<string, TryoutAnswer>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isAssessmentRequestId = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isValidIndex(value: unknown, options: string[]): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < options.length;
}

function validateAnswer(value: unknown, question: AssessmentQuestion): Answer | undefined {
  if (question.type === "multiple_choice") return isValidIndex(value, question.options) ? value : undefined;
  if (question.type === "multiple_choices") return Array.isArray(value) ? [...new Set(value.filter((i) => isValidIndex(i, question.options)))].sort((a, b) => a - b) : undefined;
  if (typeof value === "string") return value;
  const item = record(value);
  if (typeof item.text !== "string") return undefined;
  return {
    text: item.text,
    fileKey: typeof item.fileKey === "string" ? item.fileKey : undefined,
    fileName: typeof item.fileName === "string" ? item.fileName : undefined,
    fileSize: typeof item.fileSize === "string" ? item.fileSize : undefined,
    receipt: typeof item.receipt === "string" ? item.receipt : undefined,
  };
}

export function restoreAssessmentDraft(raw: string | null, player: AssessmentPlayer, newKey: () => string, now: number): AssessmentDraft {
  let value: Record<string, unknown> = {};
  if (raw) {
    try { value = record(JSON.parse(raw)); } catch { /* Ignore corrupt local state. */ }
  }
  const existingId = value.version === 1 && isAssessmentRequestId(value.requestId) ? value.requestId : undefined;
  if (!existingId) value = {};
  const storedAnswers = record(value.answers);
  const storedFlags = record(value.flags);
  const answers = Object.fromEntries(player.questions.flatMap((question) => {
    const answer = validateAnswer(storedAnswers[question.id] ?? player.answers[question.id], question);
    return answer === undefined ? [] : [[question.id, answer]];
  }));
  const flags = Object.fromEntries(player.questions.flatMap(({ id }) => storedFlags[id] === true ? [[id, true]] : []));
  const startedAt = player.startAt ? Date.parse(player.startAt) : Number(value.startedAt);
  return {
    version: 1, requestId: existingId ?? newKey(),
    startedAt: Number.isFinite(startedAt) ? Math.min(startedAt, now) : now,
    index: Number.isInteger(value.index) ? Math.max(0, Math.min(Number(value.index), player.questions.length - 1)) : 0,
    enteredAt: typeof value.enteredAt === "number" && Number.isFinite(value.enteredAt) ? Math.min(value.enteredAt, now) : now,
    flags, answers, pending: value.pending === true,
    frozenAnswers: value.pending === true && value.frozenAnswers && typeof value.frozenAnswers === "object" && !Array.isArray(value.frozenAnswers)
      ? value.frozenAnswers as Record<string, TryoutAnswer> : undefined,
  };
}

export function answered(value: Answer | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value?.text.trim() || value?.fileKey);
}

export function choice(current: Answer | undefined, index: number, multiple: boolean): Answer {
  if (!multiple) return index;
  const selected = Array.isArray(current) ? current : [];
  return selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index].sort((a, b) => a - b);
}

export function playerDeadline(player: AssessmentPlayer, startedAt: number): number | null {
  const close = player.closeAt ? Date.parse(player.closeAt) : null;
  const time = player.durationSeconds !== null ? startedAt + player.durationSeconds * 1000 : null;
  if (close !== null && Number.isFinite(close)) return time === null ? close : Math.min(close, time);
  return time;
}

export function remaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function toTryoutAnswers(questions: AssessmentQuestion[], answers: Answers): Record<string, TryoutAnswer> {
  return Object.fromEntries(questions.map((question): [string, TryoutAnswer] => {
    const value = answers[question.id];
    if (question.type === "multiple_choice") return [question.id, { type: question.type, index: typeof value === "number" ? value : null }];
    if (question.type === "multiple_choices") return [question.id, { type: question.type, indices: Array.isArray(value) ? value : [] }];
    return [question.id, { ...(typeof value === "object" && !Array.isArray(value) ? value : { text: typeof value === "string" ? value : "" }), type: question.type }];
  }));
}
