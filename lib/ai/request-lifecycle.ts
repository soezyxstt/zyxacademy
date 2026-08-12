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
  }) => Promise<ProviderGenerationResult>;
  readonly requestIdFactory?: () => string;
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

function providerFailureAllowsFallback(error: unknown): boolean {
  if (!(error instanceof ProviderAdapterError)) return true;
  return !["invalid_request", "quarantined"].includes(error.retryClassification);
}

function assertTransition(result: ControlPlaneTransitionResult, expected: string): void {
  if (result.status === "rejected") {
    throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", `${expected} transition was rejected`, result.code);
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

export class RequestLifecycle {
  private readonly allowance: NonNullable<RequestLifecycleDependencies["allowance"]>;
  private readonly controlPlane: ControlPlaneClient;
  private readonly requestIdFactory: () => string;

  constructor(private readonly dependencies: RequestLifecycleDependencies) {
    this.allowance = dependencies.allowance ?? UsageBudgetService;
    this.controlPlane = dependencies.controlPlane ?? new ControlPlaneClient();
    this.requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  }

  async execute(input: RequestLifecycleInput): Promise<RequestLifecycleResult> {
    if (!input.userId || !input.feature || input.parts.length === 0) {
      throw new RequestLifecycleError("ROUTER_INPUT_INVALID", "provider lifecycle input is incomplete");
    }

    const requestId = input.idempotencyKey ?? this.requestIdFactory();
    const requestedRoute = getProviderRoutePlan({ ...input.route, useCase: input.route?.useCase ?? input.useCase });
    const hasImage = input.parts.some((part) => part.type === "image");
    const route = hasImage
      ? {
          ...requestedRoute,
          models: requestedRoute.models.filter((model) => getModelEntry(model).input.image),
          premium: true,
        }
      : requestedRoute;
    if (route.models.length === 0) {
      throw new RequestLifecycleError("PROVIDER_CAPACITY_UNAVAILABLE", "no multimodal model is available");
    }
    const cacheStatus = input.cacheStatus ?? "miss";

    if (input.cacheLookup) {
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

    let applicationDispatched = applicationAllowance.lease.status === "dispatched";
    let providerResult: ProviderGenerationResult | null = null;
    let selectedModel: ModelId | null = null;
    let selectedProjectAlias: string | null = null;
    let selectedControlPlaneLeaseId: string | null = null;
    let lastProviderError: unknown = null;

    for (const model of route.models) {
      let controlPlaneLease: Extract<ControlPlaneReserveResult, { status: "reserved" | "idempotent" }>['lease'] | null = null;
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
        if (reservation.status !== "reserved" && reservation.status !== "idempotent") continue;
        controlPlaneLease = reservation.lease;

        const attached = await this.allowance.attachControlPlaneLease(
          applicationAllowance.lease.id,
          controlPlaneLease.leaseId,
        );
        if (!attached) {
          await this.controlPlane.refund(controlPlaneLease.leaseId, "APPLICATION_LEASE_ATTACH_FAILED");
          throw new RequestLifecycleError(
            "LIFECYCLE_PRE_DISPATCH_FAILURE",
            "application and provider leases could not be linked",
          );
        }

        assertTransition(await this.controlPlane.dispatch(controlPlaneLease.leaseId), "control-plane dispatch");
        if (!applicationDispatched) {
          const applicationDispatch = await this.allowance.markDispatched(applicationAllowance.lease.id);
          if (!applicationDispatch || applicationDispatch.status !== "dispatched") {
            throw new RequestLifecycleError(
              "LIFECYCLE_PRE_DISPATCH_FAILURE",
              "application allowance dispatch was rejected",
            );
          }
          applicationDispatched = true;
        }
      } catch (error) {
        if (controlPlaneLease) {
          await this.controlPlane.refund(controlPlaneLease.leaseId, "DISPATCH_FAILED_BEFORE_PROVIDER").catch(() => undefined);
        }
        await this.allowance.refund(applicationAllowance.lease.id).catch(() => undefined);
        if (error instanceof RequestLifecycleError) throw error;
        throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "lease dispatch failed", undefined, error);
      }

      const startedAt = Date.now();
      try {
        providerResult = await this.dependencies.invokeProvider({
          requestId: `${requestId}:${model}`,
          userCohort: hashUserCohort(input.userId),
          feature: input.feature,
          routeClass: route.routeClass,
          modelId: model,
          projectAlias: controlPlaneLease.projectAlias,
          parts: input.parts,
          config: input.config,
          cachePolicy: input.cachePolicy,
          cacheKey: input.cacheKey,
          cacheTtlSeconds: input.cacheTtlSeconds,
        });
        selectedModel = model;
        selectedProjectAlias = controlPlaneLease.projectAlias;
        selectedControlPlaneLeaseId = controlPlaneLease.leaseId;
        break;
      } catch (error) {
        lastProviderError = error;
        const classification = error instanceof ProviderAdapterError ? error.retryClassification : "unknown";
        const latencyMs = Date.now() - startedAt;
        await this.controlPlane.commit({
          leaseId: controlPlaneLease.leaseId,
          providerAttemptId: `${requestId}:${model}`,
          outcomeCode: safeOutcomeCode(error),
          outcomeClass: outcomeClass(classification),
          latencyMs,
        }).catch(() => undefined);
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
        if (!providerFailureAllowsFallback(error)) break;
      }
    }

    if (!providerResult || !selectedModel || !selectedProjectAlias || !selectedControlPlaneLeaseId) {
      await this.allowance.refund(applicationAllowance.lease.id).catch(() => undefined);
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
      }), "control-plane commit");
      const applicationCommit = await this.allowance.commit(applicationAllowance.lease.id, {
        model: selectedModel,
        inputTokens: providerResult.usage?.promptTokens ?? 0,
        outputTokens: providerResult.usage?.outputTokens ?? 0,
        requestType: "provider:success",
      });
      if (!applicationCommit || !["committed"].includes(applicationCommit.status)) {
        throw new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "application allowance commit was rejected");
      }
    } catch (error) {
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
      resultCode: "PROVIDER_SUCCESS",
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
