export type SqlValue = string | number | null | ArrayBuffer;

export type SqlCursor<T extends Record<string, SqlValue>> = {
  toArray(): T[];
};

export type SqlExecutor = {
  exec<T extends Record<string, SqlValue>>(query: string, ...bindings: unknown[]): SqlCursor<T>;
};

export const QUOTA_SCHEMA_VERSION = "plan-003-v1" as const;

export const QUOTA_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS zyra_quota_leases (
    lease_id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    user_hash TEXT NOT NULL CHECK (length(user_hash) = 64),
    role TEXT NOT NULL CHECK (role IN ('murid', 'tutor', 'admin')),
    feature TEXT NOT NULL,
    route_class TEXT NOT NULL,
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('reserved', 'dispatched', 'committed', 'refunded', 'expired_refunded', 'expired_committed')),
    provider_day TEXT NOT NULL,
    app_day TEXT NOT NULL,
    cache_status TEXT NOT NULL CHECK (cache_status IN ('hit', 'miss', 'bypass')),
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    dispatched_at_ms INTEGER,
    terminal_at_ms INTEGER,
    provider_attempt_id TEXT UNIQUE,
    provider_outcome_code TEXT,
    latency_ms INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_zyra_quota_leases_expiry ON zyra_quota_leases (state, expires_at_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_zyra_quota_leases_project_model ON zyra_quota_leases (project_alias, model_id, state)`,
  `CREATE TABLE IF NOT EXISTS zyra_quota_daily_counters (
    provider_day TEXT NOT NULL,
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    committed_count INTEGER NOT NULL DEFAULT 0 CHECK (committed_count >= 0),
    last_selected_at_ms INTEGER,
    PRIMARY KEY (provider_day, model_id, project_alias)
  )`,
  `CREATE TABLE IF NOT EXISTS zyra_quota_minute_counters (
    minute_bucket TEXT NOT NULL,
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    PRIMARY KEY (minute_bucket, model_id, project_alias)
  )`,
  `CREATE TABLE IF NOT EXISTS zyra_quota_health (
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    circuit_state TEXT NOT NULL CHECK (circuit_state IN ('closed', 'open', 'half_open')),
    open_reason TEXT,
    rpd_day TEXT,
    half_open_at_ms INTEGER,
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (model_id, project_alias)
  )`,
  `CREATE TABLE IF NOT EXISTS zyra_quota_health_samples (
    sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    provider_attempt_id TEXT NOT NULL UNIQUE,
    outcome_class TEXT NOT NULL,
    latency_ms INTEGER,
    occurred_at_ms INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_zyra_quota_health_samples_recent ON zyra_quota_health_samples (model_id, project_alias, occurred_at_ms DESC)`,
  `CREATE TABLE IF NOT EXISTS zyra_quota_telemetry (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    model_id TEXT NOT NULL,
    project_alias TEXT NOT NULL,
    role TEXT NOT NULL,
    feature TEXT NOT NULL,
    outcome_code TEXT NOT NULL,
    latency_bucket TEXT,
    cache_status TEXT NOT NULL,
    occurred_at_ms INTEGER NOT NULL
  )`
] as const;

export function ensureQuotaSchema(sql: SqlExecutor): void {
  for (const statement of QUOTA_SCHEMA_STATEMENTS) {
    sql.exec(statement);
  }
}
