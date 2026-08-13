import { describe, expect, it } from "bun:test";
import {
  assertBlueprintItemCount,
  compileAssessmentBlueprint,
  roundDimensionDistribution,
  selectAssessmentItems,
} from "@/lib/asesmen/blueprint";

describe("Assessment blueprint V2", () => {
  const dimensions = {
    ideaCoverage: { ideaA: 0.5, ideaB: 0.3, ideaC: 0.2 },
    difficulty: { easy: 0.25, medium: 0.5, hard: 0.25 },
    cognitiveLevel: { understand: 0.5, apply: 0.5 },
    reasoningPattern: { conceptual: 0.4, procedural: 0.6 },
    relationUse: { none: 0.7, prerequisite: 0.3 },
    questionType: { multiple_choice: 0.8, multiple_choices: 0.2 },
  };

  it("rounds every dimension to the exact requested item count", () => {
    const allocation = roundDimensionDistribution({ a: 0.2, b: 0.2, c: 0.6 }, 7);
    expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(7);
    expect(allocation).toEqual({ a: 2, b: 1, c: 4 });
  });

  it("enforces one chapter for quizzes and one or more for tryouts", () => {
    expect(() => compileAssessmentBlueprint({
      assessmentType: "quiz",
      chapterIds: ["chapter-a", "chapter-b"],
      itemCount: 2,
      seed: 10,
      dimensions,
    })).toThrow("exactly one chapter");

    const tryout = compileAssessmentBlueprint({
      assessmentType: "tryout",
      chapterIds: ["chapter-a", "chapter-b"],
      itemCount: 2,
      seed: 10,
      dimensions,
    });
    expect(tryout.chapterIds).toEqual(["chapter-a", "chapter-b"]);
  });

  it("selects the same eligible item versions for the same seed", () => {
    const blueprint = compileAssessmentBlueprint({
      assessmentType: "quiz",
      chapterIds: ["chapter-a"],
      itemCount: 2,
      seed: 77,
      dimensions,
    });
    const candidates = [
      { id: "q-3", version: 1, chapterId: "chapter-a", status: "published", ideaIds: ["ideaA"] },
      { id: "q-stale", version: 1, chapterId: "chapter-a", status: "published", isStale: true, ideaIds: ["ideaA"] },
      { id: "q-2", version: 2, chapterId: "chapter-a", status: "published", ideaIds: ["ideaB"] },
      { id: "q-other", version: 1, chapterId: "chapter-b", status: "published", ideaIds: ["ideaA"] },
      { id: "q-1", version: 1, chapterId: "chapter-a", status: "published", ideaIds: ["ideaC"] },
    ];
    const first = selectAssessmentItems(blueprint, candidates);
    const second = selectAssessmentItems(blueprint, [...candidates].reverse());
    expect(first).toEqual(second);
    assertBlueprintItemCount(blueprint, first);
    expect(first.every((item) => item.chapterId === "chapter-a")).toBe(true);
  });
});
