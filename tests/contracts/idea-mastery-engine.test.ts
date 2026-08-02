import { describe, expect, it } from "bun:test";
import {
  computeIdeaMastery,
  hashIdeaMasteryState,
  PEMAHAMAN_ALGORITHM_VERSION,
  replayIdeaMastery,
  type IdeaEvidence,
} from "@/lib/pemahaman/engine";

const now = new Date("2026-08-03T00:00:00.000Z");

function evidence(overrides: Partial<IdeaEvidence> = {}): IdeaEvidence {
  return {
    id: "evidence-1",
    ideaId: "ide-1",
    sourceId: "source-1",
    evidenceSource: "answer",
    scoreContribution: 1,
    weight: 1,
    confidence: 100,
    derivationStatus: "deterministic",
    affectsMastery: true,
    occurredAt: now,
    ...overrides,
  };
}

describe("Plan 011 per-Idea mastery engine", () => {
  it("keeps mastery score separate from confidence", () => {
    const state = computeIdeaMastery("ide-1", [evidence()], now);

    expect(state.score).toBe(100);
    expect(state.confidence).toBeLessThan(state.score);
    expect(state.algorithmVersion).toBe(PEMAHAMAN_ALGORITHM_VERSION);
  });

  it("weights correct, incorrect, partial, and stale evidence deterministically", () => {
    const state = computeIdeaMastery(
      "ide-1",
      [
        evidence({ id: "correct", scoreContribution: 1, occurredAt: now }),
        evidence({ id: "partial", scoreContribution: 0.5, confidence: 80, occurredAt: new Date("2026-08-02T00:00:00.000Z") }),
        evidence({ id: "incorrect", scoreContribution: 0, confidence: 100, occurredAt: new Date("2026-08-01T00:00:00.000Z") }),
        evidence({ id: "stale", scoreContribution: 0, confidence: 100, occurredAt: new Date("2025-01-01T00:00:00.000Z") }),
      ],
      now,
    );

    expect(state.score).toBeGreaterThan(40);
    expect(state.score).toBeLessThan(100);
    expect(state.evidenceCount).toBe(4);
    expect(state.evidenceIds).toEqual(["stale", "incorrect", "partial", "correct"]);
    expect(state.inputWatermark).toContain("correct");
  });

  it("uses evidence diversity and disagreement only for confidence", () => {
    const consistent = computeIdeaMastery(
      "ide-1",
      [
        evidence({ id: "a", evidenceSource: "answer" }),
        evidence({ id: "b", evidenceSource: "flashcard_review" }),
        evidence({ id: "c", evidenceSource: "material_completion" }),
      ],
      now,
    );
    const conflicting = computeIdeaMastery(
      "ide-1",
      [
        evidence({ id: "a", scoreContribution: 1 }),
        evidence({ id: "b", scoreContribution: 0, evidenceSource: "flashcard_review" }),
        evidence({ id: "c", scoreContribution: 1, evidenceSource: "material_completion" }),
      ],
      now,
    );

    expect(consistent.confidence).toBeGreaterThan(conflicting.confidence);
    expect(consistent.score).not.toBe(consistent.confidence);
  });

  it("excludes ambiguous and rejected evidence from mastery", () => {
    const baseline = computeIdeaMastery("ide-1", [evidence()], now);
    const withAmbiguous = computeIdeaMastery(
      "ide-1",
      [
        evidence(),
        evidence({ id: "ambiguous", scoreContribution: 0, derivationStatus: "ambiguous", ambiguous: true, affectsMastery: false }),
        evidence({ id: "rejected", scoreContribution: 0, derivationStatus: "rejected", affectsMastery: false }),
      ],
      now,
    );

    expect(withAmbiguous.score).toBe(baseline.score);
    expect(withAmbiguous.evidenceCount).toBe(baseline.evidenceCount);
    expect(withAmbiguous.evidenceIds).toEqual(baseline.evidenceIds);
  });

  it("replays out-of-order input to the same byte-identical state", () => {
    const input = [
      evidence({ id: "b", occurredAt: new Date("2026-08-02T00:00:00.000Z") }),
      evidence({ id: "a", occurredAt: new Date("2026-08-01T00:00:00.000Z") }),
    ];
    const first = computeIdeaMastery("ide-1", input, now);
    const replay = replayIdeaMastery("ide-1", [...input].reverse(), now);

    expect(replay).toEqual(first);
    expect(hashIdeaMasteryState(replay)).toBe(hashIdeaMasteryState(first));
  });

  it("returns a zero state without inventing evidence", () => {
    const state = computeIdeaMastery("ide-empty", [], now);

    expect(state.score).toBe(0);
    expect(state.confidence).toBe(0);
    expect(state.evidenceCount).toBe(0);
    expect(state.inputWatermark).toBe("");
  });
});
