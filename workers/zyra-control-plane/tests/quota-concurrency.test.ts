import { describe, expect, test } from "bun:test";
import { QuotaLedger } from "../src/quota/ledger";
import { ensureQuotaSchema } from "../src/quota/schema";
import { BunSqliteHarness } from "./sqlite-harness";

describe("Plan 003 atomic quota selection", () => {
  test("100 reservations never exceed the four project ceilings", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00.000Z"));
    const results = Array.from({ length: 100 }, (_, index) => ledger.reserve({
      idempotencyKey: `concurrent-${index}`,
      userHash: `${index.toString(16).padStart(2, "0")}`.repeat(32),
      role: "murid",
      feature: "concurrency-test",
      routeClass: "stable-fallback",
      modelId: "gemini-2.5-flash",
      cacheStatus: "miss"
    }));

    const accepted = results.filter((result) => result.status === "reserved");
    expect(accepted).toHaveLength(60);
    for (const result of accepted) {
      if (result.status === "reserved") {
        ledger.dispatch(result.lease.leaseId);
        ledger.commit({ leaseId: result.lease.leaseId, outcomeCode: "SUCCESS", outcomeClass: "success" });
      }
    }
    const counters = ledger.diagnostics().counters.filter((counter) => counter.modelId === "gemini-2.5-flash");
    const committed = counters.map((counter) => counter.committedCount);
    expect(committed).toEqual([15, 15, 15, 15]);
    expect(Math.max(...committed) - Math.min(...committed)).toBeLessThanOrEqual(3);
    harness.close();
  });
});
