import { describe, expect, test } from "bun:test";
import { aggregateZyraEvidence, composePersonalizedAnswer } from "@/lib/zyra/personalization";
import type { ZyraEvidenceRow } from "@/lib/zyra/personalization";

const baseDate = new Date("2026-08-01T00:00:00.000Z");

function event(overrides: Partial<ZyraEvidenceRow> = {}): ZyraEvidenceRow {
  return {
    eventKind: "checkpoint_answered",
    sourceType: "tutor",
    evidenceRef: null,
    outcome: "success",
    correctness: 1,
    responseLatencyBucket: "standard",
    hintLevel: "none",
    representation: "stepwise",
    weight: 1,
    createdAt: baseDate,
    expiresAt: null,
    ...overrides,
  };
}

describe("Zyra deterministic adaptation", () => {
  test("keeps insufficient evidence unknown", () => {
    const decision = aggregateZyraEvidence({
      events: [event({ outcome: "failure" })],
      now: new Date("2026-08-02T00:00:00.000Z"),
    });

    expect(decision.evidenceCount).toBe(1);
    expect(decision.supportIntensity).toBe("unknown");
    expect(decision.representation).toBe("unknown");
    expect(decision.reasonCodes).toContain("EVIDENCE_INSUFFICIENT");
  });

  test("does not make one failure a persistent high-support label", () => {
    const decision = aggregateZyraEvidence({
      events: [event({ outcome: "failure" })],
    });

    expect(decision.supportIntensity).toBe("unknown");
    expect(decision.explanationLength).toBe("unknown");
  });

  test("derives high support from repeated struggle and hint requests", () => {
    const decision = aggregateZyraEvidence({
      events: [
        event({ outcome: "failure", hintLevel: "hint_2" }),
        event({ outcome: "failure", hintLevel: "hint_3" }),
        event({ outcome: "success", hintLevel: "hint_1" }),
      ],
    });

    expect(decision.supportIntensity).toBe("high");
    expect(decision.explanationLength).toBe("detailed");
    expect(decision.reasonCodes).toContain("SUPPORT_REPEATED_STRUGGLE");
  });

  test("derives light support after repeated independent success", () => {
    const decision = aggregateZyraEvidence({
      events: [
        event({ responseLatencyBucket: "fast" }),
        event({ responseLatencyBucket: "fast" }),
        event({ responseLatencyBucket: "very_fast" }),
      ],
    });

    expect(decision.supportIntensity).toBe("light");
    expect(decision.explanationLength).toBe("concise");
    expect(decision.pace).toBe("fast");
  });

  test("explicit preferences override only presentation fields", () => {
    const decision = aggregateZyraEvidence({
      events: [event(), event(), event()],
      explicitPreferences: {
        pace: "slow",
        representation: "visual",
        explanationLength: "detailed",
        checkpointType: "teach_back",
      },
    });

    expect(decision.pace).toBe("slow");
    expect(decision.representation).toBe("visual");
    expect(decision.explanationLength).toBe("detailed");
    expect(decision.checkpointType).toBe("teach_back");
    expect(decision.reasonCodes).toContain("EXPLICIT_PREFERENCE_PACE");
  });

  test("expires stale evidence without changing the source rows", () => {
    const decision = aggregateZyraEvidence({
      events: [event({ expiresAt: new Date("2026-07-31T00:00:00.000Z") })],
      now: new Date("2026-08-02T00:00:00.000Z"),
    });

    expect(decision.evidenceCount).toBe(0);
    expect(decision.confidence).toBe(0);
  });

  test("changes only the learner-local composition", () => {
    const decision = aggregateZyraEvidence({
      events: [
        event({ outcome: "failure", hintLevel: "hint_2" }),
        event({ outcome: "failure", hintLevel: "hint_3" }),
        event({ outcome: "failure", hintLevel: "hint_1" }),
      ],
    });
    const base = "Materi bersama yang sudah tervalidasi.";
    const adapted = composePersonalizedAnswer(base, decision);

    expect(adapted).not.toBe(base);
    expect(adapted).toContain(base);

    const adaptedEnglish = composePersonalizedAnswer("Validated shared material.", decision, "en");
    expect(adaptedEnglish).toContain("Validated shared material.");
    expect(adaptedEnglish).not.toContain("Kita");
  });
});
