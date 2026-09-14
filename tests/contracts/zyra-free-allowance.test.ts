import { describe, expect, it } from "bun:test";
import {
  FREE_ALLOWANCE_IDEMPOTENCY_PREFIX,
  ZYRA_FREE_ALLOWANCE_POLICY,
  evaluateAllowance,
} from "@/lib/usage-budget-service";

describe("Zyra Free allowance", () => {
  it("allows one provider question per Jakarta day", () => {
    expect(ZYRA_FREE_ALLOWANCE_POLICY).toEqual({
      providerPerDay: 1,
      totalInteractions: 1,
      perMinute: 1,
      premiumPerDay: 0,
    });

    const first = evaluateAllowance(
      "murid",
      { provider: 0, total: 0, premium: 0, minute: 0 },
      { units: 1, premium: false, accessTier: "free" },
    );
    expect(first.accepted).toBe(true);

    const next = evaluateAllowance(
      "murid",
      { provider: 1, total: 1, premium: 0, minute: 0 },
      { units: 1, premium: false, accessTier: "free" },
    );
    expect(next).toMatchObject({ accepted: false, reason: "TOTAL_INTERACTION_LIMIT" });
  });

  it("counts a cache response as the same one daily interaction without provider spend", () => {
    const cacheHit = evaluateAllowance(
      "murid",
      { provider: 0, total: 0, premium: 0, minute: 0 },
      { units: 0, interactionUnits: 1, premium: false, accessTier: "free" },
    );
    expect(cacheHit.accepted).toBe(true);
    if (cacheHit.accepted) {
      expect(cacheHit.remaining.providerTurns).toBe(1);
      expect(cacheHit.remaining.totalInteractions).toBe(0);
    }

    const secondQuestion = evaluateAllowance(
      "murid",
      { provider: 0, total: 1, premium: 0, minute: 0 },
      { units: 1, premium: false, accessTier: "free" },
    );
    expect(secondQuestion).toMatchObject({ accepted: false, reason: "TOTAL_INTERACTION_LIMIT" });
  });

  it("rejects premium turns and keeps the Free idempotency namespace explicit", () => {
    const premium = evaluateAllowance(
      "murid",
      { provider: 0, total: 0, premium: 0, minute: 0 },
      { units: 1, premium: true, accessTier: "free" },
    );
    expect(premium).toMatchObject({ accepted: false, reason: "PREMIUM_LIMIT" });
    expect(FREE_ALLOWANCE_IDEMPOTENCY_PREFIX).toBe("zyra-free:");
  });
});
