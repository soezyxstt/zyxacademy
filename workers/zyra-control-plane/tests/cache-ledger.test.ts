import { describe, expect, it } from "bun:test";
import { CacheFlightLedger } from "../src/cache/ledger";
import { ensureCacheSchema } from "../src/cache/schema";
import { BunSqliteHarness } from "./sqlite-harness";

describe("Plan 006 Durable Object cache ledger", () => {
  it("elects one leader, exposes followers, and completes a result", () => {
    const sql = new BunSqliteHarness();
    ensureCacheSchema(sql);
    const ledger = new CacheFlightLedger(sql);
    const key = `zyra:exact:v1:${"a".repeat(64)}`;
    const leader = ledger.acquire(key, "leader-1", 1000);
    const follower = ledger.acquire(key, "follower-1", 1001);
    expect(leader.status).toBe("leader");
    expect(follower.status).toBe("follower");
    if (leader.status === "leader") {
      expect(ledger.complete(key, leader.flightId, "zyra:entry:v1:entry-1", 1002)).toBe(true);
    }
    expect(ledger.status(key, 1003)).toMatchObject({ status: "completed", resultKey: "zyra:entry:v1:entry-1" });
    sql.close();
  });

  it("releases a failed flight and caps one-write claims at 900", () => {
    const sql = new BunSqliteHarness();
    ensureCacheSchema(sql);
    const ledger = new CacheFlightLedger(sql);
    const key = `zyra:exact:v1:${"b".repeat(64)}`;
    const leader = ledger.acquire(key, "leader-1", 1000);
    if (leader.status === "leader") expect(ledger.fail(key, leader.flightId)).toBe(true);
    expect(ledger.acquire(key, "leader-2", 1001).status).toBe("leader");
    for (let index = 0; index < 899; index += 1) expect(ledger.claimWrite("2026-08-07").accepted).toBe(true);
    expect(ledger.claimWrite("2026-08-07")).toMatchObject({ accepted: true, claimed: 900, remaining: 0 });
    expect(ledger.claimWrite("2026-08-07").accepted).toBe(false);
    sql.close();
  });
});
