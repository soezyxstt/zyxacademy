import { modelFeature } from "./model-settings";
import { configuredModelChain } from "@/lib/ai/model-settings-store";
import { createHash, randomUUID } from "node:crypto";
import { UsageBudgetService, type AllowanceReserveResult } from "@/lib/usage-budget-service";
import {
  ControlPlaneClient,
  type ControlPlaneReserveResult,
  type ControlPlaneTransitionResult,
} from "@/lib/ai/control-plane-client";
import { getModelEntry, type ModelId, type ModelRouteClass } from "@/lib/ai/provider/model-registry";
import { ProviderAdapterError, type ProviderRetryClassification } from "@/lib/ai/provider/errors";
import { getProviderRoutePlan, type ProviderRouteRequest } from "@/lib/ai-router";
import type { ProviderGenerateRequest, ProviderGenerationResult } from "@/lib/ai/provider/provider-adapter";
import {
  recordZyraOperationalEventSafe,
  zyraLatencyBucket,
  zyraOperationalFingerprint,
  zyraSizeBucket,
} from "@/lib/zyra/ops/telemetry";

export type RequestLifecycleInput = {
  readonly userId: string;
  readonly courseId?: string;
  readonly feature: string;
  readonly idempotencyKey?: string;
  readonly parts: readonly ProviderGenerateRequest["parts"][number][];
  readonly config?: Readonly<Record<string, unknown>>;
  readonly route?: ProviderRouteRequest;
  readonly useCase?: string;
  readonly cacheStatus?: "miss" | "bypass";
  readonly cachePolicy?: "public_scaffold" | "personalized" | "active_assessment" | "bypass";
  readonly cacheKey?: string;
  readonly cacheTtlSeconds?: number;
  readonly cacheLookup?: () => Promise<ProviderGenerationResult | null>;
  readonly singleDispatch?: boolean;
};

export type RequestLifecycleResult = {
  readonly outcome: "provider_success" | "cache_hit";
  readonly requestId: string;
  readonly modelId: ModelId | "cache";
  readonly projectAlias: string | null;
  readonly routeClass: ModelRouteClass | "cache";
  readonly result: ProviderGenerationResult;
};

export type RequestLifecycleErrorCode =
  | "ROUTER_FEATURE_DISABLED"
  | "ROUTER_INPUT_INVALID"
  | "ALLOWANCE_REJECTED"
  | "PROVIDER_CAPACITY_UNAVAILABLE"
  | "PROVIDER_PROJECT_UNAVAILABLE"
  | "LIFECYCLE_PRE_DISPATCH_FAILURE"
  | "LIFECYCLE_RECONCILIATION_FAILURE"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_REPLAY_UNAVAILABLE"
  | "PROVIDER_OUTCOME_UNCERTAIN"
  | "PROVIDER_REQUEST_FAILED";

export class RequestLifecycleError extends Error {
  readonly code: RequestLifecycleErrorCode;
  readonly reason?: string;

  constructor(code: RequestLifecycleErrorCode, message: string, reason?: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RequestLifecycleError";
    this.code = code;
    this.reason = reason;
  }
}

export class ProviderNotDispatchedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ProviderNotDispatchedError";
  }
}

export type RequestLifecycleDependencies = {
  readonly allowance?: Pick<typeof UsageBudgetService, "reserve" | "attachControlPlaneLease" | "markDispatched" | "commit" | "refund" | "recordCacheHit">;
  readonly controlPlane?: ControlPlaneClient;
  readonly invokeProvider: (input: {
    readonly requestId: string;
    readonly userCohort: string;
    readonly feature: string;
    readonly routeClass: ModelRouteClass;
    readonly modelId: ModelId;
    readonly projectAlias: string;
    readonly parts: readonly ProviderGenerateRequest["parts"][number][];
    readonly config?: Readonly<Record<string, unknown>>;
    readonly cachePolicy?: RequestLifecycleInput["cachePolicy"];
    readonly cacheKey?: string;
    readonly cacheTtlSeconds?: number;
    readonly singleDispatch?: boolean;
  }) => Promise<ProviderGenerationResult>;
  // Preparation must not call the provider; the returned closure runs after dispatch.
  readonly prepareProvider?: (input: Parameters<RequestLifecycleDependencies["invokeProvider"]>[0]) => (() => Promise<ProviderGenerationResult>) | Promise<() => Promise<ProviderGenerationResult>>;
  readonly requestIdFactory?: () => string;
  readonly resolveModelChain?: typeof configuredModelChain;
};

function hashUserCohort(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

function outcomeClass(classification: ProviderRetryClassification): "provider_429" | "provider_5xx" | "provider_timeout" | "provider_malformed" | "unknown" {
  if (classification === "rate_limited") return "provider_429";
  if (classification === "timeout") return "provider_timeout";
  if (classification === "malformed_response") return "provider_malformed";
  if (classification === "transient") return "provider_5xx";
  return "unknown";
}

function safeOutcomeCode(error: unknown): string {
  if (error instanceof ProviderAdapterError) return error.code;
  if (error instanceof RequestLifecycleError) return error.code;
  return "PROVIDER_ERROR";
}

export function providerFailureAllowsFallback(error: unknown): boolean {
  if (!(error instanceof ProviderAdapterError)) return false;
  if (error.retryClassification === "malformed_response") return true;
  const status = error.httpStatus;
  return status !== undefined && (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500);
}

export function isConfirmedHttpFailure(error: unknown): boolean {
  if (!(error instanceof ProviderAdapterError) || error.retryClassification === "timeout" || error.retryClassification === "malformed_response") return false;
  const status = error.httpStatus;
  return status !== undefined && Number.isInteger(status) && status >= 400 && status <= 599;
}

function assertTransition(result: ControlPlaneTransitionResult, expected: string, outcomeCode: string, leaseId: string): void {
  if (result.status === "rejected") {
    throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", `${expected} transition was rejected`, result.code);
  }
  if (result.lease.leaseId !== leaseId || result.lease.state !== "committed" || result.lease.providerOutcomeCode !== outcomeCode) {
    throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", `${expected} transition did not match the provider outcome`);
  }
}

function allowanceRejected(result: AllowanceReserveResult): RequestLifecycleError {
  return new RequestLifecycleError(
    "ALLOWANCE_REJECTED",
    "application allowance rejected the request",
    result.accepted ? undefined : result.reason,
  );
}

function controlPlaneRouteClass(modelId: ModelId, requested: ModelRouteClass): ModelRouteClass {
  const entry = getModelEntry(modelId);
  if (entry.routeClasses.includes(requested)) return requested;
  const compatible = entry.routeClasses[0];
  if (compatible) return compatible;
  return requested;
}

function lifecycleRequestBytes(parts: readonly ProviderGenerateRequest["parts"][number][]): number {
  return parts.reduce((total, part) => {
    if (part.type === "text") return total + new TextEncoder().encode(part.text).byteLength;
    return total + Math.ceil(part.data.length * 0.75);
  }, 0);
}

function emitLifecycleEvent(input: {
  eventType: "cache_result" | "provider_attempt";
  actorRole: "admin" | "tutor" | "murid";
  courseId?: string;
  modelClass: string;
  projectAlias?: string | null;
  routeClass: string;
  resultCode: string;
  latencyMs?: number;
  sizeBytes: number;
  cacheResult: "none" | "hit" | "miss" | "bypass" | "error";
  attachmentCount: number;
}): void {
  void recordZyraOperationalEventSafe({
    version: "zyra-ops-event-v1",
    eventType: input.eventType,
    actorRole: input.actorRole,
    routeClass: input.routeClass.replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 64) || "unknown",
    modelClass: input.modelClass.replace(/[^a-z0-9._-]/gi, "_").slice(0, 96) || "unknown",
    projectFingerprint: input.projectAlias ? zyraOperationalFingerprint(input.projectAlias) : null,
    courseFingerprint: input.courseId ? zyraOperationalFingerprint(input.courseId) : null,
    resultCode: input.resultCode.replace(/[^A-Z0-9_.:-]/gi, "_").toUpperCase().slice(0, 96) || "UNKNOWN",
    latencyBucket: zyraLatencyBucket(input.latencyMs ?? -1),
    sizeBucket: zyraSizeBucket(input.sizeBytes),
    cacheResult: input.cacheResult,
    attachmentCount: input.attachmentCount,
    sanitizerVersion: input.attachmentCount > 0 ? "zyra-image-sanitizer-v1" : null,
  });
}

/**
 * A request key can be retried while the original request is still awaiting a
 * provider. Keep one in-process promise per authenticated request identity so
 * concurrent retries wait for the original result instead of dispatching a
 * second provider call. Keep a short-lived completed result as well, so a
 * client that retries after the response stream is interrupted receives the
 * answer that already consumed its allowance. The application lease remains
 * the cross-process guard; after this process forgets the result, replay is
 * rejected below instead of dispatching a second paid request.
 */
const IDEMPOTENCY_RESULT_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_RESULT_CACHE_MAX = 1024;
const inFlightRequests = new Map<string, Promise<RequestLifecycleResult>>();
const completedRequests = new Map<string, {
  result: RequestLifecycleResult;
  expiresAt: number;
}>();

function stableDedupeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableDedupeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableDedupeValue(item)]),
  );
}

function lifecycleInputFingerprint(input: RequestLifecycleInput): string {
  const serialized = JSON.stringify(stableDedupeValue({
    parts: input.parts,
    config: input.config ?? null,
    route: input.route ?? null,
    useCase: input.useCase ?? null,
    cacheStatus: input.cacheStatus ?? null,
    cachePolicy: input.cachePolicy ?? null,
    cacheKey: input.cacheKey ?? null,
    cacheTtlSeconds: input.cacheTtlSeconds ?? null,
    singleDispatch: input.singleDispatch ?? false,
  }));
  return createHash("sha256").update(serialized).digest("hex");
}

function rememberCompletedRequest(key: string, result: RequestLifecycleResult): void {
  const now = Date.now();
  for (const [existingKey, existing] of completedRequests) {
    if (existing.expiresAt <= now) completedRequests.delete(existingKey);
  }
  while (completedRequests.size >= IDEMPOTENCY_RESULT_CACHE_MAX) {
    const oldest = completedRequests.keys().next().value;
    if (oldest === undefined) break;
    completedRequests.delete(oldest);
  }
  completedRequests.set(key, {
    result,
    expiresAt: now + IDEMPOTENCY_RESULT_TTL_MS,
  });
}

function lifecycleDedupeKey(input: RequestLifecycleInput): string | null {
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) return null;
  return [input.userId, input.courseId ?? "", input.feature, idempotencyKey, lifecycleInputFingerprint(input)].join("\u0000");
}

export class RequestLifecycle {
  private readonly allowance: NonNullable<RequestLifecycleDependencies["allowance"]>;
  private readonly controlPlane: ControlPlaneClient;
  private readonly requestIdFactory: () => string;
  private readonly resolveModelChain: typeof configuredModelChain;

  constructor(private readonly dependencies: RequestLifecycleDependencies) {
    this.allowance = dependencies.allowance ?? UsageBudgetService;
    this.controlPlane = dependencies.controlPlane ?? new ControlPlaneClient();
    this.requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
    this.resolveModelChain = dependencies.resolveModelChain ?? configuredModelChain;
  }

  execute(input: RequestLifecycleInput): Promise<RequestLifecycleResult> {
    const dedupeKey = lifecycleDedupeKey(input);
    if (!dedupeKey) return this.executeOnce(input);

    const completed = completedRequests.get(dedupeKey);
    if (completed) {
      if (completed.expiresAt > Date.now()) return Promise.resolve(completed.result);
      completedRequests.delete(dedupeKey);
    }

    const inFlight = inFlightRequests.get(dedupeKey);
    if (inFlight) return inFlight;

    const execution = this.executeOnce(input);
    inFlightRequests.set(dedupeKey, execution);
    void execution.then(
      (result) => {
        if (inFlightRequests.get(dedupeKey) !== execution) return;
        inFlightRequests.delete(dedupeKey);
        rememberCompletedRequest(dedupeKey, result);
      },
      () => {
        if (inFlightRequests.get(dedupeKey) === execution) inFlightRequests.delete(dedupeKey);
      },
    );
    return execution;
  }

  private async executeOnce(input: RequestLifecycleInput): Promise<RequestLifecycleResult> {
    if (!input.userId || !input.feature || input.parts.length === 0 || (input.singleDispatch && !input.idempotencyKey?.trim())) {
      throw new RequestLifecycleError("ROUTER_INPUT_INVALID", "provider lifecycle input is incomplete");
    }

    const requestId = input.idempotencyKey?.trim() || this.requestIdFactory();
    const hasImage = input.parts.some((part) => part.type === "image");
    const isVisual = Boolean(hasImage || input.route?.visualMode || input.route?.multimodal);
    const defaultRoute = getProviderRoutePlan({
      ...input.route,
      useCase: input.route?.useCase ?? input.useCase,
      ...(hasImage ? { multimodal: true, visualMode: true } : {}),
    });
    const resolvedModels = await this.resolveModelChain(
      {
        feature: input.feature,
        useCase: input.route?.useCase ?? input.useCase,
        visual: isVisual,
      },
      defaultRoute.models,
    ).catch((error) => {
      throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "provider model selection failed", undefined, error);
    });
    const route = hasImage
      ? {
          ...defaultRoute,
          models: resolvedModels.filter((model) => getModelEntry(model).input.image),
          premium: true,
        }
      : {
          ...defaultRoute,
          models: resolvedModels,
        };
    if (route.models.length === 0) {
      throw new RequestLifecycleError("PROVIDER_CAPACITY_UNAVAILABLE", "no multimodal model is available");
    }
    const cacheStatus = input.singleDispatch ? "bypass" : input.cacheStatus ?? "miss";

    if (input.cacheLookup && !input.singleDispatch) {
      const cached = await input.cacheLookup();
      if (cached) {
        const cacheAllowance = await this.allowance.recordCacheHit({
          userId: input.userId,
          idempotencyKey: `${requestId}:cache`,
          feature: input.feature,
          model: cached.modelId,
          requestType: "cache:hit",
          runId: requestId,
        });
        if (!cacheAllowance.accepted) throw allowanceRejected(cacheAllowance);
        emitLifecycleEvent({
          eventType: "cache_result",
          actorRole: cacheAllowance.lease.peran,
          courseId: input.courseId,
          modelClass: "cache",
          routeClass: "cache",
          resultCode: "CACHE_HIT",
          sizeBytes: lifecycleRequestBytes(input.parts),
          cacheResult: "hit",
          attachmentCount: input.parts.filter((part) => part.type === "image").length,
        });
        return {
          outcome: "cache_hit",
          requestId,
          modelId: "cache",
          projectAlias: null,
          routeClass: "cache",
          result: cached,
        };
      }
    }

    const applicationAllowance = await this.allowance.reserve({
      userId: input.userId,
      idempotencyKey: requestId,
      feature: input.feature,
      model: route.models[0],
      premium: route.premium,
      mode: "provider",
      units: 1,
      requestType: "provider",
      runId: requestId,
    });
    if (!applicationAllowance.accepted) throw allowanceRejected(applicationAllowance);
    if (applicationAllowance.idempotent || applicationAllowance.lease.status !== "reserved") {
      const existingStatus = applicationAllowance.lease.status;
      if (existingStatus === "reserved" || existingStatus === "dispatched") {
        throw new RequestLifecycleError(
          "IDEMPOTENCY_IN_PROGRESS",
          "an identical provider request is already in progress",
          "IDEMPOTENCY_IN_PROGRESS",
        );
      }
      throw new RequestLifecycleError(
        "IDEMPOTENCY_REPLAY_UNAVAILABLE",
        "an identical provider result is no longer available for replay",
        "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      );
    }

    let applicationDispatched = false;
    let providerResult: ProviderGenerationResult | null = null;
    let selectedModel: ModelId | null = null;
    let selectedProjectAlias: string | null = null;
    let selectedControlPlaneLeaseId: string | null = null;
    let lastProviderError: unknown = null;
    let providerAttempted = false;

    for (const model of route.models) {
      let controlPlaneLease: Extract<ControlPlaneReserveResult, { status: "reserved" | "idempotent" }>['lease'] | null = null;
      let refundApplication = true;
      let reservationResolved = false;
      let invokePreparedProvider: (() => Promise<ProviderGenerationResult>) | undefined;
      try {
        const reservation = await this.controlPlane.reserve({
          idempotencyKey: `${requestId}:${model}`,
          userId: input.userId,
          role: applicationAllowance.lease.peran,
          feature: input.feature,
          routeClass: controlPlaneRouteClass(model, route.routeClass),
          modelId: model,
          cacheStatus,
        });
        reservationResolved = true;
        if (reservation.status === "idempotent") {
          refundApplication = false;
          throw new RequestLifecycleError("IDEMPOTENCY_IN_PROGRESS", "provider lease is already in use");
        }
        if (reservation.status !== "reserved") continue;
        controlPlaneLease = reservation.lease;

        const providerInput = {
          requestId: `${requestId}:${model}`,
          userCohort: hashUserCohort(input.userId),
          feature: getModelEntry(model).family === "chat-completions"
            ? modelFeature(input.feature, input.useCase) ?? input.feature : input.feature,
          routeClass: route.routeClass,
          modelId: model,
          projectAlias: controlPlaneLease.projectAlias,
          parts: input.parts,
          config: input.config,
          cachePolicy: input.cachePolicy,
          cacheKey: input.cacheKey,
          cacheTtlSeconds: input.cacheTtlSeconds,
          singleDispatch: input.singleDispatch,
        };
        invokePreparedProvider = await this.dependencies.prepareProvider?.(providerInput)
          ?? (() => this.dependencies.invokeProvider(providerInput));

        if (!applicationDispatched) {
          refundApplication = false;
          const applicationDispatch = await this.allowance.markDispatched(applicationAllowance.lease.id);
          if (!applicationDispatch || applicationDispatch.leaseId !== applicationAllowance.lease.id || applicationDispatch.status !== "dispatched" || !applicationDispatch.changed) {
            throw new RequestLifecycleError(
              "LIFECYCLE_PRE_DISPATCH_FAILURE",
              "application allowance dispatch was rejected",
            );
          }
          applicationDispatched = true;
          refundApplication = !providerAttempted;
        }

        const attached = await this.allowance.attachControlPlaneLease(
          applicationAllowance.lease.id,
          controlPlaneLease.leaseId,
        );
        if (!attached) {
          throw new RequestLifecycleError(
            "LIFECYCLE_PRE_DISPATCH_FAILURE",
            "application and provider leases could not be linked",
          );
        }

        const controlDispatch = await this.controlPlane.dispatch(controlPlaneLease.leaseId);
        if (controlDispatch.status === "idempotent") {
          controlPlaneLease = null;
          refundApplication = false;
          throw new RequestLifecycleError("IDEMPOTENCY_IN_PROGRESS", "provider lease was already dispatched");
        }
        if (controlDispatch.status === "rejected") {
          throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "provider lease dispatch was rejected", controlDispatch.code);
        }
      } catch (error) {
        let refundFailed = false;
        const isReplay = error instanceof RequestLifecycleError && error.code === "IDEMPOTENCY_IN_PROGRESS";
        if (controlPlaneLease) {
          try {
            const refund = await this.controlPlane.refund(controlPlaneLease.leaseId, "DISPATCH_FAILED_BEFORE_PROVIDER");
            if (refund.status === "rejected" || refund.lease.leaseId !== controlPlaneLease.leaseId || !["refunded", "expired_refunded"].includes(refund.lease.state)) refundFailed = true;
          } catch { refundFailed = true; }
        }
        if (error instanceof ProviderNotDispatchedError && controlPlaneLease && !refundFailed) continue;
        if (refundApplication && !isReplay && (!providerAttempted || (reservationResolved && !refundFailed))) {
          try {
            const refund = await this.allowance.refund(applicationAllowance.lease.id);
            if (!refund || refund.leaseId !== applicationAllowance.lease.id || refund.status !== "refunded") refundFailed = true;
          } catch { refundFailed = true; }
        }
        if (refundFailed) throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "pre-dispatch refund could not be reconciled", undefined, error);
        if (isReplay) throw error;
        if (providerAttempted && !reservationResolved) throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "provider fallback reservation could not be reconciled", undefined, error);
        if (providerAttempted) throw new RequestLifecycleError("PROVIDER_REQUEST_FAILED", "provider fallback could not be prepared", safeOutcomeCode(lastProviderError), error);
        if (error instanceof RequestLifecycleError) throw error;
        throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "lease dispatch failed", undefined, error);
      }

      const startedAt = Date.now();
      try {
        providerAttempted = true;
        providerResult = await invokePreparedProvider!();
        selectedModel = model;
        selectedProjectAlias = controlPlaneLease.projectAlias;
        selectedControlPlaneLeaseId = controlPlaneLease.leaseId;
        break;
      } catch (error) {
        lastProviderError = error;
        const classification = error instanceof ProviderAdapterError ? error.retryClassification : "unknown";
        const latencyMs = Date.now() - startedAt;
        try {
          assertTransition(await this.controlPlane.commit({
            leaseId: controlPlaneLease.leaseId,
            providerAttemptId: `${requestId}:${model}`,
            outcomeCode: safeOutcomeCode(error),
            outcomeClass: outcomeClass(classification),
            latencyMs,
          }), "control-plane attempt commit", safeOutcomeCode(error), controlPlaneLease.leaseId);
        } catch (commitError) {
          if (input.singleDispatch) throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider outcome requires reconciliation", undefined, commitError);
          if (commitError instanceof RequestLifecycleError) throw commitError;
          throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "provider attempt could not be reconciled", undefined, commitError);
        }
        emitLifecycleEvent({
          eventType: "provider_attempt",
          actorRole: applicationAllowance.lease.peran,
          courseId: input.courseId,
          modelClass: model,
          projectAlias: controlPlaneLease.projectAlias,
          routeClass: route.routeClass,
          resultCode: safeOutcomeCode(error),
          latencyMs,
          sizeBytes: lifecycleRequestBytes(input.parts),
          cacheResult: hasImage ? "bypass" : cacheStatus,
          attachmentCount: input.parts.filter((part) => part.type === "image").length,
        });
        if (!isConfirmedHttpFailure(error)) {
          throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider outcome requires reconciliation", safeOutcomeCode(error), error);
        }
        if (input.singleDispatch || !providerFailureAllowsFallback(error)) break;
      }
    }

    if (!providerResult || !selectedModel || !selectedProjectAlias || !selectedControlPlaneLeaseId) {
      const refund = await this.allowance.refund(applicationAllowance.lease.id).catch(() => null);
      if (!refund || refund.leaseId !== applicationAllowance.lease.id || refund.status !== "refunded") {
        throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "application allowance refund failed");
      }
      if (lastProviderError) {
        throw new RequestLifecycleError(
          "PROVIDER_REQUEST_FAILED",
          "all compatible provider attempts failed",
          safeOutcomeCode(lastProviderError),
          lastProviderError,
        );
      }
      throw new RequestLifecycleError("PROVIDER_CAPACITY_UNAVAILABLE", "no project-model capacity was available");
    }

    const latencyMs = providerResult.latencyMs;
    try {
      assertTransition(await this.controlPlane.commit({
        leaseId: selectedControlPlaneLeaseId,
        providerAttemptId: providerResult.providerRequestId ?? requestId,
        outcomeCode: "PROVIDER_SUCCESS",
        outcomeClass: "success",
        latencyMs,
      }), "control-plane commit", "PROVIDER_SUCCESS", selectedControlPlaneLeaseId);
      const applicationCommit = await this.allowance.commit(applicationAllowance.lease.id, {
        model: selectedModel,
        inputTokens: providerResult.usage?.promptTokens ?? 0,
        outputTokens: providerResult.usage?.outputTokens ?? 0,
        requestType: "provider:success",
      });
      if (!applicationCommit || applicationCommit.leaseId !== applicationAllowance.lease.id || applicationCommit.status !== "committed") {
        throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "application allowance commit was rejected");
      }
    } catch (error) {
      if (input.singleDispatch) throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider result requires reconciliation", undefined, error);
      if (error instanceof RequestLifecycleError) throw error;
      throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "provider and application ledgers diverged", undefined, error);
    }

    emitLifecycleEvent({
      eventType: "provider_attempt",
      actorRole: applicationAllowance.lease.peran,
      courseId: input.courseId,
      modelClass: selectedModel,
      projectAlias: selectedProjectAlias,
      routeClass: route.routeClass,
      resultCode: lastProviderError ? "PROVIDER_FALLBACK_SUCCESS" : "PROVIDER_SUCCESS",
      latencyMs,
      sizeBytes: lifecycleRequestBytes(input.parts),
      cacheResult: hasImage ? "bypass" : cacheStatus,
      attachmentCount: input.parts.filter((part) => part.type === "image").length,
    });

    return {
      outcome: "provider_success",
      requestId,
      modelId: selectedModel,
      projectAlias: selectedProjectAlias,
      routeClass: route.routeClass,
      result: providerResult,
    };
  }
}

export function modelDeadlineMs(modelId: ModelId): number {
  return getModelEntry(modelId).deadlineMs;
}
