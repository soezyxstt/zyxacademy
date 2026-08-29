import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { stableValue } from "@/lib/staging/migration-ledger";

export type MutationAuditOutcome = "success" | "rejected" | "failed";

export const MUTATION_AUDIT_OUTCOMES = ["success", "rejected", "failed"] as const;

export interface MutationAuditInput {
  actorId: string;
  actorRoles: readonly string[];
  courseId: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string;
  reason: string;
  outcome?: MutationAuditOutcome;
}

export interface TutorMutationAuditInput {
  actorId: string;
  actorRoles: readonly string[];
  courseId: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  action: string;
  outcome: MutationAuditOutcome;
  requestId: string;
  reason: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export type MutationAuditEnvelope = Record<string, unknown> & {
  auditSchemaVersion: "content-workflow-v1";
  actorRoles: string[];
  courseId: string;
  entityVersion: number;
  requestId: string;
  reason: string;
  outcome?: MutationAuditOutcome;
  snapshotHash: string | null;
  snapshot: Record<string, unknown> | null;
};

export type MutationAuditRow = typeof auditMutasi.$inferInsert;

export type DrizzleTxLike = {
  insert: (table: any) => {
    values: (values: any) => Promise<any> | any;
  };
};

export const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "bearer",
  "creditcard",
  "cvv",
  "ssn",
] as const;

export const SENSITIVE_KEY_EXACT = [
  "auth",
  "authorization",
  "cookie",
  "credential",
  "credentials",
] as const;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  if (SENSITIVE_KEY_EXACT.some((exact) => normalized === exact)) return true;
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => normalized.includes(sub));
}

export interface SanitizeSnapshotOptions {
  maxStringLength?: number;
  maxArrayLength?: number;
  maxDepth?: number;
  maxObjectKeys?: number;
  maxTotalBytes?: number;
}

export const DEFAULT_MAX_STRING_LENGTH = 4096;
export const DEFAULT_MAX_ARRAY_LENGTH = 100;
export const DEFAULT_MAX_DEPTH = 10;
export const DEFAULT_MAX_OBJECT_KEYS = 100;
export const DEFAULT_MAX_TOTAL_BYTES = 65536;

export const DEFAULT_MAX_TOP_LEVEL_STRING_LENGTH = 1024;
export const DEFAULT_MAX_REASON_LENGTH = 2048;
export const DEFAULT_MAX_ACTION_LENGTH = 512;
export const DEFAULT_MAX_ENTITY_LENGTH = 256;

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function boundRootPayload(
  sanitized: Record<string, unknown> | unknown[],
  maxTotalBytes: number,
): Record<string, unknown> | unknown[] {
  const jsonStr = stableJson(sanitized);
  const byteLength = Buffer.byteLength(jsonStr, "utf8");
  if (byteLength > maxTotalBytes) {
    const digest = createHash("sha256").update(jsonStr, "utf8").digest("hex");
    return {
      _truncated: "[TRUNCATED_PAYLOAD]",
      digest,
      byteLength,
    };
  }
  return sanitized;
}

export function sanitizeSnapshot<T>(
  value: T,
  options?: SanitizeSnapshotOptions,
  depth: number = 0,
): unknown {
  const maxStringLength = options?.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const maxArrayLength = options?.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH;
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxObjectKeys = options?.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS;
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  if (value === null || value === undefined) return null;
  if (depth > maxDepth) return "[TRUNCATED_NESTING]";

  if (typeof value === "string") {
    if (value.length > maxStringLength) {
      return `${value.slice(0, maxStringLength)}... [TRUNCATED]`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Uint8Array) {
    const b64 = Buffer.from(value).toString("base64");
    if (b64.length > maxStringLength) {
      return `${b64.slice(0, maxStringLength)}... [TRUNCATED]`;
    }
    return b64;
  }

  if (Array.isArray(value)) {
    const truncatedArray = value.slice(0, maxArrayLength);
    const sanitized = truncatedArray.map((item) => sanitizeSnapshot(item, options, depth + 1));
    if (value.length > maxArrayLength) {
      sanitized.push(`[TRUNCATED_${value.length - maxArrayLength}_ITEMS]`);
    }
    if (depth === 0) {
      return boundRootPayload(sanitized, maxTotalBytes);
    }
    return sanitized;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    const truncatedEntries = entries.slice(0, maxObjectKeys);
    for (const [key, val] of truncatedEntries) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeSnapshot(val, options, depth + 1);
      }
    }
    if (entries.length > maxObjectKeys) {
      result["_truncatedKeys"] = `[TRUNCATED_${entries.length - maxObjectKeys}_KEYS]`;
    }
    if (depth === 0) {
      return boundRootPayload(result, maxTotalBytes);
    }
    return result;
  }

  return String(value);
}

// The hash is always recomputed over the exact stored sanitized value.
// Truncation markers ({_truncated, digest}) produced by boundRootPayload are
// treated as inert content: caller-supplied lookalike objects can never
// substitute an attacker-chosen digest for the authoritative integrity hash.
export function snapshotHash(snapshot: Record<string, unknown> | null): string | null {
  if (snapshot === null) return null;
  return createHash("sha256").update(stableJson(snapshot), "utf8").digest("hex");
}

function requireTrimmedText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`AUDIT_${field.toUpperCase()}_REQUIRED`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`AUDIT_${field.toUpperCase()}_REQUIRED`);
  }
  return trimmed;
}

function boundText(validated: string, maxLength: number): string {
  if (validated.length > maxLength) {
    return `${validated.slice(0, maxLength)}... [TRUNCATED]`;
  }
  return validated;
}

export function sanitizeTopLevelText(
  value: unknown,
  field: string,
  maxLength: number = DEFAULT_MAX_TOP_LEVEL_STRING_LENGTH,
): string {
  return boundText(requireTrimmedText(value, field), maxLength);
}

export function buildAuditRowId(params: {
  requestId: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  action: string;
  outcome: string;
}): string {
  const payload = JSON.stringify([
    params.requestId,
    params.entityType,
    params.entityId,
    params.entityVersion,
    params.action,
    params.outcome,
  ]);
  const digest = createHash("sha256").update(payload, "utf8").digest("hex");
  return `audit_${digest}`;
}

export function buildMutationAuditRow(input: MutationAuditInput): MutationAuditRow {
  if (!input) throw new Error("AUDIT_INPUT_REQUIRED");
  const actorId = sanitizeTopLevelText(input.actorId, "actor", 256);
  const courseId = sanitizeTopLevelText(input.courseId, "course", 256);
  // Validate the full tuple first; row IDs hash these unbounded validated
  // values so tuples that differ only beyond storage truncation limits stay
  // distinct. Only bounded display fields are stored.
  const entityTypeFull = requireTrimmedText(input.entityType, "entity_type");
  const entityIdFull = requireTrimmedText(input.entityId, "entity_id");
  const actionFull = requireTrimmedText(input.action, "action");
  const requestIdFull = requireTrimmedText(input.requestId, "request");
  const reason = sanitizeTopLevelText(input.reason, "reason", DEFAULT_MAX_REASON_LENGTH);

  if (!Number.isInteger(input.entityVersion) || input.entityVersion < 1) {
    throw new Error("AUDIT_ENTITY_VERSION_INVALID");
  }

  if (!Array.isArray(input.actorRoles) || input.actorRoles.length === 0) {
    throw new Error("AUDIT_ACTOR_ROLES_REQUIRED");
  }
  const actorRoles = [...new Set(
    input.actorRoles
      .map((role) => (typeof role === "string" ? role.trim().slice(0, 64) : ""))
      .filter(Boolean),
  )].sort();

  if (actorRoles.length === 0) {
    throw new Error("AUDIT_ACTOR_ROLES_REQUIRED");
  }

  const outcome = input.outcome ?? "success";
  if (!MUTATION_AUDIT_OUTCOMES.includes(outcome)) {
    throw new Error("AUDIT_OUTCOME_INVALID");
  }

  const entityType = boundText(entityTypeFull, DEFAULT_MAX_ENTITY_LENGTH);
  const entityId = boundText(entityIdFull, DEFAULT_MAX_ENTITY_LENGTH);
  const action = boundText(actionFull, DEFAULT_MAX_ACTION_LENGTH);
  const requestId = boundText(requestIdFull, 256);

  const envelope = (snapshot: Record<string, unknown> | null): MutationAuditEnvelope => {
    const sanitized = snapshot === null ? null : (sanitizeSnapshot(snapshot) as Record<string, unknown>);
    return {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles,
      courseId,
      entityVersion: input.entityVersion,
      requestId,
      reason,
      outcome,
      snapshotHash: snapshotHash(sanitized),
      snapshot: sanitized,
    };
  };

  const id = buildAuditRowId({
    requestId: requestIdFull,
    entityType: entityTypeFull,
    entityId: entityIdFull,
    entityVersion: input.entityVersion,
    action: actionFull,
    outcome,
  });

  return {
    id,
    actorId,
    entityType,
    entityId,
    action,
    beforeSnapshot: input.before === null || input.before === undefined ? null : envelope(input.before),
    afterSnapshot: envelope(input.after ?? null),
    correlationId: requestId,
    courseId,
    outcome,
    reason,
  };
}

export function buildTutorMutationAuditRow(input: TutorMutationAuditInput): MutationAuditRow {
  if (!input) throw new Error("AUDIT_INPUT_REQUIRED");
  const actorId = sanitizeTopLevelText(input.actorId, "actor", 256);

  if (!Array.isArray(input.actorRoles) || input.actorRoles.length === 0) {
    throw new Error("AUDIT_ACTOR_ROLES_REQUIRED");
  }
  const actorRoles = [...new Set(
    input.actorRoles
      .map((role) => (typeof role === "string" ? role.trim().slice(0, 64) : ""))
      .filter(Boolean),
  )].sort();

  if (actorRoles.length === 0) {
    throw new Error("AUDIT_ACTOR_ROLES_REQUIRED");
  }

  const hasAuthorizedRole = actorRoles.some((role) => {
    const lower = role.toLowerCase();
    return lower === "tutor" || lower === "admin";
  });
  if (!hasAuthorizedRole) {
    throw new Error("AUDIT_TUTOR_OR_ADMIN_ROLE_REQUIRED");
  }

  const courseId = sanitizeTopLevelText(input.courseId, "course", 256);
  // Validate the full tuple first; row IDs hash these unbounded validated
  // values so tuples that differ only beyond storage truncation limits stay
  // distinct. Only bounded display fields are stored.
  const entityTypeFull = requireTrimmedText(input.entityType, "entity_type");
  const entityIdFull = requireTrimmedText(input.entityId, "entity_id");

  if (!Number.isInteger(input.entityVersion) || input.entityVersion < 1) {
    throw new Error("AUDIT_ENTITY_VERSION_INVALID");
  }

  const actionFull = requireTrimmedText(input.action, "action");

  if (!input.outcome || typeof input.outcome !== "string" || input.outcome.trim().length === 0) {
    throw new Error("AUDIT_OUTCOME_REQUIRED");
  }
  const outcome = input.outcome.trim() as MutationAuditOutcome;
  if (!MUTATION_AUDIT_OUTCOMES.includes(outcome)) {
    throw new Error("AUDIT_OUTCOME_INVALID");
  }

  const requestIdFull = requireTrimmedText(input.requestId, "request");
  const requestId = boundText(requestIdFull, 256);
  const reason = sanitizeTopLevelText(input.reason, "reason", DEFAULT_MAX_REASON_LENGTH);

  const envelope = (snapshot: Record<string, unknown> | null): MutationAuditEnvelope => {
    const sanitized = snapshot === null ? null : (sanitizeSnapshot(snapshot) as Record<string, unknown>);
    return {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles,
      courseId,
      entityVersion: input.entityVersion,
      requestId,
      reason,
      outcome,
      snapshotHash: snapshotHash(sanitized),
      snapshot: sanitized,
    };
  };

  const entityType = boundText(entityTypeFull, DEFAULT_MAX_ENTITY_LENGTH);
  const entityId = boundText(entityIdFull, DEFAULT_MAX_ENTITY_LENGTH);
  const action = boundText(actionFull, DEFAULT_MAX_ACTION_LENGTH);

  const id = buildAuditRowId({
    requestId: requestIdFull,
    entityType: entityTypeFull,
    entityId: entityIdFull,
    entityVersion: input.entityVersion,
    action: actionFull,
    outcome,
  });

  return {
    id,
    actorId,
    entityType,
    entityId,
    action,
    beforeSnapshot: input.before === null || input.before === undefined ? null : envelope(input.before),
    afterSnapshot: envelope(input.after ?? null),
    correlationId: requestId,
    courseId,
    outcome,
    reason,
  };
}

export async function recordMutationAudit(
  input: MutationAuditInput,
  tx?: DrizzleTxLike,
): Promise<MutationAuditRow> {
  const row = buildMutationAuditRow(input);
  const client = tx ?? db;
  await client.insert(auditMutasi).values(row);
  return row;
}

export async function recordTutorMutationAudit(
  input: TutorMutationAuditInput,
  tx?: DrizzleTxLike,
): Promise<MutationAuditRow> {
  const row = buildTutorMutationAuditRow(input);
  const client = tx ?? db;
  await client.insert(auditMutasi).values(row);
  return row;
}
