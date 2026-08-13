import { describe, expect, it } from "bun:test";
import {
  assertSemanticVector,
  buildSemanticCacheMetadata,
  selectReusableSemanticCandidate,
  semanticScopeFromIdentity,
} from "@/lib/ai/cache/semantic";
import { buildZyraCacheIdentity } from "@/lib/ai/cache/contracts";

const identity = buildZyraCacheIdentity({
  courseId: "mat-i",
  ideas: [{ ideaId: "limit", version: 2 }],
  evidenceHash: "c".repeat(64),
  normalizedIntent: "apa itu limit",
  promptVersion: "prompt-v1",
  policyVersion: "policy-v1",
  responseSchemaVersion: "schema-v1",
  evidenceVersion: "evidence-v1",
  language: "id",
  routeClass: "default",
  visualCapabilityVersion: "visual-v1",
  assessmentMode: "none",
});
describe("Plan 006 semantic cache contract", () => {
  it("locks the separate semantic profile to 768 dimensions", () => {
    expect(() => assertSemanticVector(new Array(768).fill(0))).not.toThrow();
    expect(() => assertSemanticVector(new Array(767).fill(0))).toThrow();
    expect(buildSemanticCacheMetadata(identity, "zyra:entry:v1:entry-1", "d".repeat(64))).toMatchObject({
      embeddingProfile: "zyra-semantic-cache-v1",
      courseId: "mat-i",
    });
  });

  it("requires exact scope equality before accepting a high-score candidate", () => {
    const metadata = buildSemanticCacheMetadata(identity, "zyra:entry:v1:entry-1", "d".repeat(64));
    const requested = semanticScopeFromIdentity(identity, "d".repeat(64));
    const hit = selectReusableSemanticCandidate([{ id: "entry-1", score: 0.99, metadata }], requested);
    expect(hit?.id).toBe("entry-1");
    expect(selectReusableSemanticCandidate([{ id: "entry-1", score: 0.999, metadata }], {
      ...requested,
      courseId: "mat-ii",
    })).toBeNull();
    expect(selectReusableSemanticCandidate([{ id: "entry-1", score: 0.999, metadata }], {
      ...requested,
      assessmentMode: "active-attempt",
    })).toBeNull();
  });
});
