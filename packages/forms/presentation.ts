export type FormDisplayMode = "question" | "section";

export type FormStep =
  | { kind: "cover" }
  | { kind: "email" }
  | { kind: "section" | "statement" | "question"; questionIndex: number }
  | { kind: "page"; questionIndices: number[]; includeEmail: boolean; includeCover: boolean };

export interface FormQuestion {
  type: string;
  required?: boolean;
  gridRows?: string[];
}

// The first section is implicit. An explicit SECTION starts a new page and
// stays with the questions that follow it, including empty or closing sections.
export function buildFormSteps(
  questions: FormQuestion[],
  mode: FormDisplayMode = "question",
  collectEmail = false,
): FormStep[] {
  if (mode === "section") {
    const pages: Extract<FormStep, { kind: "page" }>[] = [];
    let page: Extract<FormStep, { kind: "page" }> = {
      kind: "page", questionIndices: [], includeCover: true, includeEmail: collectEmail,
    };
    questions.forEach((question, index) => {
      if (question.type === "SECTION" && page.questionIndices.length > 0) {
        pages.push(page);
        page = { kind: "page", questionIndices: [], includeCover: false, includeEmail: false };
      }
      page.questionIndices.push(index);
    });
    pages.push(page);
    return pages;
  }
  const steps: FormStep[] = [{ kind: "cover" }];
  if (collectEmail) steps.push({ kind: "email" });
  questions.forEach((question, questionIndex) => {
    const kind = question.type === "SECTION" ? "section" : question.type === "STATEMENT" ? "statement" : "question";
    steps.push({ kind, questionIndex });
  });
  return steps;
}

export const PUBLIC_FORM_MAX_FILE_SIZE_MB = 50;

export function formFileSizeLimitMb(configured?: number): number {
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? Math.min(configured, PUBLIC_FORM_MAX_FILE_SIZE_MB)
    : 10;
}

export function isEmptyFormAnswer(question: FormQuestion, value: unknown): boolean {
  if (value == null || (typeof value === "string" && !value.trim())) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (question.type === "GRID_RADIO" || question.type === "GRID_CHECKBOX") {
    if (typeof value !== "object" || !value) return true;
    return (question.gridRows || []).some((row) => {
      const answer = (value as Record<string, unknown>)[row];
      return answer == null || answer === "" || (Array.isArray(answer) && answer.length === 0);
    });
  }
  return false;
}
