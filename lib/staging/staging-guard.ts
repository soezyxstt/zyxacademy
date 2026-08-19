import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type StagingEnvironment = Readonly<Record<string, string | undefined>>;

export type StagingResourceKey =
  | "database"
  | "authUrl"
  | "workerName"
  | "r2Bucket"
  | "r2Prefix"
  | "vectorizeWorker"
  | "vectorizeIndex"
  | "inngestEnvironment";

export type ResourceFingerprint = {
  key: StagingResourceKey;
  label: string;
  hash: string;
};

export type StagingGuardResult = {
  environment: "staging";
  mutationAllowed: boolean;
  resources: ResourceFingerprint[];
  databaseUrl: string;
};

export type StagingGuardOptions = {
  env?: StagingEnvironment;
  productionEnv?: StagingEnvironment;
  requireMutation?: boolean;
  requiredResources?: StagingResourceKey[];
};

export class StagingGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "StagingGuardError";
    this.code = code;
  }
}

const PRODUCTION_LABEL_PATTERN = /(^|[/:._-])(prod|production|live)(?=$|[/:._-])/i;

const RESOURCE_ALIASES: Record<StagingResourceKey, string[]> = {
  database: ["TURSO_DATABASE_URL", "TURSO_CONNECTION_URL", "DATABASE_URL"],
  authUrl: ["BETTER_AUTH_URL"],
  workerName: ["WORKER_NAME", "VECTORIZE_WORKER_NAME"],
  r2Bucket: ["R2_BUCKET"],
  r2Prefix: ["R2_PREFIX", "R2_PUBLIC_PREFIX"],
  vectorizeWorker: ["VECTORIZE_WORKER_URL"],
  vectorizeIndex: ["VECTORIZE_INDEX_NAME", "VECTORIZE_INDEX"],
  inngestEnvironment: ["INNGEST_ENVIRONMENT", "INNGEST_ENV"],
};

const PRODUCTION_ALIASES: Record<StagingResourceKey, string[]> = {
  database: [
    "PRODUCTION_TURSO_DATABASE_URL",
    "PRODUCTION_TURSO_CONNECTION_URL",
    "PRODUCTION_DATABASE_URL",
    "PROD_TURSO_DATABASE_URL",
    "PROD_TURSO_CONNECTION_URL",
    "PROD_DATABASE_URL",
  ],
  authUrl: ["PRODUCTION_BETTER_AUTH_URL", "PROD_BETTER_AUTH_URL"],
  workerName: ["PRODUCTION_WORKER_NAME", "PROD_WORKER_NAME"],
  r2Bucket: ["PRODUCTION_R2_BUCKET", "PROD_R2_BUCKET"],
  r2Prefix: ["PRODUCTION_R2_PREFIX", "PROD_R2_PREFIX"],
  vectorizeWorker: ["PRODUCTION_VECTORIZE_WORKER_URL", "PROD_VECTORIZE_WORKER_URL"],
  vectorizeIndex: ["PRODUCTION_VECTORIZE_INDEX_NAME", "PROD_VECTORIZE_INDEX_NAME"],
  inngestEnvironment: ["PRODUCTION_INNGEST_ENVIRONMENT", "PROD_INNGEST_ENVIRONMENT"],
};

const STAGING_ALLOWLIST: Partial<Record<StagingResourceKey, string[]>> = {
  database: ["libsql://zyx-staging-soezyxstt.aws-ap-south-1.turso.io"],
  authUrl: ["https://staging.zyxacademy.com"],
  r2Bucket: ["zyx-staging"],
  vectorizeWorker: ["https://zyx-vector-api-staging.16922204.workers.dev"],
};

const SECRET_ENV_NAME_PATTERN = /(TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|CLIENT_SECRET|AUTHORIZATION|COOKIE)/i;

function firstDefined(env: StagingEnvironment, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function normalizeResource(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  }
}

export function maskValue(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 8) return "[masked]";
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function resourceValue(env: StagingEnvironment, key: StagingResourceKey): string | undefined {
  return firstDefined(env, RESOURCE_ALIASES[key]);
}

function productionResourceValue(env: StagingEnvironment, key: StagingResourceKey): string | undefined {
  return firstDefined(env, PRODUCTION_ALIASES[key]) ?? firstDefined(env, RESOURCE_ALIASES[key]);
}

function resourceLabel(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname || parsed.protocol.replace(":", "");
  } catch {
    return value.split(/[/:]/, 1)[0] || "identifier";
  }
}

function hashResource(key: StagingResourceKey, value: string): string {
  return createHash("sha256")
    .update(`${key}:${normalizeResource(value)}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function isAllowlistedStagingResource(key: StagingResourceKey, value: string): boolean {
  const normalized = normalizeResource(value);
  return (STAGING_ALLOWLIST[key] ?? []).some((allowed) => normalizeResource(allowed) === normalized);
}

function assertNoProductionLikeLabel(key: StagingResourceKey, value: string): void {
  if (PRODUCTION_LABEL_PATTERN.test(value) && !isAllowlistedStagingResource(key, value)) {
    throw new StagingGuardError(
      "PRODUCTION_LIKE_RESOURCE",
      `The staging ${key} identifier contains a production-only label`,
    );
  }
}

function assertDifferentFromProduction(
  key: StagingResourceKey,
  stagingValue: string,
  productionValue: string | undefined,
): void {
  if (productionValue && normalizeResource(stagingValue) === normalizeResource(productionValue)) {
    throw new StagingGuardError(
      "STAGING_RESOURCE_MATCHES_PRODUCTION",
      `The staging ${key} identifier matches the production identifier`,
    );
  }
}

export function fingerprintResources(
  env: StagingEnvironment,
  productionEnv: StagingEnvironment = {},
): ResourceFingerprint[] {
  const fingerprints: ResourceFingerprint[] = [];
  for (const key of Object.keys(RESOURCE_ALIASES) as StagingResourceKey[]) {
    const value = resourceValue(env, key);
    if (!value) continue;
    assertNoProductionLikeLabel(key, value);
    assertDifferentFromProduction(key, value, productionResourceValue(productionEnv, key));
    fingerprints.push({
      key,
      label: resourceLabel(value),
      hash: hashResource(key, value),
    });
  }
  return fingerprints.sort((left, right) => left.key.localeCompare(right.key));
}

export function resolveDatabaseConnection(env: StagingEnvironment = process.env): {
  url: string;
  authToken?: string;
} {
  const url = resourceValue(env, "database");
  if (!url) {
    throw new StagingGuardError("MISSING_STAGING_RESOURCE", "A staging database URL is required");
  }
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;
  return { url, authToken };
}

export function assertStagingEnvironment(options: StagingGuardOptions = {}): StagingGuardResult {
  const env = options.env ?? process.env;
  const productionEnv = options.productionEnv ?? {};

  if (env.ZYX_ENVIRONMENT?.trim().toLowerCase() !== "staging") {
    throw new StagingGuardError(
      "MISSING_STAGING_MARKER",
      "ZYX_ENVIRONMENT=staging is required for staging commands",
    );
  }

  if (options.requireMutation && env.ALLOW_STAGING_MUTATION !== "1") {
    throw new StagingGuardError(
      "STAGING_MUTATION_NOT_ENABLED",
      "ALLOW_STAGING_MUTATION=1 is required for staging writes",
    );
  }

  const requiredResources = options.requiredResources ?? ["database", "authUrl"];
  for (const key of requiredResources) {
    if (!resourceValue(env, key)) {
      throw new StagingGuardError("MISSING_STAGING_RESOURCE", `A staging ${key} identifier is required`);
    }
  }

  const database = resolveDatabaseConnection(env);
  const resources = fingerprintResources(env, productionEnv);
  return {
    environment: "staging",
    mutationAllowed: env.ALLOW_STAGING_MUTATION === "1",
    resources,
    databaseUrl: database.url,
  };
}

export function safeEnvironmentKeys(env: StagingEnvironment): string[] {
  return Object.keys(env)
    .filter((key) => !SECRET_ENV_NAME_PATTERN.test(key))
    .sort();
}

export function parseEnvFile(filePath: string): StagingEnvironment {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function safeGuardError(error: unknown): { code: string; message: string } {
  if (error instanceof StagingGuardError) return { code: error.code, message: error.message };
  if (error instanceof Error && /STAGING_EXPORT_KEY|STAGING_MANIFEST_KEY/.test(error.message)) {
    return { code: "MISSING_STAGING_EXPORT_KEY", message: "STAGING_EXPORT_KEY is required for manifests and exports" };
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const schemaFailure = error.message.match(/^RESTORE_SCHEMA_FAILED:([a-z]+):([A-Za-z0-9_.-]+)(?::([A-Za-z0-9_.-]+))?$/i);
    if (schemaFailure) {
      const suffix = schemaFailure[3] && schemaFailure[3] !== "unknown" ? ` (${schemaFailure[3]})` : "";
      return { code: "DISPOSABLE_SCHEMA_FAILED", message: `The disposable restore could not create schema object ${schemaFailure[2]}${suffix}` };
    }
    const rowFailure = error.message.match(/^RESTORE_ROW_FAILED:([A-Za-z0-9_.-]+)$/i);
    if (rowFailure) {
      return { code: "DISPOSABLE_ROW_FAILED", message: `The disposable restore could not restore table ${rowFailure[1]}` };
    }
    const foreignKeyFailure = error.message.match(/^RESTORE_FOREIGN_KEYS_FAILED:([A-Za-z0-9_.-]+)$/i);
    if (foreignKeyFailure) {
      return { code: "FOREIGN_KEY_CHECK_FAILED", message: `The disposable restore could not enable foreign-key checks (${foreignKeyFailure[1]})` };
    }
    if (error.message === "RESTORE_FOREIGN_KEY_VIOLATIONS") {
      return { code: "FOREIGN_KEY_CHECK_FAILED", message: "The disposable restore produced foreign-key violations" };
    }
    if (message.includes("authentication tag") || message.includes("bad decrypt")) {
      return { code: "EXPORT_DECRYPTION_FAILED", message: "The encrypted export could not be authenticated" };
    }
    if (message.includes("not empty")) {
      return { code: "DISPOSABLE_TARGET_NOT_EMPTY", message: "The disposable restore target must be empty" };
    }
    if (message.includes("already exists") || message.includes("constraint")) {
      return { code: "DISPOSABLE_RESTORE_CONFLICT", message: "The disposable restore encountered an existing object or row conflict" };
    }
    if (message.includes("foreign key") || message.includes("foreign-key")) {
      return { code: "FOREIGN_KEY_CHECK_FAILED", message: "The staging operation produced foreign-key violations" };
    }
    if (message.includes("unique constraint") || message.includes("already exists")) {
      return { code: "STAGING_DATABASE_CONFLICT", message: "The staging database rejected a duplicate migration or object" };
    }
    if (message.includes("not authorized") || message.includes("permission denied") || message.includes("forbidden")) {
      return { code: "STAGING_DATABASE_AUTHORIZATION_FAILED", message: "The staging database rejected the operation" };
    }
    if (message.includes("syntax error") || message.includes("no such table") || message.includes("sqlite")) {
      return { code: "STAGING_DATABASE_ERROR", message: "The staging database rejected the migration operation" };
    }
    if (message.includes("no such file") || message.includes("enoent")) {
      return { code: "STAGING_ARTIFACT_MISSING", message: "A required staging artifact is missing" };
    }
    if (message.includes("fetch") || message.includes("socket") || message.includes("network") || message.includes("timeout")) {
      return { code: "STAGING_NETWORK_ERROR", message: "The staging service could not be reached" };
    }
    if (/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)) {
      return { code: error.message, message: "The staging operation failed a named prerequisite" };
    }
  }
  return { code: "STAGING_GUARD_ERROR", message: "The staging guard failed" };
}
