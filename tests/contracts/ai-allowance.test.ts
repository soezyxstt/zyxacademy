import { describe, expect, it } from "bun:test";
import {
  ZYRA_ALLOWANCE_POLICY,
  evaluateAllowance,
  UsageBudgetService,
} from "@/lib/usage-budget-service";
import { jakartaDay, nextJakartaReset, startOfJakartaDayUtc } from "@/lib/date-utils";
import { promptExecutorOwnsAllowance } from "@/lib/prompt-executor";

describe("Plan 004 allowance policy", () => {
  it("keeps the approved role limits and always-on allowance protection", () => {
    expect(ZYRA_ALLOWANCE_POLICY.murid).toEqual({ providerPerDay: 15, totalInteractions: 45, perMinute: 8, premiumPerDay: 15 });
    expect(ZYRA_ALLOWANCE_POLICY.tutor).toEqual({ providerPerDay: 50, totalInteractions: 150, perMinute: 12, premiumPerDay: 50 });
    expect(ZYRA_ALLOWANCE_POLICY.admin.providerPerDay).toBeNull();
    expect(UsageBudgetService.isAllowanceEnabled()).toBe(true);
  });

  it("counts cache interactions without spending provider turns", () => {
    const decision = evaluateAllowance("murid", { provider: 14, total: 43, premium: 1, minute: 7 }, { units: 0, premium: false });
    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.remaining.providerTurns).toBe(1);
      expect(decision.remaining.totalInteractions).toBe(1);
    }
  });

  it("keeps one allowance owner when Provider Router V2 is active", () => {
    expect(promptExecutorOwnsAllowance(true, true)).toBe(false);
    expect(promptExecutorOwnsAllowance(true, false)).toBe(true);
    expect(promptExecutorOwnsAllowance(false, true)).toBe(false);
  });

  it("uses the Jakarta day boundary independently from UTC", () => {
    const beforeMidnightUtc = new Date("2026-08-07T16:59:59.000Z");
    const afterMidnightUtc = new Date("2026-08-07T17:00:01.000Z");
    expect(jakartaDay(beforeMidnightUtc)).toBe("2026-08-07");
    expect(jakartaDay(afterMidnightUtc)).toBe("2026-08-08");
    expect(nextJakartaReset(beforeMidnightUtc).getTime()).toBe(startOfJakartaDayUtc(afterMidnightUtc).getTime());
  });
});
