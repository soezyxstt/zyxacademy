import type { ModelId, ModelRouteClass } from "../../../../lib/ai/provider/model-registry";

export const LEASE_TTL_MS = 30_000;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
export const MAX_FEATURE_LENGTH = 80;
export const MAX_PROVIDER_OUTCOME_CODE_LENGTH = 64;
export const CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD = 3;
export const CIRCUIT_ROLLING_SAMPLE_SIZE = 10;
export const CIRCUIT_ROLLING_FAILURE_RATE = 0.5;
export const CIRCUIT_COOLDOWN_MS = 30_000;

export const LEASE_STATES = [
  "reserved",
  "dispatched",
  "committed",
  "refunded",
  "expired_refunded",
  "expired_committed"
] as const;

export type LeaseState = (typeof LEASE_STATES)[number];
export type QuotaRole = "murid" | "tutor" | "admin";
export type CacheStatus = "hit" | "miss" | "bypass";
export type CircuitState = "closed" | "open" | "half_open";
export type ProviderOutcomeClass =
  | "success"
  | "provider_429"
  | "provider_5xx"
  | "provider_timeout"
  | "provider_malformed"
  | "application_validation"
  | "unknown";

export type ReserveInput = {
  idempotencyKey: string;
  userHash: string;
  role: QuotaRole;
  feature: string;
  routeClass: ModelRouteClass;
  modelId: ModelId;
  cacheStatus: CacheStatus;
};

export type LeaseSummary = {
  leaseId: string;
  idempotencyKey: string;
  role: QuotaRole;
  feature: string;
  routeClass: ModelRouteClass;
  modelId: ModelId;
  projectAlias: string;
  state: LeaseState;
  providerDay: string;
  appDay: string;
  cacheStatus: CacheStatus;
  createdAtMs: number;
  expiresAtMs: number;
  terminalAtMs: number | null;
  providerOutcomeCode: string | null;
};

export type ReserveResult =
  | { status: "reserved" | "idempotent"; lease: LeaseSummary }
  | { status: "fallback_allowed" | "quota_exhausted"; code: string; modelId: ModelId };

export type TransitionResult =
  | { status: "updated" | "idempotent"; lease: LeaseSummary }
  | { status: "rejected"; code: string };

export type CommitInput = {
  leaseId: string;
  providerAttemptId?: string;
  outcomeCode: string;
  outcomeClass: ProviderOutcomeClass;
  latencyMs?: number;
};

export type QuotaDiagnostics = {
  schemaVersion: "plan-003-v1";
  activeLeaseCount: number;
  terminalLeaseCount: number;
  counters: Array<{
    modelId: string;
    projectAlias: string;
    reservedCount: number;
    committedCount: number;
    minuteCount: number;
  }>;
  health: Array<{
    modelId: string;
    projectAlias: string;
    circuitState: CircuitState;
    consecutiveFailures: number;
    sampleCount: number;
    failureCount: number;
  }>;
};

export function validateReserveInput(input: ReserveInput): string[] {
  const failures: string[] = [];

  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(input.idempotencyKey) || input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    failures.push("invalid_idempotency_key");
  }

  if (!/^[a-f0-9]{64}$/.test(input.userHash)) {
    failures.push("invalid_user_hash");
  }

  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(input.feature) || input.feature.length > MAX_FEATURE_LENGTH) {
    failures.push("invalid_feature");
  }

  return failures;
}

export function validateCommitInput(input: CommitInput): string[] {
  const failures: string[] = [];

  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(input.leaseId)) {
    failures.push("invalid_lease_id");
  }

  if (input.providerAttemptId !== undefined && !/^[A-Za-z0-9._:-]{1,160}$/.test(input.providerAttemptId)) {
    failures.push("invalid_provider_attempt_id");
  }

  if (!/^[A-Z0-9_:-]{1,64}$/.test(input.outcomeCode) || input.outcomeCode.length > MAX_PROVIDER_OUTCOME_CODE_LENGTH) {
    failures.push("invalid_outcome_code");
  }

  if (input.latencyMs !== undefined && (!Number.isInteger(input.latencyMs) || input.latencyMs < 0 || input.latencyMs > 600_000)) {
    failures.push("invalid_latency");
  }

  return failures;
}
