import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { stableValue } from "@/lib/staging/migration-ledger";

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
}

export type MutationAuditEnvelope = Record<string, unknown> & {
  auditSchemaVersion: "content-workflow-v1";
  actorRoles: string[];
  courseId: string;
  entityVersion: number;
  requestId: string;
  reason: string;
  snapshotHash: string | null;
  snapshot: Record<string, unknown> | null;
};

export type MutationAuditRow = typeof auditMutasi.$inferInsert;

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function snapshotHash(snapshot: Record<string, unknown> | null): string | null {
  if (snapshot === null) return null;
  return createHash("sha256").update(stableJson(snapshot), "utf8").digest("hex");
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`AUDIT_${field.toUpperCase()}_REQUIRED`);
  return value.trim();
}

export function buildMutationAuditRow(input: MutationAuditInput): MutationAuditRow {
  const actorId = requireText(input.actorId, "actor_id");
  const courseId = requireText(input.courseId, "course_id");
  const entityType = requireText(input.entityType, "entity_type");
  const entityId = requireText(input.entityId, "entity_id");
  const action = requireText(input.action, "action");
  const requestId = requireText(input.requestId, "request_id");
  const reason = requireText(input.reason, "reason");
  if (!Number.isInteger(input.entityVersion) || input.entityVersion < 1) throw new Error("AUDIT_ENTITY_VERSION_INVALID");
  const actorRoles = [...new Set(input.actorRoles.map((role) => role.trim()).filter(Boolean))].sort();
  if (actorRoles.length === 0) throw new Error("AUDIT_ACTOR_ROLES_REQUIRED");

  const envelope = (snapshot: Record<string, unknown> | null): MutationAuditEnvelope => ({
    auditSchemaVersion: "content-workflow-v1",
    actorRoles,
    courseId,
    entityVersion: input.entityVersion,
    requestId,
    reason,
    snapshotHash: snapshotHash(snapshot),
    snapshot,
  });

  return {
    id: `${requestId}:${entityType}:${entityId}:${input.entityVersion}`,
    actorId,
    entityType,
    entityId,
    action,
    beforeSnapshot: input.before === null ? null : envelope(input.before),
    afterSnapshot: envelope(input.after),
    correlationId: requestId,
  };
}

export async function recordMutationAudit(input: MutationAuditInput): Promise<MutationAuditRow> {
  const row = buildMutationAuditRow(input);
  await db.insert(auditMutasi).values(row);
  return row;
}
