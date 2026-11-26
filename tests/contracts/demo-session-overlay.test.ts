import { describe, expect, test } from "bun:test";
import { addDemoEvent, emptyOverlay, overlayKey, parseOverlay, scopedDemoMaterialId, scopedDemoReviewId } from "@/lib/demo/session-overlay";

describe("demo session overlay", () => {
  test("rejects corrupt and unknown data", () => {
    expect(parseOverlay("{" )).toEqual(emptyOverlay());
    expect(parseOverlay(JSON.stringify({ version: 1, events: [], extra: true }))).toEqual(emptyOverlay());
    const event = { kind: "article", id: "a", date: "2026-01-01" };
    expect(parseOverlay(JSON.stringify({ version: 1, events: [event, event] }))).toEqual(emptyOverlay());
    expect(parseOverlay(JSON.stringify({ version: 1, events: [{ ...event, date: "2026-02-30" }] }))).toEqual(emptyOverlay());
  });
  test("accepts only graded reviews", () => {
    const review = { kind: "review" as const, id: "card", date: "2026-01-01" };
    expect(addDemoEvent(emptyOverlay(), review)).toEqual(emptyOverlay());
    expect(addDemoEvent(emptyOverlay(), { ...review, grade: 5 })).toEqual(emptyOverlay());
    expect(addDemoEvent(emptyOverlay(), { ...review, grade: 3 }).events).toHaveLength(1);
  });
  test("isolates positional card IDs across sets and pages", () => {
    const first = scopedDemoReviewId("set-a", 0, "demo-flashcard-0");
    expect(first).toBe(scopedDemoReviewId("set-a", 0, "demo-flashcard-0"));
    expect(first).not.toBe(scopedDemoReviewId("set-b", 0, "demo-flashcard-0"));
    expect(first).not.toBe(scopedDemoReviewId("set-a", 100, "demo-flashcard-0"));
  });
  test("keeps article and diktat completions distinct for the same maximum-length material ID", () => {
    const materialId = "a".repeat(128);
    const article = scopedDemoMaterialId("article", materialId);
    const diktat = scopedDemoMaterialId("diktat", materialId);
    expect(article).toBe(scopedDemoMaterialId("article", materialId));
    expect(article).not.toBe(diktat);
    const date = "2026-01-01";
    const once = addDemoEvent(emptyOverlay(), { kind: "article", id: article, date });
    const both = addDemoEvent(once, { kind: "article", id: diktat, date });
    expect(both.events.map(({ id }) => id)).toEqual([article, diktat]);
  });
  test("deduplicates completion and isolates revisions", () => {
    const event = { kind: "article" as const, id: "a", date: "2026-01-01" };
    const once = addDemoEvent(emptyOverlay(), event);
    expect(addDemoEvent(once, event)).toEqual(once);
    expect(overlayKey("course", "one")).not.toBe(overlayKey("course", "two"));
  });
});
