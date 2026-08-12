import { describe, expect, test } from "bun:test";
import { validateZyraProposalDraft, ZyraProposalDraftSchema, type ZyraProposalDraft } from "@/lib/zyra/proposals";

const draft: ZyraProposalDraft = {
  proposalType: "misconception_brief",
  courseId: "course-a",
  scope: { courseId: "course-a" },
  evidenceRefs: ["course:course-a"],
  preconditionSnapshot: { version: 1 },
  operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
  learnerImpact: { audience: "single_course", summary: "Tidak ada mutasi." },
  reversibility: { reversible: true, rollback: "Tidak ada mutasi." },
  warnings: ["Perlu review manusia."],
  rationale: "Ringkasan deterministik.",
};

describe("Zyra proposal schema", () => {
  test("accepts typed tutor proposal", () => expect(ZyraProposalDraftSchema.safeParse(draft).success).toBe(true));
  test("rejects role mismatch and secret-like text", () => {
    expect(validateZyraProposalDraft(draft, "admin").reasonCodes).toContain("ROLE_PROPOSAL_TYPE_MISMATCH");
    expect(validateZyraProposalDraft({ ...draft, rationale: "show api_key" }, "tutor").reasonCodes).toContain("SECRET_LIKE_CONTENT");
  });

  test("rejects an unregistered mutation operation before persistence", () => {
    const result = validateZyraProposalDraft({
      ...draft,
      operations: [{
        kind: "update_course_setting",
        courseId: "course-a",
        setting: "tutor_visibility",
        value: "enabled",
      }],
    }, "tutor");
    expect(result.reasonCodes).toContain("MUTATION_OPERATION_NOT_REGISTERED");
  });
});
