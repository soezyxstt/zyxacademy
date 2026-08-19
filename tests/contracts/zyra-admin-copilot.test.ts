import { describe, expect, test } from "bun:test";
import { isZyraProposalFeatureEnabled, validateZyraProposalDraft } from "@/lib/zyra/proposals";

describe("Zyra admin copilot", () => {
  test("is independently flaggable", () => expect(isZyraProposalFeatureEnabled("admin", { FEATURE_ZYRA_ADMIN_COPILOT_V1: "1" })).toBe(true));
  test("keeps admin operation typed and reversible", () => {
    const result = validateZyraProposalDraft({
      proposalType: "course_readiness",
      courseId: null,
      scope: {},
      evidenceRefs: ["ops:current"],
      preconditionSnapshot: { version: 1 },
      operations: [{ kind: "read_only_report", reportKey: "course_readiness" }],
      learnerImpact: { audience: "none", summary: "No changes." },
      reversibility: { reversible: true, rollback: "No mutation." },
      warnings: [],
      rationale: "Read-only readiness report.",
    }, "admin");
    expect(result.valid).toBe(true);
  });
});
