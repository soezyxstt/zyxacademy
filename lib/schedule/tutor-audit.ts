import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { hasDatabaseErrorCode } from "@/lib/database-retry";
import { type DbExecutor } from "@/lib/auth/tutor-access";
import {
  type DrizzleTxLike,
  buildMutationAuditRow,
  recordTutorMutationAudit,
} from "@/lib/audit/mutasi";

export function isSqliteBusyError(err: unknown): boolean {
  if (hasDatabaseErrorCode(err, ["40001", "40P01"])) return true;
  const text = [
    err instanceof Error ? err.message : String(err),
    (err as { code?: string })?.code ?? "",
  ].join(" ");
  return /SQLITE_BUSY|database is locked/i.test(text);
}

export const FAILURE_AUDIT_ATTEMPTS = 7;

export class TutorAuditPersistenceError extends Error {
  code: string;

  constructor(message = "TUTOR_AUDIT_PERSISTENCE_FAILED", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TutorAuditPersistenceError";
    this.code = "TUTOR_AUDIT_PERSISTENCE_FAILED";
  }
}

/**
 * Persists failure and rejection audits outside the main transaction.
 * Retries on database contention with bounded exponential backoff
 * (25, 50, 100, 200, 400, 800 ms). Throws TUTOR_AUDIT_PERSISTENCE_FAILED
 * upon exhaustion or non-retryable failure to ensure persistence failures
 * are never silently swallowed.
 */
export async function recordTutorFailureAudit(
  input: Parameters<typeof recordTutorMutationAudit>[0],
  executor?: DbExecutor | DrizzleTxLike,
): Promise<void> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= FAILURE_AUDIT_ATTEMPTS; attempt++) {
    try {
      await recordTutorMutationAudit(
        input,
        (executor ?? db) as unknown as Parameters<typeof recordTutorMutationAudit>[1],
      );
      return;
    } catch (auditErr) {
      lastErr = auditErr;
      if (!isSqliteBusyError(auditErr) || attempt === FAILURE_AUDIT_ATTEMPTS) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** (attempt - 1)));
    }
  }

  throw new TutorAuditPersistenceError("TUTOR_AUDIT_PERSISTENCE_FAILED", {
    cause: lastErr,
  });
}

/**
 * Durable audit for calls that never authenticated. Uses the generic mutation
 * audit builder because tutor/admin roles cannot be claimed for an
 * unauthenticated actor.
 * Retries on database contention with bounded exponential backoff.
 * Throws TUTOR_AUDIT_PERSISTENCE_FAILED upon exhaustion or non-retryable failure.
 */
export async function recordUnauthenticatedRejectAudit(params: {
  action: string;
  entityType: string;
  entityId: string;
  courseId: string;
  requestId: string;
  reason: string;
  input: Record<string, unknown>;
  executor?: DbExecutor | DrizzleTxLike;
}): Promise<void> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= FAILURE_AUDIT_ATTEMPTS; attempt++) {
    try {
      const row = buildMutationAuditRow(
        {
          actorId: "anonymous",
          actorRoles: ["unauthenticated"],
          courseId: params.courseId,
          entityType: params.entityType,
          entityId: params.entityId,
          entityVersion: 1,
          action: params.action,
          outcome: "rejected",
          before: null,
          after: params.input,
          requestId: params.requestId,
          reason: params.reason,
        },
      );
      const client = (params.executor ?? db) as DrizzleTxLike;
      await client.insert(auditMutasi).values({ ...row, actorId: null });
      return;
    } catch (auditErr) {
      lastErr = auditErr;
      if (!isSqliteBusyError(auditErr) || attempt === FAILURE_AUDIT_ATTEMPTS) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** (attempt - 1)));
    }
  }

  throw new TutorAuditPersistenceError("TUTOR_AUDIT_PERSISTENCE_FAILED", {
    cause: lastErr,
  });
}
