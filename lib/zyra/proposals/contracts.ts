import { createHash } from "node:crypto";
import { z } from "zod";

export const ZYRA_PROPOSAL_VERSION = "zyra-proposal-v1";
export const ZYRA_PROPOSAL_TTL_HOURS = 48;

export const TutorProposalTypeSchema = z.enum([
  "misconception_brief",
  "intervention_draft",
  "question_critique",
  "lesson_gap",
  "cohort_summary",
]);
export const AdminProposalTypeSchema = z.enum([
  "course_readiness",
  "missing_link_report",
  "quota_forecast",
  "cache_opportunity",
  "incident_triage",
  "configuration_diff",
]);
export const ZyraProposalTypeSchema = z.union([TutorProposalTypeSchema, AdminProposalTypeSchema]);
export type ZyraProposalType = z.infer<typeof ZyraProposalTypeSchema>;
export type ZyraProposalRole = "tutor" | "admin";

export const ZyraProposalStatusSchema = z.enum([
  "draft",
  "validated",
  "reviewed",
  "confirmed",
  "applied",
  "rejected",
  "expired",
  "failed",
]);
export type ZyraProposalStatus = z.infer<typeof ZyraProposalStatusSchema>;

const SafeOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read_only_report"), reportKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/) }).strict(),
  z.object({
    kind: z.literal("update_course_setting"),
    courseId: z.string().min(1).max(160),
    setting: z.enum(["tutor_visibility", "workflow_assignment"]),
    value: z.enum(["enabled", "disabled", "tutor_review", "admin_review"]),
  }).strict(),
]);
export type ZyraProposalOperation = z.infer<typeof SafeOperationSchema>;

const ScopeSchema = z.object({
  courseId: z.string().min(1).max(160).optional(),
  chapterId: z.string().min(1).max(160).optional(),
  cohortKey: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/).optional(),
}).strict();

export const ZyraProposalDraftSchema = z.object({
  proposalType: ZyraProposalTypeSchema,
  courseId: z.string().min(1).max(160).nullable(),
  scope: ScopeSchema,
  evidenceRefs: z.array(z.string().regex(/^[a-zA-Z0-9._:/-]{1,180}$/)).max(24),
  preconditionSnapshot: z.object({
    version: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }).strict(),
  operations: z.array(SafeOperationSchema).max(4),
  learnerImpact: z.object({
    audience: z.enum(["none", "single_course", "cohort"]),
    summary: z.string().min(1).max(500),
  }).strict(),
  reversibility: z.object({
    reversible: z.boolean(),
    rollback: z.string().min(1).max(500),
  }).strict(),
  warnings: z.array(z.string().min(1).max(240)).max(12),
  rationale: z.string().min(1).max(1200),
}).strict();
export type ZyraProposalDraft = z.infer<typeof ZyraProposalDraftSchema>;

export const ZyraProposalRecordSchema = ZyraProposalDraftSchema.extend({
  id: z.string().min(1),
  actorId: z.string().min(1),
  role: z.enum(["tutor", "admin"]),
  status: ZyraProposalStatusSchema,
  proposerTrace: z.object({
    version: z.literal(ZYRA_PROPOSAL_VERSION),
    source: z.enum(["deterministic", "ai_assisted"]),
    rationaleHash: z.string().regex(/^[a-f0-9]{64}$/i),
  }).strict(),
  validatorResult: z.object({
    valid: z.boolean(),
    reasonCodes: z.array(z.string().min(1).max(100)).max(20),
  }).strict(),
  diffHash: z.string().regex(/^[a-f0-9]{64}$/i),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
}).strict();
export type ZyraProposalRecord = z.infer<typeof ZyraProposalRecordSchema>;

const SECRET_PATTERN = /(?:api[_ -]?key|authorization|bearer|client[_ -]?secret|password|private[_ -]?key|refresh[_ -]?token|secret)/i;

export function validateZyraProposalDraft(
  draft: ZyraProposalDraft,
  role: ZyraProposalRole,
): { valid: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const isTutorType = TutorProposalTypeSchema.safeParse(draft.proposalType).success;
  if ((role === "tutor") !== isTutorType) reasonCodes.push("ROLE_PROPOSAL_TYPE_MISMATCH");
  if (role === "tutor" && !draft.courseId) reasonCodes.push("TUTOR_COURSE_SCOPE_REQUIRED");
  if (draft.scope.courseId && draft.courseId && draft.scope.courseId !== draft.courseId) reasonCodes.push("SCOPE_COURSE_MISMATCH");
  if (draft.operations.some((operation) => operation.kind === "update_course_setting" && operation.courseId !== draft.courseId)) {
    reasonCodes.push("OPERATION_SCOPE_MISMATCH");
  }
  if (draft.operations.some((operation) => operation.kind !== "read_only_report")) {
    reasonCodes.push("MUTATION_OPERATION_NOT_REGISTERED");
  }
  if (SECRET_PATTERN.test(draft.rationale) || draft.warnings.some((warning) => SECRET_PATTERN.test(warning))) {
    reasonCodes.push("SECRET_LIKE_CONTENT");
  }
  if (draft.operations.length > 0 && !draft.reversibility.reversible) reasonCodes.push("IRREVERSIBLE_OPERATION");
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function proposalDiffHash(draft: ZyraProposalDraft): string {
  return createHash("sha256")
    .update(JSON.stringify({
      proposalType: draft.proposalType,
      courseId: draft.courseId,
      scope: draft.scope,
      evidenceRefs: [...draft.evidenceRefs].sort(),
      operations: draft.operations,
      preconditionSnapshot: draft.preconditionSnapshot,
      learnerImpact: draft.learnerImpact,
      reversibility: draft.reversibility,
    }))
    .digest("hex");
}

export function transitionZyraProposalStatus(input: {
  from: ZyraProposalStatus;
  to: ZyraProposalStatus;
  actorId: string;
  proposerId: string;
  reviewerId?: string | null;
  preconditionMatches: boolean;
}): string | null {
  if (!input.actorId) return "ACTOR_REQUIRED";
  if (!input.preconditionMatches) return "STALE_PRECONDITION";
  if (input.from === "draft" && input.to === "validated") return null;
  if (input.from === "validated" && input.to === "reviewed") {
    if (input.actorId === input.proposerId) return "SECOND_REVIEWER_REQUIRED";
    return null;
  }
  if (input.from === "reviewed" && input.to === "confirmed") {
    if (input.actorId !== input.proposerId) return "PROPOSER_CONFIRMATION_REQUIRED";
    return null;
  }
  if (["draft", "validated", "reviewed"].includes(input.from) && input.to === "rejected") return null;
  if (["draft", "validated", "reviewed"].includes(input.from) && input.to === "expired") return null;
  if (input.from === "confirmed" && input.to === "applied") return "MUTATION_BOUNDARY_REQUIRED";
  if (input.from === "confirmed" && input.to === "failed") return null;
  return "INVALID_PROPOSAL_TRANSITION";
}

export function isZyraProposalFeatureEnabled(
  role: ZyraProposalRole,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const val = role === "admin" ? env.FEATURE_ZYRA_ADMIN_COPILOT_V1 : env.FEATURE_ZYRA_TUTOR_COPILOT_V1;
  return val !== "0";
}
