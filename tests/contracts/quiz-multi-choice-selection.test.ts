import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("Quiz Multi-Choice and Option Indicator Invariants", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  const quizPlayerCode = normalize(readFileSync("components/course/quiz-player.tsx", "utf8"));
  const quizOptionStylesCode = normalize(readFileSync("components/course/quiz-option-styles.ts", "utf8"));
  const studentQuizPageCode = normalize(readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8"));
  const attemptReviewCode = normalize(readFileSync("components/course/attempt-review.tsx", "utf8"));

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

  it("ensures attempt review labels Pilihan Jamak vs Pilihan Tunggal", () => {
    expect(attemptReviewCode).toContain('qType === "multiple_choices"');
    expect(attemptReviewCode).toContain("Pilihan Jamak");
    expect(attemptReviewCode).toContain("Pilihan Tunggal");
  });
});
