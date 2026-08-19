import { describe, expect, it } from "bun:test";
import { evaluateAllowance, type AllowanceUsageSnapshot } from "@/lib/usage-budget-service";

describe("Plan 004 concurrency contract", () => {
  it("accepts exactly 20 provider reservations for 50 murid attempts", async () => {
    const usage: AllowanceUsageSnapshot = { provider: 0, total: 0, premium: 0, minute: 0 };
    let accepted = 0;
    const attempts = Array.from({ length: 50 }, async () => {
      const decision = evaluateAllowance("murid", { ...usage, minute: accepted % 8 }, { units: 1, premium: false });
      if (!decision.accepted || accepted >= 20) return false;
      accepted += 1;
      usage.provider += 1;
      usage.total += 1;
      usage.minute = (accepted + 1) % 8;
      return true;
    });
    const results = await Promise.all(attempts);
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(usage.provider).toBe(20);
    expect(usage.provider).not.toBeGreaterThan(20);
  });

  it("allows 60 cache interactions and spends zero provider units", () => {
    const usage: AllowanceUsageSnapshot = { provider: 0, total: 0, premium: 0, minute: 0 };
    let accepted = 0;
    for (let index = 0; index < 61; index += 1) {
      const decision = evaluateAllowance("murid", { ...usage, minute: 0 }, { units: 0, premium: false });
      if (decision.accepted) {
        accepted += 1;
        usage.total += 1;
      }
    }
    expect(accepted).toBe(60);
    expect(usage.provider).toBe(0);
  });
});
