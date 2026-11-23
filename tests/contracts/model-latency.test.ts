import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
import { measureModelLatency, readModelLatencies, storeModelLatencies } from "@/lib/ai/provider/model-latency";
import * as kv from "@/lib/kv-cache";
import { medianModelLatency } from "@/lib/ai/provider/model-observations";
const names = ["ZYRA_CONTROL_PLANE_URL", "ZYRA_CONTROL_PLANE_TOKEN", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN", "AI_PROVIDERS", "BETTER_AUTH_URL"];
const previous = Object.fromEntries(names.map(key => [key, process.env[key]]));
beforeEach(() => Object.assign(process.env, { ZYRA_CONTROL_PLANE_URL: "https://control.test", ZYRA_CONTROL_PLANE_TOKEN: "fixture", CF_AI_GATEWAY_URL: "https://gateway.test", CF_AI_GATEWAY_TOKEN: "fixture", AI_PROVIDERS: "openai" }));
afterEach(() => { mock.restore(); for (const key of names) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
const id = "gateway:openai:gpt-new-fixture" as const;
function setup() {
  const control = new ControlPlaneClient();
  const reserve = spyOn(control, "reserve").mockResolvedValue({ status: "reserved", lease: { leaseId: "lease", projectAlias: "openai" } } as Awaited<ReturnType<ControlPlaneClient["reserve"]>>);
  spyOn(control, "dispatch").mockResolvedValue({ status: "updated", lease: {} } as Awaited<ReturnType<ControlPlaneClient["dispatch"]>>);
  const commit = spyOn(control, "commit").mockResolvedValue({ status: "updated", lease: {} } as Awaited<ReturnType<ControlPlaneClient["commit"]>>);
  let sample = 0;
  const invoke = mock(async (_input: Parameters<NonNullable<Parameters<typeof measureModelLatency>[3]>>[0]) => ({ modelId: id, text: "OK", finishReason: "stop", latencyMs: [4000,100,900][sample++], retryClassification: "none" as const }));
  return { control, reserve, commit, invoke };
}
test("records three bounded successful calls and publishes their median with quota accounting", async () => {
  const s = setup(), result = await measureModelLatency(id, 123, s.control, s.invoke);
  expect(medianModelLatency(result)).toBe(900); expect(s.invoke).toHaveBeenCalledTimes(3); expect(s.commit).toHaveBeenCalledTimes(3);
  expect(new Set(s.reserve.mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(3);
  expect(s.invoke.mock.calls[0][0]).toMatchObject({ singleDispatch: true, cachePolicy: "bypass", config: { maxOutputTokens: 512 } });
});
test("cannot bypass quota, replay an idempotent attempt or label failed responses fast", async () => {
  const s = setup();
  s.reserve.mockResolvedValueOnce({ status: "quota_exhausted", code: "QUOTA_EXHAUSTED", modelId: id });
  expect((await measureModelLatency(id, 123, s.control, s.invoke)).status).toBe("quota"); expect(s.invoke).not.toHaveBeenCalled();
  s.reserve.mockResolvedValueOnce({ status: "quota_exhausted", code: "INVALID_RESERVE_INPUT", modelId: id });
  expect((await measureModelLatency(id, 123, s.control, s.invoke)).status).toBe("unavailable");
  expect(s.invoke).not.toHaveBeenCalled();
  s.reserve.mockResolvedValueOnce({ status: "idempotent", lease: { leaseId: "lease", projectAlias: "openai" } } as Awaited<ReturnType<ControlPlaneClient["reserve"]>>);
  await measureModelLatency(id, 123, s.control, s.invoke); expect(s.invoke).not.toHaveBeenCalled();
  s.invoke.mockRejectedValue(new Error("provider unavailable"));
  const failed = await measureModelLatency(id, 124, s.control, s.invoke);
  expect(failed.status).toBe("incomplete"); expect(medianModelLatency(failed)).toBeUndefined(); expect(s.commit).toHaveBeenCalledTimes(1);
});
test("requires configured accounting and persists only validated observations in scoped KV", async () => {
  const s = setup(); delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
  expect((await measureModelLatency(id, 123, s.control, s.invoke)).status).toBe("unavailable"); expect(s.invoke).not.toHaveBeenCalled();
  const saved = new Map<string, unknown>();
  spyOn(kv, "kvPut").mockImplementation(async (key, value) => { saved.set(key, value); });
  spyOn(kv, "kvGet").mockImplementation(async <T = unknown>(key: string) => (saved.get(key) as T | undefined) ?? null);
  const result = { checkedAt: Date.now(), samples: [1, 2, 3], status: "complete" as const };
  await storeModelLatencies("openai", { [id]: result });
  expect((await readModelLatencies())[id]).toEqual(result);
  process.env.CF_AI_GATEWAY_TOKEN = "changed";
  expect((await readModelLatencies())[id]).toBeUndefined();
});

test("a shared cooldown refunds a reserved probe before dispatch", async () => {
  const s = setup();
  process.env.CF_AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/account/gateway";
  process.env.BETTER_AUTH_URL = "https://staging.zyxacademy.com";
  const dispatch = spyOn(s.control, "dispatch");
  const refund = spyOn(s.control, "refund").mockResolvedValue({ status: "updated", lease: { leaseId: "lease", state: "refunded" } } as Awaited<ReturnType<ControlPlaneClient["refund"]>>);
  spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 3, cooldownUntil: Date.now() + 86400000 });
  expect((await measureModelLatency(id, 125, s.control)).status).toBe("unavailable");
  expect(refund).toHaveBeenCalledTimes(1); expect(dispatch).not.toHaveBeenCalled(); expect(s.commit).not.toHaveBeenCalled();
});
