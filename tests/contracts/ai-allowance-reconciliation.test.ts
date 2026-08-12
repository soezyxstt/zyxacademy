import { describe, expect, it } from "bun:test";
import { evaluateAllowance } from "@/lib/usage-budget-service";

describe("Plan 004 allowance terminal semantics", () => {
  it("keeps allowance evaluation independent from provider terminal handling", () => {
    const decision = evaluateAllowance("murid", { provider: 19, total: 59, premium: 1, minute: 7 }, { units: 1, premium: false });
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
