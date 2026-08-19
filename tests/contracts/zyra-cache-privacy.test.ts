import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  assertProfileFreeSharedPayload,
  buildSharedScaffoldMetadata,
  buildSharedScaffoldHash,
  validateSharedScaffold,
} from "@/lib/ai/cache/contracts";

const identity = {
  courseId: "mat-i",
  ideas: [{ ideaId: "limit", version: 2 }],
  evidenceHash: "b".repeat(64),
  normalizedIntent: "apa itu limit",
  promptVersion: "prompt-v1",
  policyVersion: "policy-v1",
  responseSchemaVersion: "schema-v1",
  evidenceVersion: "evidence-v1",
  language: "id",
  routeClass: "default",
  visualCapabilityVersion: "visual-v1",
  assessmentMode: "none",
} as const;

function scaffold() {
  return {
    explanation: "Limit menggambarkan perilaku nilai fungsi saat input mendekati titik tertentu.",
    claims: [{
      ideaId: "limit",
      ideaVersion: 2,
      claimHash: createHash("sha256").update("limit claim").digest("hex"),
    }],
    teachingMove: "worked_example",
    examples: ["Gunakan tabel nilai dari dua arah."],
    validation: { status: "grounded", evidenceVersion: "evidence-v1", claimCount: 1 },
    cacheMetadata: buildSharedScaffoldMetadata(identity),
  };
}

describe("Plan 006 profile-free shared scaffold", () => {
  it("accepts a typed scaffold and produces a stable hash", () => {
    const parsed = validateSharedScaffold(scaffold());
    expect(parsed.cacheMetadata.personalizationAllowed).toBe(false);
    expect(buildSharedScaffoldHash(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects learner identity, history, mastery, and assessment answer fields", () => {
    for (const field of ["userId", "studentName", "learnerProfile", "masteryScore", "sessionHistory", "selectedAnswer"]) {
      expect(() => assertProfileFreeSharedPayload({ [field]: "redacted-test-value" })).toThrow();
    }
    expect(() => assertProfileFreeSharedPayload({ explanation: "studentId: redacted-test-value" })).toThrow();
  });

  it("rejects personalization and assessment leakage at schema validation", () => {
    const withPersonalization = {
      ...scaffold(),
      cacheMetadata: { ...scaffold().cacheMetadata, personalizationAllowed: true },
    };
    expect(() => validateSharedScaffold(withPersonalization)).toThrow();
    expect(() => validateSharedScaffold({
      ...scaffold(),
      assessmentAnswer: "B",
    })).toThrow();
  });
});
