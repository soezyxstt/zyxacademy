import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiAllowanceLeases,
  aiUsageEvents,
  pengguna,
  penggunaPeran,
  peran,
  user as authUser,
} from "@/db/schema";
import {
  calendarDateToJakartaInstant,
  daysAgo,
  jakartaDay,
  nextJakartaReset,
  startOfJakartaDayUtc,
} from "@/lib/date-utils";
import { normalizePeranCodes, type PeranCode } from "@/lib/auth/peran";

type QueryExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export const ZYRA_ALLOWANCE_POLICY = {
  murid: { providerPerDay: 20, totalInteractions: 60, perMinute: 8, premiumPerDay: 20 },
  tutor: { providerPerDay: 50, totalInteractions: 150, perMinute: 12, premiumPerDay: 50 },
  admin: { providerPerDay: null, totalInteractions: 300, perMinute: 20, premiumPerDay: null },
} as const;

/**
 * The authenticated Free lane is deliberately separate from the enrolled
 * allowance. This keeps the existing murid allowance unchanged while making
 * the one-question-per-Jakarta-day promise atomic across every Free course.
 */
export const ZYRA_FREE_ALLOWANCE_POLICY = {
  providerPerDay: 1,
  totalInteractions: 1,
  perMinute: 1,
  premiumPerDay: 0,
} as const;

export type AllowanceAccessTier = "free" | "standard";
export const FREE_ALLOWANCE_IDEMPOTENCY_PREFIX = "zyra-free:";

const ACTIVE_STATUSES = ["reserved", "dispatched", "committed"] as const;
type LeaseStatus = (typeof ACTIVE_STATUSES)[number] | "refunded";
type LeaseMode = "provider" | "cache_hit" | "deterministic";

export type AllowanceLease = {
  id: string;
  userId: string;
  peran: PeranCode;
  feature: string;
  appDay: string;
  units: number;
  premium: boolean;
  status: LeaseStatus;
  controlPlaneLeaseId: string | null;
  createdAt: Date;
  expiresAt: Date;
  /** Optional for legacy test doubles and callers; persisted leases always set it. */
  accessTier?: AllowanceAccessTier;
};

export type AllowanceRemaining = {
  providerTurns: number | null;
  totalInteractions: number;
  premiumTurns: number | null;
};

export type AllowanceReserveResult =
  | {
      accepted: true;
      idempotent: boolean;
      lease: AllowanceLease;
      remaining: AllowanceRemaining;
    }
  | {
      accepted: false;
      reason:
        | "FEATURE_DISABLED"
        | "NO_ACTIVE_ROLE"
        | "PER_MINUTE_LIMIT"
        | "TOTAL_INTERACTION_LIMIT"
        | "PROVIDER_TURN_LIMIT"
        | "PREMIUM_LIMIT"
        | "PERSISTENCE_FAILURE"
        | "IDEMPOTENCY_CONFLICT";
      remaining?: AllowanceRemaining;
    };

export type AllowanceSummary = {
  userId: string;
  peran: PeranCode;
  appDay: string;
  providerTurnsUsed: number;
  providerTurnsRemaining: number | null;
  totalInteractionsUsed: number;
  totalInteractionsRemaining: number;
  premiumTurnsUsed: number;
  premiumTurnsRemaining: number | null;
  cacheSaves: number;
  nextResetAt: string;
  accessTier: AllowanceAccessTier;
};

export type AllowanceUsageSnapshot = {
  provider: number;
  total: number;
  premium: number;
  minute: number;
};

export type AllowanceDecision =
  | { accepted: true; remaining: AllowanceRemaining }
  | {
      accepted: false;
      reason: "PER_MINUTE_LIMIT" | "TOTAL_INTERACTION_LIMIT" | "PROVIDER_TURN_LIMIT" | "PREMIUM_LIMIT";
      remaining: AllowanceRemaining;
    };

type ReserveParams = {
  userId: string;
  idempotencyKey: string;
  feature: string;
  requestType?: string;
  model?: string;
  premium?: boolean;
  mode?: LeaseMode;
  units?: number;
  controlPlaneLeaseId?: string;
  expiresAt?: Date;
  now?: Date;
  runId?: string;
  accessTier?: AllowanceAccessTier;
};

type LeaseTransitionResult = {
  leaseId: string;
  status: LeaseStatus;
  changed: boolean;
};

function allowanceEnabled(): boolean {
  return true;
}

function effectiveRole(codes: readonly PeranCode[]): PeranCode | null {
  if (codes.includes("admin")) return "admin";
  if (codes.includes("tutor")) return "tutor";
  if (codes.includes("murid")) return "murid";
  return null;
}

export function resolveEffectiveRoleForActor(
  canonicalRoles: readonly PeranCode[],
  actor: { identityStatus: "active" | "suspended" | null; hasAuthUser: boolean },
): PeranCode | null {
  const role = effectiveRole(canonicalRoles);
  if (role || actor.identityStatus === "suspended") return role;
  // Allowance leases reference pengguna.id. A Better Auth row alone is not a
  // durable identity, so auth-only accounts must be provisioned by the course
  // access boundary before this fallback can grant the murid lane.
  return actor.identityStatus === "active" ? "murid" : null;
}

function toNumber(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function defaultExpiry(now: Date): Date {
  return new Date(now.getTime() + 2 * 60 * 1000);
}

type AllowancePolicy = {
  providerPerDay: number | null;
  totalInteractions: number;
  perMinute: number;
  premiumPerDay: number | null;
};

function policyFor(role: PeranCode, accessTier: AllowanceAccessTier): AllowancePolicy {
  return accessTier === "free" ? ZYRA_FREE_ALLOWANCE_POLICY : ZYRA_ALLOWANCE_POLICY[role];
}

/** The column is added by the access-tier foundation migration. */
function accessTierColumn(): any {
  return (aiAllowanceLeases as unknown as { accessTier?: any }).accessTier;
}

function accessTierCondition(accessTier: AllowanceAccessTier): any {
  const column = accessTierColumn();
  // Before the additive migration, every historical lease is standard. The
  // Free lane must fail closed until the column exists.
  return column ? eq(column, accessTier) : accessTier === "standard" ? undefined : sql`0 = 1`;
}

function normalizeAccessTier(value: unknown): AllowanceAccessTier {
  return value === "free" ? "free" : "standard";
}

function requestedAccessTier(params: Pick<ReserveParams, "accessTier" | "idempotencyKey" | "runId">): AllowanceAccessTier {
  if (params.accessTier) return params.accessTier;
  // RequestLifecycle forwards the idempotency key and run id but does not yet
  // carry application access metadata. The server action prefixes its own
  // authenticated Free request id, allowing this boundary to remain fail
  // closed for arbitrary client input while the lifecycle is upgraded.
  return params.idempotencyKey.startsWith(FREE_ALLOWANCE_IDEMPOTENCY_PREFIX)
    || params.runId?.startsWith(FREE_ALLOWANCE_IDEMPOTENCY_PREFIX) === true
    ? "free"
    : "standard";
}

function remainingFromUsage(
  role: PeranCode,
  usage: { provider: number; total: number; premium: number },
  accessTier: AllowanceAccessTier = "standard",
): AllowanceRemaining {
  const policy = policyFor(role, accessTier);
  return {
    providerTurns: policy.providerPerDay === null
      ? null
      : Math.max(0, policy.providerPerDay - usage.provider),
    totalInteractions: Math.max(0, policy.totalInteractions - usage.total),
    premiumTurns: policy.premiumPerDay === null
      ? null
      : Math.max(0, policy.premiumPerDay - usage.premium),
  };
}

/** Pure policy boundary used by the transactional service and concurrency tests. */
export function evaluateAllowance(
  role: PeranCode,
  usage: AllowanceUsageSnapshot,
  request: { units: number; premium: boolean; interactionUnits?: number; accessTier?: AllowanceAccessTier },
): AllowanceDecision {
  const accessTier = request.accessTier ?? "standard";
  const policy = policyFor(role, accessTier);
  const interactionUnits = request.interactionUnits ?? (request.units > 0 ? request.units : 1);
  const remaining = remainingFromUsage(role, usage, accessTier);
  if (usage.minute + interactionUnits > policy.perMinute) {
    return { accepted: false, reason: "PER_MINUTE_LIMIT", remaining };
  }
  if (usage.total + interactionUnits > policy.totalInteractions) {
    return { accepted: false, reason: "TOTAL_INTERACTION_LIMIT", remaining };
  }
  if (request.units > 0 && policy.providerPerDay !== null && usage.provider + request.units > policy.providerPerDay) {
    return { accepted: false, reason: "PROVIDER_TURN_LIMIT", remaining };
  }
  if (request.premium && request.units > 0 && policy.premiumPerDay !== null && usage.premium + request.units > policy.premiumPerDay) {
    return { accepted: false, reason: "PREMIUM_LIMIT", remaining };
  }
  return {
    accepted: true,
    remaining: remainingFromUsage(role, {
      provider: usage.provider + request.units,
      total: usage.total + interactionUnits,
      premium: usage.premium + (request.premium ? request.units : 0),
    }, accessTier),
  };
}

function leaseFromRow(row: {
  id: string;
  userId: string;
  peran: string;
  feature: string;
  appDay: string;
  units: number;
  premium: boolean;
  status: string;
  controlPlaneLeaseId: string | null;
  createdAt: Date;
  expiresAt: Date;
  accessTier?: string | null;
}): AllowanceLease {
  const role = effectiveRole(normalizePeranCodes([row.peran]));
  if (!role) throw new Error("Invalid allowance lease role");
  return {
    id: row.id,
    userId: row.userId,
    peran: role,
    feature: row.feature,
    appDay: row.appDay,
    units: row.units,
    premium: Boolean(row.premium),
    status: row.status as LeaseStatus,
    controlPlaneLeaseId: row.controlPlaneLeaseId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    accessTier: normalizeAccessTier(row.accessTier),
  };
}

async function activeRoles(executor: QueryExecutor, userId: string): Promise<PeranCode[]> {
  const rows = await executor
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(and(
      eq(pengguna.id, userId),
      eq(pengguna.status, "active"),
      inArray(peran.code, ["admin", "tutor", "murid"]),
    ));
  const roles = normalizePeranCodes(rows.map((row) => row.code));
  if (roles.length > 0) return roles;

  // Keep the allowance boundary aligned with the canonical persistence FK.
  // Auth-only accounts are provisioned by course access before they can use
  // this service; arbitrary IDs and suspended identities fail closed.
  const [[identity], [knownAuthUser]] = await Promise.all([
    executor
      .select({ status: pengguna.status })
      .from(pengguna)
      .where(eq(pengguna.id, userId))
      .limit(1),
    executor
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.id, userId))
      .limit(1),
  ]);
  const fallbackRole = resolveEffectiveRoleForActor(roles, {
    identityStatus: identity?.status ?? null,
    hasAuthUser: Boolean(knownAuthUser),
  });
  return fallbackRole ? [fallbackRole] : [];
}

async function usageFor(
  executor: QueryExecutor,
  userId: string,
  appDay: string,
  minuteStart: Date,
  accessTier: AllowanceAccessTier = "standard",
) {
  const dayConditions = [
    eq(aiAllowanceLeases.userId, userId),
    eq(aiAllowanceLeases.appDay, appDay),
    inArray(aiAllowanceLeases.status, ACTIVE_STATUSES),
    gte(aiAllowanceLeases.createdAt, calendarDateToJakartaInstant(appDay)),
    accessTierCondition(accessTier),
  ];
  const [row] = await executor
    .select({
      provider: sql<number>`coalesce(sum(case when ${aiAllowanceLeases.units} > 0 then ${aiAllowanceLeases.units} else 0 end), 0)`,
      total: sql<number>`coalesce(sum(${aiAllowanceLeases.interactionUnits}), 0)`,
      premium: sql<number>`coalesce(sum(case when ${aiAllowanceLeases.premium} = 1 then ${aiAllowanceLeases.units} else 0 end), 0)`,
      minute: sql<number>`coalesce(sum(${aiAllowanceLeases.interactionUnits}), 0)`,
    })
    .from(aiAllowanceLeases)
    .where(and(...dayConditions));

  const [minuteRow] = await executor
    .select({ minute: sql<number>`coalesce(sum(${aiAllowanceLeases.interactionUnits}), 0)` })
    .from(aiAllowanceLeases)
    .where(and(
      eq(aiAllowanceLeases.userId, userId),
      inArray(aiAllowanceLeases.status, ACTIVE_STATUSES),
      gte(aiAllowanceLeases.createdAt, minuteStart),
      accessTierCondition(accessTier),
    ));

  return {
    provider: toNumber(row?.provider),
    total: toNumber(row?.total),
    premium: toNumber(row?.premium),
    minute: toNumber(minuteRow?.minute),
  };
}

async function expireReservations(executor: QueryExecutor, userId: string, now: Date): Promise<void> {
  await executor
    .update(aiAllowanceLeases)
    .set({ status: "refunded", resolvedAt: now })
    .where(and(
      eq(aiAllowanceLeases.userId, userId),
      eq(aiAllowanceLeases.status, "reserved"),
      lt(aiAllowanceLeases.expiresAt, now),
    ));
}

async function readLeaseWithExecutor(executor: QueryExecutor, leaseId: string): Promise<AllowanceLease | null> {
  const tierColumn = accessTierColumn();
  const columns = {
    id: aiAllowanceLeases.id,
    userId: aiAllowanceLeases.userId,
    peran: aiAllowanceLeases.peran,
    feature: aiAllowanceLeases.feature,
    appDay: aiAllowanceLeases.appDay,
    units: aiAllowanceLeases.units,
    premium: aiAllowanceLeases.premium,
    status: aiAllowanceLeases.status,
    controlPlaneLeaseId: aiAllowanceLeases.controlPlaneLeaseId,
    createdAt: aiAllowanceLeases.createdAt,
    expiresAt: aiAllowanceLeases.expiresAt,
    ...(tierColumn ? { accessTier: tierColumn } : {}),
  };
  const [row] = await executor
    .select(columns)
    .from(aiAllowanceLeases)
    .where(eq(aiAllowanceLeases.id, leaseId))
    .limit(1);
  return row ? leaseFromRow(row) : null;
}

async function readLease(leaseId: string): Promise<AllowanceLease | null> {
  return readLeaseWithExecutor(db, leaseId);
}

async function writeCompatibilityEvent(leaseId: string): Promise<void> {
  const [lease] = await db
    .select({
      id: aiAllowanceLeases.id,
      userId: aiAllowanceLeases.userId,
      feature: aiAllowanceLeases.feature,
      units: aiAllowanceLeases.units,
      model: aiAllowanceLeases.model,
      requestType: aiAllowanceLeases.requestType,
      inputTokens: aiAllowanceLeases.inputTokens,
      outputTokens: aiAllowanceLeases.outputTokens,
      status: aiAllowanceLeases.status,
    })
    .from(aiAllowanceLeases)
    .where(eq(aiAllowanceLeases.id, leaseId))
    .limit(1);
  if (!lease || lease.status !== "committed") return;

  try {
    await db.insert(aiUsageEvents).values({
      id: lease.id,
      userId: lease.userId,
      feature: lease.feature,
      model: lease.model ?? "none",
      tokens: lease.inputTokens + lease.outputTokens,
      inputTokens: lease.inputTokens,
      outputTokens: lease.outputTokens,
      requestType: lease.requestType,
    });
  } catch {
    // The lease remains authoritative. Reconciliation repairs this derived row.
    console.warn("[UsageBudget] compatibility event repair pending");
  }
}

async function transitionLease(
  leaseId: string,
  nextStatus: "dispatched" | "committed" | "refunded",
  now: Date,
): Promise<LeaseTransitionResult | null> {
  const existing = await readLease(leaseId);
  if (!existing) return null;

  if (nextStatus === "dispatched") {
    if (existing.status !== "reserved") {
      return { leaseId, status: existing.status, changed: false };
    }
    await db
      .update(aiAllowanceLeases)
      .set({ status: "dispatched", dispatchedAt: now })
      .where(and(eq(aiAllowanceLeases.id, leaseId), eq(aiAllowanceLeases.status, "reserved")));
    return { leaseId, status: "dispatched", changed: true };
  }

  if (existing.status === "committed" || existing.status === "refunded") {
    return { leaseId, status: existing.status, changed: false };
  }

  await db
    .update(aiAllowanceLeases)
    .set({ status: nextStatus, resolvedAt: now })
    .where(and(
      eq(aiAllowanceLeases.id, leaseId),
      inArray(aiAllowanceLeases.status, ["reserved", "dispatched"]),
    ));

  if (nextStatus === "committed") await writeCompatibilityEvent(leaseId);
  const updated = await readLease(leaseId);
  return updated ? { leaseId, status: updated.status, changed: updated.status === nextStatus } : null;
}

/** Single source of truth for legacy per-feature AI budgets. */
export const BUDGETS = {
  tutorPerDay: 30,
  feedbackPerSubmission: 1,
  summariesPerDayPerUser: 5,
} as const;

export class UsageBudgetService {
  static isAllowanceEnabled(): boolean {
    return allowanceEnabled();
  }

  static resolveEffectiveRole(codes: readonly PeranCode[]): PeranCode | null {
    return effectiveRole(codes);
  }

  static async getActiveRole(userId: string): Promise<PeranCode | null> {
    return effectiveRole(await activeRoles(db, userId));
  }

  /** Reserves one application allowance before a provider request is dispatched. */
  static async reserve(params: ReserveParams): Promise<AllowanceReserveResult> {
    if (!allowanceEnabled()) return { accepted: false, reason: "FEATURE_DISABLED" };
    if (!params.userId || !params.idempotencyKey || !params.feature) {
      return { accepted: false, reason: "PERSISTENCE_FAILURE" };
    }

    const now = params.now ?? new Date();
    const mode = params.mode ?? "provider";
    const units = params.units ?? (mode === "provider" ? 1 : 0);
    if (!Number.isInteger(units) || units < 0) {
      return { accepted: false, reason: "PERSISTENCE_FAILURE" };
    }

    const roles = await activeRoles(db, params.userId);
    const role = effectiveRole(roles);
    if (!role) return { accepted: false, reason: "NO_ACTIVE_ROLE" };
    const appDay = jakartaDay(now);
    const accessTier = requestedAccessTier(params);
    const tierColumn = accessTierColumn();
    const leaseColumns = {
      id: aiAllowanceLeases.id,
      userId: aiAllowanceLeases.userId,
      peran: aiAllowanceLeases.peran,
      feature: aiAllowanceLeases.feature,
      appDay: aiAllowanceLeases.appDay,
      units: aiAllowanceLeases.units,
      premium: aiAllowanceLeases.premium,
      status: aiAllowanceLeases.status,
      controlPlaneLeaseId: aiAllowanceLeases.controlPlaneLeaseId,
      createdAt: aiAllowanceLeases.createdAt,
      expiresAt: aiAllowanceLeases.expiresAt,
      ...(tierColumn ? { accessTier: tierColumn } : {}),
    };
    const existing = await db
      .select(leaseColumns)
      .from(aiAllowanceLeases)
      .where(eq(aiAllowanceLeases.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      if (existing[0].userId !== params.userId) {
        return { accepted: false, reason: "IDEMPOTENCY_CONFLICT" };
      }
      const lease = leaseFromRow(existing[0]);
      // Idempotency is request-scoped, not a reusable daily token. A key
      // replayed on another Jakarta day or for another feature must not
      // bypass that day's allowance.
      if (lease.appDay !== appDay || lease.feature !== params.feature || lease.accessTier !== accessTier) {
        return { accepted: false, reason: "IDEMPOTENCY_CONFLICT" };
      }
      if (lease.status === "refunded") {
        return { accepted: false, reason: "IDEMPOTENCY_CONFLICT" };
      }
      const usage = await usageFor(db, params.userId, appDay, new Date(now.getTime() - 60_000), accessTier);
      return {
        accepted: true,
        idempotent: true,
        lease,
        remaining: remainingFromUsage(role, usage, accessTier),
      };
    }

    try {
      const result = await db.transaction(async (tx) => {
        const executor = tx as unknown as QueryExecutor;
        await expireReservations(executor, params.userId, now);
        const currentRoles = effectiveRole(await activeRoles(executor, params.userId));
        if (!currentRoles) return { accepted: false, reason: "NO_ACTIVE_ROLE" } as const;

        const usage = await usageFor(executor, params.userId, appDay, new Date(now.getTime() - 60_000), accessTier);
        const interactionUnits = mode === "provider" ? units : 1;
        const decision = evaluateAllowance(currentRoles, usage, {
          units,
          interactionUnits,
          premium: Boolean(params.premium),
          accessTier,
        });
        if (!decision.accepted) {
          return decision;
        }

        const leaseId = `aal_${randomUUID()}`;
        const status = units === 0 ? "committed" : "reserved";
        const expiresAt = params.expiresAt ?? defaultExpiry(now);
        await executor.insert(aiAllowanceLeases).values({
          id: leaseId,
          idempotencyKey: params.idempotencyKey,
          userId: params.userId,
          peran: currentRoles,
          feature: params.feature,
          appDay,
          units,
          interactionUnits,
          premium: Boolean(params.premium),
          status,
          controlPlaneLeaseId: params.controlPlaneLeaseId ?? null,
          model: params.model ?? null,
          requestType: params.requestType ?? (mode === "cache_hit" ? "cache:hit" : mode),
          inputTokens: 0,
          outputTokens: 0,
          runId: params.runId ?? null,
          createdAt: now,
          dispatchedAt: null,
          resolvedAt: status === "committed" ? now : null,
          expiresAt,
          ...(tierColumn ? { accessTier } : {}),
        } as any);

        const lease = await readLeaseWithExecutor(executor, leaseId);
        if (!lease) return { accepted: false, reason: "PERSISTENCE_FAILURE" } as const;
        return {
          accepted: true,
          idempotent: false,
          lease,
          remaining: decision.remaining,
        } as const;
      });

      if (result.accepted && result.lease.status === "committed") {
        await writeCompatibilityEvent(result.lease.id);
      }
      return result;
    } catch {
      const retry = await db
        .select(leaseColumns)
        .from(aiAllowanceLeases)
        .where(eq(aiAllowanceLeases.idempotencyKey, params.idempotencyKey))
        .limit(1);
      if (retry[0] && retry[0].userId === params.userId) {
        const lease = leaseFromRow(retry[0]);
        if (
          lease.appDay !== appDay
          || lease.feature !== params.feature
          || lease.accessTier !== accessTier
          || lease.status === "refunded"
        ) {
          return { accepted: false, reason: "IDEMPOTENCY_CONFLICT" };
        }
        const usage = await usageFor(db, params.userId, appDay, new Date(now.getTime() - 60_000), accessTier);
        return { accepted: true, idempotent: true, lease, remaining: remainingFromUsage(role, usage, accessTier) };
      }
      return { accepted: false, reason: "PERSISTENCE_FAILURE" };
    }
  }

  static async reserveAllowance(params: ReserveParams): Promise<AllowanceReserveResult> {
    return this.reserve(params);
  }

  static async markDispatched(leaseId: string, now = new Date()): Promise<LeaseTransitionResult | null> {
    return transitionLease(leaseId, "dispatched", now);
  }

  static async commit(
    leaseId: string,
    metadata: { model?: string; inputTokens?: number; outputTokens?: number; requestType?: string } = {},
    now = new Date(),
  ): Promise<LeaseTransitionResult | null> {
    if (metadata.model || metadata.inputTokens !== undefined || metadata.outputTokens !== undefined || metadata.requestType) {
      await db.update(aiAllowanceLeases).set({
        model: metadata.model,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        requestType: metadata.requestType,
      }).where(eq(aiAllowanceLeases.id, leaseId));
    }
    return transitionLease(leaseId, "committed", now);
  }

  static async commitAllowance(leaseId: string, metadata?: Parameters<typeof UsageBudgetService.commit>[1], now?: Date) {
    return this.commit(leaseId, metadata, now);
  }

  static async refund(leaseId: string, now = new Date()): Promise<LeaseTransitionResult | null> {
    return transitionLease(leaseId, "refunded", now);
  }

  static async refundAllowance(leaseId: string, now = new Date()) {
    return this.refund(leaseId, now);
  }

  static async attachControlPlaneLease(leaseId: string, controlPlaneLeaseId: string): Promise<boolean> {
    const result = await db
      .update(aiAllowanceLeases)
      .set({ controlPlaneLeaseId })
      .where(and(eq(aiAllowanceLeases.id, leaseId), inArray(aiAllowanceLeases.status, ["reserved", "dispatched"])));
    return result.rowsAffected > 0;
  }

  static async recordCacheHit(params: Omit<ReserveParams, "mode" | "units">): Promise<AllowanceReserveResult> {
    return this.reserve({ ...params, mode: "cache_hit", units: 0, requestType: params.requestType ?? "cache:hit" });
  }

  static async cacheHit(params: Omit<ReserveParams, "mode" | "units">): Promise<AllowanceReserveResult> {
    return this.recordCacheHit(params);
  }

  static async getSummary(
    userId: string,
    now = new Date(),
    accessTier: AllowanceAccessTier = "standard",
  ): Promise<AllowanceSummary | null> {
    if (!allowanceEnabled()) return null;
    const role = effectiveRole(await activeRoles(db, userId));
    if (!role) return null;
    const appDay = jakartaDay(now);
    const usage = await usageFor(db, userId, appDay, new Date(now.getTime() - 60_000), accessTier);
    const [cacheRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiAllowanceLeases)
      .where(and(
        eq(aiAllowanceLeases.userId, userId),
        eq(aiAllowanceLeases.appDay, appDay),
        eq(aiAllowanceLeases.status, "committed"),
        eq(aiAllowanceLeases.units, 0),
        accessTierCondition(accessTier),
      ));
    const remaining = remainingFromUsage(role, usage, accessTier);
    return {
      userId,
      peran: role,
      appDay,
      providerTurnsUsed: usage.provider,
      providerTurnsRemaining: remaining.providerTurns,
      totalInteractionsUsed: usage.total,
      totalInteractionsRemaining: remaining.totalInteractions,
      premiumTurnsUsed: usage.premium,
      premiumTurnsRemaining: remaining.premiumTurns,
      cacheSaves: toNumber(cacheRow?.count),
      nextResetAt: nextJakartaReset(now).toISOString(),
      accessTier,
    };
  }

  static async currentUserSummary(
    userId: string,
    now = new Date(),
    accessTier: AllowanceAccessTier = "standard",
  ): Promise<AllowanceSummary | null> {
    return this.getSummary(userId, now, accessTier);
  }

  static async reconcileCompatibilityEvents(): Promise<{ committedLeases: number; missingEvents: number; repaired: number }> {
    const leases = await db
      .select({ id: aiAllowanceLeases.id })
      .from(aiAllowanceLeases)
      .where(eq(aiAllowanceLeases.status, "committed"));
    let missingEvents = 0;
    let repaired = 0;
    for (const lease of leases) {
      const [event] = await db.select({ id: aiUsageEvents.id }).from(aiUsageEvents).where(eq(aiUsageEvents.id, lease.id)).limit(1);
      if (!event) {
        missingEvents += 1;
        await writeCompatibilityEvent(lease.id);
        const [repairedEvent] = await db.select({ id: aiUsageEvents.id }).from(aiUsageEvents).where(eq(aiUsageEvents.id, lease.id)).limit(1);
        if (repairedEvent) repaired += 1;
      }
    }
    return { committedLeases: leases.length, missingEvents, repaired };
  }

  // Legacy compatibility methods remain available while the feature flag is off.
  static async getDailyUsageCount(userId: string): Promise<number> {
    const start = startOfJakartaDayUtc();
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, start), ne(aiUsageEvents.requestType, "cache:hit")));
    return toNumber(result[0]?.count);
  }

  static async canUseFeature(userId: string, limit = 30): Promise<boolean> {
    if (process.env.MOCK_GEMINI === "true") return true;
    return (await this.getDailyUsageCount(userId)) < limit;
  }

  static async recordUsage(params: {
    userId: string;
    feature: string;
    model: string;
    tokens: number;
    inputTokens?: number;
    outputTokens?: number;
    requestType: string;
  }): Promise<void> {
    if (process.env.MOCK_GEMINI === "true") return;
    try {
      await db.insert(aiUsageEvents).values({
        id: randomUUID(),
        userId: params.userId,
        feature: params.feature,
        model: params.model,
        tokens: params.tokens,
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        requestType: params.requestType,
      });
    } catch {
      console.warn("[UsageBudget] legacy compatibility event write pending");
    }
  }

  static async getPremiumCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), eq(aiUsageEvents.requestType, "premium:tutor"), gte(aiUsageEvents.createdAt, startOfJakartaDayUtc())));
    return toNumber(result[0]?.count);
  }

  static async getRemainingPremium(userId: string): Promise<number> {
    return Math.max(0, 5 - (await this.getPremiumCount(userId)));
  }

  static async recordPremiumUsage(userId: string): Promise<void> {
    if (allowanceEnabled()) return;
    await db.insert(aiUsageEvents).values({
      id: randomUUID(),
      userId,
      feature: "tutor",
      model: "premium:tutor",
      tokens: 0,
      requestType: "premium:tutor",
    });
  }

  static async pruneOldEvents(): Promise<void> {
    await db.delete(aiUsageEvents).where(lt(aiUsageEvents.createdAt, daysAgo(30)));
  }
}

export { allowanceEnabled as isZyraAllowanceEnabled, effectiveRole as resolveAllowanceRole };
