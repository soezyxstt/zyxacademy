import { describe, expect, it } from "bun:test";
import {
  getHistoricalSolutionContent,
  isHistoricalReferenceLinkTarget,
} from "@/lib/question-authoring";
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

  it("accepts a canonical payload without Idea links and still rejects incomplete answer data", () => {
    const parsed = questionAuthoringInputSchema.safeParse({
      courseId: "course-1",
      ideaLinks: [],
      prompt: "Pertanyaan",
      questionType: "multiple_choice",
      difficulty: "medium",
      options: ["A", "B"],
      correctIndices: [0],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.ideaLinks).toEqual([]);

    const questions = parseQuestionsMarkdown(`
## Soal 1
**Tipe:** Pilihan Ganda
Pertanyaan tanpa kunci.

A. A
B. B
`);
    expect(validateExtractedQuestion(questions[0], 1)).toContain("kunci jawaban");
  });

  it("defaults omitted Idea links to an empty array", () => {
    const parsed = questionAuthoringInputSchema.parse({
      courseId: "course-1",
      prompt: "Pertanyaan",
      questionType: "multiple_choice",
      difficulty: "medium",
      options: ["A", "B"],
      correctIndices: [0],
    });
    expect(parsed.ideaLinks).toEqual([]);
  });

  it("maps compatibility review status to canonical status", () => {
    expect(canonicalQuestionStatus("generated")).toBe("draft");
    expect(canonicalQuestionStatus("reviewed")).toBe("in_review");
    expect(canonicalQuestionStatus("published")).toBe("published");
    expect(canonicalQuestionStatus("retired")).toBe("retired");
  });

  it("allows only historical_reference targets for new reference links", () => {
    expect(isHistoricalReferenceLinkTarget("historical_reference")).toBe(true);
    expect(isHistoricalReferenceLinkTarget("itb_example")).toBe(false);
    expect(isHistoricalReferenceLinkTarget("zyx_original")).toBe(false);
  });

  it("uses extracted source_solution text and never fabricates a fallback explanation", () => {
    expect(getHistoricalSolutionContent(
      { solutionMetadata: { category: "pembahasan_soal", title: "Solution", subcategory: null, year: null, checksum: null, fileKey: "solution", extractedText: "<!-- source page 2 -->\nLangkah resmi." } },
      { solutionProvenance: "source_solution", questionNumber: "1", part: null },
    )).toBeNull();
    expect(getHistoricalSolutionContent(
      { solutionMetadata: { category: "pembahasan_soal", title: "Solution", subcategory: null, year: null, checksum: null, fileKey: "solution", extractedText: "Soal 1\nLangkah resmi 1.\n\nSoal 2\nLangkah resmi 2." } },
      { solutionProvenance: "source_solution", questionNumber: "1", part: null },
    )).toBe("Soal 1\nLangkah resmi 1.");
    expect(getHistoricalSolutionContent(
      { solutionMetadata: { category: "pembahasan_soal", title: "Solution", subcategory: null, year: null, checksum: null, fileKey: "solution", extractedText: null } },
      { solutionProvenance: "source_solution", questionNumber: "1", part: null },
    )).toBeNull();
    expect(getHistoricalSolutionContent(
      { solutionMetadata: { category: "pembahasan_soal", title: "Solution", subcategory: null, year: null, checksum: null, fileKey: "solution", extractedText: "Generated text" } },
      { solutionProvenance: "zyx_generated", questionNumber: "1", part: null },
    )).toBeNull();
  });

  it("keeps a matching solution part separate from adjacent numbered solutions", () => {
    expect(getHistoricalSolutionContent(
      { solutionMetadata: { category: "pembahasan_soal", title: "Solution", subcategory: null, year: null, checksum: null, fileKey: "solution", extractedText: "1(a)\nBagian a.\n\n1(b)\nBagian b.\n\n2.\nSoal berikutnya." } },
      { solutionProvenance: "source_solution", questionNumber: "1", part: "b" },
    )).toBe("1(b)\nBagian b.");
  });
});
