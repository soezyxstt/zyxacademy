import { describe, expect, test } from "bun:test";
import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { emptyOverlay } from "@/lib/demo/session-overlay";

describe("demo progress overlay", () => {
  test("combines daily activity and caps progress without changing the baseline", () => {
    const snapshot = {
      course: { completedMaterials: 2, totalMaterials: 3, nextConcept: null },
      flashcards: { dueCount: 1, recentReviews: [] },
      history: [{ date: "2026-01-01", materialsCompleted: 2, flashcardsReviewed: 1, quizzesCompleted: 0 }],
    } as PublicDemoSnapshot;
    const original = JSON.stringify(snapshot);
    const progress = demoProgress(snapshot, { version: 1, events: [
      { kind: "article", id: "a", date: "2026-01-01" },
      { kind: "article", id: "b", date: "2026-01-02" },
      { kind: "review", id: "c", grade: 3, date: "2026-01-02" },
      { kind: "quiz", id: "q", date: "2026-01-02" },
    ] });
    expect(progress.completedMaterials).toBe(3);
    expect(progress.dueCount).toBe(0);
    expect(progress.history).toEqual([
      { date: "2026-01-02", materialsCompleted: 1, flashcardsReviewed: 1, quizzesCompleted: 1 },
      { date: "2026-01-01", materialsCompleted: 3, flashcardsReviewed: 1, quizzesCompleted: 0 },
    ]);
    expect(JSON.stringify(snapshot)).toBe(original);
    expect(demoProgress(snapshot, emptyOverlay()).completedMaterials).toBe(2);
  });
});
