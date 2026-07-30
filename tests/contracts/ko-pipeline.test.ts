import { describe, expect, it, test } from "bun:test";
import { loadAiFixture } from "../helpers/ai-fixtures";

describe("KO Pipeline Contract Tests", () => {
  it("characterization: loads extracted KOs sample fixture and validates schema version", () => {
    const fixture = loadAiFixture<{
      extractedCount: number;
      kos?: Array<{ id: string; conceptName: string; type: string }>;
    }>("extracted-kos-sample.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-KO-EXTRACT-001");

    const { singleConcept, multiConcept } = fixture.fixtures;
    expect(singleConcept.extractedCount).toBe(1);
    expect(multiConcept.extractedCount).toBe(3);
  });

  test.todo("AI-KO-EXTRACT-001: Extract atomic KOs matching Bloom taxonomy and concept constraints", () => {});
  test.todo("AI-KO-INDEX-002: Reindex knowledge relationships deterministically upon MTD update", () => {});
});
