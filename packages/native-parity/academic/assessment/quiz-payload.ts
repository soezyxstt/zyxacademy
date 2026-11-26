import type { QuizInput } from "./model";

type QuizAvailability = Pick<QuizInput, "manualStatus" | "openAt" | "closeAt">;
export type QuizScheduleMode = "manual" | "scheduled";

export function initialQuizScheduleMode(input: QuizAvailability): QuizScheduleMode {
  return input.manualStatus === "scheduled" || input.openAt || input.closeAt ? "scheduled" : "manual";
}

export function quizAvailability(input: QuizAvailability, mode: QuizScheduleMode): QuizAvailability {
  if (mode === "scheduled") return {
    manualStatus: input.manualStatus,
    openAt: input.openAt?.trim() || null,
    closeAt: input.closeAt?.trim() || null,
  };
  return { manualStatus: input.manualStatus === "scheduled" ? "open" : input.manualStatus, openAt: null, closeAt: null };
}

/** Shared payload for course quiz authors and the Admin eval quiz editor. */
export function quizAuthoringPayload(input: QuizInput) {
  const settings = input.settings;
  const selection = input.selection;
  return {
    title: input.title.trim(),
    category: input.category,
    visibility: input.visibility,
    status: input.status,
    manualStatus: input.manualStatus,
    openAt: input.openAt ? new Date(input.openAt).toISOString() : null,
    closeAt: input.closeAt ? new Date(input.closeAt).toISOString() : null,
    timeLimitSeconds: input.timeLimitSeconds,
    maxAttempts: input.maxAttempts,
    showDiscussion: settings.explanationRelease !== "never",
    selectionRules: {
      ...settings,
      ...(selection.mode === "specific"
        ? { count: selection.questionIds.length, fixedQuestionIds: selection.questionIds, tags: [] }
        : { count: selection.count, difficulty_proportions: selection.difficulty, tags: selection.tags }),
    },
  };
}
