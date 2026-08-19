import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { QuotaLedger } from "../../workers/zyra-control-plane/src/quota/ledger";
import { ensureQuotaSchema } from "../../workers/zyra-control-plane/src/quota/schema";

const MODEL_ID = "gemini-2.5-flash";
const ROUTE_CLASS = "stable-fallback";
const MAX_SYNTHETIC_CONCURRENCY = 100;

type JsonRecord = Record<string, unknown>;

class RemoteSmokeError extends Error {
  constructor(
    readonly path: string,
    readonly httpStatus: number | null,
    readonly code: "REMOTE_NON_JSON" | "REMOTE_HTTP_ERROR"
  ) {
    super(code);
  }
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runLocal(runId: string, concurrency: number): JsonRecord {
  const database = new Database(":memory:");
  const sql = {
    exec<T extends Record<string, string | number | null | ArrayBuffer>>(query: string, ...bindings: unknown[]) {
      if (!/^(SELECT|WITH|PRAGMA)\b/i.test(query.trim())) {
        const run = database.run.bind(database) as unknown as (sqlText: string, ...values: SQLQueryBindings[]) => unknown;
        run(query, ...(bindings as SQLQueryBindings[]));
        return { toArray: () => [] as T[] };
      }
      const statement = database.query(query) as unknown as { all(...values: SQLQueryBindings[]): T[] };
      return { toArray: () => statement.all(...(bindings as SQLQueryBindings[])) };
    }
  };
  ensureQuotaSchema(sql);
  const ledger = new QuotaLedger(sql, () => Date.parse("2026-08-05T12:00:00.000Z"));
  const reservations = Array.from({ length: concurrency }, (_, index) => ledger.reserve({
    idempotencyKey: `${runId}-${index}`,
    userHash: `${index.toString(16).padStart(2, "0")}`.repeat(32),
    role: "murid" as const,
    feature: "plan003-local-synthetic",
    routeClass: ROUTE_CLASS,
    modelId: MODEL_ID,
    cacheStatus: "bypass" as const
  }));
  const accepted = reservations.filter((result) => result.status === "reserved");
  for (const result of accepted) {
    if (result.status !== "reserved") continue;
    ledger.dispatch(result.lease.leaseId);
    ledger.commit({ leaseId: result.lease.leaseId, outcomeCode: "SYNTHETIC_SUCCESS", outcomeClass: "success", latencyMs: 1 });
  }
  const diagnostics = ledger.diagnostics();
  const counters = diagnostics.counters.filter((counter) => counter.modelId === MODEL_ID);
  const committedByProject = counters.map((counter) => counter.committedCount);
  const maxCommitted = Math.max(...committedByProject);
  const minCommitted = Math.min(...committedByProject);
  database.close();
  return {
    status: accepted.length <= 64 && committedByProject.length === 4 && maxCommitted <= 16 && maxCommitted - minCommitted <= 3 ? "passed" : "failed",
    plan: "003",
    mode: "local-synthetic",
    runId,
    requestedConcurrency: concurrency,
    acceptedReservations: accepted.length,
    rejectedReservations: concurrency - accepted.length,
    committedTransitions: accepted.length,
    syntheticProviderCalls: 0,
    overAllocation: maxCommitted > 16,
    fairnessSpread: maxCommitted - minCommitted,
    committedByProject,
    diagnostics,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false
  };
}

async function requestJson(
  url: string,
  token: string,
  path: string,
  init?: RequestInit,
  allowedStatuses: readonly number[] = []
): Promise<JsonRecord> {
  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body)) throw new RemoteSmokeError(path, response.status, "REMOTE_NON_JSON");
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw new RemoteSmokeError(path, response.status, "REMOTE_HTTP_ERROR");
  }
  return body;
}

async function main(): Promise<void> {
  const runId = argValue("--run-id") ?? `plan003-quota-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const local = process.argv.includes("--local");
  const url = argValue("--url") ?? process.env.ZYRA_CONTROL_PLANE_URL;
  const token = process.env.ZYRA_CONTROL_PLANE_TOKEN;
  const concurrencyText = argValue("--synthetic-concurrency");
  const concurrency = concurrencyText === undefined ? MAX_SYNTHETIC_CONCURRENCY : Number(concurrencyText);

  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("invalid run id");
  if (local) {
    const artifact = runLocal(runId, concurrency);
    const artifactPath = resolve("artifacts", "zyra-ai", runId, "plan-003-result.json");
    await mkdir(resolve("artifacts", "zyra-ai", runId), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`quota smoke status=${artifact.status} mode=local-synthetic accepted=${artifact.acceptedReservations} rejected=${artifact.rejectedReservations} committed=${artifact.committedTransitions} syntheticProviderCalls=0 artifact=${artifactPath}`);
    if (artifact.status !== "passed") process.exitCode = 1;
    return;
  }
  if (!url) throw new Error("staging smoke requires --url or ZYRA_CONTROL_PLANE_URL");
  if (!token) throw new Error("staging smoke requires the existing staging control-plane secret");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_SYNTHETIC_CONCURRENCY) {
    throw new Error(`synthetic concurrency must be between 1 and ${MAX_SYNTHETIC_CONCURRENCY}`);
  }

  try {
    const reservations = await Promise.all(Array.from({ length: concurrency }, (_, index) =>
      requestJson(url, token, "/quota/reserve", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: `${runId}-${index}`,
          userId: `synthetic-user-${index}`,
          role: "murid",
          feature: "plan003-synthetic-concurrency",
          routeClass: ROUTE_CLASS,
          modelId: MODEL_ID,
          cacheStatus: "bypass"
        })
      }, [429])
    ));
    const accepted = reservations.filter((result) => result.status === "reserved" && isRecord(result.lease));
    const rejected = reservations.length - accepted.length;

    const transitions = await Promise.all(accepted.map(async (result) => {
      const lease = result.lease as JsonRecord;
      const leaseId = typeof lease.leaseId === "string" ? lease.leaseId : "";
      if (!leaseId) throw new Error("invalid lease response");
      await requestJson(url, token, "/quota/dispatch", {
        method: "POST",
        body: JSON.stringify({ leaseId })
      });
      return requestJson(url, token, "/quota/commit", {
        method: "POST",
        body: JSON.stringify({
          leaseId,
          providerAttemptId: `${runId}-synthetic-${leaseId}`,
          outcomeCode: "SYNTHETIC_SUCCESS",
          outcomeClass: "success",
          latencyMs: 1
        })
      });
    }));
    const committed = transitions.filter((result) => result.status === "updated" || result.status === "idempotent").length;
    const diagnostics = await requestJson(url, token, "/quota/diagnostics");
    const counters = Array.isArray(diagnostics.counters)
      ? diagnostics.counters.filter((counter): counter is JsonRecord => isRecord(counter) && counter.modelId === MODEL_ID)
      : [];
    const committedByProject = counters.map((counter) => Number(counter.committedCount ?? 0));
    const maxCommitted = committedByProject.length > 0 ? Math.max(...committedByProject) : 0;
    const minCommitted = committedByProject.length > 0 ? Math.min(...committedByProject) : 0;
    const passed = accepted.length <= 64
      && committed === accepted.length
      && maxCommitted <= 16
      && maxCommitted - minCommitted <= 3
      && committedByProject.length === 4;
    const artifact = {
      status: passed ? "passed" : "failed",
      plan: "003",
      mode: "synthetic-concurrency",
      runId,
      requestedConcurrency: concurrency,
      acceptedReservations: accepted.length,
      rejectedReservations: rejected,
      committedTransitions: committed,
      syntheticProviderCalls: 0,
      overAllocation: maxCommitted > 16,
      fairnessSpread: maxCommitted - minCommitted,
      committedByProject,
      diagnostics,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false
    };
    const artifactPath = resolve("artifacts", "zyra-ai", runId, "plan-003-result.json");
    await mkdir(resolve("artifacts", "zyra-ai", runId), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`quota smoke status=${artifact.status} accepted=${accepted.length} rejected=${rejected} committed=${committed} syntheticProviderCalls=0 artifact=${artifactPath}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const failure = error instanceof RemoteSmokeError
      ? { code: error.code, path: error.path, httpStatus: error.httpStatus }
      : { code: "REMOTE_SMOKE_ERROR", path: null, httpStatus: null };
    const artifact = {
      status: "blocked",
      plan: "003",
      mode: "synthetic-concurrency",
      runId,
      requestedConcurrency: concurrency,
      blocker: failure,
      syntheticProviderCalls: 0,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false
    };
    const artifactPath = resolve("artifacts", "zyra-ai", runId, "plan-003-result.json");
    await mkdir(resolve("artifacts", "zyra-ai", runId), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`quota smoke status=blocked mode=synthetic-concurrency blocker=${failure.code} httpStatus=${failure.httpStatus ?? "unknown"} artifact=${artifactPath}`);
    process.exitCode = 1;
  }
}

await main();
