import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelId, ModelRouteClass } from "@/lib/ai/provider/model-registry";

const leaseSchema = z.object({
  leaseId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  role: z.enum(["murid", "tutor", "admin"]),
  feature: z.string().min(1),
  routeClass: z.string().min(1),
  modelId: z.string().min(1),
  projectAlias: z.string().min(1),
  state: z.string().min(1),
  providerDay: z.string().min(1),
  appDay: z.string().min(1),
  cacheStatus: z.enum(["hit", "miss", "bypass"]),
  createdAtMs: z.number(),
  expiresAtMs: z.number(),
  terminalAtMs: z.number().nullable(),
  providerOutcomeCode: z.string().nullable(),
}).passthrough();

const reserveSchema = z.union([
  z.object({ status: z.enum(["reserved", "idempotent"]), lease: leaseSchema }),
  z.object({ status: z.enum(["fallback_allowed", "quota_exhausted"]), code: z.string(), modelId: z.string() }),
]);

const transitionSchema = z.union([
  z.object({ status: z.enum(["updated", "idempotent"]), lease: leaseSchema }),
  z.object({ status: z.literal("rejected"), code: z.string() }),
]);

const diagnosticsSchema = z.object({
  schemaVersion: z.string(),
  activeLeaseCount: z.number(),
  terminalLeaseCount: z.number(),
  counters: z.array(z.object({
    modelId: z.string(),
    projectAlias: z.string(),
    reservedCount: z.number(),
    committedCount: z.number(),
    minuteCount: z.number(),
  }).passthrough()),
  health: z.array(z.object({
    modelId: z.string(),
    projectAlias: z.string(),
    circuitState: z.string(),
    consecutiveFailures: z.number(),
    sampleCount: z.number(),
    failureCount: z.number(),
  }).passthrough()),
}).passthrough();

const cachePayloadSchema = z.record(z.string(), z.unknown());
const cacheGetSchema = z.union([
  z.object({ status: z.literal("hit"), cacheKey: z.string(), payload: cachePayloadSchema }),
  z.object({ status: z.literal("miss"), cacheKey: z.string() }),
]);
const cachePutSchema = z.object({
  status: z.enum(["stored", "skipped"]),
  cacheKey: z.string().optional(),
  kvWrites: z.number().optional(),
  remainingWrites: z.number().optional(),
  code: z.string().optional(),
}).passthrough();
const cacheFlightAcquireSchema = z.union([
  z.object({ status: z.literal("leader"), cacheKey: z.string(), flightId: z.string(), leaseMs: z.number() }),
  z.object({ status: z.literal("follower"), cacheKey: z.string(), retryAfterMs: z.number() }),
  z.object({ status: z.literal("completed"), cacheKey: z.string(), resultKey: z.string() }),
]);
const cacheFlightStatusSchema = z.union([
  z.object({ status: z.literal("running"), cacheKey: z.string(), retryAfterMs: z.number() }),
  z.object({ status: z.literal("completed"), cacheKey: z.string(), resultKey: z.string() }),
  z.object({ status: z.literal("missing"), cacheKey: z.string() }),
]);
const cacheDiagnosticsSchema = z.object({
  schemaVersion: z.literal("plan-006-v1"),
  runningFlights: z.number(),
  completedFlights: z.number(),
  writeBudget: z.array(z.object({ provider_day: z.string(), claimed_count: z.number(), updated_at_ms: z.number() })),
}).passthrough();

export type ControlPlaneReserveInput = {
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly role: "murid" | "tutor" | "admin";
  readonly feature: string;
  readonly routeClass: ModelRouteClass;
  readonly modelId: ModelId;
  readonly cacheStatus: "hit" | "miss" | "bypass";
};

export type ControlPlaneReserveResult = z.infer<typeof reserveSchema>;
export type ControlPlaneTransitionResult = z.infer<typeof transitionSchema>;
export type ControlPlaneDiagnostics = z.infer<typeof diagnosticsSchema>;
export type ControlPlaneCacheGetResult = z.infer<typeof cacheGetSchema>;
export type ControlPlaneCachePutResult = z.infer<typeof cachePutSchema>;
export type ControlPlaneCacheFlightAcquireResult = z.infer<typeof cacheFlightAcquireSchema>;
export type ControlPlaneCacheFlightStatus = z.infer<typeof cacheFlightStatusSchema>;
export type ControlPlaneCacheDiagnostics = z.infer<typeof cacheDiagnosticsSchema>;

export type ControlPlaneErrorCode =
  | "CONTROL_PLANE_CONFIGURATION_MISSING"
  | "CONTROL_PLANE_INVALID_URL"
  | "CONTROL_PLANE_TIMEOUT"
  | "CONTROL_PLANE_NETWORK_ERROR"
  | "CONTROL_PLANE_NON_JSON"
  | "CONTROL_PLANE_HTTP_ERROR"
  | "CONTROL_PLANE_INVALID_RESPONSE";

export class ControlPlaneClientError extends Error {
  readonly code: ControlPlaneErrorCode;
  readonly httpStatus?: number;

  constructor(code: ControlPlaneErrorCode, message: string, httpStatus?: number, cause?: unknown) {
    super(message, { cause });
    this.name = "ControlPlaneClientError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ControlPlaneClientOptions = {
  readonly baseUrl?: string;
  readonly token?: string;
  readonly deadlineMs?: number;
  readonly fetchImpl?: FetchLike;
  readonly requestIdFactory?: () => string;
};

function safeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new ControlPlaneClientError("CONTROL_PLANE_INVALID_URL", "control-plane URL is invalid", undefined, error);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ControlPlaneClientError("CONTROL_PLANE_INVALID_URL", "control-plane URL protocol is invalid");
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function safePathUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const relative = new URL(path, "https://control-plane.invalid");
  const prefix = base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}${relative.pathname}`;
  base.search = relative.search;
  base.hash = "";
  return base.toString();
}

export class ControlPlaneClient {
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;
  private readonly deadlineMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly requestIdFactory: () => string;

  constructor(options: ControlPlaneClientOptions = {}) {
    const configuredBaseUrl = options.baseUrl ?? process.env.ZYRA_CONTROL_PLANE_URL;
    this.baseUrl = configuredBaseUrl ? safeBaseUrl(configuredBaseUrl) : undefined;
    this.token = options.token ?? process.env.ZYRA_CONTROL_PLANE_TOKEN;
    this.deadlineMs = options.deadlineMs ?? 5_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestIdFactory = options.requestIdFactory ?? randomUUID;
  }

  async reserve(input: ControlPlaneReserveInput): Promise<ControlPlaneReserveResult> {
    return this.post("/quota/reserve", input, reserveSchema);
  }

  async dispatch(leaseId: string): Promise<ControlPlaneTransitionResult> {
    return this.post("/quota/dispatch", { leaseId }, transitionSchema);
  }

  async commit(input: {
    readonly leaseId: string;
    readonly providerAttemptId: string;
    readonly outcomeCode: string;
    readonly outcomeClass: "success" | "provider_429" | "provider_5xx" | "provider_timeout" | "provider_malformed" | "application_validation" | "unknown";
    readonly latencyMs?: number;
  }): Promise<ControlPlaneTransitionResult> {
    return this.post("/quota/commit", input, transitionSchema);
  }

  async refund(leaseId: string, reason: string): Promise<ControlPlaneTransitionResult> {
    return this.post("/quota/refund", { leaseId, reason }, transitionSchema);
  }

  async diagnostics(): Promise<ControlPlaneDiagnostics> {
    return this.request("/quota/diagnostics", { method: "GET" }, diagnosticsSchema);
  }

  async cacheGet(cacheKey: string): Promise<ControlPlaneCacheGetResult> {
    return this.request(`/cache/get?key=${encodeURIComponent(cacheKey)}`, { method: "GET" }, cacheGetSchema);
  }

  async cachePut(cacheKey: string, payload: Record<string, unknown>, ttlSeconds: number): Promise<ControlPlaneCachePutResult> {
    return this.post("/cache/put", { key: cacheKey, payload, ttlSeconds }, cachePutSchema);
  }

  async cacheFlightAcquire(cacheKey: string, leaderId: string, leaseMs = 10_000): Promise<ControlPlaneCacheFlightAcquireResult> {
    return this.post("/cache/flight/acquire", { cacheKey, leaderId, leaseMs }, cacheFlightAcquireSchema);
  }

  async cacheFlightStatus(cacheKey: string): Promise<ControlPlaneCacheFlightStatus> {
    return this.request(`/cache/flight/status?cacheKey=${encodeURIComponent(cacheKey)}`, { method: "GET" }, cacheFlightStatusSchema);
  }

  async cacheFlightComplete(cacheKey: string, flightId: string, resultKey: string): Promise<{ status: string }> {
    return this.post("/cache/flight/complete", { cacheKey, flightId, resultKey }, z.object({ status: z.string() }));
  }

  async cacheFlightFail(cacheKey: string, flightId: string): Promise<{ status: string }> {
    return this.post("/cache/flight/fail", { cacheKey, flightId }, z.object({ status: z.string() }));
  }

  async cacheDiagnostics(): Promise<ControlPlaneCacheDiagnostics> {
    return this.request("/cache/diagnostics", { method: "GET" }, cacheDiagnosticsSchema);
  }

  private async post<T extends z.ZodTypeAny>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }, schema);
  }

  private async request<T extends z.ZodTypeAny>(path: string, init: RequestInit, schema: T): Promise<z.infer<T>> {
    if (!this.baseUrl || !this.token) {
      throw new ControlPlaneClientError(
        "CONTROL_PLANE_CONFIGURATION_MISSING",
        "control-plane credentials are not configured",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.deadlineMs);
    const requestId = this.requestIdFactory();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(safePathUrl(this.baseUrl, path), {
          ...init,
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": requestId,
            ...(init.headers ?? {}),
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ControlPlaneClientError("CONTROL_PLANE_TIMEOUT", "control-plane request timed out", undefined, error);
        }
        throw new ControlPlaneClientError("CONTROL_PLANE_NETWORK_ERROR", "control-plane request failed", undefined, error);
      }

      const parsed: unknown = await response.json().catch(() => null);
      if (!parsed || typeof parsed !== "object") {
        throw new ControlPlaneClientError("CONTROL_PLANE_NON_JSON", "control-plane returned a non-JSON response", response.status);
      }
      if (!response.ok) {
        throw new ControlPlaneClientError("CONTROL_PLANE_HTTP_ERROR", "control-plane returned an HTTP error", response.status);
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new ControlPlaneClientError("CONTROL_PLANE_INVALID_RESPONSE", "control-plane response failed validation", response.status);
      }
      return result.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createControlPlaneClient(options: ControlPlaneClientOptions = {}): ControlPlaneClient {
  return new ControlPlaneClient(options);
}
