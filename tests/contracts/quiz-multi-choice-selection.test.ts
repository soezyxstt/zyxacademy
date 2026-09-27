import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("Quiz Multi-Choice and Option Indicator Invariants", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  const quizPlayerCode = normalize(readFileSync("components/course/quiz-player.tsx", "utf8"));
  const quizOptionStylesCode = normalize(readFileSync("components/course/quiz-option-styles.ts", "utf8"));
  const studentQuizPageCode = normalize(readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8"));
  const attemptReviewCode = normalize(readFileSync("components/course/attempt-review.tsx", "utf8"));
  const pkaPageCode = normalize(readFileSync("app/(student)/courses/tutorial-pka/simulasi/[subject]/[stage]/page.tsx", "utf8"));
  const submitRouteCode = normalize(readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8"));

  it("ensures quiz-option-styles exports QuizChoiceControl and quizOptionIndicatorClasses", () => {
    expect(quizOptionStylesCode).toContain('export type QuizChoiceControl = "single" | "multiple";');
    expect(quizOptionStylesCode).toContain("export function quizOptionIndicatorClasses(");
    expect(quizOptionStylesCode).toContain('const shape = isCircle ? "rounded-full" : "rounded-md";');
  });

  it("ensures QuizPlayer supports multi-choice toggle and preserves array selection", () => {
    expect(quizPlayerCode).toContain("function isMultipleChoiceQuestion(");
    expect(quizPlayerCode).toContain("function selectOption(qId: string, optionIndex: number, isMultiple: boolean)");
    expect(quizPlayerCode).toContain("currentIndices.filter((idx) => idx !== optionIndex)");
    expect(quizPlayerCode).toContain("[...currentIndices, optionIndex].sort((a, b) => a - b)");
  });

  it("ensures QuizPlayer correctly checks if multi-choice question is answered", () => {
    expect(quizPlayerCode).toContain("if (Array.isArray(val)) return val.length > 0;");
  });

  it("ensures QuizPlayer renders question type badge (Pilihan Jamak vs Pilihan Tunggal)", () => {
    expect(quizPlayerCode).toContain("Pilihan Jamak");
    expect(quizPlayerCode).toContain("Pilihan Tunggal");
    expect(quizPlayerCode).toContain("Pilih semua jawaban yang benar");
    expect(quizPlayerCode).toContain("Pilih 1 jawaban");
  });

  it("ensures QuizPlayer renders circle vs boxie checkbox option indicators", () => {
    expect(quizPlayerCode).toContain("quizOptionIndicatorClasses(");
    expect(quizPlayerCode).toContain('role={isMultiple ? "checkbox" : "radio"}');
    expect(quizPlayerCode).toContain("aria-checked={selected}");
  });

  it("ensures student quiz page maps multiple_choices type and preserves array answers", () => {
    expect(studentQuizPageCode).toContain('isMultiple ? "multiple_choices" :');
    expect(studentQuizPageCode).toContain("initialAnswers[qId] = sel.filter((item) => typeof item === \"number\");");
  });

  it("ensures completed review scoring in pages and submit route treats multiple correct indices as multi-select", () => {
    expect(studentQuizPageCode).toContain('const isMultiple = qType === "multiple_choices" || correctIndices.length > 1;');
    expect(studentQuizPageCode).toContain('} else if (!isMultiple && (qType === "multiple_choice" || !qType)) {');

    expect(pkaPageCode).toContain('const isMultiple = qType === "multiple_choices" || correct.length > 1;');
    expect(pkaPageCode).toContain('} else if (!isMultiple && (qType === "multiple_choice" || !qType)) {');

    expect(submitRouteCode).toContain('const isMultiple = qType === "multiple_choices" || correct.length > 1;');
    expect(submitRouteCode).toContain('if (!isMultiple && (qType === "multiple_choice" || !qType)) {');

    expect(attemptReviewCode).toContain('const isMultiple = qType === "multiple_choices" || correct.length > 1;');
    expect(attemptReviewCode).toContain('if (!isMultiple && (qType === "multiple_choice" || !qType)) {');
  });

  it("ensures attempt review labels Pilihan Jamak when question has multiple correct indices", () => {
    expect(attemptReviewCode).toContain("const isQuestionMultiple = qType === \"multiple_choices\" || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1)");
    expect(attemptReviewCode).toContain("Pilihan Jamak");
    expect(attemptReviewCode).toContain("Pilihan Tunggal");
  });

  it("ensures JSDoc docstrings exist on touched functions", () => {
    expect(quizOptionStylesCode).toContain("Returns class names for styling option letter badges");
    expect(quizOptionStylesCode).toContain("Returns class names for styling choice indicator controls");
    expect(quizPlayerCode).toContain("Checks whether a question allows selecting multiple answers");
    expect(quizPlayerCode).toContain("Checks whether a specific question has an existing valid answer");
    expect(quizPlayerCode).toContain("Updates answer state for an option, supporting multi-select toggle");
    expect(attemptReviewCode).toContain("Determines whether a submitted student answer is correct during review");
  });
});
