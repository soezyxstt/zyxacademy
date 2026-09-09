import { describe, expect, test } from "bun:test";
import {
  deriveFormativeAiVerdict,
  validateFormativeAiOutput,
} from "@/lib/materials/formative-ai-evaluator";

const rubric = {
  mode: "ai_rubric" as const,
  criteria: [
    { id: "concept", description: "Menjelaskan konsep utama.", weight: 0.6 },
    { id: "reason", description: "Memberikan alasan yang tepat.", weight: 0.4 },
  ],
  requiredConcepts: ["konsep utama"],
  misconceptionSignals: ["alasan terbalik"],
};

describe("server-derived formative AI verdict", () => {
  test("derives correct only when every weighted criterion is met", () => {
    expect(deriveFormativeAiVerdict([
      { criterionId: "concept", status: "met" },
      { criterionId: "reason", status: "met" },
    ], rubric)).toBe("correct");
  });

  test("derives incorrect when every weighted criterion is missed", () => {
    expect(deriveFormativeAiVerdict([
      { criterionId: "concept", status: "missed" },
      { criterionId: "reason", status: "missed" },
    ], rubric)).toBe("incorrect");
  });

  test("derives partial for mixed or partially met criteria", () => {
    expect(deriveFormativeAiVerdict([
      { criterionId: "concept", status: "met" },
      { criterionId: "reason", status: "partial" },
    ], rubric)).toBe("partial");
  });

  test("ignores a contradictory legacy model verdict", () => {
    const result = validateFormativeAiOutput({
      verdict: "correct",
      criteria: [
        { criterionId: "concept", status: "missed" },
        { criterionId: "reason", status: "missed" },
      ],
      feedback: "Perbaiki penjelasan konsep dan alasannya.",
      misconceptionIds: [],
      confidence: 0.9,
    }, { rubric });

    expect(result?.verdict).toBe("incorrect");
  });
});
