export const PEDAGOGY_STARTUP_STAGES = [
  "staging_guard",
  "config",
  "database_connectivity",
  "identity",
  "session_context",
  "course_resolution",
  "enrollment",
  "canonical_evidence",
  "runtime_env_contract",
  "canonical_runtime_import",
  "tutor_runtime_import",
] as const;

export type PedagogyStartupStage = (typeof PEDAGOGY_STARTUP_STAGES)[number];

export type MaskedDiagnosticValue = string | number | boolean | null;

export interface PedagogyStartupStageResult {
  stage: PedagogyStartupStage;
  status: "passed" | "failed";
  reasonCode?: string;
  metadata?: Record<string, MaskedDiagnosticValue>;
}

export interface PedagogyStartupDiagnosticResult {
  status: "passed" | "blocked";
  failedStage: PedagogyStartupStage | null;
  reasonCode: string | null;
  stages: PedagogyStartupStageResult[];
}

export interface PedagogyStartupDiagnosticStep {
  stage: PedagogyStartupStage;
  run: () => Promise<Record<string, MaskedDiagnosticValue> | void>;
}

export class PedagogyStartupDiagnosticError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, number | boolean | null>;

  constructor(
    code: string,
    metadata?: Record<string, number | boolean | null>,
  ) {
    super(code);
    this.name = "PedagogyStartupDiagnosticError";
    this.code = code;
    this.metadata = metadata;
  }
}

const STAGE_FAILURE_CODES: Record<PedagogyStartupStage, string> = {
  staging_guard: "PEDAGOGY_STARTUP_STAGING_GUARD_FAILED",
  config: "PEDAGOGY_STARTUP_CONFIG_INVALID",
  database_connectivity: "PEDAGOGY_STARTUP_DATABASE_UNAVAILABLE",
  identity: "PEDAGOGY_STARTUP_IDENTITY_QUERY_FAILED",
  session_context: "PEDAGOGY_STARTUP_SESSION_QUERY_FAILED",
  course_resolution: "PEDAGOGY_STARTUP_COURSE_RESOLUTION_FAILED",
  enrollment: "PEDAGOGY_STARTUP_ENROLLMENT_QUERY_FAILED",
  canonical_evidence: "PEDAGOGY_STARTUP_CANONICAL_EVIDENCE_QUERY_FAILED",
  runtime_env_contract: "PEDAGOGY_STARTUP_RUNTIME_ENV_INVALID",
  canonical_runtime_import: "PEDAGOGY_STARTUP_CANONICAL_RUNTIME_IMPORT_FAILED",
  tutor_runtime_import: "PEDAGOGY_STARTUP_TUTOR_RUNTIME_IMPORT_FAILED",
};

function safeNamedCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^[A-Z][A-Z0-9_:-]{2,100}$/.test(value)) return null;
  return value;
}

export function maskedPedagogyStartupReason(
  error: unknown,
  stage: PedagogyStartupStage,
): string {
  if (error && typeof error === "object") {
    const code = safeNamedCode((error as { code?: unknown }).code);
    if (code) return code;
    const message = safeNamedCode((error as { message?: unknown }).message);
    if (message) return message;

    const name = (error as { name?: unknown }).name;
    if (name === "ZodError") return "PEDAGOGY_STARTUP_ENV_SCHEMA_INVALID";
    if (name === "DrizzleQueryError" || name === "LibsqlError") {
      return "PEDAGOGY_STARTUP_DATABASE_QUERY_FAILED";
    }
  }
  return STAGE_FAILURE_CODES[stage];
}

export async function runMaskedPedagogyStartupDiagnostics(
  steps: readonly PedagogyStartupDiagnosticStep[],
): Promise<PedagogyStartupDiagnosticResult> {
  const stages: PedagogyStartupStageResult[] = [];
  for (const step of steps) {
    try {
      const metadata = await step.run();
      stages.push({
        stage: step.stage,
        status: "passed",
        ...(metadata ? { metadata } : {}),
      });
    } catch (error) {
      const reasonCode = maskedPedagogyStartupReason(error, step.stage);
      const metadata = error instanceof PedagogyStartupDiagnosticError
        ? error.metadata
        : undefined;
      stages.push({
        stage: step.stage,
        status: "failed",
        reasonCode,
        ...(metadata ? { metadata } : {}),
      });
      return {
        status: "blocked",
        failedStage: step.stage,
        reasonCode,
        stages,
      };
    }
  }

  return {
    status: "passed",
    failedStage: null,
    reasonCode: null,
    stages,
  };
}
