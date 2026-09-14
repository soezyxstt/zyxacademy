import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  pengguna,
  penggunaPeran,
  peran,
} from "@/db/schema";
import {
  type DbExecutor,
} from "@/lib/auth/tutor-access";
import {
  type DrizzleTxLike,
  type MutationAuditOutcome,
  type MutationAuditRow,
  recordMutationAudit,
  recordTutorMutationAudit,
} from "@/lib/audit/mutasi";
import { mapLegacyRole, normalizePeranCodes } from "@/lib/auth/peran";

export const TUTOR_CAPABILITY_ERRORS = {
  MATERIALS_AUTHORING_DISABLED: "TUTOR_CAPABILITY_FORBIDDEN: MATERIALS_AUTHORING_DISABLED",
  TRYOUT_AUTHORING_DISABLED: "TUTOR_CAPABILITY_FORBIDDEN: TRYOUT_AUTHORING_DISABLED",
  SIMULATION_MUTATION_FORBIDDEN: "TUTOR_CAPABILITY_FORBIDDEN: SIMULATION_MUTATION_FORBIDDEN",
  TRYOUT_CATEGORY_FORBIDDEN: "TUTOR_CAPABILITY_FORBIDDEN: TRYOUT_CATEGORY_FORBIDDEN",
  CROSS_COURSE_MUTATION_FORBIDDEN: "TUTOR_CAPABILITY_FORBIDDEN: CROSS_COURSE_MUTATION_FORBIDDEN",
  GRADING_COURSE_MISMATCH: "TUTOR_GRADING_SCOPE_VIOLATION: COURSE_MISMATCH",
  GRADING_NON_TRYOUT_FORBIDDEN: "TUTOR_GRADING_SCOPE_VIOLATION: NON_TRYOUT_EXAM",
  GRADING_NOT_REVIEWABLE: "TUTOR_GRADING_SCOPE_VIOLATION: SUBMISSION_NOT_REVIEWABLE",
  GRADING_CONCURRENT_CONFLICT: "TUTOR_GRADING_CONFLICT: CONCURRENT_UPDATE",
  SUBMISSION_NOT_FOUND: "SUBMISSION_NOT_FOUND",
  ACCESS_DENIED: "TUTOR_ACCESS_DENIED",
} as const;

/**
 * Legacy submission rows only exist after submit, so persisted statuses are
 * "completed" | "pending_review" | "graded" | "late". A tutor may grade a
 * submission that awaits essay review ("pending_review", legacy "late") or
 * revise an already graded one ("graded"). Fully auto-scored submissions
 * ("completed", no essays) are terminal and never enter the grading queue.
 */
export const REVIEWABLE_SUBMISSION_STATUSES = ["pending_review", "late", "graded"] as const;

export type ReviewableSubmissionStatus = (typeof REVIEWABLE_SUBMISSION_STATUSES)[number];

export function isReviewableSubmissionStatus(status: string): status is ReviewableSubmissionStatus {
  return (REVIEWABLE_SUBMISSION_STATUSES as readonly string[]).includes(status);
}

export interface ActorRolesResult {
  roles: string[];
  isTutor: boolean;
  isAdmin: boolean;
}

export async function resolveActorRoles(
  userId: string,
  sessionRole?: string | null,
  executor?: DbExecutor,
): Promise<ActorRolesResult> {
  const client = (executor ?? db) as typeof db;
  const rawUserId = typeof userId === "string" ? userId.trim() : "";
  if (!rawUserId) {
    return { roles: [], isTutor: false, isAdmin: false };
  }

  const [[identity], membershipRows, roleRows] = await Promise.all([
    client
      .select({ id: pengguna.id, status: pengguna.status })
      .from(pengguna)
      .where(eq(pengguna.id, rawUserId))
      .limit(1),
    client
      .select({ id: penggunaPeran.id })
      .from(penggunaPeran)
      .where(eq(penggunaPeran.penggunaId, rawUserId)),
    client
      .select({ code: peran.code })
      .from(penggunaPeran)
      .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
      .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
      .where(and(
        eq(penggunaPeran.penggunaId, rawUserId),
        eq(pengguna.status, "active"),
      )),
  ]);

  // A suspended canonical identity can never regain access through a stale
  // session claim. The canonical identity and membership tables are also
  // authoritative when they exist, even when the membership has an unknown
  // role code that cannot be normalized.
  if (identity && identity.status !== "active") {
    return { roles: [], isTutor: false, isAdmin: false };
  }

  if (roleRows.length > 0) {
    const dbRoles = roleRows.map((r: { code: string }) => r.code);
    const normalized = normalizePeranCodes(dbRoles);
    const isTutor = normalized.includes("tutor");
    const isAdmin = normalized.includes("admin");
    const effectiveRoles = [...new Set(normalized)];
    return {
      roles: effectiveRoles.length > 0 ? effectiveRoles : dbRoles,
      isTutor,
      isAdmin,
    };
  }

  if (identity || membershipRows.length > 0) {
    return { roles: [], isTutor: false, isAdmin: false };
  }

  if (sessionRole && typeof sessionRole === "string" && sessionRole.trim()) {
    const cleanSessionRole = sessionRole.trim();
    const mapped = mapLegacyRole(cleanSessionRole);
    const candidateRoles = mapped ? [mapped] : [cleanSessionRole];
    const normalized = normalizePeranCodes(candidateRoles);
    const isTutor = normalized.includes("tutor") || cleanSessionRole === "teacher";
    const isAdmin = normalized.includes("admin") || cleanSessionRole === "admin";
    const effectiveRoles = [...new Set([...normalized, ...(isAdmin ? ["admin"] : []), ...(isTutor ? ["tutor"] : [])])];
    return {
      roles: effectiveRoles.length > 0 ? effectiveRoles : [cleanSessionRole],
      isTutor,
      isAdmin,
    };
  }

  return {
    roles: [],
    isTutor: false,
    isAdmin: false,
  };
}

export function parseSelectionRulesInput(selectionRules: unknown): Record<string, unknown> {
  if (!selectionRules) return {};
  if (typeof selectionRules === "string") {
    try {
      const parsed = JSON.parse(selectionRules);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof selectionRules === "object" && !Array.isArray(selectionRules)) {
    return selectionRules as Record<string, unknown>;
  }
  return {};
}

export function resolveEffectiveAssessmentType(
  category?: string | null,
  selectionRules?: unknown,
): "quiz" | "tryout" {
  if (category === "simulation") return "tryout";
  const rules = parseSelectionRulesInput(selectionRules);
  return rules.assessmentType === "tryout" ? "tryout" : "quiz";
}

export function assertTutorQuizCapability(
  category?: string | null,
  selectionRules?: unknown,
): void {
  if (category === "simulation") {
    throw new Error(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
  }

  const rules = parseSelectionRulesInput(selectionRules);
  if (rules.assessmentType === "tryout") {
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
  }
}

export function checkCourseMatch(
  targetCourseId: string,
  authorizedCourseId: string,
  authorizedLegacyCourseId?: string | null,
): boolean {
  if (!targetCourseId) return false;
  const cleanTarget = targetCourseId.trim();
  if (cleanTarget === authorizedCourseId.trim()) return true;
  if (authorizedLegacyCourseId && cleanTarget === authorizedLegacyCourseId.trim()) return true;
  return false;
}

export function hashTeacherNote(note: string | null | undefined): { length: number; hash: string } {
  const content = typeof note === "string" ? note : "";
  const length = content.length;
  const hash = createHash("sha256").update(content, "utf8").digest("hex");
  return { length, hash };
}

export function buildGradingSnapshots(
  submission: {
    id: string;
    score: number | null;
    status: string;
    examId: string;
  },
  newScore: number,
  teacherNotes: string | null | undefined,
): {
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
} {
  const noteInfo = hashTeacherNote(teacherNotes);
  return {
    beforeSnapshot: {
      submissionId: submission.id,
      score: submission.score,
      status: submission.status,
      examId: submission.examId,
    },
    afterSnapshot: {
      submissionId: submission.id,
      score: newScore,
      status: "graded",
      examId: submission.examId,
      notesLength: noteInfo.length,
      notesHash: noteInfo.hash,
    },
  };
}

export class TutorAuditPersistenceError extends Error {
  code: string;
  constructor(message = "TUTOR_AUDIT_PERSISTENCE_FAILED", options?: ErrorOptions) {
    super(message, options);
    this.name = "TutorAuditPersistenceError";
    this.code = "TUTOR_AUDIT_PERSISTENCE_FAILED";
  }
}

export function isSqliteBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; message?: string; rawCode?: number; cause?: unknown };
  if (
    anyErr.code === "SQLITE_BUSY" ||
    anyErr.code === "SQLITE_BUSY_SNAPSHOT" ||
    anyErr.code === "SQLITE_LOCKED"
  )
    return true;
  if (
    typeof anyErr.message === "string" &&
    (anyErr.message.includes("SQLITE_BUSY") ||
      anyErr.message.includes("SQLITE_LOCKED") ||
      anyErr.message.includes("database table is locked") ||
      anyErr.message.includes("database is locked"))
  ) {
    return true;
  }
  if (anyErr.cause) return isSqliteBusyError(anyErr.cause);
  return false;
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; message?: string; rawCode?: number; cause?: unknown };
  if (anyErr.code === "SQLITE_CONSTRAINT" || anyErr.code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  if (
    typeof anyErr.message === "string" &&
    (anyErr.message.includes("UNIQUE constraint failed") ||
      anyErr.message.includes("SQLITE_CONSTRAINT") ||
      anyErr.message.includes("constraint failed"))
  ) {
    return true;
  }
  if (anyErr.cause) return isUniqueConstraintError(anyErr.cause);
  return false;
}

export const FAILURE_AUDIT_ATTEMPTS = 6;

export async function recordTutorFailureAudit(
  input: Parameters<typeof recordTutorMutationAudit>[0],
  executor?: DbExecutor | DrizzleTxLike,
): Promise<MutationAuditRow> {
  let lastErr: unknown = null;

  const hasAuthorizedRole =
    Array.isArray(input.actorRoles) &&
    input.actorRoles.some((role) => {
      const lower = typeof role === "string" ? role.toLowerCase() : "";
      return lower === "tutor" || lower === "admin";
    });

  const client = (executor ?? db) as unknown as Parameters<typeof recordTutorMutationAudit>[1];

  for (let attempt = 0; attempt <= FAILURE_AUDIT_ATTEMPTS; attempt++) {
    try {
      if (hasAuthorizedRole) {
        return await recordTutorMutationAudit(input, client);
      }
      const effectiveRoles =
        input.actorRoles && input.actorRoles.length > 0
          ? input.actorRoles
          : ["anonymous"];
      return await recordMutationAudit(
        {
          ...input,
          actorRoles: effectiveRoles,
          before: input.before ?? null,
          after: input.after ?? null,
        },
        client,
      );
    } catch (auditErr) {
      lastErr = auditErr;
      if (!isSqliteBusyError(auditErr) || attempt === FAILURE_AUDIT_ATTEMPTS) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }

  throw new TutorAuditPersistenceError("TUTOR_AUDIT_PERSISTENCE_FAILED", {
    cause: lastErr,
  });
}

export async function recordTutorMutationAuditSafe(
  input: {
    actorId: string;
    actorRoles: readonly string[];
    courseId: string;
    entityType: string;
    entityId: string;
    entityVersion: number;
    action: string;
    outcome: MutationAuditOutcome;
    requestId?: string;
    reason: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
  executor?: any,
): Promise<MutationAuditRow> {
  const requestId = input.requestId || `req-${randomUUID()}`;
  return recordTutorFailureAudit(
    {
      ...input,
      requestId,
    },
    executor,
  );
}
