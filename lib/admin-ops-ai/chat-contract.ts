import { z } from "zod";

// ============================================================================
// 1. Provenance and Citations
// ============================================================================

/** Describes the context supplied to the model. */
export const OPS_AI_CITATION_OFFICIAL_LABEL = "Sumber yang diberikan kepada model" as const;

export const OpsAiProvenanceSourceSchema = z.enum([
  "semantic-rag",
  "live-tool",
  "database-read",
  "system-context",
]);
export type OpsAiProvenanceSource = z.infer<typeof OpsAiProvenanceSourceSchema>;

export const OpsAiCitationAvailabilitySchema = z.enum([
  "available",
  "stale",
  "missing",
  "invalid",
]);
export type OpsAiCitationAvailability = z.infer<typeof OpsAiCitationAvailabilitySchema>;

export const OpsAiCitationSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  source: OpsAiProvenanceSourceSchema,
  availability: OpsAiCitationAvailabilitySchema,
  runId: z.string().min(1),
  stepId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  title: z.string().min(1),
  filePath: z.string().optional(),
  section: z.string().optional(),
  snippet: z.string().min(1),
  score: z.number().optional(),
  url: z.string().optional(),
  timestamp: z.number().int().positive().optional(),
}).strict();
export type OpsAiCitation = z.infer<typeof OpsAiCitationSchema>;

// ============================================================================
// 2. Work-Step Lifecycle
// ============================================================================

export const OpsAiStepStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type OpsAiStepStatus = z.infer<typeof OpsAiStepStatusSchema>;

export const OpsAiStepTypeSchema = z.enum([
  "reasoning",
  "retrieval",
  "tool_call",
  "synthesis",
]);
export type OpsAiStepType = z.infer<typeof OpsAiStepTypeSchema>;

export const OpsAiWorkStepSchema = z.object({
  stepId: z.string().min(1),
  runId: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  stepType: OpsAiStepTypeSchema,
  status: OpsAiStepStatusSchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  retryable: z.boolean().optional(),
  startedAt: z.number().int().positive(),
  finishedAt: z.number().int().positive().optional(),
  error: z.string().optional(),
}).strict();
export type OpsAiWorkStep = z.infer<typeof OpsAiWorkStepSchema>;

// ============================================================================
// 3. Action Proposals and Error Data
// ============================================================================

export const OpsAiActionProposalTypeSchema = z.enum([
  "create_token",
  "navigate_page",
  "trigger_job",
  "batch_create_chapters",
  "bulk_update_materials",
  "admin_operation",
]);
export type OpsAiActionProposalType = z.infer<typeof OpsAiActionProposalTypeSchema>;

export const OpsAiProposalStatusSchema = z.enum([
  "pending",
  "executing",
  "executed",
  "cancelled",
  "failed",
  "expired",
]);
export type OpsAiProposalStatus = z.infer<typeof OpsAiProposalStatusSchema>;

export type ZyraProposalDbStatus =
  | "draft"
  | "validated"
  | "reviewed"
  | "confirmed"
  | "applied"
  | "rejected"
  | "expired"
  | "failed";

export const PROPOSAL_STATUS_TO_DB: Record<OpsAiProposalStatus, ZyraProposalDbStatus> = {
  pending: "draft",
  executing: "confirmed",
  executed: "applied",
  cancelled: "rejected",
  expired: "expired",
  failed: "failed",
};

export const DB_STATUS_TO_PROPOSAL: Record<ZyraProposalDbStatus, OpsAiProposalStatus> = {
  draft: "pending",
  validated: "pending",
  reviewed: "pending",
  confirmed: "executing",
  applied: "executed",
  rejected: "cancelled",
  expired: "expired",
  failed: "failed",
};

export const OpsAiPreconditionSnapshotSchema = z.object({
  version: z.number().int().positive().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  stateFingerprint: z.string().min(1).optional(),
}).strict();
export type OpsAiPreconditionSnapshot = z.infer<typeof OpsAiPreconditionSnapshotSchema>;

export const OpsAiProposalPreviewSchema = z.object({
  summary: z.string().min(1),
  targetEntity: z.string().optional(),
  fields: z.array(z.object({
    label: z.string().min(1),
    value: z.string(),
  }).strict()).optional(),
}).strict();
export type OpsAiProposalPreview = z.infer<typeof OpsAiProposalPreviewSchema>;

export const OpsAiActionProposalV2Schema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  type: OpsAiActionProposalTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  preview: OpsAiProposalPreviewSchema,
  approval: z.enum(["once", "chat"]).optional(),
  status: OpsAiProposalStatusSchema,
  preconditions: OpsAiPreconditionSnapshotSchema.optional(),
  expiresAt: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.number().int().positive().optional(),
}).strict();
export type OpsAiActionProposalV2 = z.infer<typeof OpsAiActionProposalV2Schema>;

export const OpsAiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "SESSION_EXPIRED",
  "INVALID_REQUEST",
  "CONTEXT_TOO_LARGE",
  "TOOL_EXECUTION_FAILED",
  "PROMPT_INJECTION_DETECTED",
  "PII_LEAK_DETECTED",
  "STALE_PRECONDITION",
  "PROPOSAL_REPLAY_DETECTED",
  "FORGED_CITATION_DETECTED",
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
  "REQUEST_CANCELLED",
]);
export type OpsAiErrorCode = z.infer<typeof OpsAiErrorCodeSchema>;

export const OpsAiErrorDataSchema = z.object({
  code: OpsAiErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  timestamp: z.number().int().positive(),
}).strict();
export type OpsAiErrorData = z.infer<typeof OpsAiErrorDataSchema>;

// ============================================================================
// 6. Bounded Policy Constants
// ============================================================================

export const OPS_AI_POLICY_BOUNDS = {
  // Tool Loop Bounds
  maxToolSteps: 5,
  maxConsecutiveToolCalls: 3,

  // Message History Bounds
  maxMessagesHistory: 30,
  maxMessageCharLength: 4000,
  maxTotalPromptChars: 24000,

  // Provider Timeout Bounds
  providerTimeoutMs: 45000,
  stepTimeoutMs: 15000,
  streamChunkTimeoutMs: 8000,

  // Semantic Retrieval Bounds (Locked Program Contract)
  retrievalCandidateCount: 12,
  retrievalMaxFinalSources: 6,
  retrievalMinSnippetLength: 20,
  retrievalMaxSnippetLength: 1000,

  // Retry Attempts Bounds
  maxRetryAttempts: 2,
  retryInitialDelayMs: 500,
  retryMaxDelayMs: 3000,

  // Proposal Bounds
  proposalTtlMinutes: 30,
  proposalMaxParamsSizeBytes: 8192,

  // Cancellation Semantics
  cancellationGracePeriodMs: 2000,
  cancellationReasons: [
    "user_aborted",
    "timeout_exceeded",
    "session_terminated",
    "prompt_injection_prevented",
    "precondition_invalidated",
  ] as const,
} as const;

export type OpsAiCancellationReason = (typeof OPS_AI_POLICY_BOUNDS.cancellationReasons)[number];
