import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { isMultipleChoiceQuestion, isQuizAnswerComplete, selectQuizOption } from "@/lib/quiz/player-state";
import { checkAnswerCorrectness } from "@/lib/gamification/question-grading";

describe("Quiz Multi-Choice and Option Indicator Invariants", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  const quizPlayerCode = ["components/course/quiz-player.tsx", "features/student-assessment/ui/shared/quiz-player-parts.tsx", "hooks/use-quiz-player.ts", "lib/quiz/player-state.ts"].map(path => normalize(readFileSync(path, "utf8"))).join("\n");
  const quizOptionStylesCode = normalize(readFileSync("components/course/quiz-option-styles.ts", "utf8"));
  const studentQuizPageCode = normalize(readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8"));
  const studentQuizReviewCode = normalize(readFileSync("components/course/student-quiz-review.tsx", "utf8"));
  const attemptReviewCode = ["components/course/attempt-review.tsx", "lib/quiz/review.ts"].map(path => normalize(readFileSync(path, "utf8"))).join("\n");
  const pkaPageCode = normalize(readFileSync("app/(student)/courses/tutorial-pka/simulasi/[subject]/[stage]/page.tsx", "utf8"));
  const submitRouteCode = normalize(readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8"));

  it("ensures quiz-option-styles exports QuizChoiceControl and quizOptionIndicatorClasses", () => {
    expect(quizOptionStylesCode).toContain('export type QuizChoiceControl = "single" | "multiple";');
    expect(quizOptionStylesCode).toContain("export function quizOptionIndicatorClasses(");
    expect(quizOptionStylesCode).toContain('const shape = isCircle ? "rounded-full" : "rounded-md";');
  });

  it("supports multi-choice toggle and preserves array selection", () => {
    expect(isMultipleChoiceQuestion("multiple_choices")).toBe(true);
    expect(isMultipleChoiceQuestion("multi_select")).toBe(true);
    expect(isMultipleChoiceQuestion("multiple_choice")).toBe(false);
    expect(selectQuizOption([2, 0], 1, true)).toEqual([0, 1, 2]);
    expect(selectQuizOption([0, 1, 2], 1, true)).toEqual([0, 2]);
    expect(selectQuizOption(2, 1, true)).toEqual([1, 2]);
    expect(selectQuizOption([0, 2], 1, false)).toBe(1);
  });

  it("counts only non-empty multi-choice answers", () => {
    expect(isQuizAnswerComplete([])).toBe(false);
    expect(isQuizAnswerComplete([0, 2])).toBe(true);
    expect(isQuizAnswerComplete(0)).toBe(true);
  });

  it("ensures QuizPlayer renders distinct instructions for single and multiple choices", () => {
    expect(quizPlayerCode).toContain('t("quiz.chooseAllCorrect")');
    expect(quizPlayerCode).toContain('t("quiz.chooseOne")');
    const quizMessages = JSON.parse(readFileSync("messages/id/learning.json", "utf8")).quiz;
    expect(quizMessages.multipleChoice).toBe("Pilihan jamak");
    expect(quizMessages.singleChoice).toBe("Pilihan tunggal");
    expect(quizMessages.chooseAllCorrect).toBe("Pilih semua jawaban yang benar");
    expect(quizMessages.chooseOne).toBe("Pilih satu jawaban");
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
    expect(studentQuizReviewCode).toContain('checkAnswerCorrectness(q, rawSubmitted)');

    expect(pkaPageCode).toContain('const isMultiple = qType === "multiple_choices" || correct.length > 1;');
    expect(pkaPageCode).toContain('} else if (!isMultiple && (qType === "multiple_choice" || !qType)) {');

    expect(submitRouteCode).toContain("checkAnswerCorrectness(q, submitted)");
    expect(checkAnswerCorrectness({ question_type: "multiple_choice", correct_indices: [0, 2] }, [2, 0])).toBe(true);
    expect(checkAnswerCorrectness({ question_type: "multiple_choice", correct_indices: [0, 2] }, [0])).toBe(false);
    expect(checkAnswerCorrectness({ question_type: "multiple_choice", correct_indices: [0] }, [0, 1])).toBe(false);

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
