import { affectedRows } from "@/lib/mutation-result";
import { createHash, randomUUID } from "node:crypto";
import {
  OPS_AI_POLICY_BOUNDS,
  evaluateProposalExecutionEligibility,
  type OpsAiActionProposalV2,
  type OpsAiActionProposalType,
  type OpsAiProposalStatus,
  type OpsAiPreconditionSnapshot,
  type OpsAiProposalPreview,
  type OpsAiErrorCode,
  PROPOSAL_STATUS_TO_DB,
  DB_STATUS_TO_PROPOSAL,
  type ZyraProposalDbStatus,
} from "./contracts";
import { db } from "@/db";
import { auditMutasi, courses, mataKuliah, courseMaterials, zyraProposals } from "@/db/schema";
import { inArray, eq, and, gt } from "drizzle-orm";
import { generateEnrollmentToken } from "@/app/(admin)/admin/(academic)/tokens/actions";
import {
  executeBatchCreateChapters,
  type BatchCreateChaptersInput,
  executeBulkUpdateMaterials,
  type BulkUpdateMaterialsInput,
} from "./domain-academic";

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export interface ServerStoredProposal<T = unknown> {
  id: string;
  runId: string;
  stepId: string;
  type: OpsAiActionProposalType;
  title: string;
  description: string;
  preview: OpsAiProposalPreview;
  status: OpsAiProposalStatus;
  payload: T;
  preconditions?: OpsAiPreconditionSnapshot;
  diffHash: string;
  actorId?: string;
  createdAt: number;
  expiresAt: number;
  confirmedBy?: string;
  confirmedAt?: number;
  executedAt?: number;
  executionResult?: Record<string, unknown>;
  failureReason?: string;
  idempotencyKey?: string;
  publicProposal: OpsAiActionProposalV2;
}

export interface CreateProposalInput<T = unknown> {
  runId: string;
  stepId: string;
  type: OpsAiActionProposalType;
  title: string;
  description: string;
  preview: OpsAiProposalPreview;
  payload: T;
  preconditions?: OpsAiPreconditionSnapshot;
  actorId?: string;
  ttlMinutes?: number;
}

export interface OpsAiMutationAuditRecord {
  id: string;
  actorId: string;
  proposalId: string;
  actionType: OpsAiActionProposalType;
  diffHash: string;
  timestamp: number;
  status: OpsAiProposalStatus;
  outcome: "success" | "rejected" | "failed";
  reason?: string;
  correlationId?: string;
  entityType: string;
  entityId: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
}

export type PreconditionChecker = (proposal: ServerStoredProposal) => Promise<boolean> | boolean;

export type ActionExecutor<T = any> = (
  payload: T,
  context: { actorId: string; proposalId: string }
) => Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }>;

// ============================================================================
// 2. State Transition Rules & Hash Helpers
// ============================================================================

export const VALID_PROPOSAL_TRANSITIONS: Record<
  OpsAiProposalStatus,
  ReadonlyArray<OpsAiProposalStatus>
> = {
  pending: ["executing", "cancelled", "expired"],
  executing: ["executed", "failed", "pending"],
  executed: [],
  failed: ["pending", "executing"],
  cancelled: [],
  expired: [],
};

export function computeProposalDiffHash(input: {
  type: string;
  payload: unknown;
  preconditions?: unknown;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: input.type,
        payload: input.payload,
        preconditions: input.preconditions ?? null,
      })
    )
    .digest("hex");
}

// ============================================================================
// 3. Default Handlers
// ============================================================================

async function defaultCreateTokenExecutor(
  payload: { courseIds: string[]; capacity: number; packageType?: string },
  _context: { actorId: string; proposalId: string }
): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  const { courseIds, capacity, packageType = "reguler_15" } = payload;
  const res = await generateEnrollmentToken(courseIds, capacity, packageType as any);
  if (!res.success) {
    return {
      success: false,
      error: res.error || "Gagal membuat token pendaftaran",
    };
  }
  return {
    success: true,
    result: {
      token: (res as any).token,
      link: (res as any).link,
      capacity: (res as any).capacity ?? capacity,
      groupId: (res as any).groupId,
      expiresAt: (res as any).expiresAt,
      message: "Token aktivasi berhasil dibuat.",
    },
  };
}

async function defaultCreateTokenPreconditionChecker(
  proposal: ServerStoredProposal
): Promise<boolean> {
  const courseIds = (proposal.payload as any)?.courseIds;
  if (!Array.isArray(courseIds) || courseIds.length === 0) return false;

  try {
    const courseRecords = await db.query.courses.findMany({
      where: inArray(courses.id, courseIds),
    });
    return courseRecords.length === courseIds.length;
  } catch (err) {
    // Fail-closed: database error or unreachability strictly denies precondition
    console.error("[OpsAi Proposal Precondition] Database check failed, denying by default:", err);
    return false;
  }
}

/**
 * Server-side executor for confirmed batch chapter creation proposals.
 */
async function defaultBatchCreateChaptersExecutor(
  payload: BatchCreateChaptersInput,
  context: { actorId: string; proposalId: string }
): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const res = await executeBatchCreateChapters(payload, context.actorId);
    return {
      success: true,
      result: {
        ...res.data,
        message: res.summary,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Gagal membuat bab materi",
    };
  }
}

/**
 * Precondition checker verifying that the target course exists before chapter creation.
 */
async function defaultBatchCreateChaptersPreconditionChecker(
  proposal: ServerStoredProposal
): Promise<boolean> {
  const courseId = String((proposal.payload as any)?.courseId || "").trim().toLowerCase();
  if (!courseId) return false;
  try {
    const existing = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    const existingMk = await db.query.mataKuliah.findFirst({ where: eq(mataKuliah.id, courseId) });
    return Boolean(existing || existingMk);
  } catch (err) {
    console.error("[OpsAi Proposal Precondition] Database check failed for course:", err);
    return false;
  }
}

/**
 * Server-side executor for confirmed bulk material metadata update proposals.
 */
async function defaultBulkUpdateMaterialsExecutor(
  payload: BulkUpdateMaterialsInput,
  context: { actorId: string; proposalId: string }
): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const res = await executeBulkUpdateMaterials(payload, context.actorId);
    return {
      success: true,
      result: {
        ...res.data,
        message: res.summary,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Gagal memperbarui metadata materi",
    };
  }
}

/**
 * Precondition checker verifying that all referenced material IDs exist in the database.
 */
async function defaultBulkUpdateMaterialsPreconditionChecker(
  proposal: ServerStoredProposal
): Promise<boolean> {
  const materialIds = (proposal.payload as any)?.materialIds;
  if (!Array.isArray(materialIds) || materialIds.length === 0) return false;
  const uniqueIds = Array.from(new Set(materialIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return false;
  try {
    const found = await db
      .select({ id: courseMaterials.id })
      .from(courseMaterials)
      .where(inArray(courseMaterials.id, uniqueIds));
    return found.length === uniqueIds.length;
  } catch (err) {
    console.error("[OpsAi Proposal Precondition] Database check failed for materials:", err);
    return false;
  }
}

// ============================================================================
// 4. OpsAiProposalStore Implementation
// ============================================================================

export class OpsAiProposalStore {
  private proposals = new Map<string, ServerStoredProposal>();
  private auditLog: OpsAiMutationAuditRecord[] = [];
  private preconditionCheckers = new Map<OpsAiActionProposalType, PreconditionChecker>();
  private actionExecutors = new Map<OpsAiActionProposalType, ActionExecutor>();

  constructor() {
    this.initDefaults();
  }

  private initDefaults(): void {
    this.preconditionCheckers.set("create_token", defaultCreateTokenPreconditionChecker);
    this.actionExecutors.set("create_token", defaultCreateTokenExecutor);
    this.preconditionCheckers.set("batch_create_chapters", defaultBatchCreateChaptersPreconditionChecker);
    this.actionExecutors.set("batch_create_chapters", defaultBatchCreateChaptersExecutor);
    this.preconditionCheckers.set("bulk_update_materials", defaultBulkUpdateMaterialsPreconditionChecker);
    this.actionExecutors.set("bulk_update_materials", defaultBulkUpdateMaterialsExecutor);
  }

  /**
   * Resets all store state, clearing in-memory proposals and audit records,
   * and restoring default handlers.
   */
  clear(): void {
    this.proposals.clear();
    this.auditLog = [];
    this.preconditionCheckers.clear();
    this.actionExecutors.clear();
    this.initDefaults();
  }

  /**
   * Wipes only the in-memory proposal map to test database persistence reload.
   */
  clearInMemoryCacheOnly(): void {
    this.proposals.clear();
  }

  /**
   * Registers a custom precondition checker for a proposal type.
   */
  registerPreconditionChecker(
    type: OpsAiActionProposalType,
    checker: PreconditionChecker
  ): void {
    this.preconditionCheckers.set(type, checker);
  }

  /**
   * Registers a custom action executor for a proposal type.
   */
  registerActionExecutor<T = any>(
    type: OpsAiActionProposalType,
    executor: ActionExecutor<T>
  ): void {
    this.actionExecutors.set(type, executor);
  }

  /**
   * Creates a new server-stored proposal with an opaque ID, calculates diffHash,
   * and returns the public preview representation without executable params.
   */
  async createProposal<T = unknown>(input: CreateProposalInput<T>): Promise<{
    storedProposal: ServerStoredProposal<T>;
    publicProposal: OpsAiActionProposalV2;
  }> {
    const id = `prop-${randomUUID()}`;
    const createdAt = Date.now();
    const ttlMinutes = input.ttlMinutes ?? OPS_AI_POLICY_BOUNDS.proposalTtlMinutes;
    const expiresAt = createdAt + ttlMinutes * 60 * 1000;

    const diffHash = computeProposalDiffHash({
      type: input.type,
      payload: input.payload,
      preconditions: input.preconditions,
    });

    const publicProposal: OpsAiActionProposalV2 = {
      id,
      runId: input.runId,
      stepId: input.stepId,
      type: input.type,
      title: input.title,
      description: input.description,
      preview: input.preview,
      status: "pending",
      preconditions: input.preconditions,
      createdAt,
      expiresAt,
    };

    const storedProposal: ServerStoredProposal<T> = {
      id,
      runId: input.runId,
      stepId: input.stepId,
      type: input.type,
      title: input.title,
      description: input.description,
      preview: input.preview,
      status: "pending",
      payload: input.payload,
      preconditions: input.preconditions,
      diffHash,
      actorId: input.actorId,
      createdAt,
      expiresAt,
      publicProposal,
    };

    // Execution requires the persisted row for its atomic state transition.
    try {
      await db.insert(zyraProposals).values({
        id,
        actorId: input.actorId || "admin",
        role: "admin",
        proposalType: input.type,
        courseId: (input.payload as any)?.courseId || (input.payload as any)?.courseIds?.[0] || null,
        scope: {
          title: input.title,
          description: input.description,
          preview: input.preview,
          fullProposal: storedProposal,
        },
        evidenceRefs: [],
        preconditionSnapshot: (input.preconditions as Record<string, unknown>) ?? {},
        operations: [{ type: input.type, payload: input.payload }],
        learnerImpact: { summary: input.preview.summary },
        reversibility: { reversible: false, rollback: "manual_revocation" },
        warnings: [],
        proposerTrace: { runId: input.runId, stepId: input.stepId, diffHash },
        validatorResult: { valid: true },
        status: "draft",
        preconditionVersion: input.preconditions?.version ?? 1,
        diffHash,
        expiresAt: new Date(expiresAt),
        createdAt: new Date(createdAt),
      });
    } catch (err) {
      throw new Error("OPS_AI_PROPOSAL_PERSISTENCE_FAILED", { cause: err });
    }
    this.proposals.set(id, storedProposal as ServerStoredProposal);

    return {
      storedProposal,
      publicProposal,
    };
  }

  /**
   * Retrieves a server-stored proposal by its opaque ID.
   * Checks in-memory cache first, falling back to zyra_proposals table.
   */
  async getProposal(id: string): Promise<ServerStoredProposal | null> {
    const cached = this.proposals.get(id);
    if (cached) return cached;

    // Fallback: query database for persisted proposal
    try {
      const [row] = await db
        .select()
        .from(zyraProposals)
        .where(eq(zyraProposals.id, id))
        .limit(1);

      if (row) {
        let full: ServerStoredProposal | null = null;
        const currentStatus = DB_STATUS_TO_PROPOSAL[row.status as ZyraProposalDbStatus] || "pending";

        if ((row.scope as any)?.fullProposal) {
          full = (row.scope as any).fullProposal as ServerStoredProposal;
          full.status = currentStatus;
          full.publicProposal.status = currentStatus;
        } else {
          // Reconstruct ServerStoredProposal from persistent DB columns
          const operation = Array.isArray(row.operations) && row.operations[0] ? (row.operations[0] as any) : {};
          const scope = (row.scope as any) || {};
          const preview: OpsAiProposalPreview = scope.preview || {
            summary: scope.description || row.proposalType,
            affectedEntities: [],
          };
          const publicProposal: OpsAiActionProposalV2 = {
            id: row.id,
            runId: (row.proposerTrace as any)?.runId || "persisted-run",
            stepId: (row.proposerTrace as any)?.stepId || "persisted-step",
            type: row.proposalType as OpsAiActionProposalType,
            title: scope.title || row.proposalType,
            description: scope.description || "",
            preview,
            status: currentStatus,
            preconditions: row.preconditionSnapshot as any,
            createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
            expiresAt: row.expiresAt ? row.expiresAt.getTime() : Date.now() + 600000,
            confirmedBy: row.actorId,
            confirmedAt: row.confirmedAt ? row.confirmedAt.getTime() : undefined,
          };
          full = {
            id: row.id,
            runId: publicProposal.runId,
            stepId: publicProposal.stepId,
            type: row.proposalType as OpsAiActionProposalType,
            title: publicProposal.title,
            description: publicProposal.description,
            preview,
            status: currentStatus,
            payload: operation.payload ?? {},
            preconditions: row.preconditionSnapshot as any,
            diffHash: row.diffHash,
            actorId: row.actorId,
            createdAt: publicProposal.createdAt,
            expiresAt: row.expiresAt ? row.expiresAt.getTime() : (publicProposal.expiresAt ?? Date.now() + 600000),
            confirmedBy: row.actorId,
            confirmedAt: publicProposal.confirmedAt,
            publicProposal,
          };
        }
        if (full) {
          this.proposals.set(id, full);
          return full;
        }
      }
    } catch {
      // Database not reachable or table missing
    }

    return null;
  }

  /**
   * Retrieves only the public preview representation of a proposal.
   */
  async getPublicProposal(id: string): Promise<OpsAiActionProposalV2 | null> {
    const stored = await this.getProposal(id);
    return stored?.publicProposal ?? null;
  }

  /**
   * Performs an atomic status transition with validation against the transition matrix.
   */
  async transitionStatus(
    id: string,
    newStatus: OpsAiProposalStatus,
    metadata?: { actorId?: string; reason?: string }
  ): Promise<ServerStoredProposal> {
    const proposal = await this.getProposal(id);
    if (!proposal) {
      throw new Error(`Proposal '${id}' tidak ditemukan.`);
    }

    const allowed = VALID_PROPOSAL_TRANSITIONS[proposal.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transisi status proposal tidak valid: '${proposal.status}' -> '${newStatus}'.`
      );
    }

    const dbTargetStatus = PROPOSAL_STATUS_TO_DB[newStatus];

    // Determine atomic update condition based on transition
    let whereClause = eq(zyraProposals.id, id);
    if (newStatus === "executing") {
      // Must atomically transition from unconfirmed state (draft / validated / reviewed) and not expired
      whereClause = and(
        eq(zyraProposals.id, id),
        inArray(zyraProposals.status, ["draft", "validated", "reviewed"]),
        gt(zyraProposals.expiresAt, new Date())
      )!;
    } else if (newStatus === "executed") {
      // Must atomically transition from confirmed (executing)
      whereClause = and(
        eq(zyraProposals.id, id),
        eq(zyraProposals.status, "confirmed")
      )!;
    } else if (newStatus === "failed") {
      whereClause = and(
        eq(zyraProposals.id, id),
        eq(zyraProposals.status, "confirmed")
      )!;
    }

    const previous = {
      status: proposal.status,
      confirmedBy: proposal.confirmedBy,
      confirmedAt: proposal.confirmedAt,
      publicConfirmedBy: proposal.publicProposal.confirmedBy,
      publicConfirmedAt: proposal.publicProposal.confirmedAt,
    };
    let persistedStatus: OpsAiProposalStatus | undefined;
    // Update in-memory state
    proposal.status = newStatus;
    proposal.publicProposal.status = newStatus;

    if (metadata?.actorId && (newStatus === "executed" || newStatus === "executing")) {
      proposal.confirmedBy = metadata.actorId;
      proposal.confirmedAt = Date.now();
      proposal.publicProposal.confirmedBy = metadata.actorId;
      proposal.publicProposal.confirmedAt = proposal.confirmedAt;
    }

    if (metadata?.reason && newStatus === "failed") {
      proposal.failureReason = metadata.reason;
    }

    // Update DB record if reachable
    try {
      const updateResult = await db
        .update(zyraProposals)
        .set({
          status: dbTargetStatus,
          scope: {
            title: proposal.title,
            description: proposal.description,
            preview: proposal.preview,
            fullProposal: proposal,
          },
          confirmedAt: proposal.confirmedAt ? new Date(proposal.confirmedAt) : null,
          appliedAt: newStatus === "executed" ? new Date() : null,
          failureCode: proposal.failureReason ?? null,
          updatedAt: new Date(),
        })
        .where(whereClause);

      if (
        (newStatus === "executing" || newStatus === "executed") &&
        affectedRows(updateResult) === 0
      ) {
        // Verify if row was persisted in DB
        const [existingRow] = await db
          .select({ id: zyraProposals.id, status: zyraProposals.status })
          .from(zyraProposals)
          .where(eq(zyraProposals.id, id))
          .limit(1);

        if (existingRow) {
          // Revert in-memory status to match database reality
          persistedStatus = DB_STATUS_TO_PROPOSAL[existingRow.status as ZyraProposalDbStatus] || "failed";
          proposal.status = persistedStatus;
          proposal.publicProposal.status = proposal.status;

          throw new Error(
            `Atomic transition to '${newStatus}' failed: proposal '${id}' sudah berada dalam status DB '${existingRow.status}' atau telah kedaluwarsa.`
          );
        }
        throw new Error(`Atomic transition to '${newStatus}' failed: proposal '${id}' tidak ditemukan.`);
      }
    } catch (err: any) {
      if (newStatus === "executing" || newStatus === "executed") {
        proposal.status = persistedStatus ?? previous.status;
        proposal.publicProposal.status = proposal.status;
        proposal.confirmedBy = previous.confirmedBy;
        proposal.confirmedAt = previous.confirmedAt;
        proposal.publicProposal.confirmedBy = previous.publicConfirmedBy;
        proposal.publicProposal.confirmedAt = previous.publicConfirmedAt;
        throw err;
      }
      // Non-fatal if DB table is unconfigured in offline mock unit tests
    }

    return proposal;
  }

  /**
   * Hardened Server-Side Execution of an authorized proposal.
   * Performs replay check, TTL expiry, precondition revalidation,
   * atomic state transitions, action execution, and audit logging.
   */
  async executeProposal(input: {
    proposalId: string;
    actorId: string;
    livePreconditionMatch?: boolean;
    currentTimeMs?: number;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
    errorCode?: OpsAiErrorCode;
    idempotent?: boolean;
  }> {
    const now = input.currentTimeMs ?? Date.now();
    const stored = await this.getProposal(input.proposalId);

    if (!stored) {
      return {
        success: false,
        error: `Proposal '${input.proposalId}' tidak ditemukan di server.`,
        errorCode: "INVALID_REQUEST",
      };
    }

    // 0. Actor Binding Check: Only the administrator who created the proposal can execute it
    if (stored.actorId && stored.actorId !== input.actorId) {
      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: stored.status,
        outcome: "rejected",
        reason: `Actor '${input.actorId}' tidak berwenang mengeksekusi proposal milik '${stored.actorId}'.`,
        correlationId: stored.runId,
        entityType: "ops_ai_proposal",
        entityId: stored.id,
      });

      return {
        success: false,
        error: "Proposal hanya dapat dieksekusi oleh administrator pembuat proposal.",
        errorCode: "FORBIDDEN",
      };
    }

    // 1. Idempotency Check: duplicate confirmation returns previously computed result
    if (stored.status === "executed") {
      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: stored.status,
        outcome: "success",
        reason: "Idempotent replay: proposal already executed",
        correlationId: stored.runId,
        entityType: "enrollment_token",
        entityId: stored.id,
        beforeSnapshot: { status: "executed" },
        afterSnapshot: { status: "executed", result: stored.executionResult },
      });

      return {
        success: true,
        result: stored.executionResult,
        idempotent: true,
      };
    }

    // 2. Check Expiry
    if (now > stored.expiresAt) {
      if (stored.status === "pending") {
        await this.transitionStatus(stored.id, "expired");
      }
      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: "expired",
        outcome: "rejected",
        reason: "Proposal has expired",
        correlationId: stored.runId,
        entityType: "ops_ai_proposal",
        entityId: stored.id,
      });

      return {
        success: false,
        error: "Proposal telah kedaluwarsa dan tidak dapat dieksekusi.",
        errorCode: "PROPOSAL_REPLAY_DETECTED",
      };
    }

    // 3. Precondition Evaluation
    let liveMatch = input.livePreconditionMatch ?? true;
    if (input.livePreconditionMatch === undefined && stored.preconditions) {
      const checker = this.preconditionCheckers.get(stored.type);
      if (checker) {
        liveMatch = await checker(stored);
      }
    }

    const eligibility = evaluateProposalExecutionEligibility({
      proposal: stored.publicProposal,
      livePreconditionMatch: liveMatch,
      currentTimeMs: now,
    });

    if (!eligibility.canExecute) {
      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: stored.status,
        outcome: "rejected",
        reason: eligibility.message,
        correlationId: stored.runId,
        entityType: "ops_ai_proposal",
        entityId: stored.id,
      });

      return {
        success: false,
        error: eligibility.message || "Proposal tidak memenuhi syarat eksekusi.",
        errorCode: eligibility.errorCode,
      };
    }

    // 4. Transition to "executing" with atomic race condition protection
    try {
      await this.transitionStatus(stored.id, "executing", { actorId: input.actorId });
    } catch (err: any) {
      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: stored.status,
        outcome: "rejected",
        reason: `Gagal transisi ke status executing: ${err.message}`,
        correlationId: stored.runId,
        entityType: "ops_ai_proposal",
        entityId: stored.id,
      });

      return {
        success: false,
        error: err.message || "Proposal sedang atau telah dieksekusi.",
        errorCode: "INVALID_REQUEST",
      };
    }

    // 5. Execute Action via Action Executor
    const executor = this.actionExecutors.get(stored.type);
    if (!executor) {
      await this.transitionStatus(stored.id, "failed", {
        actorId: input.actorId,
        reason: `No executor registered for action type '${stored.type}'`,
      });

      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: "failed",
        outcome: "failed",
        reason: `Executor not found for ${stored.type}`,
        correlationId: stored.runId,
        entityType: "ops_ai_proposal",
        entityId: stored.id,
      });

      return {
        success: false,
        error: `Tipe proposal '${stored.type}' belum didukung untuk eksekusi server-side.`,
        errorCode: "TOOL_EXECUTION_FAILED",
      };
    }

    try {
      const execResult = await executor(stored.payload, {
        actorId: input.actorId,
        proposalId: stored.id,
      });

      if (!execResult.success) {
        await this.transitionStatus(stored.id, "failed", {
          actorId: input.actorId,
          reason: execResult.error || "Execution failed",
        });

        await this.recordAuditEvent({
          actorId: input.actorId,
          proposalId: stored.id,
          actionType: stored.type,
          diffHash: stored.diffHash,
          status: "failed",
          outcome: "failed",
          reason: execResult.error,
          correlationId: stored.runId,
          entityType: "enrollment_token",
          entityId: stored.id,
        });

        return {
          success: false,
          error: execResult.error || "Gagal mengeksekusi aksi proposal.",
          errorCode: "TOOL_EXECUTION_FAILED",
        };
      }

      // 6. Execution succeeded! Update records and transitions
      stored.executionResult = execResult.result;
      stored.executedAt = Date.now();
      if (input.idempotencyKey) {
        stored.idempotencyKey = input.idempotencyKey;
      }

      await this.transitionStatus(stored.id, "executed", { actorId: input.actorId });

      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: "executed",
        outcome: "success",
        reason: "Proposal executed successfully",
        correlationId: stored.runId,
        entityType: "enrollment_token",
        entityId: stored.id,
        beforeSnapshot: { status: "pending" },
        afterSnapshot: { status: "executed", diffHash: stored.diffHash },
      });

      return {
        success: true,
        result: execResult.result,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.transitionStatus(stored.id, "failed", {
        actorId: input.actorId,
        reason: errorMsg,
      });

      await this.recordAuditEvent({
        actorId: input.actorId,
        proposalId: stored.id,
        actionType: stored.type,
        diffHash: stored.diffHash,
        status: "failed",
        outcome: "failed",
        reason: errorMsg,
        correlationId: stored.runId,
        entityType: "enrollment_token",
        entityId: stored.id,
      });

      return {
        success: false,
        error: errorMsg,
        errorCode: "TOOL_EXECUTION_FAILED",
      };
    }
  }

  /**
   * Records a structured audit mutation record with minimum PII,
   * strictly omitting full prompt, secrets, and sensitive tokens.
   */
  async recordAuditEvent(
    record: Omit<OpsAiMutationAuditRecord, "id" | "timestamp">
  ): Promise<OpsAiMutationAuditRecord> {
    const auditRecord: OpsAiMutationAuditRecord = {
      ...record,
      id: `audit-${randomUUID()}`,
      timestamp: Date.now(),
    };

    this.auditLog.push(auditRecord);

    try {
      await db.insert(auditMutasi).values({
        id: auditRecord.id,
        actorId: auditRecord.actorId,
        entityType: auditRecord.entityType,
        entityId: auditRecord.entityId,
        action: auditRecord.actionType,
        beforeSnapshot: auditRecord.beforeSnapshot ?? null,
        afterSnapshot: auditRecord.afterSnapshot ?? null,
        correlationId: auditRecord.correlationId ?? null,
        courseId: null,
        outcome: auditRecord.outcome,
        reason: auditRecord.reason ?? null,
        createdAt: new Date(auditRecord.timestamp),
      });
    } catch {
      // In-memory record is preserved; database insert failures in hermetic tests are gracefully handled
    }

    return auditRecord;
  }

  /**
   * Retrieves all recorded audit events, optionally filtered by proposalId.
   */
  getAuditRecords(proposalId?: string): OpsAiMutationAuditRecord[] {
    if (!proposalId) {
      return [...this.auditLog];
    }
    return this.auditLog.filter((r) => r.proposalId === proposalId);
  }
}

// Global Singleton Instance
export const proposalStore = new OpsAiProposalStore();
