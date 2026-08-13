import type { SqlExecutor } from "../quota/schema";

export const CACHE_WRITE_LIMIT = 900 as const;

type FlightRow = {
  cache_key: string;
  flight_id: string;
  leader_id: string;
  state: "running" | "completed";
  result_key: string | null;
  created_at_ms: number;
  expires_at_ms: number;
  completed_at_ms: number | null;
};

type BudgetRow = {
  provider_day: string;
  claimed_count: number;
  updated_at_ms: number;
};

export type CacheFlightResult =
  | { readonly status: "leader"; readonly cacheKey: string; readonly flightId: string; readonly leaseMs: number }
  | { readonly status: "follower"; readonly cacheKey: string; readonly retryAfterMs: number }
  | { readonly status: "completed"; readonly cacheKey: string; readonly resultKey: string };

export type CacheFlightStatus =
  | { readonly status: "running"; readonly cacheKey: string; readonly retryAfterMs: number }
  | { readonly status: "completed"; readonly cacheKey: string; readonly resultKey: string }
  | { readonly status: "missing"; readonly cacheKey: string };

function safeCacheKey(value: string): void {
  if (!/^zyra:exact:v1:[a-f0-9]{64}$/i.test(value)) throw new Error("invalid cache key");
}

function safeLeaderId(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new Error("invalid leader ID");
}

function safeDay(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid provider day");
}

function boundedLeaseMs(value: number): number {
  if (!Number.isFinite(value)) return 15_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(value)));
}

export class CacheFlightLedger {
  constructor(private readonly sql: SqlExecutor) {}

  acquire(cacheKey: string, leaderId: string, now = Date.now(), requestedLeaseMs = 15_000): CacheFlightResult {
    safeCacheKey(cacheKey);
    safeLeaderId(leaderId);
    const leaseMs = boundedLeaseMs(requestedLeaseMs);
    const existing = this.sql.exec<FlightRow>(
      `SELECT cache_key, flight_id, leader_id, state, result_key, created_at_ms, expires_at_ms, completed_at_ms
       FROM zyra_cache_flights WHERE cache_key = ?`,
      cacheKey,
    ).toArray()[0];

    if (existing && existing.expires_at_ms <= now) {
      this.sql.exec(`DELETE FROM zyra_cache_flights WHERE cache_key = ?`, cacheKey);
    } else if (existing?.state === "completed" && existing.result_key) {
      return { status: "completed", cacheKey, resultKey: existing.result_key };
    } else if (existing?.state === "running") {
      return {
        status: "follower",
        cacheKey,
        retryAfterMs: Math.max(50, Math.min(2_000, existing.expires_at_ms - now)),
      };
    }

    const flightId = `${leaderId}:${now}:${crypto.randomUUID()}`;
    this.sql.exec(
      `INSERT INTO zyra_cache_flights (cache_key, flight_id, leader_id, state, result_key, created_at_ms, expires_at_ms, completed_at_ms)
       VALUES (?, ?, ?, 'running', NULL, ?, ?, NULL)`,
      cacheKey,
      flightId,
      leaderId,
      now,
      now + leaseMs,
    );
    return { status: "leader", cacheKey, flightId, leaseMs };
  }

  complete(cacheKey: string, flightId: string, resultKey: string, now = Date.now()): boolean {
    safeCacheKey(cacheKey);
    safeLeaderId(flightId);
    if (!/^zyra:entry:v1:[A-Za-z0-9._:-]{1,160}$/.test(resultKey)) throw new Error("invalid cache result key");
    const result = this.sql.exec(
      `UPDATE zyra_cache_flights
       SET state = 'completed', result_key = ?, completed_at_ms = ?, expires_at_ms = ?
       WHERE cache_key = ? AND flight_id = ? AND state = 'running'`,
      resultKey,
      now,
      now + 60_000,
      cacheKey,
      flightId,
    ).toArray();
    return result.length === 0 ? Boolean(this.status(cacheKey, now).status === "completed") : true;
  }

  fail(cacheKey: string, flightId: string): boolean {
    safeCacheKey(cacheKey);
    safeLeaderId(flightId);
    const existing = this.sql.exec<FlightRow>(
      `SELECT cache_key, flight_id, leader_id, state, result_key, created_at_ms, expires_at_ms, completed_at_ms
       FROM zyra_cache_flights WHERE cache_key = ? AND flight_id = ? AND state = 'running'`,
      cacheKey,
      flightId,
    ).toArray()[0];
    const result = this.sql.exec(
      `DELETE FROM zyra_cache_flights WHERE cache_key = ? AND flight_id = ? AND state = 'running'`,
      cacheKey,
      flightId,
    ).toArray();
    void result;
    return Boolean(existing);
  }

  status(cacheKey: string, now = Date.now()): CacheFlightStatus {
    safeCacheKey(cacheKey);
    const row = this.sql.exec<FlightRow>(
      `SELECT cache_key, flight_id, leader_id, state, result_key, created_at_ms, expires_at_ms, completed_at_ms
       FROM zyra_cache_flights WHERE cache_key = ?`,
      cacheKey,
    ).toArray()[0];
    if (!row || row.expires_at_ms <= now) {
      if (row) this.sql.exec(`DELETE FROM zyra_cache_flights WHERE cache_key = ?`, cacheKey);
      return { status: "missing", cacheKey };
    }
    if (row.state === "completed" && row.result_key) {
      return { status: "completed", cacheKey, resultKey: row.result_key };
    }
    return { status: "running", cacheKey, retryAfterMs: Math.max(50, Math.min(2_000, row.expires_at_ms - now)) };
  }

  claimWrite(providerDay: string, now = Date.now()): { readonly accepted: boolean; readonly claimed: number; readonly remaining: number } {
    safeDay(providerDay);
    const current = this.sql.exec<BudgetRow>(
      `SELECT provider_day, claimed_count, updated_at_ms FROM zyra_cache_write_budget WHERE provider_day = ?`,
      providerDay,
    ).toArray()[0];
    const claimed = current?.claimed_count ?? 0;
    if (claimed >= CACHE_WRITE_LIMIT) return { accepted: false, claimed, remaining: 0 };
    const next = claimed + 1;
    if (current) {
      this.sql.exec(
        `UPDATE zyra_cache_write_budget SET claimed_count = ?, updated_at_ms = ? WHERE provider_day = ?`,
        next,
        now,
        providerDay,
      );
    } else {
      this.sql.exec(
        `INSERT INTO zyra_cache_write_budget (provider_day, claimed_count, updated_at_ms) VALUES (?, ?, ?)`,
        providerDay,
        next,
        now,
      );
    }
    return { accepted: true, claimed: next, remaining: CACHE_WRITE_LIMIT - next };
  }

  diagnostics(): {
    readonly schemaVersion: "plan-006-v1";
    readonly runningFlights: number;
    readonly completedFlights: number;
    readonly writeBudget: readonly BudgetRow[];
  } {
    const flights = this.sql.exec<{ state: "running" | "completed"; count: number }>(
      `SELECT state, COUNT(*) AS count FROM zyra_cache_flights GROUP BY state`,
    ).toArray();
    return {
      schemaVersion: "plan-006-v1",
      runningFlights: flights.find((row) => row.state === "running")?.count ?? 0,
      completedFlights: flights.find((row) => row.state === "completed")?.count ?? 0,
      writeBudget: this.sql.exec<BudgetRow>(
        `SELECT provider_day, claimed_count, updated_at_ms FROM zyra_cache_write_budget ORDER BY provider_day DESC LIMIT 7`,
      ).toArray(),
    };
  }
}
