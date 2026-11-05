import { z } from "zod";
import type { DemoQuizQuestion } from "@/app/(marketing)/demo/demo-data";
import type { QuizPlayerProps } from "@/components/course/quiz-player";

function quizResultSchema(limit: number) {
 return z.object({
  score: z.number().int().min(0).max(limit), total: z.number().int().min(1).max(limit),
  results: z.array(z.object({ index: z.number().int().min(0).max(limit - 1), isCorrect: z.boolean(), correctIndices: z.array(z.number().int().min(0).max(20)).min(1).max(21).refine(indices => new Set(indices).size === indices.length).optional(), explanation: z.string().max(20000).nullable() }).strict()).min(1).max(limit),
 }).strict().refine(value => value.results.length === value.total && value.results.every(item => item.index < value.total) && new Set(value.results.map(item => item.index)).size === value.total && value.score === value.results.filter(item => item.isCorrect).length);
}
const resultSchema = quizResultSchema(3);
const attemptResultSchema = quizResultSchema(1000);
export type DemoQuizResult = z.infer<typeof resultSchema>;

/** Full, unambiguous page identity, also stored with the result to detect hash collisions. */
export function demoQuizIdentity(courseId: string, revision: string, offset: number, questions: readonly DemoQuizQuestion[]): string {
  return JSON.stringify([courseId, revision, offset, questions.map(({ id, prompt, options, multiple }) => [id, prompt, options, multiple])]);
}

/** Bounded event key, for display bookkeeping only, never an authorization token. */
export function demoQuizEventKey(identity: string): string {
  const mask = (1n << 64n) - 1n;
  let a = 14695981039346656037n;
  let b = 7809847782465536322n;
  for (let i = 0; i < identity.length; i++) {
    const code = BigInt(identity.charCodeAt(i));
    a = ((a ^ code) * 1099511628211n) & mask;
    b = ((b ^ code) * 14029467366897019727n) & mask;
  }
  return `quiz-v2-${a.toString(16).padStart(16, "0")}${b.toString(16).padStart(16, "0")}`;
}

export function demoQuizExam(questions: DemoQuizQuestion[], title: string): QuizPlayerProps["exam"] {
  return {
    id: "demo-quiz", title,
    questions: questions.map((question, order) => ({ id: question.id, order, type: question.multiple ? "multiple_choices" : "multiple_choice", prompt: question.prompt, options: question.options })),
    settings: { requireAllAnswered: true, canGoBack: true },
  };
}

export async function gradeDemoQuiz(courseId: string, questions: DemoQuizQuestion[], token: string, answers: Record<string, unknown>, quizOffset = 0): Promise<DemoQuizResult> {
  if (questions.length < 1 || questions.length > 3 || new Set(questions.map((question) => question.id)).size !== questions.length || !Number.isSafeInteger(quizOffset) || quizOffset < 0 || quizOffset % 3 !== 0) throw new Error("Invalid quiz");
  const orderedAnswers = questions.map((question) => {
    const value = answers[question.id];
    const selected = Array.isArray(value) ? value : typeof value === "number" ? [value] : [];
    if (selected.length === 0 || new Set(selected).size !== selected.length || selected.some((index) => !Number.isInteger(index) || index < 0 || index >= question.options.length) || (!question.multiple && selected.length > 1)) throw new Error("Invalid answer");
    return selected;
  });
  const response = await fetch("/api/demo/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ courseId, quizOffset, questionIds: questions.map((question) => question.id), questionSetToken: token, answers: orderedAnswers }) });
  if (!response.ok) throw new Error("Quiz unavailable");
  const result = resultSchema.parse(await response.json());
  if (result.total !== questions.length || result.results.some(item => item.correctIndices?.some(index => index >= questions[item.index].options.length))) throw new Error("Invalid result count");
  return result;
}

export function serializeDemoQuizResult(identity: string, result: DemoQuizResult, answers?: Record<string, number[]>): string {
  return JSON.stringify({ version: 2, identity, result, ...(answers ? { answers } : {}) });
}

const savedAnswersSchema = z.record(z.string().max(128), z.array(z.number().int().min(0).max(20)).max(21));
export function parseDemoQuizAttempt(value: string | null, identity: string, expectedCount: number): { result: DemoQuizResult; answers: Record<string, number[]> } | null {
  try {
    const envelope = z.object({ version: z.literal(2), identity: z.literal(identity), result: attemptResultSchema, answers: savedAnswersSchema.optional() }).strict().parse(JSON.parse(value && value.length < 200000 ? value : "null"));
    return envelope.result.total === expectedCount ? { result: envelope.result, answers: envelope.answers ?? {} } : null;
  } catch { return null; }
}
export function parseDemoQuizResult(value: string | null, identity: string, expectedCount: number): DemoQuizResult | null {
  if (expectedCount > 3) return null;
  return parseDemoQuizAttempt(value, identity, expectedCount)?.result ?? null;
}
