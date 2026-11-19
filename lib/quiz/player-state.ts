import { z } from "zod";

export const quizAnswerSchema = z.union([
  z.number().int().nonnegative(),
  z.string(),
  z.array(z.number().int().nonnegative()),
  z.array(z.string()),
  z.object({
    text: z.string().optional().default(""),
    fileName: z.string().nullable().optional(),
    fileSize: z.string().optional(),
    fileKey: z.string().nullable().optional(),
  }),
]);

export type QuizAnswer = z.infer<typeof quizAnswerSchema>;
export type QuizAnswers = Record<string, QuizAnswer>;
export type EssayAnswer = Extract<QuizAnswer, { text: string }>;
export type QuizQuestion = {
  id: string;
  order: number;
  type: string;
  prompt: string;
  options: string[];
  question_type?: string;
  questionType?: string;
  multiple?: boolean;
  origin?: "zyx_original" | "historical_reference" | "itb_example";
  sourceEventName?: string | null;
  sourceReferenceId?: string | null;
};

export type QuizPlayerProps = {
  courseId: string;
  visualCourseId?: string;
  /** Owner of the authenticated server snapshot. Keep another account from restoring this draft. */
  expectedUserId?: string;
  /** Isolated client transport. No student endpoints or uploads are used when supplied. */
  transport?: { submit: (answers: Record<string, unknown>, durationSeconds: number) => Promise<void> };
  exam: {
    id: string;
    title: string;
    questions: QuizQuestion[];
    settings?: {
      timeLimitMinutes?: number;
      timeLimitSeconds?: number;
      canGoBack?: boolean;
      requireAllAnswered?: boolean;
      perQuestionTimerEnabled?: boolean;
      perQuestionTimers?: Record<string, number>;
      defaultQuestionTimerSeconds?: number;
      shuffleQuestions?: boolean;
      shuffleOptions?: boolean;
    };
  };
  attemptId: string;
  getRedirectPath?: (attemptId: string) => string;
  redirectBasePath?: string;
  initialAnswers?: Record<string, unknown>;
  startedAtMs?: number;
  closeAtMs?: number;
};

export type QuizSubmission = { answers: QuizAnswers; durationSeconds: number };

export interface QuizStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keep recovery usable when the browser denies or fills localStorage. */
export function createQuizStorage(): QuizStorage {
  const fallback = new Map<string, string>();
  return {
    getItem(key) {
      if (fallback.has(key)) return fallback.get(key)!;
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    setItem(key, value) {
      // Keep the most recent draft even if only some storage operations fail.
      fallback.set(key, value);
      try { window.localStorage.setItem(key, value); } catch { /* memory recovery */ }
    },
    removeItem(key) {
      fallback.delete(key);
      try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
    },
  };
}

export function quizStorageKeys(attemptId: string) {
  return {
    answers: `zyx-quiz-answers-${attemptId}`,
    flags: `zyx-quiz-flags-${attemptId}`,
    deadline: `zyx-quiz-timer-deadline-${attemptId}`,
  };
}

function readRecord(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch { return {}; }
}

/** Recover only known question answers, preserving valid server data if a draft is corrupt. */
export function readQuizAnswers(raw: string | null, questions: readonly QuizQuestion[], initial: Record<string, unknown> = {}): QuizAnswers {
  const stored = readRecord(raw);
  const entries = questions.flatMap(({ id }) => {
    const saved = quizAnswerSchema.safeParse(stored[id]);
    const value = saved.success ? saved : quizAnswerSchema.safeParse(initial[id]);
    return value.success ? [[id, value.data] as const] : [];
  });
  return Object.fromEntries(entries);
}

export function readQuizFlags(raw: string | null, questions: readonly QuizQuestion[]): Record<string, boolean> {
  const stored = readRecord(raw);
  return Object.fromEntries(questions.filter(({ id }) => typeof stored[id] === "boolean").map(({ id }) => [id, stored[id]])) as Record<string, boolean>;
}

export function asEssayAnswer(answer: unknown): EssayAnswer | undefined {
  return answer && typeof answer === "object" && !Array.isArray(answer)
    ? answer as EssayAnswer
    : undefined;
}

/** Checks whether a specific question has an existing valid answer from the student. */
export function isQuizAnswerComplete(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "number") return Number.isFinite(val);
  if (typeof val === "string") return val.trim().length > 0;
  const essay = asEssayAnswer(val);
  return Boolean(essay && ((typeof essay.text === "string" && essay.text.trim()) || essay.fileName || essay.fileKey));
}

/** Checks whether a question allows selecting multiple answers. */
export function isMultipleChoiceQuestion(type?: string): boolean {
  return type === "multiple_choices" || type === "multi_select" || type === "checkbox";
}

/** Updates answer state for an option, supporting multi-select toggle. */
export function selectQuizOption(current: QuizAnswer | undefined, optionIndex: number, isMultiple: boolean): QuizAnswer {
  if (!isMultiple) return optionIndex;
  const currentIndices = Array.isArray(current)
    ? current.filter((value): value is number => typeof value === "number")
    : typeof current === "number" ? [current] : [];
  return currentIndices.includes(optionIndex)
    ? currentIndices.filter((idx) => idx !== optionIndex)
    : [...currentIndices, optionIndex].sort((a, b) => a - b);
}

export function formatQuizAnswers(questions: readonly QuizQuestion[], answers: QuizAnswers): QuizAnswers {
  return Object.fromEntries(questions.map((question) => {
    const value = answers[question.id];
    const empty = question.type === "short_answer" ? ""
      : question.type === "essay" ? { text: "", fileName: null, fileKey: null } : [];
    return [question.id, typeof value === "number" ? [value] : value ?? empty];
  }));
}

/** A stored clock can shorten the server deadline, but cannot extend it. */
export function resolveQuizDeadline({ stored, startedAtMs, closeAtMs, durationSeconds, now }: {
  stored: string | null;
  startedAtMs?: number;
  closeAtMs?: number;
  durationSeconds: number;
  now: number;
}): number {
  const saved = stored ? Number(stored) : NaN;
  const hasStart = typeof startedAtMs === "number" && Number.isFinite(startedAtMs);
  const serverDeadline = (hasStart ? startedAtMs : now) + durationSeconds * 1000;
  let deadline = Number.isFinite(saved) && saved > 0 ? saved : serverDeadline;
  if (hasStart) deadline = Math.min(deadline, serverDeadline);
  if (typeof closeAtMs === "number" && Number.isFinite(closeAtMs)) deadline = Math.min(deadline, closeAtMs);
  return deadline;
}

export function remainingQuizSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Lock before waiting for uploads, then take the answer snapshot exactly once. */
export function createQuizSubmissionGate() {
  let phase: "idle" | "waiting" | "sending" | "submitted" = "idle";
  return {
    get phase() { return phase; },
    async run({ waitForUploads, snapshot, submit, onSuccess }: {
      waitForUploads: () => Promise<void>;
      snapshot: () => QuizSubmission;
      submit: (payload: QuizSubmission) => Promise<unknown>;
      onSuccess: () => void;
    }): Promise<boolean> {
      if (phase !== "idle") return false;
      phase = "waiting";
      try {
        await waitForUploads();
        const payload = snapshot();
        phase = "sending";
        await submit(payload);
      } catch (error) {
        phase = "idle";
        throw error;
      }
      phase = "submitted";
      onSuccess();
      return true;
    },
  };
}

export async function waitForQuizUploads(uploads: Iterable<Promise<void>>, timeoutMs = 8000): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(Array.from(uploads)),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
