import { describe, expect, test } from "bun:test";
import {
  assertProfileFreeSharedPayload,
  composePersonalizedAnswer,
  aggregateZyraEvidence,
} from "@/lib/zyra/personalization";

describe("Zyra personalization privacy boundary", () => {
  test("accepts a profile-free shared scaffold", () => {
    expect(() => assertProfileFreeSharedPayload({
      explanation: "Materi bersama",
      sourceRefs: [{ id: "source-1", label: "Bab 1" }],
      validation: { status: "grounded" },
    })).not.toThrow();
  });

  test("rejects learner adaptation fields in a shared payload", () => {
    expect(() => assertProfileFreeSharedPayload({
      explanation: "Materi bersama",
      adaptation: { supportIntensity: "high" },
    })).toThrow("ZYRA_SHARED_PAYLOAD_CONTAINS_PROFILE");
  });

  test("does not serialize raw learner evidence into adaptation output", () => {
    const decision = aggregateZyraEvidence({ events: [] });
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("response");
    expect(serialized).not.toContain("studentId");
  });

  test("shared answer remains the source of truth for content", () => {
    const decision = aggregateZyraEvidence({ events: [] });
    const answer = "Klaim kanonik dari materi.";
    expect(composePersonalizedAnswer(answer, decision)).toBe(answer);
  });
});
