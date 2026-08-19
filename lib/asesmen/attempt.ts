import { indicesToStableOptionIds, stableOptionIdsToIndices } from "@/lib/questions/option-shuffle";

export function buildStableOptionIds(questionId: string, optionCount: number): string[] {
  return Array.from({ length: optionCount }, (_, index) => `option-${questionId}-${index}`);
}

export function answerToStableOptionIds(
  stableOptionIds: readonly string[],
  answer: unknown,
): string[] {
  if (Array.isArray(answer) && answer.every((value) => typeof value === "number")) {
    return indicesToStableOptionIds(stableOptionIds, answer as number[]);
  }
  if (typeof answer === "number") return indicesToStableOptionIds(stableOptionIds, [answer]);
  if (typeof answer === "string") return stableOptionIds.includes(answer) ? [answer] : [];
  if (Array.isArray(answer) && answer.every((value) => typeof value === "string")) {
    return stableOptionIdsToIndices(stableOptionIds, answer as string[]).map((index) => stableOptionIds[index]);
  }
  return [];
}

export function gradeStableOptionAnswer(input: {
  stableOptionIds: readonly string[];
  correctIndices: readonly number[];
  submitted: unknown;
  questionType?: string;
}): boolean {
  let submittedIds: string[];
  let correctIds: string[];
  try {
    submittedIds = answerToStableOptionIds(input.stableOptionIds, input.submitted);
    correctIds = indicesToStableOptionIds(input.stableOptionIds, input.correctIndices).sort();
  } catch {
    return false;
  }
  const normalizedSubmitted = [...new Set(submittedIds)].sort();
  if (input.questionType === "multiple_choice") return normalizedSubmitted[0] === correctIds[0];
  return normalizedSubmitted.length === correctIds.length && normalizedSubmitted.every((id, index) => id === correctIds[index]);
}
