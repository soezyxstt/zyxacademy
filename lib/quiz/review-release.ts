import { normalizeDate } from "@/lib/date-utils";
import { sanitizeQuestionsSnapshot } from "@/lib/assessment-serialization";

/** Match the quiz's manual override and scheduled close behavior. */
export function isQuizDiscussionClosed({
  manualStatus,
  closeAt,
  now,
}: {
  manualStatus: string | null | undefined;
  closeAt: Date | null;
  now: Date;
}): boolean {
  return manualStatus === "closed" || Boolean(manualStatus !== "open" && closeAt && now > closeAt);
}

/** Resolve the template's discussion policy for this student. */
export function canViewQuizDiscussion({
  explanationRelease,
  showDiscussion,
  isQuizClosed,
  hasCompletedAttempt,
}: {
  explanationRelease: unknown;
  showDiscussion: boolean | null | undefined;
  isQuizClosed: boolean;
  hasCompletedAttempt: boolean;
}): boolean {
  // The form stores "immediate" for release after a student submits. Older
  // templates without an explicit rule use the showDiscussion fallback.
  const policy = explanationRelease === undefined || explanationRelease === null || explanationRelease === ""
    ? (showDiscussion === false ? "never" : "after_close")
    : explanationRelease;
  if (policy === "immediate") return hasCompletedAttempt;
  if (policy === "after_close") return isQuizClosed;
  return false;
}

/** Extract only display text from legacy option objects. */
export function publicQuizOptionTexts(value: unknown): string[] {
  const options = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object" || Array.isArray(option)) return null;
      const record = option as Record<string, unknown>;
      for (const key of ["text", "label", "value", "content"]) {
        if (typeof record[key] === "string") return record[key];
      }
      return null;
    })
    .filter((option): option is string => option !== null);
}

/** Project only review fields, and never project questions before release. */
export function projectQuizReviewSnapshot(snapshot: unknown, released: boolean) {
  if (!released || !Array.isArray(snapshot)) return [];

  return snapshot.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const question = value as Record<string, unknown>;
    const [clean] = sanitizeQuestionsSnapshot([{
      id: question.id,
      prompt: question.prompt,
      options: publicQuizOptionTexts(question.options),
      question_type: question.question_type ?? question.questionType ?? question.type,
      difficulty: question.difficulty,
      origin: question.origin,
      sourceEventName: question.sourceEventName ?? question.source_event_name,
      sourceReferenceId: question.sourceReferenceId ?? question.source_reference_id,
      correct_indices: question.correct_indices ?? question.correctIndices,
      acceptable_answers: question.acceptable_answers ?? question.acceptableAnswers,
      explanation: question.explanation,
    }], "completed", "released");

    return [{
      id: clean.id,
      prompt: clean.prompt,
      options: clean.options,
      question_type: clean.question_type,
      correct_indices: clean.correct_indices ?? [],
      acceptable_answers: clean.acceptable_answers,
      explanation: clean.explanation ?? "",
      difficulty: clean.difficulty ?? "",
      origin: clean.origin,
      sourceEventName: clean.sourceEventName,
      sourceReferenceId: clean.sourceReferenceId,
      ...(typeof question.gradedCorrect === "boolean" ? { gradedCorrect: question.gradedCorrect } : {}),
    }];
  });
}


/** Resolve release for direct APIs as well as the review page. Missing policies fail closed. */
export function canViewAttemptDiscussion(
  template: { selectionRules: unknown; showDiscussion: boolean | null; manualStatus: string | null; closeAt: Date | string | number | null } | undefined,
  attemptStatus: string,
  now = new Date(),
): boolean {
  if (!template || attemptStatus !== "completed") return false;
  let rules: unknown = template.selectionRules;
  if (typeof rules === "string") {
    try { rules = JSON.parse(rules); } catch { return false; }
  }
  if (rules !== null && rules !== undefined && (typeof rules !== "object" || Array.isArray(rules))) return false;
  const explanationRelease = (rules as Record<string, unknown> | null | undefined)?.explanationRelease;
  const closeAt = template.closeAt === null ? null : normalizeDate(template.closeAt);
  if (closeAt && Number.isNaN(closeAt.getTime())) return false;
  return canViewQuizDiscussion({
    explanationRelease,
    showDiscussion: template.showDiscussion,
    isQuizClosed: isQuizDiscussionClosed({ manualStatus: template.manualStatus, closeAt, now }),
    hasCompletedAttempt: true,
  });
}
