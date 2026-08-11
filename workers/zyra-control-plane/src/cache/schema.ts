import type { SqlExecutor } from "../quota/schema";

export const CACHE_SCHEMA_VERSION = "plan-006-v1" as const;

export const CACHE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS zyra_cache_flights (
    cache_key TEXT PRIMARY KEY,
    flight_id TEXT NOT NULL,
    leader_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('running', 'completed')),
    result_key TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    completed_at_ms INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_zyra_cache_flights_expiry ON zyra_cache_flights (state, expires_at_ms)`,
  `CREATE TABLE IF NOT EXISTS zyra_cache_write_budget (
    provider_day TEXT PRIMARY KEY,
    claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0 AND claimed_count <= 900),
    updated_at_ms INTEGER NOT NULL
  )`,
] as const;

export function ensureCacheSchema(sql: SqlExecutor): void {
  for (const statement of CACHE_SCHEMA_STATEMENTS) sql.exec(statement);
}
