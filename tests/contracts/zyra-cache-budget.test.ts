import { describe, expect, it } from "bun:test";
import { DailyCacheWriteBudget, ZYRA_CACHE_DAILY_WRITE_LIMIT } from "@/lib/ai/cache/write-budget";

describe("Plan 006 KV write budget", () => {
  it("accepts at most 900 one-write entries and keeps reads available by rejecting writes", () => {
    const budget = new DailyCacheWriteBudget();
    for (let index = 0; index < ZYRA_CACHE_DAILY_WRITE_LIMIT; index += 1) {
      expect(budget.claim("2026-08-07").accepted).toBe(true);
    }
    expect(budget.claim("2026-08-07").accepted).toBe(false);
    expect(budget.count("2026-08-07")).toBe(900);
  });
});
