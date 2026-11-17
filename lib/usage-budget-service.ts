import { affectedRows } from "@/lib/mutation-result";
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiAllowanceLeases,
  aiUsageEvents,
  gamificationAccounts,
  gamificationDailyRankSnapshots,
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
import { getDailyRankSnapshot } from "@/lib/gamification/allowance";
import { normalizePeranCodes, type PeranCode } from "@/lib/auth/peran";
import { evaluateAllowance, remainingFromUsage, type AllowanceAccessTier, type AllowanceRemaining } from "@/lib/usage-budget-policy";
export { evaluateAllowance, ZYRA_ALLOWANCE_POLICY, ZYRA_FREE_ALLOWANCE_POLICY } from "@/lib/usage-budget-policy";
export type { AllowanceAccessTier, AllowanceRemaining, AllowanceUsageSnapshot, AllowanceDecision } from "@/lib/usage-budget-policy";

type QueryExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

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

/** First eligible standard read fixes the rank for the Jakarta day. */
async function dailyRank(executor: QueryExecutor, userId: string, appDay: string, now: Date, role: PeranCode, tier: AllowanceAccessTier): Promise<string | null> {
  if (role !== "murid" || tier !== "standard") return null;
  const snapshot = gamificationDailyRankSnapshots;
  const condition = and(eq(snapshot.userId, userId), eq(snapshot.dayKey, appDay));
  return getDailyRankSnapshot(
    async () => {
      const [row] = await executor.select({ rankKey: snapshot.rankKey }).from(snapshot).where(condition).limit(1);
      return row?.rankKey ?? null;
    },
    async () => {
      // The rank subquery and insertion are one statement; the primary key
      // selects the winner when first reads race.
      await executor.insert(snapshot).values({
        userId, dayKey: appDay, capturedAt: now,
        rankKey: sql`coalesce((select ${gamificationAccounts.rankKey} from ${gamificationAccounts} where ${gamificationAccounts.userId} = ${userId}), 'rakyat')`,
      }).onConflictDoNothing();
    },
  );
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
      premium: sql<number>`coalesce(sum(case when ${aiAllowanceLeases.premium} = true then ${aiAllowanceLeases.units} else 0 end), 0)`,
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
  metadata?: { model?: string; inputTokens?: number; outputTokens?: number; requestType?: string },
): Promise<LeaseTransitionResult | null> {
  const [updated] = await db
    .update(aiAllowanceLeases)
    .set(nextStatus === "dispatched"
      ? { status: nextStatus, dispatchedAt: now }
      : { ...metadata, status: nextStatus, resolvedAt: now })
    .where(and(
      eq(aiAllowanceLeases.id, leaseId),
      nextStatus === "dispatched"
        ? eq(aiAllowanceLeases.status, "reserved")
        : inArray(aiAllowanceLeases.status, ["reserved", "dispatched"]),
    ))
    .returning({ status: aiAllowanceLeases.status });

  if (updated) {
    if (nextStatus === "committed") await writeCompatibilityEvent(leaseId);
    return { leaseId, status: updated.status, changed: true };
  }
  const existing = await readLease(leaseId);
  return existing ? { leaseId, status: existing.status, changed: false } : null;
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
    try {
      const result = await db.transaction(async (tx) => {
        // Serialize each user's count and insert, including concurrent idempotent replays.
        await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, params.userId)).for("update");
        const executor = tx as unknown as QueryExecutor;
        const currentRoles = effectiveRole(await activeRoles(executor, params.userId));
        if (!currentRoles) return { accepted: false, reason: "NO_ACTIVE_ROLE" } as const;

        const rankKey = await dailyRank(executor, params.userId, appDay, now, currentRoles, accessTier);
        const [existing] = await executor.select(leaseColumns).from(aiAllowanceLeases)
          .where(eq(aiAllowanceLeases.idempotencyKey, params.idempotencyKey)).limit(1);
        if (existing) {
          const lease = leaseFromRow(existing);
          if (existing.userId !== params.userId || lease.appDay !== appDay || lease.feature !== params.feature
            || lease.accessTier !== accessTier || lease.status === "refunded") {
            return { accepted: false, reason: "IDEMPOTENCY_CONFLICT" } as const;
          }
          const usage = await usageFor(executor, params.userId, appDay, new Date(now.getTime() - 60_000), accessTier);
          return { accepted: true, idempotent: true, lease, remaining: remainingFromUsage(currentRoles, usage, accessTier, rankKey) } as const;
        }

        await expireReservations(executor, params.userId, now);

        const usage = await usageFor(executor, params.userId, appDay, new Date(now.getTime() - 60_000), accessTier);
        const interactionUnits = mode === "provider" ? units : 1;
        const decision = evaluateAllowance(currentRoles, usage, {
          units,
          interactionUnits,
          premium: Boolean(params.premium),
          accessTier,
          rankKey,
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
        try {
          const rankKey = await dailyRank(db, params.userId, appDay, now, role, accessTier);
          return { accepted: true, idempotent: true, lease, remaining: remainingFromUsage(role, usage, accessTier, rankKey) };
        } catch { return { accepted: false, reason: "PERSISTENCE_FAILURE" }; }
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
    return transitionLease(leaseId, "committed", now, metadata);
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
    return affectedRows(result) > 0;
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
    const rankKey = await dailyRank(db, userId, appDay, now, role, accessTier);
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
    const remaining = remainingFromUsage(role, usage, accessTier, rankKey);
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
