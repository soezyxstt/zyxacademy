import { describe, expect, it, test } from "bun:test";
import { loadAiFixture } from "../helpers/ai-fixtures";

describe("Question Pipeline Contract Tests", () => {
  it("characterization: loads generated question draft fixture and validates schema version", () => {
    const fixture = loadAiFixture<{
      draftId: string;
      prompt: string;
      options: string[];
      correctIndices: number[];
      difficulty: string;
    }>("question-draft.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-QUEST-GEN-001");

    const { multipleChoiceLimit, conceptualDerivative } = fixture.fixtures;
    expect(multipleChoiceLimit.options).toHaveLength(4);
    expect(conceptualDerivative.difficulty).toBe("medium");
  });

  test.todo("AI-QUEST-GEN-001: Enforce distractor mapping to misconception KOs during generation", () => {});
  test.todo("AI-QUEST-VAL-002: Reject draft questions violating course difficulty caps", () => {});
});
