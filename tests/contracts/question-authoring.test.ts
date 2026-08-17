import { describe, expect, it } from "bun:test";
import {
  canonicalQuestionStatus,
  questionAuthoringInputSchema,
} from "@/lib/question-authoring-contract";
import { parseQuestionsMarkdown, validateExtractedQuestion } from "@/lib/question-markdown";

describe("canonical question authoring contract", () => {
  it("parses the current Markdown sample with an explicit question type", () => {
    const questions = parseQuestionsMarkdown(`
## Soal 1
**Tipe:** Pilihan Ganda
**Kesulitan:** Sedang
**Level Kognitif:** Menerapkan
**Pola Penalaran:** direct_application
Tentukan hasil dari $2 + 2$.

A. 3
B. 4
C. 5
D. 6

**Jawaban:** B
**Pembahasan:** $2+2=4$.
`);

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      questionType: "multiple_choice",
      difficulty: "medium",
      cognitiveLevel: "apply",
      reasoningPattern: "direct_application",
      options: ["3", "4", "5", "6"],
      correctIndices: [1],
    });
    expect(validateExtractedQuestion(questions[0], 1)).toBeNull();
  });

  it("supports multiple correct answers and short-answer aliases", () => {
    const questions = parseQuestionsMarkdown(`
## Soal 1
**Type:** multiple_choices
**Answer:** A, C
Pilih pernyataan yang benar.

A. Benar
B. Salah
C. Benar juga
D. Salah

## Soal 2
**Tipe:** Isian Singkat
Berapakah hasilnya?
**Jawaban:** 12; duabelas
`);

    expect(questions[0].correctIndices).toEqual([0, 2]);
    expect(questions[0].questionType).toBe("multiple_choices");
    expect(questions[1].acceptableAnswers).toEqual(["12", "duabelas"]);
    expect(validateExtractedQuestion(questions[0], 1)).toBeNull();
    expect(validateExtractedQuestion(questions[1], 2)).toBeNull();
  });

  it("rejects a canonical payload without Idea links or complete answer data", () => {
    const parsed = questionAuthoringInputSchema.safeParse({
      courseId: "course-1",
      prompt: "Pertanyaan",
      questionType: "multiple_choice",
      difficulty: "medium",
      options: ["A", "B"],
      correctIndices: [0],
    });
    expect(parsed.success).toBe(false);

    const questions = parseQuestionsMarkdown(`
## Soal 1
**Tipe:** Pilihan Ganda
Pertanyaan tanpa kunci.

A. A
B. B
`);
    expect(validateExtractedQuestion(questions[0], 1)).toContain("kunci jawaban");
  });

  it("maps compatibility review status to canonical status", () => {
    expect(canonicalQuestionStatus("generated")).toBe("draft");
    expect(canonicalQuestionStatus("reviewed")).toBe("in_review");
    expect(canonicalQuestionStatus("published")).toBe("published");
    expect(canonicalQuestionStatus("retired")).toBe("retired");
  });
});
