import { z } from "zod";
import type { UIMessage } from "ai";

/**
 * Zyx Admin Ops AI v2 Contracts and Baseline Security Policy.
 *
 * This module defines the type-safe contracts, security classifications,
 * authorization matrix, bounded runtime policy constants, and threat model
 * for Ops AI v2.
 */

// ============================================================================
// 1. Provenance and Citations
// ============================================================================

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
// 4. Message Metadata & UI Message Generics
// ============================================================================

export const OpsAiMessageMetadataSchema = z.object({
  runId: z.string().min(1).optional(),
  stepCount: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  finishReason: z.string().optional(),
  modelId: z.string().optional(),
  createdAt: z.number().int().positive().optional(),
}).strict();
export type OpsAiMessageMetadata = z.infer<typeof OpsAiMessageMetadataSchema>;

export interface OpsAiNotificationData {
  message: string;
  level: "info" | "warning" | "error" | "success";
}

export interface OpsAiDataTypes extends Record<string, unknown> {
  citation: OpsAiCitation;
  "work-step": OpsAiWorkStep;
  proposal: OpsAiActionProposalV2;
  error: OpsAiErrorData;
  notification: OpsAiNotificationData;
}

export type OpsAiUITools = {
  retrieve_admin_knowledge: {
    input: { query: string };
    output: { summary: string; data?: unknown };
  };
  inspect_schema: {
    input: { tableName?: string };
    output: { summary: string; data?: unknown };
  };
  get_system_metrics: {
    input: Record<string, never>;
    output: { summary: string; data?: unknown };
  };
  navigate_admin: {
    input: { destination: string };
    output: { summary: string; data?: unknown };
  };
  search_users: {
    input: { query: string };
    output: { summary: string; data?: unknown };
  };
  propose_create_token: {
    input: { courseIds: string; capacity: string; packageType?: string };
    output: { summary: string; proposal?: OpsAiActionProposalV2 };
  };
};

export type OpsAiUIMessage = UIMessage<
  OpsAiMessageMetadata,
  OpsAiDataTypes,
  OpsAiUITools
>;

// ============================================================================
// 5. Tool Security Classification & Authorization Matrix
// ============================================================================

export const OpsAiToolClassSchema = z.enum([
  "read-only",
  "retrieval",
  "proposal-only",
  "confirmation-executor",
]);
export type OpsAiToolClass = z.infer<typeof OpsAiToolClassSchema>;

export interface OpsAiToolSecurityClassification {
  readonly name: string;
  readonly toolClass: OpsAiToolClass;
  readonly isModelCallable: boolean;
  readonly requiredRole: "admin" | "superadmin";
  readonly requiresHumanConfirmation: boolean;
  readonly allowsMutation: boolean;
  readonly description: string;
}

export const OPS_AI_TOOL_SECURITY_REGISTRY: Record<string, OpsAiToolSecurityClassification> = {
  retrieve_admin_knowledge: {
    name: "retrieve_admin_knowledge",
    toolClass: "retrieval",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: false,
    allowsMutation: false,
    description: "Cari dokumentasi teknis, arsitektur, dan runbook SOP Zyx Academy.",
  },
  inspect_schema: {
    name: "inspect_schema",
    toolClass: "read-only",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: false,
    allowsMutation: false,
    description: "Inspeksi struktur tabel dan skema database secara read-only.",
  },
  get_system_metrics: {
    name: "get_system_metrics",
    toolClass: "read-only",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: false,
    allowsMutation: false,
    description: "Ambil ringkasan statistik database secara agregat.",
  },
  navigate_admin: {
    name: "navigate_admin",
    toolClass: "read-only",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: false,
    allowsMutation: false,
    description: "Dapatkan link navigasi halaman admin panel Zyx Academy.",
  },
  search_users: {
    name: "search_users",
    toolClass: "read-only",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: false,
    allowsMutation: false,
    description: "Cari data profil dasar pengguna dengan proyeksi kolom non-sensitif.",
  },
  propose_create_token: {
    name: "propose_create_token",
    toolClass: "proposal-only",
    isModelCallable: true,
    requiredRole: "admin",
    requiresHumanConfirmation: true,
    allowsMutation: false,
    description: "Siapkan kartu proposal pembuatan token aktivasi; mutasi ditunda hingga konfirmasi admin.",
  },
  execute_confirmed_proposal: {
    name: "execute_confirmed_proposal",
    toolClass: "confirmation-executor",
    isModelCallable: false,
    requiredRole: "admin",
    requiresHumanConfirmation: true,
    allowsMutation: true,
    description: "Eksekutor server-side yang hanya dipicu klik eksplisit admin pada UI proposal.",
  },
} as const;

/**
 * Invariant Assertion: No model-callable tool may ever execute a mutation.
 */
export function assertNoModelCallableMutation(
  registry: Record<string, OpsAiToolSecurityClassification> = OPS_AI_TOOL_SECURITY_REGISTRY
): void {
  for (const [name, tool] of Object.entries(registry)) {
    if (tool.isModelCallable) {
      if (tool.toolClass === "confirmation-executor") {
        throw new Error(`Security Invariant Violation: Model-callable tool '${name}' has forbidden class 'confirmation-executor'.`);
      }
      if (tool.allowsMutation) {
        throw new Error(`Security Invariant Violation: Model-callable tool '${name}' cannot have allowsMutation=true.`);
      }
    }
  }
}

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

// ============================================================================
// 7. Security Threat Model Data
// ============================================================================

export type OpsAiThreatCategory =
  | "retrieved_prompt_injection"
  | "proposal_replay"
  | "stale_preconditions"
  | "pii_leakage"
  | "forged_citations";

export interface OpsAiThreatDefense {
  readonly threatCategory: OpsAiThreatCategory;
  readonly riskDescription: string;
  readonly mitigationStrategy: string;
  readonly enforcementMechanism: string;
  readonly testableRule: string;
}

export const OPS_AI_THREAT_MODEL: Record<OpsAiThreatCategory, OpsAiThreatDefense> = {
  retrieved_prompt_injection: {
    threatCategory: "retrieved_prompt_injection",
    riskDescription: "Untrusted external or documentation content containing prompt escape or hijacking instructions.",
    mitigationStrategy: "Isolate retrieved document snippets within delimited XML/markdown blocks and strip control injection delimiters.",
    enforcementMechanism: "Prompt framing enforces strict separation between system instructions, user queries, and retrieved context.",
    testableRule: "Retrieved snippets are treated as passive data and cannot override system instructions or tool execution policy.",
  },
  proposal_replay: {
    threatCategory: "proposal_replay",
    riskDescription: "Attacker re-submits previously executed or expired action proposals to trigger duplicated mutations.",
    mitigationStrategy: "Cryptographic proposal ID tracking with single-use execution state transitions and TTL expiry.",
    enforcementMechanism: "Proposal transitions require status='pending' and transition atomically to 'executing'/'executed'; duplicate execution is rejected.",
    testableRule: "A proposal can only transition from pending to executed once, and cannot be executed after expiry.",
  },
  stale_preconditions: {
    threatCategory: "stale_preconditions",
    riskDescription: "Admin confirms a proposal whose underlying system state or entity changed between proposal creation and execution.",
    mitigationStrategy: "Precondition snapshots (version, contentHash, stateFingerprint) validated before proposal execution.",
    enforcementMechanism: "Executor compares snapshot against live state and aborts with STALE_PRECONDITION if state has mutated.",
    testableRule: "Proposal execution aborts if current state fingerprint or version diverges from proposal precondition snapshot.",
  },
  pii_leakage: {
    threatCategory: "pii_leakage",
    riskDescription: "User PII such as contact details, emails, session tokens, and passwords exposed in tool outputs or model responses.",
    mitigationStrategy: "Enforce minimum projection allowlist (id, name, role, createdAt) with email omitted or redacted by default, and screening for secret-like tokens.",
    enforcementMechanism: "search_users output projection strips credentials and omits or masks email; secret patterns filtered.",
    testableRule: "Tool results and RAG contexts must not contain secret tokens, unmasked credentials, or unredacted emails by default.",
  },
  forged_citations: {
    threatCategory: "forged_citations",
    riskDescription: "Model generates phantom or fabricated citation references that do not correspond to verified RAG retrievals or tool calls.",
    mitigationStrategy: "Strict citation binding requiring verified sourceId, runId, stepId, and provenance origin match.",
    enforcementMechanism: "Citation validator cross-references citations against recorded source IDs, work steps, and retrieval result logs.",
    testableRule: "Every citation must possess a valid sourceId, runId, stepId, matching provenance origin, and valid availability state.",
  },
};

// ============================================================================
// 8. Validation and Policy Enforcement Helpers
// ============================================================================

export function validateOpsAiCitation(input: unknown): { valid: boolean; errors: string[] } {
  const parse = OpsAiCitationSchema.safeParse(input);
  if (parse.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: parse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export function validateOpsAiWorkStep(input: unknown): { valid: boolean; errors: string[] } {
  const parse = OpsAiWorkStepSchema.safeParse(input);
  if (parse.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: parse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export function validateOpsAiProposal(input: unknown): { valid: boolean; errors: string[] } {
  const parse = OpsAiActionProposalV2Schema.safeParse(input);
  if (parse.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: parse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export function validateOpsAiErrorData(input: unknown): { valid: boolean; errors: string[] } {
  const parse = OpsAiErrorDataSchema.safeParse(input);
  if (parse.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: parse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

const SECRET_LIKE_PATTERN = /(?:api[_ -]?key|authorization|bearer|client[_ -]?secret|password|private[_ -]?key|refresh[_ -]?token|secret)/i;

/**
 * Checks whether text contains secret-like credentials or private tokens.
 */
export function containsSecretLikePattern(text: string): boolean {
  return SECRET_LIKE_PATTERN.test(text);
}

/**
 * Evaluates whether a proposal can proceed to execution against replay, expiry, and precondition checks.
 */
export function evaluateProposalExecutionEligibility(input: {
  proposal: OpsAiActionProposalV2;
  livePreconditionMatch: boolean;
  currentTimeMs?: number;
}): { canExecute: boolean; errorCode?: OpsAiErrorCode; message?: string } {
  const now = input.currentTimeMs ?? Date.now();
  const { proposal, livePreconditionMatch } = input;

  if (proposal.status !== "pending") {
    return {
      canExecute: false,
      errorCode: "PROPOSAL_REPLAY_DETECTED",
      message: `Proposal is in state '${proposal.status}', but must be 'pending' to execute.`,
    };
  }

  const ttlMs = OPS_AI_POLICY_BOUNDS.proposalTtlMinutes * 60 * 1000;
  const expiryTimestamp = proposal.expiresAt ?? proposal.createdAt + ttlMs;
  if (now > expiryTimestamp) {
    return {
      canExecute: false,
      errorCode: "PROPOSAL_REPLAY_DETECTED",
      message: "Proposal has expired and cannot be executed.",
    };
  }

  if (proposal.preconditions && !livePreconditionMatch) {
    return {
      canExecute: false,
      errorCode: "STALE_PRECONDITION",
      message: "Target state changed between proposal creation and execution confirmation.",
    };
  }

  return { canExecute: true };
}

/**
 * Validates citation binding against verified run steps and source IDs.
 */
export function verifyCitationBinding(input: {
  citation: OpsAiCitation;
  validRunId: string;
  knownSourceIds: Set<string>;
  knownStepIds: Set<string>;
  knownToolCallIds?: Set<string>;
}): { valid: boolean; reasonCode?: string } {
  if (input.citation.runId !== input.validRunId) {
    return { valid: false, reasonCode: "RUN_ID_MISMATCH" };
  }
  if (!input.knownSourceIds.has(input.citation.sourceId)) {
    return { valid: false, reasonCode: "UNKNOWN_SOURCE_ID" };
  }
  if (!input.knownStepIds.has(input.citation.stepId)) {
    return { valid: false, reasonCode: "UNKNOWN_STEP_ID" };
  }
  if (input.citation.toolCallId && input.knownToolCallIds && !input.knownToolCallIds.has(input.citation.toolCallId)) {
    return { valid: false, reasonCode: "UNKNOWN_TOOL_CALL_ID" };
  }
  return { valid: true };
}

export interface OpsAiUserSearchProjection {
  id: string;
  name: string;
  role: string;
  createdAt: number;
  email?: string;
}

/**
 * Sanitizes user search outputs according to the minimum projection contract.
 * By default, email is omitted to prevent PII exposure.
 */
export function sanitizeUserSearchProjection(
  users: Array<Record<string, unknown>>,
  options?: { includeRedactedEmail?: boolean }
): OpsAiUserSearchProjection[] {
  return users.map((u) => {
    const proj: OpsAiUserSearchProjection = {
      id: String(u.id || ""),
      name: String(u.name || ""),
      role: String(u.role || "student"),
      createdAt: Number(u.createdAt) || Date.now(),
    };
    if (options?.includeRedactedEmail && typeof u.email === "string" && u.email.trim().length > 0) {
      const parts = u.email.trim().split("@");
      if (parts.length === 2 && parts[0].length > 0) {
        proj.email = `${parts[0][0]}***@${parts[1]}`;
      } else {
        proj.email = "***@***";
      }
    }
    return proj;
  });
}
