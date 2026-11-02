import { describe, expect, it } from "bun:test";
import { evaluateAllowance, ZYRA_ALLOWANCE_POLICY, type AllowanceUsageSnapshot } from "@/lib/usage-budget-service";

describe("Plan 004 concurrency contract", () => {
  it("accepts exactly the murid provider allowance across repeated evaluations", async () => {
    const usage: AllowanceUsageSnapshot = { provider: 0, total: 0, premium: 0, minute: 0 };
    let accepted = 0;
    const attempts = Array.from({ length: 50 }, async () => {
      const decision = evaluateAllowance("murid", { ...usage, minute: accepted % 8 }, { units: 1, premium: false });
      if (!decision.accepted) return false;
      accepted += 1;
      usage.provider += 1;
      usage.total += 1;
      usage.minute = (accepted + 1) % 8;
      return true;
    });
    const results = await Promise.all(attempts);
    expect(results.filter(Boolean)).toHaveLength(ZYRA_ALLOWANCE_POLICY.murid.providerPerDay);
    expect(usage.provider).toBe(ZYRA_ALLOWANCE_POLICY.murid.providerPerDay);
  });

  it("allows the murid interaction allowance without spending provider units", () => {
    const usage: AllowanceUsageSnapshot = { provider: 0, total: 0, premium: 0, minute: 0 };
    let accepted = 0;
    for (let index = 0; index <= ZYRA_ALLOWANCE_POLICY.murid.totalInteractions; index += 1) {
      const decision = evaluateAllowance("murid", { ...usage, minute: 0 }, { units: 0, premium: false });
      if (decision.accepted) {
        accepted += 1;
        usage.total += 1;
      }
    }
    expect(accepted).toBe(ZYRA_ALLOWANCE_POLICY.murid.totalInteractions);
    expect(usage.provider).toBe(0);
  });
});
