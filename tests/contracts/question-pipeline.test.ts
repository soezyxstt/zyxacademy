import { describe, expect, it, test } from "bun:test";
import { loadAiFixture } from "../helpers/ai-fixtures";

describe("Question Pipeline Contract Tests", () => {
  it("characterization: loads question-generation fixture and validates schema version", () => {
    const fixture = loadAiFixture<{
      questionType: string;
      options: string[];
      correctOption?: string;
      correctOptions?: string[];
      isMalformed?: boolean;
    }>("question-generation.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-QGEN-001");

    const { singleAnswer, multipleAnswer, duplicateOptions } = fixture.fixtures;
    expect(singleAnswer.options.length).toBe(4);
    expect(multipleAnswer.correctOptions).toEqual(["A", "C"]);
    expect(duplicateOptions.isMalformed).toBe(true);
  });

  test.todo("AI-QGEN-001: Generate single-choice questions with distinct distractor options");
  test.todo("AI-QGEN-002: Reject question structures containing duplicate option texts");
});
