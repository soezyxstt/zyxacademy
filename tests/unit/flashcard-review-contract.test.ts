import { describe, expect, test } from "bun:test";
import { flashcardReviewInputSchema, flashcardReviewResultSchema } from "../../lib/flashcards/review-contract";
import { appendFlashcardRetry, skipFlashcardInSession } from "../../lib/flashcard-session";

describe("flashcard session review boundary", () => {
  test("rejects non-SM-2 grades and preserves the submitted exam answer", () => {
    const input = { studentId: "student", courseId: "course", flashcardId: "card", grade: 3, manualAnswer: "x = 2", isExamMode: true };
    expect(flashcardReviewInputSchema.parse(input)).toEqual(input);
    for (const grade of [0, 5, 1.5, NaN, Infinity]) {
      expect(flashcardReviewInputSchema.safeParse({ ...input, grade }).success).toBe(false);
    }
    expect(flashcardReviewInputSchema.safeParse({ ...input, studentId: "" }).success).toBe(false);
  });

  test("requires a valid scheduling receipt before a session advances", () => {
    const result = { nextReviewDue: new Date("2026-11-19T00:00:00Z"), nextIntervalDays: 1, nextBox: 1, examInputPassed: false };
    expect(flashcardReviewResultSchema.parse(result)).toEqual(result);
    expect(flashcardReviewResultSchema.safeParse({ nextReviewDue: result.nextReviewDue }).success).toBe(false);
    expect(flashcardReviewResultSchema.safeParse({ ...result, nextReviewDue: new Date(NaN) }).success).toBe(false);
    expect(flashcardReviewResultSchema.safeParse({ ...result, nextIntervalDays: -1 }).success).toBe(false);
  });

  test("keeps answered cards fixed while skip and Again change only the session tail", () => {
    const queue = ["answered", "current", "next", "last"];
    const skipped = skipFlashcardInSession(queue, 1);
    expect(skipped).toEqual(["answered", "next", "last", "current"]);
    expect(appendFlashcardRetry(skipped, "next")).toEqual(["answered", "next", "last", "current", "next"]);
    expect(queue).toEqual(["answered", "current", "next", "last"]);
  });
});
