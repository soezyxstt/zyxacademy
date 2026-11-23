import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { z } from "zod";

const envKeys = ["DATABASE_URL", "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN", "ZYRA_CONTROL_PLANE_URL", "ZYRA_CONTROL_PLANE_TOKEN", "MOCK_GEMINI", "SKIP_ENV_VALIDATION"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
for (const key of envKeys) delete process.env[key];
process.env.DATABASE_URL = "postgresql://local:local@127.0.0.1:5432/dummy";
process.env.GEMINI_API_KEY = "fake-local-key";
process.env.CF_AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/google-ai-studio";
process.env.CF_AI_GATEWAY_TOKEN = "fake-local-gateway-token";
process.env.SKIP_ENV_VALIDATION = "1";

type Lease = { id: string; status: "reserved" | "dispatched" | "committed" | "refunded"; peran: "murid" };
const state: {
  leases: Map<string, Lease>; refunds: number; commits: number; providerCalls: number; controlReserves: number;
  capacityFirst: boolean; quota: boolean; provider: "fail" | "error" | "success" | "malformed" | "fail-once";
  failCommit: boolean; failControlCommit: boolean; failRefund: boolean; failControlRefund: boolean; denyCapacity: boolean; badConfig: boolean;
  controlDispatches: number; controlRefunds: number; controlCommits: number; projectAlias: string;
  providerStarted?: () => void; waitForProvider?: Promise<void>;
  models: string[] | null; requests: RequestInit[];
} = {} as any;

const allowance = {
  isAllowanceEnabled: () => true,
  reserve: async ({ idempotencyKey }: { idempotencyKey: string }) => {
    if (state.quota) return { accepted: false, reason: "PROVIDER_TURN_LIMIT" };
    const existing = state.leases.get(idempotencyKey);
    if (existing) return { accepted: true, idempotent: true, lease: existing };
    const lease: Lease = { id: idempotencyKey, status: "reserved", peran: "murid" };
    state.leases.set(idempotencyKey, lease);
    return { accepted: true, idempotent: false, lease };
  },
  markDispatched: async (id: string) => {
    const lease = state.leases.get(id)!;
    const changed = lease.status === "reserved";
    if (changed) lease.status = "dispatched";
    return { leaseId: id, status: lease.status, changed };
  },
  attachControlPlaneLease: async () => true,
  commit: async (id: string) => {
    state.commits++;
    if (state.failCommit) throw new Error("uncertain commit");
    state.leases.get(id)!.status = "committed";
    return { leaseId: id, status: "committed", changed: true };
  },
  refund: async (id: string) => {
    state.refunds++;
    if (state.failRefund) throw new Error("uncertain refund");
    state.leases.get(id)!.status = "refunded";
    return { leaseId: id, status: "refunded", changed: true };
  },
  recordCacheHit: async () => { throw new Error("unexpected shared cache"); },
};

mock.module("@/lib/usage-budget-service", () => ({ UsageBudgetService: allowance, FREE_ALLOWANCE_IDEMPOTENCY_PREFIX: "zyra-free:" }));
mock.module("@/lib/ai/provenance", () => ({ hashSanitizedInput: () => "hash", hashEvidence: () => "hash", recordGenerationTrace: async () => "trace" }));
mock.module("@/lib/ai/model-settings-store", () => ({ configuredModelChain: async (_input: unknown, defaults: string[]) => {
  if (state.badConfig) throw new Error("invalid model configuration");
  return state.models ?? defaults;
} }));
mock.module("@/lib/zyra/ops/telemetry", () => ({ recordZyraOperationalEventSafe: async () => {}, zyraLatencyBucket: () => "unknown", zyraOperationalFingerprint: () => "hash", zyraSizeBucket: () => "unknown" }));
mock.module("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("unexpected database access"); } }) }));

class FakeControlPlane {
  async reserve({ modelId }: { modelId: string }) {
    state.controlReserves++;
    if (state.denyCapacity) return { status: "quota_exhausted", code: "NO_CAPACITY", modelId };
    if (state.capacityFirst && state.controlReserves === 1) return { status: "fallback_allowed", code: "NO_CAPACITY", modelId };
    return { status: "reserved", lease: { leaseId: `cp-${modelId}`, projectAlias: state.projectAlias, state: "reserved" } };
  }
  async dispatch() { state.controlDispatches++; return { status: "updated" }; }
  async commit({ leaseId, outcomeCode }: { leaseId: string; outcomeCode: string }) {
    state.controlCommits++;
    if (state.failControlCommit) throw new Error("uncertain control commit");
    return { status: "updated", lease: { leaseId, state: "committed", providerOutcomeCode: outcomeCode } };
  }
  async refund(leaseId: string) {
    state.controlRefunds++;
    return state.failControlRefund ? { status: "rejected", code: "REFUND_FAILED" } : { status: "updated", lease: { leaseId, state: "refunded" } };
  }
}
mock.module("@/lib/ai/control-plane-client", () => ({ ControlPlaneClient: FakeControlPlane }));

const { PromptExecutor } = await import("@/lib/prompt-executor");
const { geminiKeyPool } = await import("@/lib/gemini");
const { ProviderNotDispatchedError } = await import("@/lib/ai/request-lifecycle");
const { googleGatewayClient } = await import("@/lib/ai/provider/google-gateway-client");
let key = geminiKeyPool.getAllKeys()[0];

beforeEach(() => {
  Object.assign(state, { leases: new Map(), refunds: 0, commits: 0, providerCalls: 0, controlReserves: 0,
    controlDispatches: 0, controlRefunds: 0, controlCommits: 0, projectAlias: "gemini-project-1",
    capacityFirst: false, quota: false, failCommit: false, failControlCommit: false, failRefund: false, failControlRefund: false,
    denyCapacity: false, badConfig: false, provider: "success", models: null, requests: [], providerStarted: undefined, waitForProvider: undefined });
  delete process.env.ZYRA_CONTROL_PLANE_URL;
  delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
  spyOn(geminiKeyPool, "markSuccess").mockImplementation(() => {});
  spyOn(geminiKeyPool, "markFailure").mockImplementation(() => {});
  spyOn(globalThis, "fetch").mockImplementation((async (_url: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
    state.providerCalls++;
    state.requests.push(init ?? {});
    state.providerStarted?.();
    if (state.waitForProvider) await state.waitForProvider;
    if (state.provider === "error") throw new Error("fake transport timeout");
    if (state.provider === "fail" || (state.provider === "fail-once" && state.providerCalls === 1)) {
      return new Response(JSON.stringify({ error: { code: 503, message: "unavailable", status: "UNAVAILABLE" } }), { status: 503, headers: { "content-type": "application/json" } });
    }
    const text = state.provider === "malformed" ? "not json" : '{"answer":"ok"}';
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch);
  // The SDK captures fetch, so each test needs its own client after installing its transport mock.
  const client = googleGatewayClient(key.key);
  key = { ...key, client, clientGateway: client };
  spyOn(geminiKeyPool, "getBestKey").mockReturnValue(key);
});
afterEach(() => mock.restore());
afterAll(() => { for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; } });

function run(id: string, singleDispatch = true, route?: { explicitUserAction: "diagnose" }, instruction = "Explain", invalidCacheKey = false) {
  return PromptExecutor.run({
    userId: "student-1", feature: "discussion-tutor", idempotencyKey: id, singleDispatch,
    cachePolicy: singleDispatch || invalidCacheKey ? "public_scaffold" : "bypass",
    cacheKey: singleDispatch || invalidCacheKey ? "invalid-for-shared-cache" : undefined, maxAttempts: 3, providerRoute: route,
    variables: {}, schema: z.object({ answer: z.string() }),
    prompt: { version: "discussion-tutor/1", systemInstruction: "Return JSON", userPrompt: () => instruction },
  });
}

describe("single dispatch through the real executor, Gemini adapter and lifecycle", () => {
  for (const router of [false, true]) {
    const mode = router ? "router on" : "router off";
    const enableRouter = () => { if (router) { process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1"; process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake"; } };

    it(`${mode}: refunds an unavailable key before a provider call`, async () => {
      enableRouter();
      state.models = ["gemini-2.5-flash"];
      if (router) state.projectAlias = "missing-project";
      else spyOn(geminiKeyPool, "getBestKey").mockImplementation(() => {
        expect(state.leases.get(`no-key-${router}`)?.status).toBe("dispatched");
        return null;
      });
      const id = `no-key-${router}`;
      expect((await run(id)).outcome).toBe("provider_failure");
      expect(state.providerCalls).toBe(0);
      expect(state.refunds).toBe(1);
      expect(state.commits).toBe(0);
      expect(state.leases.get(id)?.status).toBe("refunded");
      if (router) {
        expect(state.controlDispatches).toBe(0);
        expect(state.controlRefunds).toBe(1);
      }
      await run(id);
      expect(state.providerCalls).toBe(0);
      expect(state.refunds).toBe(1);
    });

    it(`${mode}: rejects invalid provider input without charging a turn`, async () => {
      enableRouter();
      const id = `invalid-input-${router}`;
      expect((await run(id, true, undefined, " ")).outcome).toBe("provider_failure");
      expect(state.providerCalls).toBe(0);
      expect(state.leases.get(id)?.status).toBe("refunded");
      expect(state.refunds).toBe(1);
      expect(state.controlDispatches).toBe(0);
    });

    it(`${mode}: rejects invalid model configuration before any provider call`, async () => {
      enableRouter();
      state.badConfig = true;
      const id = `bad-config-${router}`;
      expect((await run(id)).outcome).toBe("provider_failure");
      expect(state.providerCalls).toBe(0);
      expect(state.commits).toBe(0);
      expect(state.controlReserves).toBe(0);
      expect(state.leases.get(id)?.status ?? "absent").toBe(router ? "absent" : "refunded");
      expect(state.refunds).toBe(router ? 0 : 1);
    });

    it(`${mode}: reports reconciliation when a proven pre-call refund fails`, async () => {
      enableRouter();
      state.failRefund = true;
      if (router) state.projectAlias = "missing-project";
      else spyOn(geminiKeyPool, "getBestKey").mockReturnValue(null);
      const id = `refund-failed-${router}`;
      expect((await run(id)).outcome).toBe("uncertain");
      expect(state.providerCalls).toBe(0);
      expect(state.leases.get(id)?.status).not.toBe("refunded");
    });

    it(`${mode}: a concurrent replay cannot dispatch or refund the winner`, async () => {
      enableRouter();
      const id = `concurrent-${router}`;
      let release!: () => void;
      let started!: () => void;
      state.waitForProvider = new Promise<void>((resolve) => { release = resolve; });
      const ready = new Promise<void>((resolve) => { started = resolve; });
      state.providerStarted = started;
      const winner = run(id);
      await ready;
      expect((await run(id, true, undefined, "Different content")).outcome).toBe("uncertain");
      expect(state.providerCalls).toBe(1);
      expect(state.refunds).toBe(0);
      release();
      expect((await winner).success).toBe(true);
      expect(state.commits).toBe(1);
    });

    it(`${mode}: leaves an unknown outcome dispatched without refund or replay`, async () => {
      enableRouter();
      state.provider = "error";
      const id = `unknown-${router}`;
      expect(await run(id)).toMatchObject({ success: false, outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] });
      expect(state.providerCalls).toBe(1);
      expect(state.refunds).toBe(0);
      expect(state.commits).toBe(0);
      expect(state.leases.get(id)?.status).toBe("dispatched");
      expect((await run(id)).outcome).toBe("uncertain");
      expect(state.providerCalls).toBe(1);
    });

    it(`${mode}: charges once on success and replays without another provider call`, async () => {
      enableRouter();
      const id = `success-${router}`;
      expect(await run(id)).toMatchObject({ success: true, data: { answer: "ok" } });
      expect(state.providerCalls).toBe(1);
      expect(state.commits).toBe(1);
      expect(state.refunds).toBe(0);
      const headers = new Headers(state.requests[0].headers);
      expect(headers.get("cf-aig-skip-cache")).toBe("true");
      expect(headers.get("cf-aig-max-attempts")).toBe("1");
      await run(id);
      expect(state.providerCalls).toBe(1);
      expect(state.commits).toBe(1);
    });

    it(`${mode}: rejects quota before the provider`, async () => {
      enableRouter();
      state.quota = true;
      expect((await run(`quota-${router}`)).outcome).toBe("quota_exceeded");
      expect(state.providerCalls).toBe(0);
      expect(state.refunds).toBe(0);
    });

    it(`${mode}: never redispatches a committed lease whose result is unavailable`, async () => {
      enableRouter();
      const id = `committed-replay-${router}`;
      state.leases.set(id, { id, status: "committed", peran: "murid" });
      expect((await run(id)).outcome).toBe("uncertain");
      expect(state.providerCalls).toBe(0);
      expect(state.refunds).toBe(0);
    });

    it(`${mode}: disables structured-output repair even when maxAttempts allows it`, async () => {
      enableRouter();
      state.provider = "malformed";
      expect((await run(`invalid-${router}`)).outcome).toBe("rejected");
      expect(state.providerCalls).toBe(1);
      expect(state.commits).toBe(1);
    });

    it(`${mode}: returns typed uncertainty when the successful call cannot be reconciled`, async () => {
      enableRouter();
      state.failCommit = true;
      const id = `commit-failure-${router}`;
      expect(await run(id)).toMatchObject({ success: false, outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] });
      expect(state.providerCalls).toBe(1);
      expect(state.refunds).toBe(0);
      expect(state.leases.get(id)?.status).toBe("dispatched");
      expect((await run(id)).outcome).toBe("uncertain");
      expect(state.providerCalls).toBe(1);
    });

    it(`${mode}: disables SDK Interactions retries on a provider 503`, async () => {
      enableRouter();
      state.models = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
      state.provider = "fail";
      expect((await run(`interaction-${router}`, true, { explicitUserAction: "diagnose" })).outcome).toBe(router ? "provider_failure" : "uncertain");
      expect(state.providerCalls).toBe(1);
      expect(state.refunds).toBe(router ? 1 : 0);
    });
  }

  it("finds another capacity lease before the first provider attempt", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.capacityFirst = true;
    expect((await run("capacity")).success).toBe(true);
    expect(state.controlReserves).toBe(2);
    expect(state.providerCalls).toBe(1);
  });

  it("refunds a router request when every control-plane candidate is denied", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.denyCapacity = true;
    const id = "all-candidates-denied";
    expect((await run(id)).outcome).toBe("provider_failure");
    expect(state.providerCalls).toBe(0);
    expect(state.controlDispatches).toBe(0);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
  });

  it("refunds invalid gateway configuration before dispatch", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    const id = "invalid-gateway-cache";
    expect((await run(id, false, undefined, "Explain", true)).outcome).toBe("provider_failure");
    expect(state.providerCalls).toBe(0);
    expect(state.controlDispatches).toBe(0);
    expect(state.controlRefunds).toBe(1);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
  });

  it("fails closed when a control-plane refund is rejected", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.projectAlias = "missing-project";
    state.failControlRefund = true;
    const id = "control-refund-rejected";
    expect((await run(id)).outcome).toBe("uncertain");
    expect(state.providerCalls).toBe(0);
    expect(state.controlDispatches).toBe(0);
    expect(state.controlRefunds).toBe(1);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
    await run(id);
    expect(state.providerCalls).toBe(0);
    expect(state.controlRefunds).toBe(1);
  });

  it("keeps a prepared router client if project availability changes after selection", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    const lookup = spyOn(geminiKeyPool, "getKeyByProjectAlias").mockReturnValueOnce(key).mockReturnValue(null);
    expect((await run("project-lookup-race")).success).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
  });

  it("refunds when a router key is unavailable during client preparation", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-2.5-flash"];
    const lookup = spyOn(geminiKeyPool, "getKeyByProjectAlias").mockReturnValue(null);
    const id = "project-lookup-disappears";
    expect((await run(id, false)).outcome).toBe("provider_failure");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(state.providerCalls).toBe(0);
    expect(state.controlDispatches).toBe(0);
    expect(state.controlRefunds).toBe(1);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
  });

  it("keeps ordinary router fallback inside one allowance owner", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    const directPool = spyOn(geminiKeyPool, "getBestKey");
    state.provider = "fail-once";
    expect(await run("router-ordinary-fallback", false)).toMatchObject({ success: true, data: { answer: "ok" } });
    expect(state.providerCalls).toBe(2);
    expect(state.controlReserves).toBe(2);
    expect(state.controlCommits).toBe(2);
    expect(state.leases.size).toBe(1);
    expect(state.commits).toBe(1);
    expect(state.refunds).toBe(0);
    expect(directPool).not.toHaveBeenCalled();
  });

  it("does not repeat an ordinary Interactions transport failure inside the SDK", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-3.5-flash", "gemini-2.5-flash"];
    state.provider = "error";
    const id = "router-interactions-unknown";
    expect(await run(id, false, { explicitUserAction: "diagnose" })).toMatchObject({ outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] });
    expect(state.providerCalls).toBe(1);
    expect(state.controlCommits).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
  });

  it("does not repeat an ordinary legacy Interactions transport failure inside the SDK", async () => {
    state.models = ["gemini-3.5-flash", "gemini-2.5-flash"];
    state.provider = "error";
    const id = "legacy-interactions-unknown";
    expect(await run(id, false, { explicitUserAction: "diagnose" })).toMatchObject({ outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] });
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
  });

  it("uses the lifecycle fallback after one ordinary Interactions HTTP failure", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-3.5-flash", "gemini-2.5-flash"];
    state.provider = "fail-once";
    expect((await run("router-interactions-fallback", false, { explicitUserAction: "diagnose" })).success).toBe(true);
    expect(state.providerCalls).toBe(2);
    expect(state.controlReserves).toBe(2);
    expect(state.controlCommits).toBe(2);
    expect(state.commits).toBe(1);
    expect(state.refunds).toBe(0);
  });

  it("does not bypass a router allowance rejection for an ordinary caller", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.quota = true;
    const directPool = spyOn(geminiKeyPool, "getBestKey");
    expect((await run("router-ordinary-quota", false)).outcome).toBe("quota_exceeded");
    expect(state.providerCalls).toBe(0);
    expect(state.controlReserves).toBe(0);
    expect(directPool).not.toHaveBeenCalled();
  });

  it("does not repeat an ordinary router request after reconciliation fails", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    state.failControlCommit = true;
    const directPool = spyOn(geminiKeyPool, "getBestKey");
    state.provider = "fail";
    const id = "router-ordinary-reconciliation";
    expect(await run(id, false)).toMatchObject({ outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] });
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
    expect(directPool).not.toHaveBeenCalled();
    await run(id, false);
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
  });

  it("keeps an ordinary router lease after an unknown transport error", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    state.provider = "error";
    const id = "router-ordinary-unknown";
    expect((await run(id, false)).outcome).toBe("uncertain");
    expect(state.providerCalls).toBe(1);
    expect(state.controlReserves).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
    await run(id, false);
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
  });

  it("keeps an ordinary legacy lease after an unknown SDK failure", async () => {
    state.models = ["gemini-2.5-flash"];
    spyOn(key.clientGateway!.models, "generateContent").mockImplementation(async () => {
      state.providerCalls++;
      throw new Error("connection lost after 503");
    });
    const id = "legacy-ordinary-unknown";
    expect((await run(id, false)).outcome).toBe("uncertain");
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.commits).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
    await run(id, false);
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
  });

  it("does not trust a pre-dispatch marker thrown by the SDK", async () => {
    state.models = ["gemini-2.5-flash"];
    spyOn(key.clientGateway!.models, "generateContent").mockImplementation(async () => {
      state.providerCalls++;
      throw new ProviderNotDispatchedError("not proof after SDK invocation");
    });
    const id = "legacy-forged-pre-dispatch";
    expect((await run(id, false)).outcome).toBe("uncertain");
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.commits).toBe(0);
    expect(state.leases.get(id)?.status).toBe("dispatched");
  });

  it("refunds the application after a recorded failure when a fallback key disappears", async () => {
    process.env.ZYRA_CONTROL_PLANE_URL = "http://127.0.0.1:1";
    process.env.ZYRA_CONTROL_PLANE_TOKEN = "fake";
    state.models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    spyOn(geminiKeyPool, "getKeyByProjectAlias").mockReturnValueOnce(key).mockReturnValue(null);
    state.provider = "fail";
    const id = "router-fallback-key-disappears";
    expect(await run(id, false)).toMatchObject({ outcome: "provider_failure", violationCodes: ["PROVIDER_REQUEST_FAILED"] });
    expect(state.providerCalls).toBe(1);
    expect(state.controlReserves).toBe(2);
    expect(state.controlRefunds).toBe(1);
    expect(state.controlCommits).toBe(1);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
  });

  for (const status of [400, 422]) it(`settles ordinary terminal legacy HTTP ${status} without fallback`, async () => {
    state.models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    spyOn(globalThis, "fetch").mockImplementation((async () => {
      state.providerCalls++;
      return new Response(JSON.stringify({ error: { code: status, message: "rejected", status: "INVALID_ARGUMENT" } }), { status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch);
    const id = `legacy-terminal-${status}`;
    expect((await run(id, false)).outcome).toBe("provider_failure");
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(1);
    expect(state.leases.get(id)?.status).toBe("refunded");
  });

  it("preserves ordinary bounded legacy fallback when single dispatch is omitted", async () => {
    state.provider = "fail-once";
    const result = await run("default-fallback", false);
    expect(result.success).toBe(true);
    expect(state.providerCalls).toBe(2);
    expect(state.commits).toBe(1);
  });

  it("skips a denied legacy model before the first provider call", async () => {
    state.models = ["gemini-3-flash-preview", "gemini-2.5-flash"];
    expect((await run("legacy-denied-model", false)).success).toBe(true);
    expect(state.providerCalls).toBe(1);
    expect(state.refunds).toBe(0);
    expect(state.commits).toBe(1);
  });
});
