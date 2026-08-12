import { describe, expect, test } from "bun:test";
import { ZyraAllowanceSummarySchema } from "@/lib/zyra/murid";

describe("Zyra allowance UI contract", () => {
  test("accepts exact personal allowance fields", () => {
    const result = ZyraAllowanceSummarySchema.safeParse({
      peran: "murid",
      appDay: "2026-08-12",
      providerTurnsUsed: 2,
      providerTurnsRemaining: 8,
      totalInteractionsUsed: 3,
      totalInteractionsRemaining: 27,
      premiumTurnsUsed: 0,
      premiumTurnsRemaining: 5,
      cacheSaves: 1,
      nextResetAt: "2026-08-13T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
  test("rejects global capacity claims", () => {
    const result = ZyraAllowanceSummarySchema.safeParse({ providerRemaining: 999 });
    expect(result.success).toBe(false);
  });
});
