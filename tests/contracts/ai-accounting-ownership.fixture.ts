import { afterAll, afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { RequestLifecycleDependencies } from "@/lib/ai/request-lifecycle";
import type { ControlPlaneClient } from "@/lib/ai/control-plane-client";

const fixtureEnvKeys = ["DATABASE_URL", "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN", "ZYRA_CONTROL_PLANE_URL", "ZYRA_CONTROL_PLANE_TOKEN", "MOCK_GEMINI", "SKIP_ENV_VALIDATION"];
const originalEnv = Object.fromEntries(fixtureEnvKeys.map((key) => [key, process.env[key]]));
for (const key of fixtureEnvKeys) delete process.env[key];
process.env.SKIP_ENV_VALIDATION = "1";

const dialect = new PgDialect();
const leases = new Map<string, Record<string, any>>();
const usageEvents = new Map<string, Record<string, any>>();
const db = {
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: (condition: any) => ({
    returning: async () => {
      const [id, ...statuses] = dialect.sqlToQuery(condition).params;
      const row = leases.get(String(id));
      if (!row || !statuses.includes(row.status)) return [];
      Object.assign(row, values);
      return [{ status: row.status }];
    },
  }) }) }),
  select: () => ({ from: () => ({ where: (condition: any) => ({
    limit: async () => {
      const [id] = dialect.sqlToQuery(condition).params;
      const row = leases.get(String(id));
      return row ? [{ ...row }] : [];
    },
  }) }) }),
  insert: () => ({ values: async (event: Record<string, any>) => { usageEvents.set(event.id, event); } }),
};
mock.module("@/db", () => ({ db }));
mock.module("@/lib/zyra/ops/telemetry", () => ({
  recordZyraOperationalEventSafe: async () => {},
  zyraLatencyBucket: () => "unknown",
  zyraOperationalFingerprint: () => "fixture",
  zyraSizeBucket: () => "unknown",
}));

const { UsageBudgetService } = await import("@/lib/usage-budget-service");
const { RequestLifecycle, RequestLifecycleError } = await import("@/lib/ai/request-lifecycle");
const { ProviderAdapterError } = await import("@/lib/ai/provider/errors");
const gemini = await import("@/lib/gemini");
const generateAdapter = await import("@/lib/ai/provider/gemini-generate-adapter");
const interactionsAdapter = await import("@/lib/ai/provider/gemini-interactions-adapter");
const { PromptExecutor } = await import("@/lib/prompt-executor");

afterEach(() => {
  mock.restore();
  delete process.env.MOCK_GEMINI;
  delete process.env.ZYRA_CONTROL_PLANE_URL;
  delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
});
afterAll(() => {
  for (const key of fixtureEnvKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function lease(status: "reserved" | "dispatched" | "committed" | "refunded" = "reserved") {
  return {
    id: "lease-1", userId: "user-1", peran: "murid" as const, feature: "test", appDay: "2026-11-16",
    units: 1, premium: false, status, controlPlaneLeaseId: null, createdAt: new Date(1), expiresAt: new Date(2),
  };
}
const remaining = { providerTurns: 14, totalInteractions: 44, premiumTurns: 14 };
const providerResult = { modelId: "gemini-2.5-flash", text: '{"answer":"ok"}', finishReason: "STOP", latencyMs: 1, retryClassification: "none" as const };

function insertLease(id: string) {
  leases.set(id, { ...lease(), id, accessTier: "standard", model: null, requestType: "provider", inputTokens: 0, outputTokens: 0 });
}

function controlLease(id: string) {
  return {
    leaseId: id, idempotencyKey: id, role: "murid", feature: "test", routeClass: "default",
    modelId: "gemini-2.5-flash", projectAlias: "project-1", state: "reserved", providerDay: "2026-11-16",
    appDay: "2026-11-16", cacheStatus: "miss", createdAtMs: 1, expiresAtMs: 2, terminalAtMs: null, providerOutcomeCode: null,
  };
}

function lifecycleFixture() {
  const events: string[] = [];
  let reservationCount = 0;
  const allowance = {
    reserve: async () => ({ accepted: true as const, idempotent: false, lease: lease(), remaining }),
    recordCacheHit: async () => ({ accepted: true as const, idempotent: false, lease: lease("committed"), remaining }),
    markDispatched: async () => ({ leaseId: "lease-1", status: "dispatched" as const, changed: true }),
    attachControlPlaneLease: async () => true,
    commit: async () => ({ leaseId: "lease-1", status: "committed" as const, changed: true }),
    refund: async () => { events.push("app.refund"); return { leaseId: "lease-1", status: "refunded" as const, changed: true }; },
  };
  const controlPlane = {
    reserve: async () => ({ status: "reserved" as const, lease: controlLease(`cp-${++reservationCount}`) }),
    dispatch: async () => ({ status: "updated" as const, lease: controlLease("cp") }),
    commit: async ({ leaseId, outcomeCode }: { leaseId: string; outcomeCode: string }) => ({
      status: "updated" as const, lease: { ...controlLease(leaseId), state: "committed", providerOutcomeCode: outcomeCode },
    }),
    refund: async (leaseId: string) => { events.push("cp.refund"); return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "refunded" } }; },
  };
  const dependencies = {
    allowance: allowance as RequestLifecycleDependencies["allowance"],
    controlPlane: controlPlane as unknown as ControlPlaneClient,
    invokeProvider: async () => { events.push("provider"); return providerResult; },
    resolveModelChain: async (_input: unknown, defaults: readonly string[]) => defaults,
  } as RequestLifecycleDependencies;
  return { events, allowance, controlPlane, dependencies };
}

function settlementFixture(id: string) {
  insertLease(id);
  const events: string[] = [];
  const state = {
    reservations: 0,
    refund: "ok" as "ok" | "reject" | "throw" | "throw_after" | "wrong_lease",
    appCommit: "ok" as "ok" | "reject" | "throw" | "wrong_lease",
    dispatchWrongLease: false,
    controlRefund: "ok" as "ok" | "reject" | "throw" | "wrong_lease" | "wrong_state",
    controlCommit: "ok" as "ok" | "reject" | "throw" | "other_outcome" | "wrong_lease" | "wrong_state" | "wrong_outcome" | "idempotent_match",
    reserveFailureAt: 0,
  };
  let reserved = false;
  const allowance = {
    reserve: async () => {
      events.push("app.reserve");
      const status = leases.get(id)!.status as "reserved" | "dispatched" | "committed" | "refunded";
      if (reserved && status === "refunded") return { accepted: false as const, reason: "IDEMPOTENCY_CONFLICT" as const };
      const idempotent = reserved;
      reserved = true;
      return { accepted: true as const, idempotent, lease: { ...lease(status), id }, remaining };
    },
    markDispatched: async () => {
      events.push("app.dispatch");
      if (state.dispatchWrongLease) return { leaseId: "other", status: "dispatched" as const, changed: true };
      return UsageBudgetService.markDispatched(id);
    },
    attachControlPlaneLease: async () => true,
    commit: async () => {
      events.push("app.commit");
      if (state.appCommit === "throw") throw new Error("commit outcome unknown");
      if (state.appCommit === "reject") return { leaseId: id, status: "dispatched" as const, changed: false };
      if (state.appCommit === "wrong_lease") return { leaseId: "other", status: "committed" as const, changed: true };
      return UsageBudgetService.commit(id);
    },
    refund: async () => {
      events.push("app.refund");
      if (state.refund === "throw") throw new Error("refund failed");
      if (state.refund === "reject") return { leaseId: id, status: "dispatched" as const, changed: false };
      if (state.refund === "wrong_lease") return { leaseId: "other", status: "refunded" as const, changed: true };
      if (state.refund === "throw_after") { await UsageBudgetService.refund(id); throw new Error("refund response lost"); }
      return UsageBudgetService.refund(id);
    },
    recordCacheHit: async () => { throw new Error("unexpected cache hit"); },
  };
  const controlPlane = {
    reserve: async ({ modelId }: { modelId: string }) => {
      events.push(`cp.reserve:${modelId}`);
      if (++state.reservations === state.reserveFailureAt) throw new Error("reservation outcome unknown");
      return { status: "reserved" as const, lease: { ...controlLease(`cp-${modelId}`), modelId } };
    },
    dispatch: async () => ({ status: "updated" as const, lease: controlLease("cp") }),
    commit: async ({ leaseId, outcomeCode }: { leaseId: string; outcomeCode: string }) => {
      events.push(`cp.commit:${leaseId}:${outcomeCode}`);
      if (state.controlCommit === "throw") throw new Error("commit outcome unknown");
      if (state.controlCommit === "reject") return { status: "rejected" as const, code: "REJECTED" };
      if (state.controlCommit === "other_outcome") {
        return { status: "idempotent" as const, lease: { ...controlLease(leaseId), state: "committed", providerOutcomeCode: "PROVIDER_SUCCESS" } };
      }
      if (state.controlCommit === "wrong_lease") return { status: "updated" as const, lease: { ...controlLease("other"), state: "committed", providerOutcomeCode: outcomeCode } };
      if (state.controlCommit === "wrong_state") return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "dispatched", providerOutcomeCode: outcomeCode } };
      if (state.controlCommit === "wrong_outcome") return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "committed", providerOutcomeCode: "PROVIDER_SUCCESS" } };
      if (state.controlCommit === "idempotent_match") return { status: "idempotent" as const, lease: { ...controlLease(leaseId), state: "committed", providerOutcomeCode: outcomeCode } };
      return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "committed", providerOutcomeCode: outcomeCode } };
    },
    refund: async (leaseId: string) => {
      events.push(`cp.refund:${leaseId}`);
      if (state.controlRefund === "throw") throw new Error("refund outcome unknown");
      if (state.controlRefund === "reject") return { status: "rejected" as const, code: "REJECTED" };
      if (state.controlRefund === "wrong_lease") return { status: "updated" as const, lease: { ...controlLease("other"), state: "refunded" } };
      if (state.controlRefund === "wrong_state") return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "reserved" } };
      return { status: "updated" as const, lease: { ...controlLease(leaseId), state: "refunded" } };
    },
  };
  const dependencies = {
    allowance: allowance as RequestLifecycleDependencies["allowance"],
    controlPlane: controlPlane as unknown as ControlPlaneClient,
    resolveModelChain: async () => ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    invokeProvider: async () => { throw new Error("set a fake provider"); },
  } as RequestLifecycleDependencies;
  const input = { userId: "user-1", feature: `settlement-${id}`, idempotencyKey: id, parts: [{ type: "text" as const, text: "hi" }] };
  return { events, state, dependencies, input };
}

function httpFailure(status: number) {
  return new ProviderAdapterError({
    code: status === 429 ? "PROVIDER_RATE_LIMITED" : status >= 500 ? "PROVIDER_TRANSIENT" : "PROVIDER_ERROR",
    message: "fake HTTP failure",
    retryClassification: status === 429 ? "rate_limited" : status >= 500 ? "transient" : "invalid_request",
    httpStatus: status,
  });
}

describe("application allowance settlement after provider failure", () => {
  it("refunds one application lease after exhausted 429 and 503 attempts are committed", async () => {
    const fixture = settlementFixture("exhausted-http");
    let calls = 0;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => {
      fixture.events.push("provider");
      throw httpFailure(++calls === 1 ? 429 : 503);
    } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED", reason: "PROVIDER_TRANSIENT" });
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("refunded");
    expect(fixture.events.filter((event) => event === "app.reserve")).toHaveLength(1);
    expect(fixture.events.filter((event) => event === "app.dispatch")).toHaveLength(1);
    expect(fixture.events.filter((event) => event.startsWith("cp.commit:"))).toHaveLength(2);
    expect(fixture.events.filter((event) => event.startsWith("cp.refund:"))).toHaveLength(0);
    expect(fixture.events.filter((event) => event === "app.refund")).toHaveLength(1);
    expect(fixture.events).not.toContain("app.commit");
  });

  for (const status of [400, 429, 503]) {
    it(`settles HTTP ${status} without fallback in single-dispatch mode`, async () => {
      const fixture = settlementFixture(`single-http-${status}`);
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); throw httpFailure(status); } });
      const input = { ...fixture.input, singleDispatch: true };
      await expect(lifecycle.execute(input)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED" });
      expect(leases.get(input.idempotencyKey)?.status).toBe("refunded");
      expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
      expect(fixture.events.filter((event) => event.startsWith("cp.commit:"))).toHaveLength(1);
      expect(fixture.events.filter((event) => event.startsWith("cp.refund:"))).toHaveLength(0);
      await expect(lifecycle.execute(input)).rejects.toMatchObject({ code: "ALLOWANCE_REJECTED", reason: "IDEMPOTENCY_CONFLICT" });
      expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
      expect(fixture.events.filter((event) => event === "app.refund")).toHaveLength(1);
    });
  }

  it("does not fall back on a terminal non-retryable HTTP response", async () => {
    const fixture = settlementFixture("http-400");
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); throw httpFailure(400); } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED", reason: "PROVIDER_ERROR" });
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("refunded");
  });

  it("refunds the application after a recorded failure and a failed fallback preparation", async () => {
    const fixture = settlementFixture("fallback-preparation");
    let prepared = 0;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, prepareProvider: () => {
      if (++prepared === 2) throw new Error("missing client");
      return async () => { fixture.events.push("provider"); throw httpFailure(503); };
    } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED", reason: "PROVIDER_TRANSIENT" });
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
    expect(fixture.events.filter((event) => event.startsWith("cp.commit:"))).toHaveLength(1);
    expect(fixture.events.filter((event) => event.startsWith("cp.refund:"))).toHaveLength(1);
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("refunded");
  });

  for (const failure of ["reject", "throw", "wrong_lease", "wrong_state"] as const) {
    it(`retains the application lease when fallback control-plane refund returns ${failure}`, async () => {
      const fixture = settlementFixture(`fallback-cp-refund-${failure}`);
      fixture.state.controlRefund = failure;
      let prepared = 0;
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, prepareProvider: () => {
        if (++prepared === 2) throw new Error("missing client");
        return async () => { throw httpFailure(503); };
      } });
      await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
      expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
      expect(fixture.events).not.toContain("app.refund");
    });
  }

  it("reports an uncertain refund response without attempting the refund again", async () => {
    const fixture = settlementFixture("app-refund-response-lost");
    fixture.state.refund = "throw_after";
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); throw httpFailure(400); } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("refunded");
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "ALLOWANCE_REJECTED", reason: "IDEMPOTENCY_CONFLICT" });
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
    expect(fixture.events.filter((event) => event === "app.refund")).toHaveLength(1);
  });

  it("retains the application lease when a fallback reservation response is lost", async () => {
    const fixture = settlementFixture("fallback-reserve-unknown");
    fixture.state.reserveFailureAt = 2;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { throw httpFailure(503); } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
    expect(fixture.events).not.toContain("app.refund");
  });

  for (const failure of ["reject", "throw", "wrong_lease"] as const) {
    it(`reports reconciliation when the application refund ${failure}s`, async () => {
      const fixture = settlementFixture(`app-refund-${failure}`);
      fixture.state.refund = failure;
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { throw httpFailure(400); } });
      await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
      expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
      expect(fixture.events.filter((event) => event === "app.refund")).toHaveLength(1);
    });
  }

  for (const error of [
    new Error("network lost"),
    httpFailure(200),
    httpFailure(600),
    new ProviderAdapterError({ code: "REQUEST_TIMEOUT", message: "timeout", retryClassification: "timeout", httpStatus: 503 }),
  ]) {
    it(`retains an unconfirmed provider outcome: ${error.message}`, async () => {
      const fixture = settlementFixture(`unknown-${error.message}`);
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); throw error; } });
      await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_OUTCOME_UNCERTAIN" });
      expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
      expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
      expect(fixture.events).not.toContain("app.refund");
    });
  }

  it("stops after a malformed response before another billable attempt", async () => {
    const fixture = settlementFixture("malformed-then-http");
    let calls = 0;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => {
      if (++calls === 1) throw new ProviderAdapterError({ code: "MALFORMED_RESPONSE", message: "empty", retryClassification: "malformed_response" });
      return providerResult;
    } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_OUTCOME_UNCERTAIN", reason: "MALFORMED_RESPONSE" });
    expect(calls).toBe(1);
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
    expect(fixture.events).not.toContain("app.refund");
  });

  it("does not prepare a fallback after a malformed provider outcome", async () => {
    const fixture = settlementFixture("malformed-fallback-preparation");
    let prepared = 0;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, prepareProvider: () => {
      if (++prepared === 2) throw new Error("missing client");
      return async () => { throw new ProviderAdapterError({ code: "MALFORMED_RESPONSE", message: "empty", retryClassification: "malformed_response" }); };
    } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_OUTCOME_UNCERTAIN", reason: "MALFORMED_RESPONSE" });
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
    expect(prepared).toBe(1);
    expect(fixture.events.filter((event) => event.startsWith("cp.refund:"))).toHaveLength(0);
    expect(fixture.events).not.toContain("app.refund");
  });

  it("stops after an unknown fallback outcome even if an earlier failure was confirmed", async () => {
    const fixture = settlementFixture("http-then-unknown");
    let calls = 0;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => {
      if (++calls === 1) throw httpFailure(503);
      throw new Error("connection lost");
    } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_OUTCOME_UNCERTAIN" });
    expect(calls).toBe(2);
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
    expect(fixture.events).not.toContain("app.refund");
  });

  for (const failure of ["reject", "throw", "other_outcome", "wrong_lease", "wrong_state", "wrong_outcome"] as const) {
    it(`does not refund when provider attempt reconciliation returns ${failure}`, async () => {
      const fixture = settlementFixture(`cp-commit-${failure}`);
      fixture.state.controlCommit = failure;
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); throw httpFailure(503); } });
      await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
      expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
      expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
      expect(fixture.events).not.toContain("app.refund");
    });
  }

  it("accepts an idempotent commit only when it matches the same lease and outcome", async () => {
    const fixture = settlementFixture("cp-commit-idempotent-match");
    fixture.state.controlCommit = "idempotent_match";
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { throw httpFailure(400); } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED" });
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("refunded");
  });

  for (const failure of ["control", "app-reject", "app-throw", "app-wrong-lease"] as const) {
    it(`retains a successful provider response when ${failure} reconciliation fails`, async () => {
      const fixture = settlementFixture(`success-reconciliation-${failure}`);
      if (failure === "control") fixture.state.controlCommit = "throw";
      if (failure === "app-reject") fixture.state.appCommit = "reject";
      if (failure === "app-throw") fixture.state.appCommit = "throw";
      if (failure === "app-wrong-lease") fixture.state.appCommit = "wrong_lease";
      const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); return providerResult; } });
      await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
      expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
      expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("dispatched");
      expect(fixture.events).not.toContain("app.refund");
    });
  }

  it("does not call the provider when application dispatch identifies another lease", async () => {
    const fixture = settlementFixture("dispatch-wrong-lease");
    fixture.state.dispatchWrongLease = true;
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => { fixture.events.push("provider"); return providerResult; } });
    await expect(lifecycle.execute(fixture.input)).rejects.toMatchObject({ code: "LIFECYCLE_PRE_DISPATCH_FAILURE" });
    expect(fixture.events).not.toContain("provider");
    expect(fixture.events).not.toContain("app.refund");
    expect(leases.get(fixture.input.idempotencyKey)?.status).toBe("reserved");
  });

  it("shares a concurrent failed request without another provider call or refund", async () => {
    const fixture = settlementFixture("concurrent-failure");
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const lifecycle = new RequestLifecycle({ ...fixture.dependencies, invokeProvider: async () => {
      fixture.events.push("provider"); started(); await wait; throw httpFailure(400);
    } });
    const first = lifecycle.execute(fixture.input);
    await ready;
    const second = lifecycle.execute(fixture.input);
    release();
    const results = await Promise.allSettled([first, second]);
    expect(results.every((item) => item.status === "rejected" && item.reason.code === "PROVIDER_REQUEST_FAILED")).toBe(true);
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
    expect(fixture.events.filter((event) => event === "app.refund")).toHaveLength(1);
    expect(fixture.events.filter((event) => event.startsWith("cp.commit:"))).toHaveLength(1);
  });
});

describe("atomic allowance transitions", () => {
  it("reports exactly one winner for concurrent dispatch and terminal transitions", async () => {
    insertLease("race");
    const dispatches = await Promise.all(Array.from({ length: 12 }, () => UsageBudgetService.markDispatched("race")));
    expect(dispatches.filter((result) => result?.changed)).toHaveLength(1);
    expect(dispatches.every((result) => result?.status === "dispatched")).toBe(true);

    const commits = await Promise.all(Array.from({ length: 8 }, (_, index) => UsageBudgetService.commit("race", { model: `winner-${index}`, inputTokens: index })));
    expect(commits.filter((result) => result?.changed)).toHaveLength(1);
    expect(commits.every((result) => result?.status === "committed")).toBe(true);
    const beforeReplay = { ...leases.get("race") };
    expect(await UsageBudgetService.commit("race", { model: "replay", inputTokens: 999 })).toMatchObject({ status: "committed", changed: false });
    expect(await UsageBudgetService.refund("race")).toMatchObject({ status: "committed", changed: false });
    expect(leases.get("race")).toEqual(beforeReplay);
    expect([...usageEvents.keys()]).toEqual(["race"]);

    insertLease("refund-race");
    const refunds = await Promise.all(Array.from({ length: 6 }, () => UsageBudgetService.refund("refund-race")));
    expect(refunds.filter((result) => result?.changed)).toHaveLength(1);
    expect(refunds.every((result) => result?.status === "refunded")).toBe(true);
    expect(await UsageBudgetService.commit("refund-race", { model: "late" })).toMatchObject({ status: "refunded", changed: false });
    expect(await UsageBudgetService.markDispatched("missing")).toBeNull();
  });

  it("lets only the winning commit or refund set terminal metadata", async () => {
    for (const refundFirst of [false, true]) {
      const id = `terminal-race-${refundFirst}`;
      insertLease(id);
      const operations = refundFirst
        ? [UsageBudgetService.refund(id), UsageBudgetService.commit(id, { model: "committed-model" })]
        : [UsageBudgetService.commit(id, { model: "committed-model" }), UsageBudgetService.refund(id)];
      const transitions = await Promise.all(operations);
      expect(transitions.filter((result) => result?.changed)).toHaveLength(1);
      expect(leases.get(id)?.status).toBe(refundFirst ? "refunded" : "committed");
      expect(leases.get(id)?.model).toBe(refundFirst ? null : "committed-model");
      expect(usageEvents.has(id)).toBe(!refundFirst);
    }
  });
});

describe("provider lifecycle ownership", () => {
  it("lets only the dispatch winner call the provider and does not refund the loser's application lease", async () => {
    const fixture = lifecycleFixture();
    let claimed = false;
    fixture.allowance.markDispatched = async () => {
      const changed = !claimed;
      claimed = true;
      return { leaseId: "lease-1", status: "dispatched", changed };
    };
    const lifecycle = new RequestLifecycle(fixture.dependencies);
    const input = { userId: "user-1", feature: "race", idempotencyKey: "same-key", parts: [{ type: "text" as const, text: "one" }] };
    const results = await Promise.allSettled([lifecycle.execute(input), lifecycle.execute({ ...input, parts: [{ type: "text", text: "two" }] })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
    expect(fixture.events.filter((event) => event === "cp.refund")).toHaveLength(1);
    expect(fixture.events).not.toContain("app.refund");
  });

  it("rejects replayed application and provider leases without refunding them", async () => {
    for (const status of ["reserved", "dispatched", "committed"] as const) {
      const fixture = lifecycleFixture();
      fixture.allowance.reserve = async () => ({ accepted: true, idempotent: true, lease: lease(status), remaining });
      await expect(new RequestLifecycle(fixture.dependencies).execute({ userId: "user-1", feature: `replay-${status}`, idempotencyKey: status, parts: [{ type: "text", text: "hi" }] }))
        .rejects.toMatchObject({ code: status === "committed" ? "IDEMPOTENCY_REPLAY_UNAVAILABLE" : "IDEMPOTENCY_IN_PROGRESS" });
      expect(fixture.events).toEqual([]);
    }
    const fixture = lifecycleFixture();
    const controlPlane = { ...fixture.controlPlane, reserve: async () => ({ status: "idempotent", lease: controlLease("existing") }) } as unknown as ControlPlaneClient;
    await expect(new RequestLifecycle({ ...fixture.dependencies, controlPlane }).execute({ userId: "user-1", feature: "provider-replay", parts: [{ type: "text", text: "hi" }] }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });
    expect(fixture.events).toEqual([]);
  });

  it("stops before another model when an attempt cannot be reconciled", async () => {
    for (const commitMode of ["throw", "reject"] as const) {
      const fixture = lifecycleFixture();
      const invokeProvider = async () => {
        fixture.events.push("provider");
        throw new ProviderAdapterError({ code: "PROVIDER_TRANSIENT", message: "test", retryClassification: "transient" });
      };
      fixture.controlPlane.commit = async () => {
        if (commitMode === "throw") throw new Error("uncertain commit");
        return { status: "rejected", code: "MISSING" } as never;
      };
      await expect(new RequestLifecycle({ ...fixture.dependencies, invokeProvider }).execute({ userId: "user-1", feature: `uncertain-${commitMode}`, parts: [{ type: "text", text: "hi" }] }))
        .rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
      expect(fixture.events).toEqual(["provider"]);
    }
  });

  it("continues a reconciled model fallback under the same application dispatch", async () => {
    const fixture = lifecycleFixture();
    let calls = 0;
    const dispatch = spyOn(fixture.allowance, "markDispatched");
    const invokeProvider = async () => {
      if (++calls === 1) throw new ProviderAdapterError({ code: "PROVIDER_TRANSIENT", message: "test", retryClassification: "transient", httpStatus: 503 });
      return providerResult;
    };
    const output = await new RequestLifecycle({ ...fixture.dependencies, invokeProvider }).execute({ userId: "user-1", feature: "fallback", parts: [{ type: "text", text: "hi" }] });
    expect(output.outcome).toBe("provider_success");
    expect(calls).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("leaves another dispatch alone and refunds an owned pre-dispatch failure", async () => {
    const duplicate = lifecycleFixture();
    const controlPlane = { ...duplicate.controlPlane, dispatch: async () => ({ status: "idempotent", lease: controlLease("existing") }) } as unknown as ControlPlaneClient;
    await expect(new RequestLifecycle({ ...duplicate.dependencies, controlPlane }).execute({ userId: "user-1", feature: "duplicate-dispatch", parts: [{ type: "text", text: "hi" }] }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });
    expect(duplicate.events).toEqual([]);

    const owned = lifecycleFixture();
    owned.allowance.attachControlPlaneLease = async () => false;
    await expect(new RequestLifecycle(owned.dependencies).execute({ userId: "user-1", feature: "owned-attach-failure", parts: [{ type: "text", text: "hi" }] }))
      .rejects.toMatchObject({ code: "LIFECYCLE_PRE_DISPATCH_FAILURE" });
    expect(owned.events).toEqual(["cp.refund", "app.refund"]);
  });

  it("does not retry or refund after a successful provider response with uncertain commit", async () => {
    const fixture = lifecycleFixture();
    fixture.controlPlane.commit = async () => { throw new Error("uncertain commit"); };
    await expect(new RequestLifecycle(fixture.dependencies).execute({ userId: "user-1", feature: "success-uncertain", parts: [{ type: "text", text: "hi" }] }))
      .rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
    expect(fixture.events).toEqual(["provider"]);
  });

  it("deduplicates the same request in flight and replays its completed result", async () => {
    const fixture = lifecycleFixture();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const lifecycle = new RequestLifecycle({
      ...fixture.dependencies,
      invokeProvider: async () => { fixture.events.push("provider"); started(); await wait; return providerResult; },
    });
    const input = { userId: "user-1", feature: "inflight", idempotencyKey: "stable-key", parts: [{ type: "text" as const, text: "hi" }] };
    const first = lifecycle.execute(input);
    await ready;
    const second = lifecycle.execute(input);
    release();
    const result = await first;
    expect(await second).toEqual(result);
    expect(await lifecycle.execute(input)).toEqual(result);
    expect(fixture.events.filter((event) => event === "provider")).toHaveLength(1);
  });
});

function enableRouter() {
  process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1";
  process.env.ZYRA_CONTROL_PLANE_TOKEN = "local-test";
}

describe("Gemini lifecycle boundary", () => {
  it("propagates quota, reconciliation, and unexpected failures without entering the legacy keypool", async () => {
    enableRouter();
    const execute = spyOn(RequestLifecycle.prototype, "execute");
    const legacy = spyOn(gemini.geminiKeyPool, "getAllKeys").mockImplementation(() => { throw new Error("unexpected legacy path"); });
    for (const error of [
      new RequestLifecycleError("ALLOWANCE_REJECTED", "rejected", "PROVIDER_TURN_LIMIT"),
      new RequestLifecycleError("LIFECYCLE_RECONCILIATION_FAILURE", "uncertain"),
      new Error("unexpected lifecycle failure"),
    ]) {
      execute.mockRejectedValueOnce(error);
      await expect(gemini.generateContentWithFallback({ userId: "user-1", requestId: "same", contents: "hello" })).rejects.toBe(error);
    }
    expect(legacy).not.toHaveBeenCalled();
  });

  it("keeps the router-disabled legacy provider path available", async () => {
    const key = { id: "key-test", client: {}, clientGateway: null } as never;
    spyOn(gemini.geminiKeyPool, "getAllKeys").mockReturnValue([key]);
    spyOn(gemini.geminiKeyPool, "getBestKey").mockReturnValue(key);
    spyOn(gemini.geminiKeyPool, "markSuccess").mockImplementation(() => {});
    const generate = mock(async () => providerResult);
    spyOn(generateAdapter, "createGeminiGenerateAdapter").mockReturnValue({ generate } as never);
    spyOn(interactionsAdapter, "createGeminiInteractionsAdapter").mockReturnValue({ generate } as never);
    const result = await gemini.generateContentWithFallback({ contents: "hello" });
    expect(result.response.text).toBe(providerResult.text);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

const outputSchema = z.object({ answer: z.string() });
const promptContract = {
  stageId: "accounting-test", promptVersion: "1", policies: [], inputSchemaVersion: "1", outputSchemaVersion: "1",
  systemInstruction: "test", userPrompt: () => "test", maxAttempts: 1,
  structuredOutputMode: "legacy-fallback" as const,
};
const mockGeneration = { response: { text: '{"answer":"ok"}' }, modelUsed: "gemini-2.5-flash", viaGateway: false };
const runPrompt = (contract = promptContract) => PromptExecutor.run({
  userId: "user-1", contract, variables: {}, schema: outputSchema, idempotencyKey: "prompt-stable-key",
});

describe("PromptExecutor allowance ownership", () => {
  it("settles exhausted confirmed legacy HTTP failures and retains ambiguous outcomes", async () => {
    process.env.MOCK_GEMINI = "true";
    spyOn(UsageBudgetService, "reserve").mockResolvedValue({ accepted: true, idempotent: false, lease: lease(), remaining });
    spyOn(UsageBudgetService, "markDispatched").mockResolvedValue({ leaseId: "lease-1", status: "dispatched", changed: true });
    const refund = spyOn(UsageBudgetService, "refund").mockResolvedValue({ leaseId: "lease-1", status: "refunded", changed: true });
    const commit = spyOn(UsageBudgetService, "commit");
    const provider = spyOn(gemini, "generateContentWithFallback").mockRejectedValue(httpFailure(503));
    expect((await runPrompt()).outcome).toBe("provider_failure");
    expect(refund).toHaveBeenCalledWith("lease-1");
    refund.mockClear();
    provider.mockRejectedValue(new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "timeout"));
    expect((await runPrompt()).outcome).toBe("uncertain");
    expect(refund).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects active and terminal reservation replays without dispatch, refund, or commit", async () => {
    process.env.MOCK_GEMINI = "true";
    const reserve = spyOn(UsageBudgetService, "reserve");
    const dispatch = spyOn(UsageBudgetService, "markDispatched");
    const refund = spyOn(UsageBudgetService, "refund");
    const commit = spyOn(UsageBudgetService, "commit");
    const provider = spyOn(gemini, "generateContentWithFallback");
    for (const status of ["reserved", "dispatched", "committed"] as const) {
      reserve.mockResolvedValueOnce({ accepted: true, idempotent: true, lease: lease(status), remaining });
      const result = await runPrompt();
      expect(result.violationCodes).toContain(status === "committed" ? "IDEMPOTENCY_REPLAY_UNAVAILABLE" : "IDEMPOTENCY_IN_PROGRESS");
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("never refunds or commits an unsuccessful or uncertain dispatch", async () => {
    process.env.MOCK_GEMINI = "true";
    spyOn(UsageBudgetService, "reserve").mockResolvedValue({ accepted: true, idempotent: false, lease: lease(), remaining });
    const dispatch = spyOn(UsageBudgetService, "markDispatched")
      .mockResolvedValueOnce({ leaseId: "lease-1", status: "dispatched", changed: false })
      .mockRejectedValueOnce(new Error("uncertain dispatch"));
    const refund = spyOn(UsageBudgetService, "refund");
    const commit = spyOn(UsageBudgetService, "commit");
    const provider = spyOn(gemini, "generateContentWithFallback");
    expect((await runPrompt()).violationCodes).toContain("ALLOWANCE_DISPATCH_FAILURE");
    expect((await runPrompt()).violationCodes).toContain("ALLOWANCE_DISPATCH_FAILURE");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(refund).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("refunds a freshly owned reservation if prompt preparation fails", async () => {
    process.env.MOCK_GEMINI = "true";
    spyOn(UsageBudgetService, "reserve").mockResolvedValue({ accepted: true, idempotent: false, lease: lease(), remaining });
    const refund = spyOn(UsageBudgetService, "refund").mockResolvedValue({ leaseId: "lease-1", status: "refunded", changed: true });
    const provider = spyOn(gemini, "generateContentWithFallback");
    const result = await runPrompt({ ...promptContract, userPrompt: () => { throw new Error("invalid prompt"); } });
    expect(result.outcome).toBe("invalid_contract");
    expect(refund).toHaveBeenCalledWith("lease-1");
    expect(provider).not.toHaveBeenCalled();
  });

  it("dispatches only one concurrent prompt with the same reservation key", async () => {
    process.env.MOCK_GEMINI = "true";
    let reserved = false;
    spyOn(UsageBudgetService, "reserve").mockImplementation(async () => {
      const idempotent = reserved;
      reserved = true;
      return { accepted: true, idempotent, lease: lease(idempotent ? "dispatched" : "reserved"), remaining };
    });
    spyOn(UsageBudgetService, "markDispatched").mockResolvedValue({ leaseId: "lease-1", status: "dispatched", changed: true });
    spyOn(UsageBudgetService, "commit").mockResolvedValue({ leaseId: "lease-1", status: "committed", changed: true });
    const refund = spyOn(UsageBudgetService, "refund");
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const provider = spyOn(gemini, "generateContentWithFallback").mockImplementation(async () => {
      started();
      await wait;
      return mockGeneration;
    });
    const first = runPrompt();
    await ready;
    const replay = await runPrompt();
    release();
    expect((await first).success).toBe(true);
    expect(replay.violationCodes).toContain("IDEMPOTENCY_IN_PROGRESS");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });

  it("fails closed if a completed legacy provider call cannot be committed", async () => {
    process.env.MOCK_GEMINI = "true";
    spyOn(UsageBudgetService, "reserve").mockResolvedValue({ accepted: true, idempotent: false, lease: lease(), remaining });
    spyOn(UsageBudgetService, "markDispatched").mockResolvedValue({ leaseId: "lease-1", status: "dispatched", changed: true });
    spyOn(UsageBudgetService, "commit").mockResolvedValue({ leaseId: "lease-1", status: "refunded", changed: false });
    const refund = spyOn(UsageBudgetService, "refund");
    const provider = spyOn(gemini, "generateContentWithFallback").mockResolvedValue(mockGeneration);
    await expect(runPrompt()).rejects.toMatchObject({ code: "LIFECYCLE_RECONCILIATION_FAILURE" });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });

  it("uses one accounting owner across router-enabled and legacy configurations", async () => {
    process.env.MOCK_GEMINI = "true";
    const reserve = spyOn(UsageBudgetService, "reserve").mockResolvedValue({ accepted: true, idempotent: false, lease: lease(), remaining });
    const dispatch = spyOn(UsageBudgetService, "markDispatched").mockResolvedValue({ leaseId: "lease-1", status: "dispatched", changed: true });
    const commit = spyOn(UsageBudgetService, "commit").mockResolvedValue({ leaseId: "lease-1", status: "committed", changed: true });
    const usage = spyOn(UsageBudgetService, "recordUsage").mockResolvedValue(undefined);
    const provider = spyOn(gemini, "generateContentWithFallback").mockResolvedValue(mockGeneration);
    expect((await runPrompt()).success).toBe(true);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(usage).not.toHaveBeenCalled();

    enableRouter();
    expect((await runPrompt()).success).toBe(true);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(usage).not.toHaveBeenCalled();

    delete process.env.ZYRA_CONTROL_PLANE_URL;
    delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
    spyOn(UsageBudgetService, "isAllowanceEnabled").mockReturnValue(false);
    spyOn(UsageBudgetService, "canUseFeature").mockResolvedValue(true);
    expect((await runPrompt()).success).toBe(true);
    expect(usage).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(3);
  });

  it("does not report persistence and idempotency conflicts as exhausted quota", async () => {
    process.env.MOCK_GEMINI = "true";
    const reserve = spyOn(UsageBudgetService, "reserve");
    const provider = spyOn(gemini, "generateContentWithFallback");
    for (const reason of ["PERSISTENCE_FAILURE", "IDEMPOTENCY_CONFLICT"] as const) {
      reserve.mockResolvedValueOnce({ accepted: false, reason });
      const result = await runPrompt();
      expect(result.outcome).toBe("provider_failure");
      expect(result.violationCodes).toContain(`ALLOWANCE_${reason}`);
    }
    expect(provider).not.toHaveBeenCalled();
    enableRouter();
    provider.mockRejectedValueOnce(new RequestLifecycleError("ALLOWANCE_REJECTED", "rejected", "IDEMPOTENCY_CONFLICT"));
    expect((await runPrompt()).outcome).toBe("provider_failure");
    provider.mockRejectedValueOnce(new RequestLifecycleError("ALLOWANCE_REJECTED", "rejected", "PROVIDER_TURN_LIMIT"));
    expect((await runPrompt()).outcome).toBe("quota_exceeded");
    provider.mockRejectedValueOnce(new RequestLifecycleError("ALLOWANCE_REJECTED", "rejected", "UNKNOWN"));
    expect((await runPrompt()).outcome).toBe("provider_failure");
  });

  it("does not add a legacy usage event for a router-owned repair", async () => {
    process.env.MOCK_GEMINI = "true";
    enableRouter();
    const usage = spyOn(UsageBudgetService, "recordUsage").mockResolvedValue(undefined);
    const provider = spyOn(gemini, "generateContentWithFallback")
      .mockResolvedValueOnce({ ...mockGeneration, response: { text: "invalid" } })
      .mockResolvedValueOnce(mockGeneration);
    const result = await runPrompt({ ...promptContract, maxAttempts: 2 });
    expect(result.success).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[0][0].requestId).toBe("prompt-stable-key");
    expect(provider.mock.calls[1][0].requestId).toBe("prompt-stable-key:repair");
    expect(usage).not.toHaveBeenCalled();
  });

  it("retains an uncertain repair outcome without presenting deterministic success", async () => {
    process.env.MOCK_GEMINI = "true";
    enableRouter();
    const provider = spyOn(gemini, "generateContentWithFallback")
      .mockResolvedValueOnce({ ...mockGeneration, response: { text: "invalid" } })
      .mockRejectedValueOnce(new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "repair response lost"));
    const result = await runPrompt({ ...promptContract, maxAttempts: 2 });
    expect(result.success).toBe(false);
    expect(result.outcome).toBe("uncertain");
    expect(result.violationCodes).toContain("PROVIDER_OUTCOME_UNCERTAIN");
    expect(provider).toHaveBeenCalledTimes(2);
  });
});
