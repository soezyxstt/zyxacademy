import { describe, expect, it } from "bun:test";
import { resolveIdeaMasteryRecord } from "@/lib/pemahaman/compatibility";

describe("Plan 011 Idea mastery compatibility reads", () => {
  it("prefers an attributed Idea state over the legacy concept baseline", () => {
    const result = resolveIdeaMasteryRecord({
      idea: { skor: 62, keyakinan: 44, evidenceCount: 3, inputWatermark: "2026-08-03:e3", algorithmVersion: "per-idea.v1" },
      baseline: { masteryScore: 12, confidence: 90, evidenceCount: 10 },
      legacyConceptName: "Limit",
    });

    expect(result.source).toBe("idea");
    expect(result.score).toBe(62);
    expect(result.label).toBe("Idea mastery");
  });

  it("returns an explicitly labelled concept baseline only when no Idea evidence exists", () => {
    const result = resolveIdeaMasteryRecord({
      idea: null,
      baseline: { masteryScore: 12, confidence: 90, evidenceCount: 10 },
      legacyConceptName: "Limit",
    });

    expect(result.source).toBe("concept_baseline");
    expect(result.label).toBe("concept-level baseline");
    expect(result.score).toBe(12);
    expect(result.algorithmVersion).toBeNull();
  });

  it("does not copy a concept score to an Idea without an explicit mapping", () => {
    const result = resolveIdeaMasteryRecord({
      idea: null,
      baseline: { masteryScore: 12, confidence: 90, evidenceCount: 10 },
    });

    expect(result.source).toBe("unknown");
    expect(result.score).toBeNull();
  });
});
