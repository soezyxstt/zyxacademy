import {
  appDayLabel,
  nextProviderDayBoundaryMs,
  providerDayLabel,
  providerMinuteBucket
} from "./clock";
import {
  CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_ROLLING_FAILURE_RATE,
  CIRCUIT_ROLLING_SAMPLE_SIZE,
  type CacheStatus,
  type CircuitState,
  type CommitInput,
  type LeaseState,
  type LeaseSummary,
  type ProviderOutcomeClass,
  type QuotaDiagnostics,
  type ReserveInput,
  type ReserveResult,
  type TransitionResult,
  validateCommitInput,
  validateReserveInput
} from "./contracts";
import {
  getWorkerModelContract,
  PROJECT_ALIASES,
  projectDailyCeiling,
  type WorkerModelContract
} from "./model-contract";
import type { SqlExecutor } from "./schema";

type LeaseRow = {
  lease_id: string;
  idempotency_key: string;
  user_hash: string;
  role: string;
  feature: string;
  route_class: string;
  model_id: string;
  project_alias: string;
  state: string;
  provider_day: string;
  app_day: string;
  cache_status: string;
  created_at_ms: number;
  expires_at_ms: number;
  dispatched_at_ms?: number | null;
  terminal_at_ms: number | null;
  provider_attempt_id?: string | null;
  provider_outcome_code: string | null;
  latency_ms?: number | null;
};

type CounterRow = {
  reserved_count: number;
  committed_count: number;
  last_selected_at_ms: number | null;
};

type MinuteRow = {
  request_count: number;
};

type HealthRow = {
  circuit_state: string;
  open_reason: string | null;
  rpd_day: string | null;
  half_open_at_ms: number | null;
  consecutive_failures: number;
  sample_count: number;
  failure_count: number;
};

type SampleRow = {
  outcome_class: string;
};

type CountRow = {
  count: number;
};

type CounterDiagnosticRow = {
  model_id: string;
  project_alias: string;
  reserved_count: number;
  committed_count: number;
  minute_count: number;
};

type HealthDiagnosticRow = {
  model_id: string;
  project_alias: string;
  circuit_state: string;
  consecutive_failures: number;
  sample_count: number;
  failure_count: number;
};

type Candidate = {
  projectAlias: string;
  daily: CounterRow;
  minute: MinuteRow;
  health: HealthRow;
  activeCount: number;
  dailyUtilization: number;
  minuteUtilization: number;
  lastSelectedAtMs: number;
};

const PROVIDER_FAILURES = new Set<ProviderOutcomeClass>([
  "provider_429",
  "provider_5xx",
  "provider_timeout",
  "provider_malformed"
]);

const TERMINAL_STATES = new Set<LeaseState>([
  "committed",
  "refunded",
  "expired_refunded",
  "expired_committed"
]);

function asNumber(value: number | string | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asCircuitState(value: string): CircuitState {
  if (value === "open" || value === "half_open") return value;
  return "closed";
}

function asLeaseState(value: string): LeaseState {
  if (TERMINAL_STATES.has(value as LeaseState)) return value as LeaseState;
  return value === "dispatched" ? "dispatched" : "reserved";
}

function latencyBucket(latencyMs: number | undefined): string | null {
  if (latencyMs === undefined) return null;
  if (latencyMs < 500) return "lt_500ms";
  if (latencyMs < 2_000) return "500ms_2s";
  if (latencyMs < 5_000) return "2s_5s";
  if (latencyMs < 15_000) return "5s_15s";
  return "gte_15s";
}

function buildLeaseSummary(row: LeaseRow): LeaseSummary {
  return {
    leaseId: row.lease_id,
    idempotencyKey: row.idempotency_key,
    role: row.role as LeaseSummary["role"],
    feature: row.feature,
    routeClass: row.route_class as LeaseSummary["routeClass"],
    modelId: row.model_id as LeaseSummary["modelId"],
    projectAlias: row.project_alias,
    state: asLeaseState(row.state),
    providerDay: row.provider_day,
    appDay: row.app_day,
    cacheStatus: row.cache_status as CacheStatus,
    createdAtMs: asNumber(row.created_at_ms),
    expiresAtMs: asNumber(row.expires_at_ms),
    terminalAtMs: row.terminal_at_ms === null ? null : asNumber(row.terminal_at_ms),
    providerOutcomeCode: row.provider_outcome_code
  };
}

export class QuotaLedger {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly now: () => number = Date.now,
    private readonly projectAliases: readonly string[] = PROJECT_ALIASES
  ) {}

  reserve(input: ReserveInput): ReserveResult {
    const failures = validateReserveInput(input);
    const model = getWorkerModelContract(input.modelId);

    if (!model) return { status: "quota_exhausted", code: "UNKNOWN_MODEL", modelId: input.modelId };
    if (!model.ordinaryRoutingAllowed || model.initialUsableRpd <= 0) {
      return { status: "fallback_allowed", code: "MODEL_QUARANTINED", modelId: input.modelId };
    }
    if (!model.routeClasses.includes(input.routeClass)) failures.push("route_class_model_mismatch");
    if (failures.length > 0) return { status: "quota_exhausted", code: "INVALID_RESERVE_INPUT", modelId: input.modelId };

    const existing = this.findLeaseByIdempotency(input.idempotencyKey);
    if (existing) return { status: "idempotent", lease: buildLeaseSummary(existing) };

    const nowMs = this.now();
    const providerDay = providerDayLabel(new Date(nowMs));
    const appDay = appDayLabel(new Date(nowMs));
    const minuteBucket = providerMinuteBucket(new Date(nowMs));
    const candidates = this.projectAliases
      .map((projectAlias) => this.readCandidate(projectAlias, model, providerDay, minuteBucket, nowMs))
      .filter((candidate): candidate is Candidate => candidate !== null);

    const selected = candidates.sort((left, right) =>
      left.dailyUtilization - right.dailyUtilization
      || left.minuteUtilization - right.minuteUtilization
      || left.activeCount - right.activeCount
      || left.health.consecutive_failures - right.health.consecutive_failures
      || left.lastSelectedAtMs - right.lastSelectedAtMs
      || left.projectAlias.localeCompare(right.projectAlias)
    )[0];

    if (!selected) {
      const premium = input.routeClass === "premium-pedagogy" || input.routeClass === "premium-visual";
      return {
        status: premium ? "fallback_allowed" : "quota_exhausted",
        code: premium ? "PREMIUM_EXHAUSTED_FALLBACK_ALLOWED" : "QUOTA_EXHAUSTED",
        modelId: input.modelId
      };
    }

    const leaseId = crypto.randomUUID();
    const expiresAtMs = nowMs + 30_000;
    this.sql.exec(
      `INSERT INTO zyra_quota_leases (
        lease_id, idempotency_key, user_hash, role, feature, route_class, model_id, project_alias,
        state, provider_day, app_day, cache_status, created_at_ms, expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)`,
      leaseId,
      input.idempotencyKey,
      input.userHash,
      input.role,
      input.feature,
      input.routeClass,
      input.modelId,
      selected.projectAlias,
      providerDay,
      appDay,
      input.cacheStatus,
      nowMs,
      expiresAtMs
    );
    this.sql.exec(
      `INSERT INTO zyra_quota_daily_counters (provider_day, model_id, project_alias, reserved_count, committed_count, last_selected_at_ms)
       VALUES (?, ?, ?, 1, 0, ?)
       ON CONFLICT(provider_day, model_id, project_alias)
       DO UPDATE SET reserved_count = reserved_count + 1, last_selected_at_ms = excluded.last_selected_at_ms`,
      providerDay,
      input.modelId,
      selected.projectAlias,
      nowMs
    );
    this.sql.exec(
      `INSERT INTO zyra_quota_minute_counters (minute_bucket, model_id, project_alias, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(minute_bucket, model_id, project_alias)
       DO UPDATE SET request_count = request_count + 1`,
      minuteBucket,
      input.modelId,
      selected.projectAlias
    );

    const row: LeaseRow = {
      lease_id: leaseId,
      idempotency_key: input.idempotencyKey,
      user_hash: input.userHash,
      role: input.role,
      feature: input.feature,
      route_class: input.routeClass,
      model_id: input.modelId,
      project_alias: selected.projectAlias,
      state: "reserved",
      provider_day: providerDay,
      app_day: appDay,
      cache_status: input.cacheStatus,
      created_at_ms: nowMs,
      expires_at_ms: expiresAtMs,
      terminal_at_ms: null,
      provider_outcome_code: null
    };
    return { status: "reserved", lease: buildLeaseSummary(row) };
  }

  dispatch(leaseId: string): TransitionResult {
    const row = this.findLease(leaseId);
    if (!row) return { status: "rejected", code: "LEASE_NOT_FOUND" };
    if (row.state === "dispatched") return { status: "idempotent", lease: buildLeaseSummary(row) };
    if (TERMINAL_STATES.has(row.state as LeaseState)) return { status: "idempotent", lease: buildLeaseSummary(row) };
    if (row.state !== "reserved") return { status: "rejected", code: "INVALID_LEASE_STATE" };

    const nowMs = this.now();
    this.sql.exec(
      `UPDATE zyra_quota_leases SET state = 'dispatched', dispatched_at_ms = ? WHERE lease_id = ? AND state = 'reserved'`,
      nowMs,
      leaseId
    );
    return { status: "updated", lease: buildLeaseSummary({ ...row, state: "dispatched", dispatched_at_ms: nowMs }) };
  }

  commit(input: CommitInput): TransitionResult {
    const failures = validateCommitInput(input);
    if (failures.length > 0) return { status: "rejected", code: "INVALID_COMMIT_INPUT" };

    const row = this.findLease(input.leaseId);
    if (!row) return { status: "rejected", code: "LEASE_NOT_FOUND" };
    if (TERMINAL_STATES.has(row.state as LeaseState)) return { status: "idempotent", lease: buildLeaseSummary(row) };
    if (row.state !== "dispatched") return { status: "rejected", code: "LEASE_NOT_DISPATCHED" };

    const nowMs = this.now();
    const providerAttemptId = input.providerAttemptId ?? input.leaseId;
    this.sql.exec(
      `UPDATE zyra_quota_leases
       SET state = 'committed', terminal_at_ms = ?, provider_attempt_id = ?, provider_outcome_code = ?, latency_ms = ?
       WHERE lease_id = ? AND state = 'dispatched'`,
      nowMs,
      providerAttemptId,
      input.outcomeCode,
      input.latencyMs ?? null,
      input.leaseId
    );
    this.sql.exec(
      `UPDATE zyra_quota_daily_counters
       SET reserved_count = CASE WHEN reserved_count > 0 THEN reserved_count - 1 ELSE 0 END,
           committed_count = committed_count + 1
       WHERE provider_day = ? AND model_id = ? AND project_alias = ?`,
      row.provider_day,
      row.model_id,
      row.project_alias
    );
    this.recordHealth(row.model_id, row.project_alias, providerAttemptId, input.outcomeClass, input.latencyMs, nowMs);
    this.recordTelemetry(row, input.outcomeCode, input.latencyMs, nowMs);

    return {
      status: "updated",
      lease: buildLeaseSummary({
        ...row,
        state: "committed",
        terminal_at_ms: nowMs,
        provider_attempt_id: providerAttemptId,
        provider_outcome_code: input.outcomeCode
      })
    };
  }

  refund(leaseId: string, reason = "REFUNDED_BEFORE_DISPATCH"): TransitionResult {
    const row = this.findLease(leaseId);
    if (!row) return { status: "rejected", code: "LEASE_NOT_FOUND" };
    if (TERMINAL_STATES.has(row.state as LeaseState)) return { status: "idempotent", lease: buildLeaseSummary(row) };
    if (row.state !== "reserved") return { status: "rejected", code: "LEASE_ALREADY_DISPATCHED" };

    const nowMs = this.now();
    this.sql.exec(
      `UPDATE zyra_quota_leases SET state = 'refunded', terminal_at_ms = ?, provider_outcome_code = ? WHERE lease_id = ? AND state = 'reserved'`,
      nowMs,
      reason,
      leaseId
    );
    this.releaseReservation(row);
    this.recordTelemetry(row, reason, undefined, nowMs);
    return {
      status: "updated",
      lease: buildLeaseSummary({ ...row, state: "refunded", terminal_at_ms: nowMs, provider_outcome_code: reason })
    };
  }

  expire(nowMs = this.now()): number {
    const due = this.sql.exec<LeaseRow>(
      `SELECT lease_id, idempotency_key, user_hash, role, feature, route_class, model_id, project_alias,
              state, provider_day, app_day, cache_status, created_at_ms, expires_at_ms, terminal_at_ms, provider_outcome_code
       FROM zyra_quota_leases WHERE state IN ('reserved', 'dispatched') AND expires_at_ms <= ?`,
      nowMs
    ).toArray();
    let expired = 0;
    for (const row of due) {
      if (row.state === "reserved") {
        this.refund(row.lease_id, "LEASE_EXPIRED_BEFORE_DISPATCH");
      } else {
        this.commit({
          leaseId: row.lease_id,
          providerAttemptId: `expire-${row.lease_id}`,
          outcomeCode: "LEASE_EXPIRED_AFTER_DISPATCH",
          outcomeClass: "provider_timeout",
          latencyMs: Math.max(0, nowMs - row.created_at_ms)
        });
        this.sql.exec(
          `UPDATE zyra_quota_leases SET state = 'expired_committed', provider_outcome_code = ? WHERE lease_id = ? AND state = 'committed'`,
          "LEASE_EXPIRED_AFTER_DISPATCH",
          row.lease_id
        );
      }
      expired += 1;
    }
    return expired;
  }

  nextExpiryAt(): number | null {
    const row = this.sql.exec<{ next_expiry: number | null }>(
      `SELECT MIN(expires_at_ms) AS next_expiry FROM zyra_quota_leases WHERE state IN ('reserved', 'dispatched')`
    ).toArray()[0];
    return row?.next_expiry === null || row?.next_expiry === undefined ? null : asNumber(row.next_expiry);
  }

  diagnostics(nowMs = this.now()): QuotaDiagnostics {
    const active = this.sql.exec<CountRow>(
      `SELECT COUNT(*) AS count FROM zyra_quota_leases WHERE state IN ('reserved', 'dispatched')`
    ).toArray()[0]?.count ?? 0;
    const terminal = this.sql.exec<CountRow>(
      `SELECT COUNT(*) AS count FROM zyra_quota_leases WHERE state IN ('committed', 'refunded', 'expired_refunded', 'expired_committed')`
    ).toArray()[0]?.count ?? 0;
    const minuteBucket = providerMinuteBucket(new Date(nowMs));
    const counters = this.sql.exec<CounterDiagnosticRow>(
      `SELECT d.model_id, d.project_alias, d.reserved_count, d.committed_count,
              COALESCE(m.request_count, 0) AS minute_count
       FROM zyra_quota_daily_counters d
       LEFT JOIN zyra_quota_minute_counters m
         ON m.model_id = d.model_id AND m.project_alias = d.project_alias AND m.minute_bucket = ?
       ORDER BY d.model_id, d.project_alias`,
      minuteBucket
    ).toArray();
    const health = this.sql.exec<HealthDiagnosticRow>(
      `SELECT model_id, project_alias, circuit_state, consecutive_failures, sample_count, failure_count
       FROM zyra_quota_health ORDER BY model_id, project_alias`
    ).toArray();

    return {
      schemaVersion: "plan-003-v1",
      activeLeaseCount: asNumber(active),
      terminalLeaseCount: asNumber(terminal),
      counters: counters.map((row) => ({
        modelId: row.model_id,
        projectAlias: row.project_alias,
        reservedCount: asNumber(row.reserved_count),
        committedCount: asNumber(row.committed_count),
        minuteCount: asNumber(row.minute_count)
      })),
      health: health.map((row) => ({
        modelId: row.model_id,
        projectAlias: row.project_alias,
        circuitState: asCircuitState(row.circuit_state),
        consecutiveFailures: asNumber(row.consecutive_failures),
        sampleCount: asNumber(row.sample_count),
        failureCount: asNumber(row.failure_count)
      }))
    };
  }

  nextProviderDayBoundary(nowMs = this.now()): number {
    return nextProviderDayBoundaryMs(new Date(nowMs));
  }

  private findLease(leaseId: string): LeaseRow | undefined {
    return this.sql.exec<LeaseRow>(
      `SELECT lease_id, idempotency_key, user_hash, role, feature, route_class, model_id, project_alias,
              state, provider_day, app_day, cache_status, created_at_ms, expires_at_ms, terminal_at_ms, provider_outcome_code
       FROM zyra_quota_leases WHERE lease_id = ?`,
      leaseId
    ).toArray()[0];
  }

  private findLeaseByIdempotency(idempotencyKey: string): LeaseRow | undefined {
    return this.sql.exec<LeaseRow>(
      `SELECT lease_id, idempotency_key, user_hash, role, feature, route_class, model_id, project_alias,
              state, provider_day, app_day, cache_status, created_at_ms, expires_at_ms, terminal_at_ms, provider_outcome_code
       FROM zyra_quota_leases WHERE idempotency_key = ?`,
      idempotencyKey
    ).toArray()[0];
  }

  private readCandidate(
    projectAlias: string,
    model: WorkerModelContract,
    providerDay: string,
    minuteBucket: string,
    nowMs: number
  ): Candidate | null {
    const daily = this.sql.exec<CounterRow>(
      `SELECT reserved_count, committed_count, last_selected_at_ms
       FROM zyra_quota_daily_counters WHERE provider_day = ? AND model_id = ? AND project_alias = ?`,
      providerDay,
      model.id,
      projectAlias
    ).toArray()[0] ?? { reserved_count: 0, committed_count: 0, last_selected_at_ms: null };
    const minute = this.sql.exec<MinuteRow>(
      `SELECT request_count FROM zyra_quota_minute_counters WHERE minute_bucket = ? AND model_id = ? AND project_alias = ?`,
      minuteBucket,
      model.id,
      projectAlias
    ).toArray()[0] ?? { request_count: 0 };
    let health = this.sql.exec<HealthRow>(
      `SELECT circuit_state, open_reason, rpd_day, half_open_at_ms, consecutive_failures, sample_count, failure_count
       FROM zyra_quota_health WHERE model_id = ? AND project_alias = ?`,
      model.id,
      projectAlias
    ).toArray()[0] ?? {
      circuit_state: "closed",
      open_reason: null,
      rpd_day: null,
      half_open_at_ms: null,
      consecutive_failures: 0,
      sample_count: 0,
      failure_count: 0
    };
    const activeCount = this.sql.exec<CountRow>(
      `SELECT COUNT(*) AS count FROM zyra_quota_leases
       WHERE model_id = ? AND project_alias = ? AND state IN ('reserved', 'dispatched')`,
      model.id,
      projectAlias
    ).toArray()[0]?.count ?? 0;

    if (health.open_reason === "rpd" && health.rpd_day !== providerDay) {
      this.sql.exec(
        `UPDATE zyra_quota_health SET circuit_state = 'closed', open_reason = NULL, rpd_day = NULL, half_open_at_ms = NULL, updated_at_ms = ? WHERE model_id = ? AND project_alias = ?`,
        nowMs,
        model.id,
        projectAlias
      );
      health = { ...health, circuit_state: "closed", open_reason: null, rpd_day: null, half_open_at_ms: null };
    }

    const ceiling = projectDailyCeiling(model);
    const dailyCount = asNumber(daily.reserved_count) + asNumber(daily.committed_count);
    if (ceiling <= dailyCount) {
      this.sql.exec(
        `INSERT INTO zyra_quota_health (model_id, project_alias, circuit_state, open_reason, rpd_day, half_open_at_ms, consecutive_failures, sample_count, failure_count, updated_at_ms)
         VALUES (?, ?, 'open', 'rpd', ?, NULL, ?, ?, ?, ?)
         ON CONFLICT(model_id, project_alias) DO UPDATE SET circuit_state = 'open', open_reason = 'rpd', rpd_day = excluded.rpd_day, half_open_at_ms = NULL, updated_at_ms = excluded.updated_at_ms`,
        model.id,
        projectAlias,
        providerDay,
        health.consecutive_failures,
        health.sample_count,
        health.failure_count,
        nowMs
      );
      return null;
    }

    if (health.circuit_state === "open" && health.open_reason !== "rpd" && asNumber(health.half_open_at_ms) <= nowMs) {
      this.sql.exec(
        `UPDATE zyra_quota_health SET circuit_state = 'half_open', updated_at_ms = ? WHERE model_id = ? AND project_alias = ? AND circuit_state = 'open'`,
        nowMs,
        model.id,
        projectAlias
      );
      health = { ...health, circuit_state: "half_open" };
    }

    if (asNumber(minute.request_count) >= model.perProjectRpm) return null;
    if (health.circuit_state === "open") return null;
    if (health.circuit_state === "half_open" && activeCount > 0) return null;

    return {
      projectAlias,
      daily,
      minute,
      health,
      activeCount: asNumber(activeCount),
      dailyUtilization: dailyCount / ceiling,
      minuteUtilization: asNumber(minute.request_count) / model.perProjectRpm,
      lastSelectedAtMs: asNumber(daily.last_selected_at_ms)
    };
  }

  private releaseReservation(row: LeaseRow): void {
    const minuteBucket = providerMinuteBucket(new Date(row.created_at_ms));
    this.sql.exec(
      `UPDATE zyra_quota_daily_counters
       SET reserved_count = CASE WHEN reserved_count > 0 THEN reserved_count - 1 ELSE 0 END
       WHERE provider_day = ? AND model_id = ? AND project_alias = ?`,
      row.provider_day,
      row.model_id,
      row.project_alias
    );
    this.sql.exec(
      `UPDATE zyra_quota_minute_counters
       SET request_count = CASE WHEN request_count > 0 THEN request_count - 1 ELSE 0 END
       WHERE minute_bucket = ? AND model_id = ? AND project_alias = ?`,
      minuteBucket,
      row.model_id,
      row.project_alias
    );
  }

  private recordHealth(
    modelId: string,
    projectAlias: string,
    providerAttemptId: string,
    outcomeClass: ProviderOutcomeClass,
    latencyMs: number | undefined,
    nowMs: number
  ): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO zyra_quota_health_samples (model_id, project_alias, provider_attempt_id, outcome_class, latency_ms, occurred_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      modelId,
      projectAlias,
      providerAttemptId,
      outcomeClass,
      latencyMs ?? null,
      nowMs
    );
    const samples = this.sql.exec<SampleRow>(
      `SELECT outcome_class FROM zyra_quota_health_samples
       WHERE model_id = ? AND project_alias = ? ORDER BY occurred_at_ms DESC LIMIT ?`,
      modelId,
      projectAlias,
      CIRCUIT_ROLLING_SAMPLE_SIZE
    ).toArray();
    const failures = samples.filter((sample) => PROVIDER_FAILURES.has(sample.outcome_class as ProviderOutcomeClass)).length;
    const consecutiveFailures = PROVIDER_FAILURES.has(outcomeClass)
      ? (this.sql.exec<HealthRow>(
        `SELECT consecutive_failures, circuit_state, open_reason, rpd_day, half_open_at_ms, sample_count, failure_count
         FROM zyra_quota_health WHERE model_id = ? AND project_alias = ?`,
        modelId,
        projectAlias
      ).toArray()[0]?.consecutive_failures ?? 0) + 1
      : 0;
    const existing = this.sql.exec<HealthRow>(
      `SELECT circuit_state, open_reason, rpd_day, half_open_at_ms, consecutive_failures, sample_count, failure_count
       FROM zyra_quota_health WHERE model_id = ? AND project_alias = ?`,
      modelId,
      projectAlias
    ).toArray()[0];
    const shouldOpen = PROVIDER_FAILURES.has(outcomeClass)
      && (consecutiveFailures >= CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD
        || (samples.length >= CIRCUIT_ROLLING_SAMPLE_SIZE && failures / samples.length >= CIRCUIT_ROLLING_FAILURE_RATE));
    const circuitState: CircuitState = shouldOpen ? "open" : outcomeClass === "success" ? "closed" : asCircuitState(existing?.circuit_state ?? "closed");
    this.sql.exec(
      `INSERT INTO zyra_quota_health (model_id, project_alias, circuit_state, open_reason, rpd_day, half_open_at_ms, consecutive_failures, sample_count, failure_count, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(model_id, project_alias) DO UPDATE SET
         circuit_state = excluded.circuit_state,
         open_reason = excluded.open_reason,
         rpd_day = excluded.rpd_day,
         half_open_at_ms = excluded.half_open_at_ms,
         consecutive_failures = excluded.consecutive_failures,
         sample_count = excluded.sample_count,
         failure_count = excluded.failure_count,
         updated_at_ms = excluded.updated_at_ms`,
      modelId,
      projectAlias,
      circuitState,
      shouldOpen ? "provider_failure" : circuitState === "closed" ? null : existing?.open_reason ?? null,
      null,
      shouldOpen ? nowMs + CIRCUIT_COOLDOWN_MS : circuitState === "closed" ? null : existing?.half_open_at_ms ?? null,
      consecutiveFailures,
      samples.length,
      failures,
      nowMs
    );
  }

  private recordTelemetry(row: LeaseRow, outcomeCode: string, latencyMs: number | undefined, nowMs: number): void {
    this.sql.exec(
      `INSERT INTO zyra_quota_telemetry (event_type, model_id, project_alias, role, feature, outcome_code, latency_bucket, cache_status, occurred_at_ms)
       VALUES ('lease_transition', ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.model_id,
      row.project_alias,
      row.role,
      row.feature,
      outcomeCode,
      latencyBucket(latencyMs),
      row.cache_status,
      nowMs
    );
  }
}

export function isSafeTelemetryValue(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(value) && !value.includes("@");
}

export function hashUserId(value: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
