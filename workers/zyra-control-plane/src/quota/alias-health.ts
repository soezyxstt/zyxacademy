import type { SqlExecutor } from "./schema";

export const ALIAS_COOLDOWN_MS = 24 * 60 * 60_000;
export type AliasHealth = { failures: number; cooldownUntil: number };

export class GatewayAliasLedger {
  constructor(private readonly sql: SqlExecutor, private readonly now: () => number = Date.now) {
    sql.exec("CREATE TABLE IF NOT EXISTS gateway_alias_health (alias_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL, cooldown_until INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS gateway_alias_attempts (attempt_id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL)");
  }

  status(id: string): AliasHealth {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid alias identity");
    const row = this.sql.exec<{ failures: number; cooldown_until: number }>("SELECT failures, cooldown_until FROM gateway_alias_health WHERE alias_hash = ?", id).toArray()[0];
    if (!row || (row.cooldown_until > 0 && row.cooldown_until <= this.now())) return { failures: 0, cooldownUntil: 0 };
    return { failures: row.failures, cooldownUntil: row.cooldown_until };
  }

  record(id: string, attemptId: string, success: boolean): AliasHealth {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(attemptId)) throw new Error("Invalid alias attempt");
    const before = this.status(id);
    if (this.sql.exec("SELECT attempt_id FROM gateway_alias_attempts WHERE attempt_id = ?", attemptId).toArray().length) return before;
    const now = this.now();
    this.sql.exec("DELETE FROM gateway_alias_attempts WHERE occurred_at < ?", now - 2 * ALIAS_COOLDOWN_MS);
    this.sql.exec("INSERT INTO gateway_alias_attempts (attempt_id, occurred_at) VALUES (?, ?)", attemptId, now);
    if (before.cooldownUntil > now) return before;
    const failures = success ? 0 : before.failures + 1;
    const state = { failures, cooldownUntil: failures >= 3 ? now + ALIAS_COOLDOWN_MS : 0 };
    this.sql.exec("INSERT INTO gateway_alias_health (alias_hash, failures, cooldown_until) VALUES (?, ?, ?) ON CONFLICT(alias_hash) DO UPDATE SET failures = excluded.failures, cooldown_until = excluded.cooldown_until", id, state.failures, state.cooldownUntil);
    return state;
  }
}
