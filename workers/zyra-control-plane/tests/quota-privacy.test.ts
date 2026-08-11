import { describe, expect, test } from "bun:test";
import { isSafeTelemetryValue, QuotaLedger } from "../src/quota/ledger";
import { ensureQuotaSchema } from "../src/quota/schema";
import { BunSqliteHarness } from "./sqlite-harness";

describe("Plan 003 privacy boundary", () => {
  test("stores only the hash and bounded telemetry dimensions", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00.000Z"));
    const rawUser = "student@example.test";
    const result = ledger.reserve({
      idempotencyKey: "privacy-1",
      userHash: "b".repeat(64),
      role: "murid",
      feature: "privacy-test",
      routeClass: "stable-fallback",
      modelId: "gemini-2.5-flash",
      cacheStatus: "miss"
    });
    expect(result.status).toBe("reserved");
    if (result.status !== "reserved") return;
    ledger.dispatch(result.lease.leaseId);
    ledger.commit({ leaseId: result.lease.leaseId, outcomeCode: "SUCCESS", outcomeClass: "success" });

    const schema = harness.database.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const schemaText = schema.map((row) => row.name).join(" ");
    expect(schemaText).not.toContain("prompt");
    expect(schemaText).not.toContain("answer");
    expect(schemaText).not.toContain("api_key");
    const stored = harness.database.query<{ user_hash: string }, []>("SELECT user_hash FROM zyra_quota_leases").all();
    expect(stored[0]?.user_hash).not.toBe(rawUser);
    expect(isSafeTelemetryValue("student@example.test")).toBe(false);
    expect(isSafeTelemetryValue("gemini-project-1")).toBe(true);
    harness.close();
  });

  test("does not permit raw email-like feature dimensions", () => {
    expect(isSafeTelemetryValue("person@example.test")).toBe(false);
    expect(isSafeTelemetryValue("tutor-turns")).toBe(true);
  });
});
