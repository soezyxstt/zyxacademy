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

export type RequestLifecycleInput = {
  readonly userId: string;
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
    const route = getProviderRoutePlan({ ...input.route, useCase: input.route?.useCase ?? input.useCase });
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

    let controlPlaneLease: Extract<ControlPlaneReserveResult, { status: "reserved" | "idempotent" }>['lease'] | null = null;
    let selectedModel: ModelId | null = null;
    try {
      for (const model of route.models) {
        const reservation = await this.controlPlane.reserve({
          idempotencyKey: `${requestId}:${model}`,
          userId: input.userId,
          role: applicationAllowance.lease.peran,
          feature: input.feature,
          routeClass: controlPlaneRouteClass(model, route.routeClass),
          modelId: model,
          cacheStatus,
        });
        if (reservation.status === "reserved" || reservation.status === "idempotent") {
          controlPlaneLease = reservation.lease;
          selectedModel = model;
          break;
        }
      }
    } catch (error) {
      await this.allowance.refund(applicationAllowance.lease.id);
      throw error;
    }

    if (!controlPlaneLease || !selectedModel) {
      await this.allowance.refund(applicationAllowance.lease.id);
      throw new RequestLifecycleError("PROVIDER_CAPACITY_UNAVAILABLE", "no project-model capacity was available");
    }

    const attached = await this.allowance.attachControlPlaneLease(applicationAllowance.lease.id, controlPlaneLease.leaseId);
    if (!attached) {
      await this.controlPlane.refund(controlPlaneLease.leaseId, "APPLICATION_LEASE_ATTACH_FAILED");
      await this.allowance.refund(applicationAllowance.lease.id);
      throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "application and provider leases could not be linked");
    }

    try {
      assertTransition(await this.controlPlane.dispatch(controlPlaneLease.leaseId), "control-plane dispatch");
      const applicationDispatch = await this.allowance.markDispatched(applicationAllowance.lease.id);
      if (!applicationDispatch || applicationDispatch.status !== "dispatched") {
        throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "application allowance dispatch was rejected");
      }
    } catch (error) {
      await this.controlPlane.refund(controlPlaneLease.leaseId, "DISPATCH_FAILED_BEFORE_PROVIDER").catch(() => undefined);
      await this.allowance.refund(applicationAllowance.lease.id).catch(() => undefined);
      if (error instanceof RequestLifecycleError) throw error;
      throw new RequestLifecycleError("LIFECYCLE_PRE_DISPATCH_FAILURE", "lease dispatch failed", undefined, error);
    }

    const startedAt = Date.now();
    let providerResult: ProviderGenerationResult;
    try {
      providerResult = await this.dependencies.invokeProvider({
        requestId,
        userCohort: hashUserCohort(input.userId),
        feature: input.feature,
        routeClass: route.routeClass,
        modelId: selectedModel,
        projectAlias: controlPlaneLease.projectAlias,
        parts: input.parts,
        config: input.config,
        cachePolicy: input.cachePolicy,
        cacheKey: input.cacheKey,
        cacheTtlSeconds: input.cacheTtlSeconds,
      });
    } catch (error) {
      const classification = error instanceof ProviderAdapterError ? error.retryClassification : "unknown";
      const latencyMs = Date.now() - startedAt;
      await this.controlPlane.commit({
        leaseId: controlPlaneLease.leaseId,
        providerAttemptId: requestId,
        outcomeCode: safeOutcomeCode(error),
        outcomeClass: outcomeClass(classification),
        latencyMs,
      }).catch(() => undefined);
      await this.allowance.commit(applicationAllowance.lease.id, {
        model: selectedModel,
        inputTokens: 0,
        outputTokens: 0,
        requestType: "provider:failed",
      }).catch(() => undefined);
      throw new RequestLifecycleError("PROVIDER_REQUEST_FAILED", "provider request failed after dispatch", safeOutcomeCode(error), error);
    }

    const latencyMs = providerResult.latencyMs;
    try {
      assertTransition(await this.controlPlane.commit({
        leaseId: controlPlaneLease.leaseId,
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

    return {
      outcome: "provider_success",
      requestId,
      modelId: selectedModel,
      projectAlias: controlPlaneLease.projectAlias,
      routeClass: route.routeClass,
      result: providerResult,
    };
  }
}

export function modelDeadlineMs(modelId: ModelId): number {
  return getModelEntry(modelId).deadlineMs;
}
