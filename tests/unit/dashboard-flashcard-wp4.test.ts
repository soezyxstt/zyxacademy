import { describe, expect, test } from "bun:test";
import { isReviewDue, rankFlashcardQueue, weakestFlashcardIdea } from "../../lib/flashcard-ranking";

describe("review selection", () => {
  test("uses absolute due time and canonical active status", () => {
    expect(isReviewDue(null, 100)).toBe(true);
    expect(isReviewDue({ due: new Date(100), status: "active" }, 100)).toBe(true);
    expect(isReviewDue({ due: new Date(101), status: "active" }, 100)).toBe(false);
    expect(isReviewDue({ due: new Date(0), status: "paused" }, 100)).toBe(false);
  });
  test("selects weakest idea and excludes mastered cards", () => {
    const idea = weakestFlashcardIdea([{ ideaId: "b", masteryScore: 0 }, { ideaId: "a", masteryScore: null }, { ideaId: "c", masteryScore: 90 }]);
    expect(idea?.ideaId).toBe("a");
    const base = { cardId: "1", ideaId: "a", confidence: null, seenBefore: false, nextReviewDue: new Date(0) };
    expect(rankFlashcardQueue([{ ...base, masteryScore: null }, { ...base, cardId: "2", masteryScore: 80 }])).toHaveLength(1);
  });
});
