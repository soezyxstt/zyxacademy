import { describe, expect, it } from "bun:test";
import { deriveAnswerEvidence, validateEvidenceRubric, type EvidenceRubric } from "@/lib/asesmen/evidence-rubric";

const objectiveRubric: EvidenceRubric = {
  version: "1.0",
  questionId: "question-1",
  questionType: "multiple_choice",
  ideaWeights: { ideaA: 0.7, ideaB: 0.3 },
  outcomes: [
    {
      outcomeId: "correct",
      stableOptionIds: ["option-question-1-1"],
      contributions: [
        { ideaId: "ideaA", contribution: 1, weight: 0.7, confidence: 1, evidenceSource: "deterministic_rubric", kind: "mastery", ambiguous: false, affectsMastery: true, misconceptionIdeaId: null },
        { ideaId: "ideaB", contribution: 1, weight: 0.3, confidence: 0.9, evidenceSource: "deterministic_rubric", kind: "mastery", ambiguous: false, affectsMastery: true, misconceptionIdeaId: null },
      ],
    },
    {
      outcomeId: "misconception",
      stableOptionIds: ["option-question-1-2"],
      contributions: [
        { ideaId: "ideaA", contribution: -1, weight: 0.7, confidence: 0.8, evidenceSource: "deterministic_rubric", kind: "misconception", ambiguous: false, affectsMastery: false, misconceptionIdeaId: "ideaA" },
      ],
    },
  ],
  provenance: "deterministic_rubric",
  reviewed: false,
  reviewerId: null,
};

describe("Per-Idea evidence rubric", () => {
  it("requires exact Idea weight totals and derives stable-option evidence", () => {
    expect(validateEvidenceRubric(objectiveRubric).valid).toBe(true);
    const evidence = deriveAnswerEvidence({ rubric: objectiveRubric, answer: ["option-question-1-1"] });
    expect(evidence.status).toBe("derived");
    expect(evidence.affectsMastery).toBe(true);
    expect(evidence.contributions).toHaveLength(2);
  });

  it("keeps misconception evidence out of mastery", () => {
    const evidence = deriveAnswerEvidence({ rubric: objectiveRubric, answer: ["option-question-1-2"] });
    expect(evidence.status).toBe("derived");
    expect(evidence.affectsMastery).toBe(false);
    expect(evidence.contributions[0].kind).toBe("misconception");
  });

  it("blocks unreviewed free-response judgments", () => {
    const freeResponse = {
      ...objectiveRubric,
      questionType: "essay" as const,
      provenance: "ai_proposal" as const,
      outcomes: [{ ...objectiveRubric.outcomes[0], stableOptionIds: ["reviewed-outcome"] }],
    };
    const evidence = deriveAnswerEvidence({ rubric: freeResponse, answer: "draft answer" });
    expect(evidence.status).toBe("blocked");
    expect(evidence.affectsMastery).toBe(false);
  });
});
