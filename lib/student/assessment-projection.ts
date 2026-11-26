import type { Answer, Answers, AssessmentQuestion, Availability, ReviewedQuestion, TryoutAnswer } from "@/packages/native-parity/student/assessment/contract";
import { checkAnswerCorrectness, questionAnswerType } from "@/lib/gamification/question-grading";
import { publicQuizOptionTexts } from "@/lib/quiz/review-release";

export function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function objectRecord(value: unknown): Record<string, unknown> {
  const source = decoded(value);
  return source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};
}

export function records(value: unknown): Record<string, unknown>[] {
  const source = decoded(value);
  return Array.isArray(source) ? source.map(objectRecord).filter((row) => typeof row.id === "string") : [];
}

export function assessmentAvailability(allowed: boolean, dates: { openAt: Date | null; closeAt: Date | null; manualStatus?: string }, now = new Date()): Availability {
  if (!allowed) return "locked";
  if (dates.manualStatus === "closed") return "closed";
  if (dates.manualStatus === "open") return "open";
  if (dates.closeAt && now > dates.closeAt) return "closed";
  if (dates.openAt && now < dates.openAt) return "upcoming";
  return "open";
}

export function projectQuestion(raw: Record<string, unknown>): AssessmentQuestion {
  const type = questionAnswerType(raw);
  const correctOptionCount = numberArray(raw.correct_indices ?? raw.correctIndices).length;
  return {
    id: String(raw.id),
    type: type === "short_answer" || type === "essay" || type === "multiple_choices"
      ? type : type === "checkbox" || type === "multi_select" || correctOptionCount > 1 ? "multiple_choices" : "multiple_choice",
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    options: publicQuizOptionTexts(raw.options),
    sourceEventName: typeof raw.sourceEventName === "string" ? raw.sourceEventName : undefined,
    acceptsImage: raw.acceptsImage === true,
    acceptsFile: raw.acceptsFile === true,
  };
}

function numberArray(value: unknown): number[] {
  const parsed = decoded(value);
  return Array.isArray(parsed) ? parsed.filter((entry): entry is number => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0) : [];
}

function optionIndices(value: unknown, stableIds: unknown): number[] {
  if (typeof value === "number") return numberArray([value]);
  if (Array.isArray(value) && Array.isArray(stableIds) && value.every((id) => typeof id === "string")) {
    return numberArray(value.map((id) => stableIds.indexOf(id)));
  }
  return numberArray(value);
}

export function readQuizAnswers(snapshot: unknown, rows: readonly Record<string, unknown>[]): Answers {
  const answers = objectRecord(snapshot);
  return Object.fromEntries(rows.flatMap((row): [string, Answer][] => {
    const question = projectQuestion(row);
    const value = answers[question.id];
    if (question.type === "essay") {
      if (typeof value === "string") return [[question.id, { text: value }]];
      const essay = objectRecord(value);
      if (typeof essay.text === "string" || typeof essay.fileKey === "string") {
        return [[question.id, {
          text: typeof essay.text === "string" ? essay.text : "",
          fileKey: typeof essay.fileKey === "string" ? essay.fileKey : undefined,
          fileName: typeof essay.fileName === "string" ? essay.fileName : undefined,
          fileSize: typeof essay.fileSize === "string" ? essay.fileSize : undefined,
        }]];
      }
    }
    if (question.type === "short_answer" && typeof value === "string") return [[question.id, value]];
    if (question.type === "multiple_choice" || question.type === "multiple_choices") {
      const indices = optionIndices(value, row.stable_option_ids ?? row.stableOptionIds).filter((i) => i < question.options.length);
      if (indices.length) return [[question.id, question.type === "multiple_choice" ? indices[0] : indices]];
    }
    return [];
  }));
}

function optionLabels(options: string[], indices: number[]): string | null {
  return indices.flatMap((index) => options[index] === undefined ? [] : [`${String.fromCharCode(65 + index)}. ${options[index]}`]).join("\n") || null;
}

function textLabel(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  const essay = objectRecord(value);
  return [essay.text, essay.fileName].filter((part) => typeof part === "string" && part.trim()).join("\n") || null;
}

function textAnswers(raw: unknown): string | null {
  const list = decoded(raw);
  return Array.isArray(list) ? list.filter((value) => typeof value === "string").join(" / ") || null : null;
}

export function quizReviewAttachment(question: AssessmentQuestion, submitted: unknown) {
  if (question.type !== "essay") return null;
  const { fileName, fileKey, fileSize } = objectRecord(submitted);
  if (typeof fileName !== "string" || !fileName.trim() || typeof fileKey !== "string" || !fileKey.trim()) return null;
  return { fileKey, fileName, fileSize: typeof fileSize === "string" ? fileSize : undefined };
}

export function reviewQuizQuestion(raw: Record<string, unknown>, submitted: unknown, feedback?: string): ReviewedQuestion {
  const question = projectQuestion(raw);
  const choice = question.type === "multiple_choice" || question.type === "multiple_choices";
  const file = quizReviewAttachment(question, submitted);
  const selected = choice ? optionLabels(question.options, optionIndices(submitted, raw.stable_option_ids ?? raw.stableOptionIds))
    : file ? textLabel(objectRecord(submitted).text) : textLabel(submitted);
  const expected = choice
    ? optionLabels(question.options, optionIndices(raw.correct_indices ?? raw.correctIndices ?? raw.correctIndex, undefined))
    : textAnswers(raw.acceptable_answers ?? raw.acceptableAnswers);
  return {
    ...question, selected, expected,
    ...(file ? { attachment: { fileName: file.fileName, fileSize: file.fileSize } } : {}),
    correct: typeof raw.gradedCorrect === "boolean" ? raw.gradedCorrect : question.type === "essay" ? null : checkAnswerCorrectness(raw, submitted),
    explanation: typeof raw.explanation === "string" ? raw.explanation : "", feedback,
  };
}

export function reviewTryoutQuestion(raw: Record<string, unknown>, submitted: unknown): ReviewedQuestion {
  const ans = objectRecord(submitted);
  const question = projectQuestion(raw);
  const submittedIndices = optionIndices(ans.index ?? ans.indices, undefined);
  const expectedIndices = optionIndices(raw.correctIndex ?? raw.correctIndices, undefined);
  const choice = question.type === "multiple_choice" || question.type === "multiple_choices";
  const accepted = decoded(raw.acceptableAnswers);
  const value = typeof ans.text === "string" ? ans.text.trim().toLowerCase() : "";
  let correct: boolean | null = null;
  if (choice) correct = expectedIndices.length > 0 && submittedIndices.length === expectedIndices.length && new Set(submittedIndices).size === submittedIndices.length && submittedIndices.every((index) => expectedIndices.includes(index));
  if (question.type === "short_answer") correct = Array.isArray(accepted) && accepted.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === value);
  return {
    ...question,
    selected: choice ? optionLabels(question.options, submittedIndices) : textLabel(ans),
    expected: choice ? optionLabels(question.options, expectedIndices) : textAnswers(accepted),
    correct,
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
  };
}

export function validTryoutAnswer(answer: TryoutAnswer, question: AssessmentQuestion): boolean {
  if (answer.type !== question.type) return false;
  if (answer.type === "multiple_choice") return answer.index === null || answer.index < question.options.length;
  if (answer.type === "multiple_choices") return new Set(answer.indices).size === answer.indices.length && answer.indices.every((i) => i < question.options.length);
  return !answer.fileKey || question.acceptsImage === true || question.acceptsFile === true;
}
