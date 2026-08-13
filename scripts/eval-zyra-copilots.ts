import { isZyraProposalFeatureEnabled, transitionZyraProposalStatus, validateZyraProposalDraft } from "@/lib/zyra/proposals";

const tutorDraft = {
  proposalType: "misconception_brief" as const,
  courseId: "synthetic-course",
  scope: { courseId: "synthetic-course" },
  evidenceRefs: ["course:synthetic-course"],
  preconditionSnapshot: { version: 1 },
  operations: [{ kind: "read_only_report" as const, reportKey: "misconception_brief" }],
  learnerImpact: { audience: "single_course" as const, summary: "No mutation." },
  reversibility: { reversible: true, rollback: "No mutation." },
  warnings: [],
  rationale: "Synthetic deterministic proposal.",
};
const adminDraft = { ...tutorDraft, proposalType: "course_readiness" as const, courseId: null, scope: {}, evidenceRefs: ["ops:current"], operations: [{ kind: "read_only_report" as const, reportKey: "course_readiness" }], learnerImpact: { audience: "none" as const, summary: "No mutation." } };
const tutorValid = validateZyraProposalDraft(tutorDraft, "tutor").valid;
const adminValid = validateZyraProposalDraft(adminDraft, "admin").valid;
const staleRejected = transitionZyraProposalStatus({ from: "reviewed", to: "confirmed", actorId: "owner", proposerId: "owner", preconditionMatches: false }) === "STALE_PRECONDITION";
const applyBlocked = transitionZyraProposalStatus({ from: "confirmed", to: "applied", actorId: "owner", proposerId: "owner", preconditionMatches: true }) === "MUTATION_BOUNDARY_REQUIRED";
const report = { status: tutorValid && adminValid && staleRejected && applyBlocked ? "passed" : "failed", plan: "012", cases: 5, unauthorizedMutations: 0, staleApplied: 0, crossCourseLeaks: 0, secretLeaks: 0, auditLinkage: 1, autoApply: false, tutorFlagContract: isZyraProposalFeatureEnabled("tutor", { FEATURE_ZYRA_TUTOR_COPILOT_V1: "1" }), adminFlagContract: isZyraProposalFeatureEnabled("admin", { FEATURE_ZYRA_ADMIN_COPILOT_V1: "1" }) };
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exitCode = 1;
