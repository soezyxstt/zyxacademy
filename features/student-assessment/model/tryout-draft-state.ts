import type { ExamFixture, QuestionSpec } from "@/lib/student-course-fixtures";

export type AnswerState =
  | { type: "short_answer"; text: string; fileName: string | null }
  | { type: "multiple_choice"; index: number | null }
  | { type: "multiple_choices"; indices: number[] }
  | {
      type: "essay";
      text: string;
      fileName: string | null;
      fileSize?: string;
      fileKey?: string | null;
    };

export type PublicQuestion<T = QuestionSpec> = T extends QuestionSpec
  ? Omit<T, "correctIndex" | "correctIndices" | "acceptableAnswers">
  : never;

export type TryoutPresentationExam = Omit<ExamFixture, "questions"> & {
  questions: PublicQuestion[];
};

export interface TryoutDraftPayload {
  answers: Record<string, AnswerState>;
  flags: Record<string, boolean>;
  index: number;
}

export const TRYOUT_DRAFT_VERSION = 1;

export function emptyTryoutAnswer(q: PublicQuestion): AnswerState {
  if (q.type === "short_answer") {
    return { type: "short_answer", text: "", fileName: null };
  }
  if (q.type === "multiple_choice") {
    return { type: "multiple_choice", index: null };
  }
  if (q.type === "multiple_choices") {
    return { type: "multiple_choices", indices: [] };
  }
  return { type: "essay", text: "", fileName: null, fileSize: "" };
}

export function createInitialTryoutDraft(
  questions: PublicQuestion[]
): TryoutDraftPayload {
  const answers: Record<string, AnswerState> = {};
  for (const q of questions) {
    answers[q.id] = emptyTryoutAnswer(q);
  }
  return {
    answers,
    flags: {},
    index: 0,
  };
}

export function isTryoutQuestionAnswered(
  question: PublicQuestion,
  answers: Record<string, AnswerState>
): boolean {
  const ans = answers[question.id];
  if (!ans) return false;
  if (ans.type === "multiple_choice") return ans.index !== null;
  if (ans.type === "multiple_choices") return ans.indices.length > 0;
  if (ans.type === "short_answer" || ans.type === "essay") {
    const textDone = ans.text.trim() !== "";
    const fileDone = ans.fileName !== null;
    return textDone || fileDone;
  }
  return false;
}

export function validateTryoutDraft(
  raw: unknown,
  questions: PublicQuestion[]
): TryoutDraftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<TryoutDraftPayload>;
  if (!candidate.answers || typeof candidate.answers !== "object") return null;

  const base = createInitialTryoutDraft(questions);
  const mergedAnswers: Record<string, AnswerState> = { ...base.answers };

  for (const q of questions) {
    const stored = candidate.answers[q.id];
    if (!stored || typeof stored !== "object" || stored.type !== q.type) continue;
    if (stored.type === "multiple_choice") {
      if (stored.index === null || typeof stored.index === "number") {
        mergedAnswers[q.id] = { type: "multiple_choice", index: stored.index };
      }
    } else if (stored.type === "multiple_choices") {
      if (Array.isArray(stored.indices)) {
        mergedAnswers[q.id] = {
          type: "multiple_choices",
          indices: stored.indices.filter((n): n is number => typeof n === "number"),
        };
      }
    } else if (stored.type === "short_answer") {
      if (typeof stored.text === "string") {
        mergedAnswers[q.id] = {
          type: "short_answer",
          text: stored.text,
          fileName: typeof stored.fileName === "string" ? stored.fileName : null,
        };
      }
    } else if (stored.type === "essay") {
      if (typeof stored.text === "string") {
        mergedAnswers[q.id] = {
          type: "essay",
          text: stored.text,
          fileName: typeof stored.fileName === "string" ? stored.fileName : null,
          fileSize: typeof stored.fileSize === "string" ? stored.fileSize : "",
          fileKey: typeof stored.fileKey === "string" ? stored.fileKey : null,
        };
      }
    }
  }

  const flags: Record<string, boolean> = {};
  if (candidate.flags && typeof candidate.flags === "object") {
    for (const q of questions) {
      if (typeof candidate.flags[q.id] === "boolean") {
        flags[q.id] = candidate.flags[q.id];
      }
    }
  }

  const maxIndex = Math.max(0, questions.length - 1);
  const rawIndex = typeof candidate.index === "number" ? Math.trunc(candidate.index) : 0;
  const clampedIndex = Math.min(maxIndex, Math.max(0, rawIndex));

  return {
    answers: mergedAnswers,
    flags,
    index: clampedIndex,
  };
}

export function getTryoutDraftStorageKey(
  courseId: string,
  examId: string,
  isDemo: boolean
): string {
  return `zyx:tryout-draft:${isDemo ? "demo" : "live"}:${courseId}:${examId}`;
}
