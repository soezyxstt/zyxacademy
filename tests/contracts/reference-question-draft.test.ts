import { describe, expect, test } from "bun:test";
import {
  referenceQuestionDraftSchema,
  validateReferenceQuestionDraft,
} from "@/lib/authoring/reference-question-draft";

const source = {
  sourceFileKey: "ref-source-key",
  solutionFileKey: "ref-solution-key",
  institution: "ITB",
  assessmentType: "uts",
  year: 2023,
  academicYearLabel: null,
  term: null,
  title: "Matematika I",
};

const context = {
  courseId: "course-1",
  source: {
    category: "soal" as const,
    title: "Matematika I",
    subcategory: "uts",
    year: 2023,
    checksum: "a".repeat(64),
    pageCount: 10,
    fileKey: "ref-source-key",
  },
  solution: {
    category: "pembahasan_soal" as const,
    title: "Pembahasan UTS Matematika I",
    subcategory: "uts",
    year: 2023,
    checksum: "b".repeat(64),
    pageCount: 10,
    fileKey: "ref-solution-key",
  },
  ideas: new Map([
    ["idea-1", { id: "idea-1", courseId: "course-1", chapterId: "chapter-1", status: "published" }],
  ]),
};

function makeDraft(questionOverrides: Record<string, unknown> = {}) {
  return referenceQuestionDraftSchema.parse({
    schemaVersion: "reference-question-draft.v1",
    source,
    questions: [{
      localId: "q-1",
      questionNumber: "4",
      part: null,
      page: 2,
      prompt: "Pilih jawaban yang benar.",
      questionType: "multiple_choice",
      options: ["A", "B", "C", "D"],
      correctIndices: [0],
      acceptableAnswers: [],
      answerProvenance: "official",
      solutionProvenance: "source_solution",
      difficulty: "medium",
      cognitiveLevel: "understand",
      ideaLinks: [{ ideaId: "idea-1", weight: 1, role: "primary" }],
      quizEligible: true,
      ...questionOverrides,
    }],
  });
}

describe("historical reference question draft", () => {
  test("accepts a source-backed, course-scoped, quiz-eligible draft", () => {
    const result = validateReferenceQuestionDraft(makeDraft(), context);
    expect(result.valid).toBe(true);
    expect(result.questionCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
  });

  test("rejects cross-course Ideas and invalid source pages", () => {
    const result = validateReferenceQuestionDraft(
      makeDraft({ page: 11 }),
      {
        ...context,
        ideas: new Map([
          ["idea-1", { id: "idea-1", courseId: "course-2", chapterId: "chapter-2", status: "published" }],
        ]),
      },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "HISTORICAL_PAGE_OUT_OF_RANGE",
      "HISTORICAL_IDEA_COURSE_MISMATCH",
    ]));
  });

  test("does not allow essay questions into the quiz runtime", () => {
    const result = validateReferenceQuestionDraft(makeDraft({
      questionType: "essay",
      options: [],
      correctIndices: [],
      answerProvenance: "unavailable",
      quizEligible: true,
    }), context);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("HISTORICAL_ESSAY_NOT_QUIZ_ELIGIBLE");
    expect(result.eligibleCount).toBe(0);
  });

  test("requires available answer provenance for quiz eligibility", () => {
    const result = validateReferenceQuestionDraft(makeDraft({ answerProvenance: "unavailable" }), context);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("HISTORICAL_QUIZ_PROVENANCE_INVALID");
    expect(result.eligibleCount).toBe(0);
  });

  test("requires a solution file when solution provenance is source-backed", () => {
    const draft = makeDraft({ solutionProvenance: "source_solution" });
    draft.source.solutionFileKey = null;
    const result = validateReferenceQuestionDraft(
      draft,
      { ...context, solution: null },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("HISTORICAL_PROVENANCE_SOURCE_MISSING");
  });

  test("rejects resolved source metadata that does not match the draft", () => {
    const result = validateReferenceQuestionDraft(makeDraft(), {
      ...context,
      source: { ...context.source, fileKey: "another-source-key" },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("HISTORICAL_SOURCE_FILE_MISMATCH");
  });

  test("rejects invalid page-count metadata before page-range validation", () => {
    const result = validateReferenceQuestionDraft(makeDraft(), {
      ...context,
      source: { ...context.source, pageCount: 0 },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("HISTORICAL_SOURCE_PAGE_COUNT_INVALID");
  });
});
