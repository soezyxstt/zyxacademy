import { describe, expect, it } from "bun:test";
import { materialMatchesDocumentFilters, type DocumentFilterState } from "@/lib/document-filters";
import { rankFlashcardQueue } from "@/lib/flashcard-ranking";
import { selectDailyTrivia, validateDailyTriviaCandidate, type DailyTriviaCandidate } from "@/lib/daily-trivia";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { clampTutorPanelWidth } from "@/lib/tutor-panel-layout";
import { appendFlashcardRetry, skipFlashcardInSession } from "@/lib/flashcard-session";

function filters(values: Partial<Record<keyof DocumentFilterState, string[]>> = {}): DocumentFilterState {
  return {
    categories: new Set(values.categories ?? []),
    subcategories: new Set(values.subcategories ?? []),
    chapters: new Set(values.chapters ?? []),
    years: new Set(values.years ?? []),
  };
}

const material: CourseMaterial = {
  id: "material-1",
  courseId: "course-1",
  title: "Integral lipat",
  kind: "pdf",
  docCategory: "soal",
  subcategory: "tutorial",
  year: 2025,
  chapterIds: ["bab-1", "bab-2"],
  completed: false,
};

describe("document filters", () => {
  it("uses OR inside a group and AND between groups", () => {
    expect(materialMatchesDocumentFilters(material, filters({ categories: ["materi", "soal"], chapters: ["bab-2"], years: ["2025"] }), "integral")).toBe(true);
    expect(materialMatchesDocumentFilters(material, filters({ categories: ["materi", "soal"], chapters: ["bab-3"] }), "")).toBe(false);
    expect(materialMatchesDocumentFilters(material, filters({ categories: ["materi"], chapters: ["bab-2"] }), "")).toBe(false);
  });
});

describe("flashcard queue priority", () => {
  it("prioritizes low mastery, unseen cards, oldest due dates, and stable IDs", () => {
    const ranked = rankFlashcardQueue([
      { cardId: "mapped-high", ideaId: "idea-2", masteryScore: 70, confidence: 80, seenBefore: false, nextReviewDue: new Date("2026-09-01") },
      { cardId: "mapped-seen", ideaId: "idea-1", masteryScore: 20, confidence: 70, seenBefore: true, nextReviewDue: new Date("2026-08-01") },
      { cardId: "mapped-new", ideaId: "idea-3", masteryScore: 20, confidence: null, seenBefore: false, nextReviewDue: new Date("2026-09-01") },
      { cardId: "unmapped", ideaId: null, masteryScore: null, confidence: null, seenBefore: false, nextReviewDue: new Date(0) },
      { cardId: "mastered", ideaId: "idea-4", masteryScore: 80, confidence: 90, seenBefore: true, nextReviewDue: new Date(0) },
    ]);
    expect(ranked.map((item) => item.cardId)).toEqual(["mapped-new", "mapped-seen", "mapped-high", "unmapped"]);
  });

  it("moves skipped and repeat cards to the session tail without fabricating review data", () => {
    const queue = [{ id: "a", reviews: 0 }, { id: "b", reviews: 1 }, { id: "c", reviews: 2 }];
    expect(skipFlashcardInSession(queue, 0)).toEqual([queue[1], queue[2], queue[0]]);
    expect(skipFlashcardInSession([queue[0]], 0)).toEqual([queue[0]]);
    expect(appendFlashcardRetry(queue, queue[0])).toEqual([...queue, queue[0]]);
    expect(queue[0].reviews).toBe(0);
  });
});

function candidate(overrides: Partial<DailyTriviaCandidate> = {}): DailyTriviaCandidate {
  return {
    id: "question-1",
    prompt: "Berapa hasil 2 + 2?",
    options: ["3", "4", "5"],
    correctIndices: [1],
    explanation: "Dua ditambah dua adalah empat.",
    questionType: "multiple_choice",
    tags: ["trivia"],
    status: "active",
    reviewStatus: "published",
    isStale: false,
    knowledgeObjectId: "ko-1",
    ...overrides,
  };
}

describe("daily trivia validation", () => {
  it("fails closed for feedback, missing anchors, and malformed options", () => {
    expect(validateDailyTriviaCandidate(candidate({ tags: ["trivia", "feedback"] }), true)).toBeNull();
    expect(validateDailyTriviaCandidate(candidate({ knowledgeObjectId: null }), false)).toBeNull();
    expect(validateDailyTriviaCandidate(candidate({ options: ["4", "4"] }), true)).toBeNull();
    expect(validateDailyTriviaCandidate(candidate({ correctIndices: [0, 1] }), true)).toBeNull();
  });

  it("keeps selection stable for a course and Jakarta day", () => {
    const first = validateDailyTriviaCandidate(candidate(), true)!;
    const second = { ...first, id: "question-2" };
    const date = new Date("2026-09-03T04:00:00.000Z");
    expect(selectDailyTrivia([first, second], "course-a", date)?.id).toBe(selectDailyTrivia([second, first], "course-a", date)?.id);
  });
});

describe("Zyra panel width", () => {
  it("uses the same desktop limits for pointer and keyboard resize", () => {
    expect(clampTutorPanelWidth(100, 1536)).toBe(360);
    expect(clampTutorPanelWidth(900, 1536)).toBe(720);
    expect(clampTutorPanelWidth(700, 1000)).toBe(500);
  });
});
