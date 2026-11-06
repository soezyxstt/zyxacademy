import { describe, expect, mock, test } from "bun:test";

mock.module("@/db", () => ({ db: {} }));
const { orderCanonicalIdeas } = await import("../../lib/study-path-service");

const idea = (id: string, chapterOrder: number, code: string) => ({
  id, chapterOrder, code, name: id, conceptDisplayName: null,
  chapterId: `chapter-${chapterOrder}`, chapterTitle: "Chapter", score: null, confidence: null,
});

describe("canonical study path ordering", () => {
  test("orders prerequisites before chapter and code ties and ignores outside edges", () => {
    const result = orderCanonicalIdeas([idea("b", 1, "B"), idea("a", 1, "A"), idea("c", 2, "C")], [
      { sourceIdeaId: "c", targetIdeaId: "a" },
      { sourceIdeaId: "outside", targetIdeaId: "b" },
    ]);
    expect(result.orderedIds).toEqual(["b", "c", "a"]);
    expect(result.prerequisites.get("a")).toEqual(["c"]);
  });
  test("appends cyclic ideas in chapter and code order", () => {
    const result = orderCanonicalIdeas([idea("b", 1, "B"), idea("a", 1, "A")], [
      { sourceIdeaId: "a", targetIdeaId: "b" }, { sourceIdeaId: "b", targetIdeaId: "a" },
    ]);
    expect(result.orderedIds).toEqual(["a", "b"]);
    expect(orderCanonicalIdeas([], []).orderedIds).toEqual([]);
  });
});
