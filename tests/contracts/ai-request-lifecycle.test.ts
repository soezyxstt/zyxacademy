import { describe, expect, it } from "bun:test";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import type { ProviderGenerationResult } from "@/lib/ai/provider/provider-adapter";
import { RequestLifecycle, type RequestLifecycleDependencies } from "@/lib/ai/request-lifecycle";

function appLease() {
  return {
    id: "aal-1",
    userId: "user-1",
    peran: "murid" as const,
    feature: "plan005-test",
    appDay: "2026-08-07",
    units: 1,
    premium: false,
    status: "reserved" as const,
    controlPlaneLeaseId: null,
    createdAt: new Date(1),
    expiresAt: new Date(2),
  };
}

function controlLease(modelId: string, routeClass: string, projectAlias = "gemini-project-1") {
  return {
    leaseId: `cp-${modelId}`,
    idempotencyKey: `request-1:${modelId}`,
    role: "murid" as const,
    feature: "plan005-test",
    routeClass,
    modelId,
    projectAlias,
    state: "reserved",
    providerDay: "2026-08-07",
    appDay: "2026-08-07",
    cacheStatus: "miss" as const,
    createdAtMs: 1,
    expiresAtMs: 2,
    terminalAtMs: null,
    providerOutcomeCode: null,
  };
}

function result(modelId: string): ProviderGenerationResult {
  return {
    modelId,
    text: "ok",
    finishReason: "STOP",
    latencyMs: 10,
    providerRequestId: "provider-request-1",
    retryClassification: "none",
  };
}

function dependencies(overrides: Partial<RequestLifecycleDependencies> = {}) {
  const events: string[] = [];
  const allowance = {
    reserve: async () => {
      events.push("allowance.reserve");
      return { accepted: true as const, idempotent: false, lease: appLease(), remaining: { providerTurns: 19, totalInteractions: 59, premiumTurns: 2 } };
    },
    recordCacheHit: async () => {
      events.push("allowance.cache");
      return { accepted: true as const, idempotent: false, lease: { ...appLease(), status: "committed" as const, units: 0 }, remaining: { providerTurns: 20, totalInteractions: 59, premiumTurns: 2 } };
    },
    attachControlPlaneLease: async () => { events.push("allowance.attach"); return true; },
    markDispatched: async () => { events.push("allowance.dispatch"); return { leaseId: "aal-1", status: "dispatched" as const, changed: true }; },
    commit: async () => { events.push("allowance.commit"); return { leaseId: "aal-1", status: "committed" as const, changed: true }; },
    refund: async () => { events.push("allowance.refund"); return { leaseId: "aal-1", status: "refunded" as const, changed: true }; },
  } as unknown as RequestLifecycleDependencies["allowance"];

  const controlPlane = {
    reserve: async (input: { modelId: string; routeClass: string }) => {
      events.push(`cp.reserve:${input.modelId}:${input.routeClass}`);
      if (input.modelId === "gemini-3.5-flash") return { status: "fallback_allowed" as const, code: "PREMIUM_EXHAUSTED_FALLBACK_ALLOWED", modelId: input.modelId };
      return { status: "reserved" as const, lease: controlLease(input.modelId, input.routeClass) };
    },
    dispatch: async () => { events.push("cp.dispatch"); return { status: "updated" as const, lease: controlLease("gemini-3.1-flash-lite", "default") }; },
    commit: async () => { events.push("cp.commit"); return { status: "updated" as const, lease: controlLease("gemini-3.1-flash-lite", "default") }; },
    refund: async () => { events.push("cp.refund"); return { status: "updated" as const, lease: controlLease("gemini-3.1-flash-lite", "default") }; },
  } as unknown as ControlPlaneClient;

  return {
    events,
    dependencies: {
      allowance,
      controlPlane,
      invokeProvider: async ({ modelId }: { modelId: "gemini-3.1-flash-lite" }) => {
        events.push(`provider:${modelId}`);
        return result(modelId);
      },
      requestIdFactory: () => "request-1",
      ...overrides,
    } as RequestLifecycleDependencies,
  };
}

describe("Plan 005 request lifecycle", () => {
  it("falls back before dispatch while keeping one application allowance", async () => {
    const fixture = dependencies();
    const lifecycle = new RequestLifecycle(fixture.dependencies);
    const output = await lifecycle.execute({
      userId: "user-1",
      feature: "plan005-test",
      idempotencyKey: "request-1",
      useCase: "mistake-feedback",
      parts: [{ type: "text", text: "Explain" }],
    });

    expect(output.modelId).toBe("gemini-3.1-flash-lite");
    expect(output.routeClass).toBe("premium-pedagogy");
    expect(fixture.events.filter((event) => event === "allowance.reserve")).toHaveLength(1);
    expect(fixture.events).toContain("cp.reserve:gemini-3.5-flash:premium-pedagogy");
    expect(fixture.events).toContain("cp.reserve:gemini-3.1-flash-lite:default");
    expect(fixture.events).toContain("provider:gemini-3.1-flash-lite");
  });

  it("records exact cache hits without a provider lease or provider call", async () => {
    const fixture = dependencies();
    const lifecycle = new RequestLifecycle(fixture.dependencies);
    const output = await lifecycle.execute({
      userId: "user-1",
      feature: "plan005-cache",
      idempotencyKey: "request-cache",
      parts: [{ type: "text", text: "Cached" }],
      cacheLookup: async () => result("gemini-3.1-flash-lite"),
    });

    expect(output.outcome).toBe("cache_hit");
    expect(fixture.events).toEqual(["allowance.cache"]);
  });

  it("commits a dispatched provider failure instead of double-sending", async () => {
    const fixture = dependencies({
      invokeProvider: async () => {
        fixture.events.push("provider:failure");
        throw new ProviderAdapterError({
          code: "PROVIDER_TRANSIENT",
          message: "masked",
          retryClassification: "transient",
        });
      },
    });
    const lifecycle = new RequestLifecycle(fixture.dependencies);

    await expect(lifecycle.execute({
      userId: "user-1",
      feature: "plan005-failure",
      idempotencyKey: "request-failure",
      parts: [{ type: "text", text: "Failure" }],
    })).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED", reason: "PROVIDER_TRANSIENT" });
    expect(fixture.events).toContain("cp.commit");
    expect(fixture.events).toContain("allowance.commit");
    expect(fixture.events).not.toContain("cp.refund");
  });
});
