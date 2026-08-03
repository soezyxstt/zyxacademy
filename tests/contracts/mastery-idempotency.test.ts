import { describe, expect, it } from "bun:test";
import { computeIdeaMastery, hashIdeaMasteryState, type IdeaEvidence } from "@/lib/pemahaman/engine";
import { learningEvidenceIdentity } from "@/lib/pemahaman/evidence";
import { rankIdeaRecommendations } from "@/lib/pemahaman/recommendations";

const now = new Date("2026-08-03T00:00:00.000Z");

function input() {
  return {
    penggunaId: "murid-1",
    ideId: "ide-1",
    evidenceSource: "flashcard_review",
    sourceId: "review-1",
    scoreContribution: 0.8,
    confidence: 80,
    rubricVersion: "idea-evidence.v1",
    derivationStatus: "reviewed" as const,
    affectsMastery: true,
    occurredAt: now,
  };
}

function evidence(id: string): IdeaEvidence {
  return {
    id,
    ideaId: "ide-1",
    sourceId: id,
    evidenceSource: "flashcard_review",
    scoreContribution: 0.8,
    weight: 1,
    confidence: 80,
    derivationStatus: "reviewed",
    affectsMastery: true,
    occurredAt: now,
  };
}

describe("Plan 011 mastery idempotency and replay", () => {
  it("uses the same identity for a retry and a new identity for a new rubric", () => {
    const first = input();
    const retry = { ...first };
    const newRubric = { ...first, rubricVersion: "idea-evidence.v2" };

    expect(learningEvidenceIdentity(first)).toBe(learningEvidenceIdentity(retry));
    expect(learningEvidenceIdentity(first)).not.toBe(learningEvidenceIdentity(newRubric));
  });

  it("repeated evidence does not change the replay hash when the writer deduplicates", () => {
    const first = computeIdeaMastery("ide-1", [evidence("evidence-1")], now);
    const deduplicatedRetry = computeIdeaMastery("ide-1", [evidence("evidence-1")], now);

    expect(hashIdeaMasteryState(first)).toBe(hashIdeaMasteryState(deduplicatedRetry));
    expect(deduplicatedRetry.evidenceCount).toBe(1);
  });

  it("changes the watermark and state only when a distinct evidence event is added", () => {
    const one = computeIdeaMastery("ide-1", [evidence("evidence-1")], now);
    const two = computeIdeaMastery("ide-1", [evidence("evidence-1"), evidence("evidence-2")], now);

    expect(two.evidenceCount).toBe(2);
    expect(two.inputWatermark).not.toBe(one.inputWatermark);
    expect(hashIdeaMasteryState(two)).not.toBe(hashIdeaMasteryState(one));
  });

  it("ranks recommendations without calling an AI provider", () => {
    const ranked = rankIdeaRecommendations(
      [
        { flashcardId: "card-strong", ideaId: "ide-strong", dueAt: now, masteryScore: 80, confidence: 80 },
        { flashcardId: "card-weak", ideaId: "ide-weak", dueAt: new Date("2026-08-05T00:00:00.000Z"), masteryScore: 20, confidence: 30 },
      ],
      now,
    );

    expect(ranked[0]?.flashcardId).toBe("card-weak");
    expect(ranked[0]?.reason).toContain("low_mastery");
    expect(ranked[0]?.reason).toContain("low_confidence");
  });
});
