import { describe, expect, test } from "bun:test";
import { QuotaLedger } from "../src/quota/ledger";
import { ensureQuotaSchema } from "../src/quota/schema";
import { BunSqliteHarness } from "./sqlite-harness";

function reserveInput(idempotencyKey: string) {
  return {
    idempotencyKey,
    userHash: "a".repeat(64),
    role: "murid" as const,
    feature: "quota-test",
    routeClass: "stable-fallback" as const,
    modelId: "gemini-2.5-flash" as const,
    cacheStatus: "miss" as const
  };
}

describe("Plan 003 lease transitions", () => {
  test("reserves, dispatches, commits, and idempotently replays a terminal lease", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00.000Z"));

    const reserved = ledger.reserve(reserveInput("state-1"));
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    expect(ledger.dispatch(reserved.lease.leaseId).status).toBe("updated");
    const committed = ledger.commit({
      leaseId: reserved.lease.leaseId,
      providerAttemptId: "provider-attempt-1",
      outcomeCode: "SUCCESS",
      outcomeClass: "success",
      latencyMs: 42
    });
    expect(committed.status).toBe("updated");
    expect(ledger.commit({
      leaseId: reserved.lease.leaseId,
      providerAttemptId: "provider-attempt-1",
      outcomeCode: "SUCCESS",
      outcomeClass: "success",
      latencyMs: 42
    }).status).toBe("idempotent");
    expect(ledger.reserve(reserveInput("state-1")).status).toBe("idempotent");
    expect(ledger.diagnostics().terminalLeaseCount).toBe(1);
    harness.close();
  });

  test("refunds only before dispatch and expires dispatched leases conservatively", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    let now = Date.parse("2026-08-05T12:00:00.000Z");
    const ledger = new QuotaLedger(harness, () => now);

    const refundable = ledger.reserve(reserveInput("refund-1"));
    expect(refundable.status).toBe("reserved");
    if (refundable.status !== "reserved") return;
    expect(ledger.refund(refundable.lease.leaseId).status).toBe("updated");
    expect(ledger.refund(refundable.lease.leaseId).status).toBe("idempotent");

    const dispatched = ledger.reserve(reserveInput("expire-1"));
    expect(dispatched.status).toBe("reserved");
    if (dispatched.status !== "reserved") return;
    ledger.dispatch(dispatched.lease.leaseId);
    now += 31_000;
    expect(ledger.expire()).toBe(1);
    const counters = ledger.diagnostics().counters.filter((counter) => counter.modelId === "gemini-2.5-flash");
    expect(counters.reduce((total, counter) => total + counter.committedCount, 0)).toBe(1);
    expect(ledger.commit({
      leaseId: dispatched.lease.leaseId,
      outcomeCode: "LATE",
      outcomeClass: "success"
    }).status).toBe("idempotent");
    harness.close();
  });

  test("premium exhaustion is fallback-allowed without consuming a premium counter", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00.000Z"));
    const input = {
      ...reserveInput("premium-1"),
      modelId: "gemini-3.5-flash" as const,
      routeClass: "premium-pedagogy" as const
    };
    const first = ledger.reserve(input);
    expect(first.status).toBe("reserved");
    if (first.status !== "reserved") return;
    ledger.dispatch(first.lease.leaseId);
    ledger.commit({ leaseId: first.lease.leaseId, outcomeCode: "SUCCESS", outcomeClass: "success" });
    for (let index = 0; index < 63; index += 1) {
      const result = ledger.reserve({ ...input, idempotencyKey: `premium-${index + 2}` });
      if (result.status === "reserved") {
        ledger.dispatch(result.lease.leaseId);
        ledger.commit({ leaseId: result.lease.leaseId, outcomeCode: "SUCCESS", outcomeClass: "success" });
      }
    }
    const exhausted = ledger.reserve({ ...input, idempotencyKey: "premium-exhausted" });
    expect(exhausted.status).toBe("fallback_allowed");
    expect(ledger.diagnostics().counters.filter((counter) => counter.modelId === "gemini-3.5-flash").every((counter) => counter.committedCount <= 16)).toBe(true);
    harness.close();
  });
});
