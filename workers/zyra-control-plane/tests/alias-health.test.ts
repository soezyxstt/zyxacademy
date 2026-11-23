import { expect, test } from "bun:test";
import { ALIAS_COOLDOWN_MS, FAILURE_WINDOW_MS, GatewayAliasLedger } from "../src/quota/alias-health";
import { BunSqliteHarness } from "./sqlite-harness";

test("three consecutive failures persist for five minutes and success resets the counter", () => {
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

test("existing day-long cooldowns expire five minutes after the original failure", () => {
  const sql = new BunSqliteHarness();
  const alias = "d".repeat(64);
  const start = 1000;
  let now = start + 299_999;
  sql.exec("CREATE TABLE gateway_alias_health (alias_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL, cooldown_until INTEGER NOT NULL)");
  sql.exec("INSERT INTO gateway_alias_health VALUES (?, 3, ?)", alias, start + 86_400_000);
  const ledger = new GatewayAliasLedger(sql, () => now);
  expect(ledger.status(alias).cooldownUntil).toBe(start + 300_000);
  now++;
  expect(ledger.record(alias, "recovered", true)).toEqual({ failures: 0, cooldownUntil: 0 });
  sql.close();
});

test("sporadic failures decay after the failure window and manual reset clears cooldowns immediately", () => {
  const sql = new BunSqliteHarness();
  let now = 5_000;
  const ledger = new GatewayAliasLedger(sql, () => now);
  const aliasA = "e".repeat(64);
  const aliasB = "f".repeat(64);

  expect(ledger.record(aliasA, "err-1", false)).toEqual({ failures: 1, cooldownUntil: 0 });
  expect(ledger.record(aliasA, "err-2", false)).toEqual({ failures: 2, cooldownUntil: 0 });
  now += FAILURE_WINDOW_MS + 1;
  expect(ledger.status(aliasA)).toEqual({ failures: 0, cooldownUntil: 0 });
  expect(ledger.record(aliasA, "err-3-after-window", false)).toEqual({ failures: 1, cooldownUntil: 0 });

  for (let i = 0; i < 3; i++) {
    ledger.record(aliasA, `a-fail-${i}`, false);
    ledger.record(aliasB, `b-fail-${i}`, false);
  }
  expect(ledger.status(aliasA).cooldownUntil).toBeGreaterThan(now);
  expect(ledger.status(aliasB).cooldownUntil).toBeGreaterThan(now);

  expect(ledger.reset(aliasA)).toEqual({ cleared: 1 });
  expect(ledger.status(aliasA)).toEqual({ failures: 0, cooldownUntil: 0 });
  expect(ledger.status(aliasB).cooldownUntil).toBeGreaterThan(now);

  expect(ledger.reset()).toEqual({ cleared: 1 });
  expect(ledger.status(aliasB)).toEqual({ failures: 0, cooldownUntil: 0 });
  sql.close();
});
