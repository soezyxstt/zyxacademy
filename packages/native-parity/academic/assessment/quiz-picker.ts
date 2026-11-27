import { questionTypes, type BankQuestion } from "./model";

export type PickerQuestion = Pick<BankQuestion, "id" | "prompt" | "type" | "tags" | "difficulty"> &
  Partial<Pick<BankQuestion, "origin" | "reviewStatus" | "quizSelectable">>;

export type QuizQuestionFilters = {
  difficulty: "" | BankQuestion["difficulty"];
  type: "" | BankQuestion["type"];
  origin: "" | BankQuestion["origin"];
  status: "" | NonNullable<BankQuestion["reviewStatus"]>;
  tag: string;
  selectedOnly: boolean;
};

export const emptyQuizQuestionFilters: QuizQuestionFilters = {
  difficulty: "", type: "", origin: "", status: "", tag: "", selectedOnly: false,
};

export function filterQuizQuestions({
  bank, ids, disabledIds, search, filters,
}: { bank: readonly PickerQuestion[]; ids: readonly string[]; disabledIds: readonly string[]; search: string; filters: QuizQuestionFilters }) {
  const disabled = new Set(disabledIds);
  const selected = new Set(ids);
  const query = search.toLocaleLowerCase("id").trim();
  return bank.filter(question => !disabled.has(question.id) &&
    (!filters.difficulty || question.difficulty === filters.difficulty) &&
    (!filters.type || question.type === filters.type) &&
    (!filters.origin || question.origin === filters.origin) &&
    (!filters.status || (question.reviewStatus ?? (question.quizSelectable ? "published" : undefined)) === filters.status) &&
    (!filters.tag || question.tags.includes(filters.tag)) &&
    (!filters.selectedOnly || selected.has(question.id)) &&
    [question.prompt, questionTypes[question.type], ...question.tags].join(" ").toLocaleLowerCase("id").includes(query));
}

export function addVisibleQuizQuestions(ids: readonly string[], questions: readonly PickerQuestion[]) {
  return [...new Set([...ids, ...questions.flatMap(question => question.quizSelectable === false ? [] : [question.id])])];
}

export function removeVisibleQuizQuestions(ids: readonly string[], questions: readonly PickerQuestion[]) {
  const visibleIds = new Set(questions.map(({ id }) => id));
  return ids.filter(id => !visibleIds.has(id));
}

export function unchangedOrEligibleSelection(ids: readonly string[], originalIds: readonly string[], bank: readonly PickerQuestion[]) {
  if (ids.length === originalIds.length && ids.every((id, index) => id === originalIds[index])) return true;
  const ineligible = new Set(bank.filter(question => question.quizSelectable === false).map(({ id }) => id));
  return ids.every(id => !ineligible.has(id));
}
