import { DurableObject } from "cloudflare:workers";
import { isAuthorizedRequest } from "./auth";
import {
  buildHealthPayload,
  jsonResponse,
  safeError
} from "./contracts";
import {
  type CacheStatus,
  type CommitInput,
  type LeaseSummary,
  type ProviderOutcomeClass,
  type QuotaRole,
  type ReserveInput,
} from "./quota/contracts";
import { hashUserId, QuotaLedger } from "./quota/ledger";
import { ensureQuotaSchema, type SqlExecutor } from "./quota/schema";
import { CacheFlightLedger } from "./cache/ledger";
import { ensureCacheSchema } from "./cache/schema";
import {
  validateCacheKey,
  validateCachePayload,
  validateSemanticMetadata,
  semanticMetadataMatchesScope,
  validateSemanticVector,
  type SemanticCacheMetadata,
} from "./cache/contracts";
import type { ModelId, ModelRouteClass } from "../../../lib/ai/provider/model-registry";

const MAX_BODY_BYTES = 32 * 1024;

function invalidRequest(code = "invalid_request"): Response {
  return jsonResponse(safeError(code), 400);
}

function notFound(): Response {
  return jsonResponse(safeError("not_found"), 404);
}

function quotaInternalError(code: "quota_binding_unavailable" | "quota_storage_unavailable" | "quota_diagnostics_unavailable" | "quota_coordinator_invocation_failed"): Response {
  return jsonResponse(safeError(code), 503);
}

function cacheInternalError(code: "cache_binding_unavailable" | "cache_storage_unavailable" | "cache_operation_failed"): Response {
  return jsonResponse(safeError(code), 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalStringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return value === undefined ? undefined : typeof value === "string" && value.length > 0 ? value : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return null;

  try {
    const body = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function sqlExecutor(state: DurableObjectState): SqlExecutor {
  return state.storage.sql as unknown as SqlExecutor;
}

function responseStatus(result: { status: string }): number {
  if (result.status === "reserved" || result.status === "updated" || result.status === "idempotent") return 200;
  if (result.status === "fallback_allowed" || result.status === "quota_exhausted") return 429;
  return 400;
}

export class ZyraQuotaCoordinator extends DurableObject<WorkerEnv> {
  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let sql: SqlExecutor;
    try {
      sql = sqlExecutor(this.ctx);
      ensureQuotaSchema(sql);
      ensureCacheSchema(sql);
    } catch {
      return quotaInternalError("quota_storage_unavailable");
    }
    const ledger = new QuotaLedger(sql);
    const cacheLedger = new CacheFlightLedger(sql);

    if (url.pathname === "/cache/diagnostics") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      try {
        return jsonResponse(cacheLedger.diagnostics());
      } catch {
        return cacheInternalError("cache_storage_unavailable");
      }
    }

    if (url.pathname === "/cache/flight/status") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const cacheKey = url.searchParams.get("cacheKey");
      if (!cacheKey || !validateCacheKey(cacheKey)) return invalidRequest("invalid_cache_key");
      return jsonResponse(cacheLedger.status(cacheKey));
    }

    if (url.pathname === "/cache/flight/acquire") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await readJson(request);
      if (!body || typeof body.cacheKey !== "string" || !validateCacheKey(body.cacheKey)
        || typeof body.leaderId !== "string" || typeof body.leaseMs !== "number") {
        return invalidRequest("invalid_cache_flight_request");
      }
      try {
        return jsonResponse(cacheLedger.acquire(body.cacheKey, body.leaderId, Date.now(), body.leaseMs));
      } catch {
        return invalidRequest("invalid_cache_flight_request");
      }
    }

    if (url.pathname === "/cache/flight/complete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await readJson(request);
      if (!body || typeof body.cacheKey !== "string" || !validateCacheKey(body.cacheKey)
        || typeof body.flightId !== "string" || typeof body.resultKey !== "string") {
        return invalidRequest("invalid_cache_flight_request");
      }
      try {
        return jsonResponse({ status: cacheLedger.complete(body.cacheKey, body.flightId, body.resultKey) ? "completed" : "stale" });
      } catch {
        return invalidRequest("invalid_cache_flight_request");
      }
    }

    if (url.pathname === "/cache/flight/fail") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await readJson(request);
      if (!body || typeof body.cacheKey !== "string" || !validateCacheKey(body.cacheKey)
        || typeof body.flightId !== "string") {
        return invalidRequest("invalid_cache_flight_request");
      }
      try {
        return jsonResponse({ status: cacheLedger.fail(body.cacheKey, body.flightId) ? "released" : "stale" });
      } catch {
        return invalidRequest("invalid_cache_flight_request");
      }
    }

    if (url.pathname === "/cache/write-claim") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await readJson(request);
      if (!body || typeof body.providerDay !== "string") return invalidRequest("invalid_cache_write_claim");
      try {
        return jsonResponse(cacheLedger.claimWrite(body.providerDay));
      } catch {
        return invalidRequest("invalid_cache_write_claim");
      }
    }

    if (url.pathname === "/quota/health" || url.pathname === "/quota/diagnostics") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      try {
        return jsonResponse(ledger.diagnostics());
      } catch {
        return quotaInternalError("quota_diagnostics_unavailable");
      }
    }

    if (url.pathname === "/quota/expire") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const expired = ledger.expire();
      await this.scheduleAlarm(ledger);
      return jsonResponse({ status: "ok", expired });
    }

    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = await readJson(request);
    if (!body) return invalidRequest("invalid_json_body");

    if (url.pathname === "/quota/reserve") {
      const userId = stringField(body, "userId");
      const modelId = stringField(body, "modelId");
      const routeClass = stringField(body, "routeClass");
      const role = stringField(body, "role");
      const idempotencyKey = stringField(body, "idempotencyKey");
      const feature = stringField(body, "feature");
      const cacheStatus = body.cacheStatus === undefined ? "miss" : body.cacheStatus;
      if (!userId || !modelId || !routeClass || !role || !idempotencyKey || !feature
        || !oneOf(role, ["murid", "tutor", "admin"] as const)
        || !oneOf(cacheStatus, ["hit", "miss", "bypass"] as const)) {
        return invalidRequest("invalid_reserve_request");
      }

      const userHash = await hashUserId(userId);
      const input: ReserveInput = {
        idempotencyKey,
        userHash,
        role: role as QuotaRole,
        feature,
        routeClass: routeClass as ModelRouteClass,
        modelId: modelId as ModelId,
        cacheStatus: cacheStatus as CacheStatus
      };
      const result = ledger.reserve(input);
      await this.scheduleAlarm(ledger);
      if (result.status === "reserved") {
        await this.emitAnalytics("reserve", result.lease, result.lease.providerOutcomeCode ?? "RESERVED");
      }
      return jsonResponse(result, responseStatus(result));
    }

    if (url.pathname === "/quota/dispatch") {
      const leaseId = stringField(body, "leaseId");
      if (!leaseId) return invalidRequest("invalid_dispatch_request");
      const result = ledger.dispatch(leaseId);
      await this.scheduleAlarm(ledger);
      if (result.status === "updated") {
        await this.emitAnalytics("dispatch", result.lease, result.lease.providerOutcomeCode ?? "DISPATCHED");
      }
      return jsonResponse(result, responseStatus(result));
    }

    if (url.pathname === "/quota/commit") {
      const leaseId = stringField(body, "leaseId");
      const outcomeCode = stringField(body, "outcomeCode");
      const outcomeClass = body.outcomeClass;
      const latencyMs = body.latencyMs;
      if (!leaseId || !outcomeCode || !oneOf(outcomeClass, [
        "success",
        "provider_429",
        "provider_5xx",
        "provider_timeout",
        "provider_malformed",
        "application_validation",
        "unknown"
      ] as const) || (latencyMs !== undefined && typeof latencyMs !== "number")) {
        return invalidRequest("invalid_commit_request");
      }

      const input: CommitInput = {
        leaseId,
        providerAttemptId: optionalStringField(body, "providerAttemptId"),
        outcomeCode,
        outcomeClass: outcomeClass as ProviderOutcomeClass,
        latencyMs: latencyMs as number | undefined
      };
      const result = ledger.commit(input);
      await this.scheduleAlarm(ledger);
      if (result.status === "updated") {
        await this.emitAnalytics("commit", result.lease, result.lease.providerOutcomeCode ?? outcomeCode);
      }
      return jsonResponse(result, responseStatus(result));
    }

    if (url.pathname === "/quota/refund") {
      const leaseId = stringField(body, "leaseId");
      if (!leaseId) return invalidRequest("invalid_refund_request");
      const reason = optionalStringField(body, "reason") ?? "REFUNDED_BEFORE_DISPATCH";
      const result = ledger.refund(leaseId, reason);
      await this.scheduleAlarm(ledger);
      if (result.status === "updated") {
        await this.emitAnalytics("refund", result.lease, result.lease.providerOutcomeCode ?? reason);
      }
      return jsonResponse(result, responseStatus(result));
    }

    return notFound();
  }

  async alarm(): Promise<void> {
    const sql = sqlExecutor(this.ctx);
    ensureQuotaSchema(sql);
    const ledger = new QuotaLedger(sql);
    ledger.expire();
    await this.scheduleAlarm(ledger);
  }

  private async scheduleAlarm(ledger: QuotaLedger): Promise<void> {
    const nextExpiry = ledger.nextExpiryAt();
    if (nextExpiry === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(nextExpiry);
  }

  private async emitAnalytics(eventType: string, lease: LeaseSummary, outcomeCode: string): Promise<void> {
    if (!this.env.ZYRA_ANALYTICS) return;
    try {
      this.env.ZYRA_ANALYTICS.writeDataPoint({
        blobs: [eventType, lease.role, lease.feature, lease.modelId, lease.projectAlias, outcomeCode, lease.cacheStatus],
        indexes: [lease.modelId, lease.projectAlias, lease.role, eventType]
      });
    } catch {
      // Analytics failure must never roll back a valid quota transition.
    }
  }
}

function methodNotAllowed(allow: string): Response {
  return jsonResponse(safeError("method_not_allowed"), 405, { allow });
}

function utcProviderDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function cacheCoordinatorRequest(
  env: WorkerEnv,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Response> {
  if (!env.ZYRA_QUOTA_COORDINATOR) return cacheInternalError("cache_binding_unavailable");
  const request = new Request(`https://cache-coordinator.invalid${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    return await env.ZYRA_QUOTA_COORDINATOR.getByName("global").fetch(request);
  } catch {
    return cacheInternalError("cache_operation_failed");
  }
}

async function handleCacheRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/cache/diagnostics") {
    return cacheCoordinatorRequest(env, "/cache/diagnostics", "GET");
  }

  if (url.pathname === "/cache/flight/status") {
    return cacheCoordinatorRequest(env, `/cache/flight/status?cacheKey=${encodeURIComponent(url.searchParams.get("cacheKey") ?? "")}`, "GET");
  }

  if (url.pathname.startsWith("/cache/flight/") || url.pathname === "/cache/write-claim") {
    return cacheCoordinatorRequest(env, url.pathname, request.method as "GET" | "POST", request.method === "GET" ? undefined : await request.json().catch(() => null));
  }

  if (url.pathname === "/cache/get") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const cacheKey = url.searchParams.get("key");
    if (!cacheKey || !validateCacheKey(cacheKey)) return invalidRequest("invalid_cache_key");
    const kv = env.ZYX_KV ?? env.ZYX_STAGING_KV;
    if (!kv) return cacheInternalError("cache_binding_unavailable");
    try {
      const payload = await kv.get(cacheKey, "json") as unknown;
      if (payload === null || payload === undefined) return jsonResponse({ status: "miss", cacheKey });
      if (!validateCachePayload(payload)) return jsonResponse({ status: "miss", cacheKey, code: "CACHE_PAYLOAD_REJECTED" });
      return jsonResponse({ status: "hit", cacheKey, payload });
    } catch {
      return cacheInternalError("cache_operation_failed");
    }
  }

  if (url.pathname === "/cache/put") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const kv = env.ZYX_KV ?? env.ZYX_STAGING_KV;
    if (!kv) return cacheInternalError("cache_binding_unavailable");
    const body = await readJson(request);
    const ttlSeconds = body?.ttlSeconds;
    if (!body || typeof body.key !== "string" || !validateCacheKey(body.key)
      || !validateCachePayload(body.payload)
      || typeof ttlSeconds !== "number" || !Number.isInteger(ttlSeconds)
      || ttlSeconds < 60 || ttlSeconds > 60 * 60 * 24 * 30) {
      return invalidRequest("invalid_cache_put_request");
    }
    const claim = await cacheCoordinatorRequest(env, "/cache/write-claim", "POST", { providerDay: utcProviderDay() });
    if (!claim.ok) return cacheInternalError("cache_operation_failed");
    const claimBody = await claim.json().catch(() => null) as { accepted?: boolean; claimed?: number; remaining?: number } | null;
    if (!claimBody?.accepted) return jsonResponse({ status: "skipped", code: "CACHE_WRITE_BUDGET_EXHAUSTED", remaining: claimBody?.remaining ?? 0 }, 429);
    try {
      await kv.put(body.key, JSON.stringify(body.payload), { expirationTtl: ttlSeconds });
      return jsonResponse({ status: "stored", cacheKey: body.key, kvWrites: 1, remainingWrites: claimBody.remaining ?? 0 });
    } catch {
      return cacheInternalError("cache_operation_failed");
    }
  }

  if (url.pathname === "/cache/semantic/upsert") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (!env.ZYRA_SEMANTIC_CACHE) return cacheInternalError("cache_binding_unavailable");
    const body = await readJson(request);
    if (!body || typeof body.id !== "string" || !validateSemanticVector(body.values) || !validateSemanticMetadata(body.metadata)) {
      return invalidRequest("invalid_semantic_cache_upsert");
    }
    try {
      await env.ZYRA_SEMANTIC_CACHE.upsert([{ id: body.id, values: body.values, metadata: body.metadata }]);
      return jsonResponse({ status: "upserted", profileId: body.metadata.embeddingProfile, count: 1 });
    } catch {
      return cacheInternalError("cache_operation_failed");
    }
  }

  if (url.pathname === "/cache/semantic/query") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const semanticIndex = env.ZYRA_SEMANTIC_CACHE;
    if (!semanticIndex) return cacheInternalError("cache_binding_unavailable");
    const body = await readJson(request);
    const scope = body?.scope;
    if (!body || !validateSemanticVector(body.vector) || !scope || typeof scope !== "object" || Array.isArray(scope)
      || !validateSemanticMetadata({ cacheEntryId: "zyra:entry:v1:scope", ...scope, contentHash: (scope as Record<string, unknown>).contentHash ?? "" })) {
      return invalidRequest("invalid_semantic_cache_query");
    }
    const topK = typeof body.topK === "number" && Number.isInteger(body.topK) ? Math.min(50, Math.max(1, body.topK)) : 5;
    const scopeRecord = scope as Record<string, string>;
    const strictFilter = {
      embeddingProfile: "zyra-semantic-cache-v1",
      courseId: scopeRecord.courseId,
      ideaVersionHash: scopeRecord.ideaVersionHash,
      policyVersion: scopeRecord.policyVersion,
      language: scopeRecord.language,
      routeClass: scopeRecord.routeClass,
      assessmentMode: scopeRecord.assessmentMode,
      contentHash: scopeRecord.contentHash,
      responseSchemaVersion: scopeRecord.responseSchemaVersion,
    };
    const coarseFilter = { courseId: scopeRecord.courseId };
    const query = (filter: Record<string, string>, queryTopK: number) => semanticIndex.query(body.vector as number[], {
      topK: queryTopK,
      returnValues: false,
      returnMetadata: "all",
      filter,
    });
    try {
      let result = await query(strictFilter, topK);
      let filterMode: "strict" | "coarse_revalidated" = "strict";
      if (result.matches.length === 0) {
        result = await query(coarseFilter, Math.max(topK, 50));
        filterMode = "coarse_revalidated";
      }
      const rawMatchCount = result.matches.length;
      let invalidMetadataCount = 0;
      let scopeMismatchCount = 0;
      const scopeMismatchFields: Record<string, number> = {};
      const matches = result.matches.flatMap((match) => {
        if (!validateSemanticMetadata(match.metadata)) {
          invalidMetadataCount += 1;
          return [];
        }
        if (!semanticMetadataMatchesScope(match.metadata, scope as Omit<SemanticCacheMetadata, "cacheEntryId">)) {
          scopeMismatchCount += 1;
          for (const field of ["embeddingProfile", "courseId", "ideaVersionHash", "policyVersion", "language", "routeClass", "assessmentMode", "contentHash", "responseSchemaVersion"] as const) {
            if (match.metadata[field] !== (scope as Record<string, string>)[field]) {
              scopeMismatchFields[field] = (scopeMismatchFields[field] ?? 0) + 1;
            }
          }
          return [];
        }
        return [{ id: match.id, score: match.score, metadata: match.metadata }];
      });
      return jsonResponse({
        status: "ok",
        profileId: "zyra-semantic-cache-v1",
        matches,
        rawMatchCount,
        rejectedMetadataCount: rawMatchCount - matches.length,
        invalidMetadataCount,
        scopeMismatchCount,
        scopeMismatchFields,
        filterMode,
      });
    } catch {
      return cacheInternalError("cache_operation_failed");
    }
  }

  return notFound();
}

function unauthorized(): Response {
  return jsonResponse(safeError("unauthorized"), 401, {
    "www-authenticate": "Bearer"
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }

      return jsonResponse(buildHealthPayload(env));
    }

    if (!(await isAuthorizedRequest(request, env.ZYRA_CONTROL_PLANE_TOKEN))) {
      return unauthorized();
    }

    if (url.pathname.startsWith("/quota/")) {
      let namespace: WorkerEnv["ZYRA_QUOTA_COORDINATOR"];
      try {
        namespace = env.ZYRA_QUOTA_COORDINATOR;
      } catch {
        return quotaInternalError("quota_binding_unavailable");
      }
      if (!namespace) return jsonResponse(safeError("quota_binding_missing"), 503);
      try {
        const response = await namespace.getByName("global").fetch(request);
        if (response.status >= 500) {
          return quotaInternalError("quota_coordinator_invocation_failed");
        }
        return response;
      } catch {
        return quotaInternalError("quota_coordinator_invocation_failed");
      }
    }

    if (url.pathname.startsWith("/cache/")) {
      return handleCacheRequest(request, env);
    }

    return jsonResponse(safeError("not_found"), 404);
  }
} satisfies ExportedHandler<WorkerEnv>;
