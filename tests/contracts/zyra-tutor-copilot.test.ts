import { describe, expect, test } from "bun:test";
import { isZyraProposalFeatureEnabled, validateZyraProposalDraft } from "@/lib/zyra/proposals";

describe("Zyra tutor copilot", () => {
  test("is independently flaggable", () => {
    expect(isZyraProposalFeatureEnabled("tutor", { FEATURE_ZYRA_TUTOR_COPILOT_V1: "1" })).toBe(true);
    expect(isZyraProposalFeatureEnabled("tutor", { FEATURE_ZYRA_TUTOR_COPILOT_V1: "0" })).toBe(false);
  });
  test("does not allow tutor proposals without course scope", () => {
    const result = validateZyraProposalDraft({
      proposalType: "misconception_brief",
      courseId: null,
      scope: {},
      evidenceRefs: [],
      preconditionSnapshot: { version: 1 },
      operations: [],
      learnerImpact: { audience: "none", summary: "none" },
      reversibility: { reversible: true, rollback: "none" },
      warnings: [],
      rationale: "brief",
    }, "tutor");
    expect(result.reasonCodes).toContain("TUTOR_COURSE_SCOPE_REQUIRED");
  });
});
