import type { QuestionType } from "../../../../packages/native-parity/academic/assessment/model";

export function tryoutCorrectIndices(type: QuestionType, content: Record<string, unknown>): number[] {
  if (type === "essay" || type === "short_answer") return [];
  const correctIndices = Array.isArray(content.correctIndices)
    ? content.correctIndices.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0)
    : [];
  if (type === "multiple_choices") return correctIndices;
  if (typeof content.correctIndex === "number" && Number.isInteger(content.correctIndex) && content.correctIndex >= 0) {
    return [content.correctIndex];
  }
  return correctIndices.slice(0, 1);
}
