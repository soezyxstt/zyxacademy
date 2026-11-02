import { describe, expect, it } from "bun:test";
import { evaluateAllowance, ZYRA_ALLOWANCE_POLICY } from "@/lib/usage-budget-service";

describe("Plan 004 allowance terminal semantics", () => {
  it("keeps allowance evaluation independent from provider terminal handling", () => {
    const policy = ZYRA_ALLOWANCE_POLICY.murid;
    const decision = evaluateAllowance("murid", { provider: policy.providerPerDay - 1, total: policy.totalInteractions - 1, premium: 1, minute: policy.perMinute - 1 }, { units: 1, premium: false });
    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.remaining.providerTurns).toBe(0);
      expect(decision.remaining.totalInteractions).toBe(0);
    }
  });

  it("does not spend provider turns for a deterministic action", () => {
    const decision = evaluateAllowance("tutor", { provider: 50, total: 149, premium: 5, minute: 11 }, { units: 0, premium: false });
    expect(decision.accepted).toBe(true);
    if (decision.accepted) expect(decision.remaining.providerTurns).toBe(0);
  });
});
