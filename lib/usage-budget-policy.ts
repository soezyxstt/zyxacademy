import { rankProviderTurnLimit } from "@/lib/gamification/allowance";
import type { PeranCode } from "@/lib/auth/peran";

export const ZYRA_ALLOWANCE_POLICY = {
  murid: { providerPerDay: 15, totalInteractions: 45, perMinute: 8, premiumPerDay: 15 },
  tutor: { providerPerDay: 50, totalInteractions: 150, perMinute: 12, premiumPerDay: 50 },
  admin: { providerPerDay: null, totalInteractions: 300, perMinute: 20, premiumPerDay: null },
} as const;

/**
 * The authenticated Free lane is deliberately separate from the enrolled
 * allowance. This keeps the existing murid allowance unchanged while making
 * the 5-questions-per-Jakarta-day promise atomic across every Free course.
 */
export const ZYRA_FREE_ALLOWANCE_POLICY = {
  providerPerDay: 5,
  totalInteractions: 5,
  perMinute: 5,
  premiumPerDay: 0,
} as const;

export type AllowanceAccessTier = "free" | "standard";
export type AllowanceRemaining = {
  providerTurns: number | null;
  totalInteractions: number;
  premiumTurns: number | null;
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

type AllowancePolicy = {
  providerPerDay: number | null;
  totalInteractions: number;
  perMinute: number;
  premiumPerDay: number | null;
};

function policyFor(role: PeranCode, accessTier: AllowanceAccessTier, rankKey: string | null = null): AllowancePolicy {
  const base = accessTier === "free" ? ZYRA_FREE_ALLOWANCE_POLICY : ZYRA_ALLOWANCE_POLICY[role];
  if (role !== "murid" || accessTier !== "standard" || !rankKey) return base;
  const providerPerDay = rankProviderTurnLimit(base.providerPerDay!, rankKey);
  // Premium is the same published provider ceiling, not a separate hard cap.
  return { ...base, providerPerDay, premiumPerDay: providerPerDay };
}

export function remainingFromUsage(
  role: PeranCode,
  usage: { provider: number; total: number; premium: number },
  accessTier: AllowanceAccessTier = "standard",
  rankKey: string | null = null,
): AllowanceRemaining {
  const policy = policyFor(role, accessTier, rankKey);
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
  request: { units: number; premium: boolean; interactionUnits?: number; accessTier?: AllowanceAccessTier; rankKey?: string | null },
): AllowanceDecision {
  const accessTier = request.accessTier ?? "standard";
  const policy = policyFor(role, accessTier, request.rankKey);
  const interactionUnits = request.interactionUnits ?? (request.units > 0 ? request.units : 1);
  const remaining = remainingFromUsage(role, usage, accessTier, request.rankKey);
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
    }, accessTier, request.rankKey),
  };
}
