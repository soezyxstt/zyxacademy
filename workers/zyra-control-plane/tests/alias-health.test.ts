import { expect, test } from "bun:test";
import { ALIAS_COOLDOWN_MS, GatewayAliasLedger } from "../src/quota/alias-health";
import { BunSqliteHarness } from "./sqlite-harness";

test("three consecutive failures persist for 24 hours and success resets the counter", () => {
  const sql = new BunSqliteHarness();
  let now = 1000;
  const ledger = new GatewayAliasLedger(sql, () => now), alias = "a".repeat(64), other = "b".repeat(64);
  expect(ledger.record(alias, "one", false).failures).toBe(1);
  expect(ledger.record(alias, "two", false).failures).toBe(2);
  expect(ledger.record(alias, "ok", true)).toEqual({ failures: 0, cooldownUntil: 0 });
  for (let index = 0; index < 3; index++) ledger.record(alias, `failed-${index}`, false);
  expect(ledger.status(alias)).toEqual({ failures: 3, cooldownUntil: now + ALIAS_COOLDOWN_MS });
  expect(new GatewayAliasLedger(sql, () => now).status(alias)).toEqual(ledger.status(alias));
  expect(ledger.status(other).cooldownUntil).toBe(0);
  expect(ledger.record(alias, "late-success", true).cooldownUntil).toBe(now + ALIAS_COOLDOWN_MS);
  now += ALIAS_COOLDOWN_MS;
  expect(ledger.status(alias)).toEqual({ failures: 0, cooldownUntil: 0 });
  expect(ledger.record(alias, "after-expiry", false)).toEqual({ failures: 1, cooldownUntil: 0 });
  sql.close();
});

test("duplicate receipts do not advance an alias failure counter", () => {
  const sql = new BunSqliteHarness(), ledger = new GatewayAliasLedger(sql), alias = "c".repeat(64);
  for (let index = 0; index < 20; index++) ledger.record(alias, "same-attempt", false);
  expect(ledger.status(alias).failures).toBe(1);
  expect(() => ledger.status("raw-secret")).toThrow();
  sql.close();
});
