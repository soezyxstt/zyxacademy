import { hashEvidence, hashSanitizedInput, recordGenerationTrace } from "@/lib/ai/provenance";
import {
  PEDAGOGY_POLICY_VERSION,
  PEDAGOGY_PROMPT_VERSION,
  PEDAGOGY_RESPONSE_SCHEMA_VERSION,
  type HintLevel,
  type TeachingState,
} from "./contracts";

export const PEDAGOGY_SHADOW_MAX_PROVIDER_REQUESTS = 40;

// One canonical query embedding is currently issued for each of five namespaces,
// followed by one legacy generation and one candidate generation.
export const PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE = 7;

export type PedagogyExecutionMode = "legacy" | "primary" | "shadow";

export class PedagogyShadowGuardError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PedagogyShadowGuardError";
    this.code = code;
  }
}

export interface ResolvePedagogyExecutionModeInput {
  requestedMode?: PedagogyExecutionMode;
  environment?: string;
  configuredShadowUserId?: string;
  userId: string;
}

export function resolvePedagogyExecutionMode(
  input: ResolvePedagogyExecutionModeInput,
): PedagogyExecutionMode {
  const mode = input.requestedMode ?? "primary";
  if (mode !== "shadow") return mode;

  if (input.environment?.trim().toLowerCase() !== "staging") {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_STAGING_ONLY");
  }

  const configuredUserId = input.configuredShadowUserId?.trim();
  if (!configuredUserId) {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_IDENTITY_NOT_CONFIGURED");
  }
  if (configuredUserId !== input.userId) {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_IDENTITY_MISMATCH");
  }

  return mode;
}

export function boundedPedagogyShadowCaseCount(maxProviderRequests: number): number {
  if (
    !Number.isInteger(maxProviderRequests)
    || maxProviderRequests < 1
    || maxProviderRequests > PEDAGOGY_SHADOW_MAX_PROVIDER_REQUESTS
  ) {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_PROVIDER_BUDGET_INVALID");
  }
  return Math.floor(maxProviderRequests / PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE);
}

export interface PedagogyShadowComparison {
  schemaVersion: "1.0";
  visibleResponse: "legacy";
  baselineOutcome: "success" | "rejected" | "quota_exceeded" | "provider_failure" | "invalid_contract";
  candidateOutcome: "composed" | "generated" | "rejected";
  selectedState: TeachingState;
  hintLevel: HintLevel;
  candidateUsedFallback: boolean;
  candidateViolationCodes: string[];
  evidenceCount: number;
  providerCallUpperBound: number;
  traceId?: string;
}

export interface RecordPedagogyShadowComparisonInput {
  runId: string;
  caseId: string;
  courseId: string;
  baselineOutcome: PedagogyShadowComparison["baselineOutcome"];
  candidateOutcome: PedagogyShadowComparison["candidateOutcome"];
  selectedState: TeachingState;
  hintLevel: HintLevel;
  candidateUsedFallback: boolean;
  candidateViolationCodes: readonly string[];
  evidenceIds: readonly string[];
  latencyMs: number;
}

function assertOpaqueLabel(value: string, code: string): void {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(value)) {
    throw new PedagogyShadowGuardError(code);
  }
}

export async function recordPedagogyShadowComparison(
  input: RecordPedagogyShadowComparisonInput,
): Promise<PedagogyShadowComparison> {
  assertOpaqueLabel(input.runId, "PEDAGOGY_SHADOW_RUN_ID_INVALID");
  assertOpaqueLabel(input.caseId, "PEDAGOGY_SHADOW_CASE_ID_INVALID");

  const comparison: PedagogyShadowComparison = {
    schemaVersion: "1.0",
    visibleResponse: "legacy",
    baselineOutcome: input.baselineOutcome,
    candidateOutcome: input.candidateOutcome,
    selectedState: input.selectedState,
    hintLevel: input.hintLevel,
    candidateUsedFallback: input.candidateUsedFallback,
    candidateViolationCodes: [...new Set(input.candidateViolationCodes)].sort(),
    evidenceCount: input.evidenceIds.length,
    providerCallUpperBound: PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE,
  };

  const traceId = await recordGenerationTrace({
    stageId: "zyra-pedagogy-shadow",
    promptVersion: PEDAGOGY_PROMPT_VERSION,
    policyVersion: PEDAGOGY_POLICY_VERSION,
    inputSchemaVersion: "shadow-comparison-v1",
    outputSchemaVersion: PEDAGOGY_RESPONSE_SCHEMA_VERSION,
    validatorVersion: "shadow-comparison-v1",
    sanitizedInputHash: hashSanitizedInput({
      runId: input.runId,
      caseId: input.caseId,
      courseHash: hashSanitizedInput(input.courseId),
      baselineOutcome: input.baselineOutcome,
      candidateOutcome: input.candidateOutcome,
      selectedState: input.selectedState,
      hintLevel: input.hintLevel,
    }),
    evidenceHash: hashEvidence([...input.evidenceIds].sort()),
    model: "shadow-comparison",
    route: "staging-shadow",
    inputTokens: 0,
    outputTokens: 0,
    retryCount: 0,
    terminalOutcome: input.candidateOutcome === "rejected" ? "rejected" : "success",
    violationCodes: comparison.candidateViolationCodes,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    cacheResult: "none",
  });

  return { ...comparison, traceId };
}
