import { expect, mock, test } from "bun:test";
import type { ModelId } from "@/lib/ai/provider/model-registry";
const catalog = mock(async (_refresh?: boolean, _requireAllProviders?: boolean) => new Set(["gemini-3.5-flash-lite", "gateway:openai:gpt-6-luna", "gateway:openai:gpt-other"]));
const measure = mock(async (_id: ModelId, _cycle: number | string) => ({ checkedAt: Date.now(), samples: [1, 3, 2], status: "complete" }));
const store = mock(async () => {});
const complete = mock(async () => {});
const claim = mock(async () => true);
mock.module("@/lib/ai/model-latency-cooldown", () => ({ claimLatencyCycle: claim, completeLatencyCycle: complete }));
mock.module("@/lib/ai/provider/selector-catalog", () => ({ selectorCatalog: catalog }));
mock.module("@/lib/ai/provider/model-latency", () => ({ measureModelLatency: measure, storeModelLatencies: store }));
const { queueJobs } = await import("@/jobs/define-job");
await import("@/jobs/ai-model-catalog");
test("the 12-hour job reads the shared catalog and measures durable per-model steps", async () => {
  Object.assign(process.env, { CF_ACCOUNT_ID: "fixture", CF_KV_NAMESPACE_ID: "fixture", CF_API_TOKEN: "fixture", AI_PROVIDERS: "gemini,openai" });
  const job = queueJobs.get("ai-model-catalog-cron")!, steps: string[] = [];
  expect(job.definition.triggers).toEqual([{ cron: "0 */12 * * *" }, { event: "ai-model-catalog-cron" }]);
  await job.run({ event: { data: {} }, step: { run: async (id, execute) => { steps.push(id); return execute(); }, enqueueTask: async () => {} } });
  expect(catalog.mock.calls).toEqual([[false, true]]);
  expect(measure).toHaveBeenCalledTimes(2); expect(store).toHaveBeenCalledTimes(2);
  expect(steps).toContain("latency-gateway:openai:gpt-6-luna");
});

test("manual latency refresh uses its request identity without forcing catalog discovery", async () => {
  catalog.mockClear(); measure.mockClear(); store.mockClear();
  const job = queueJobs.get("ai-model-catalog-cron")!;
  await job.run({ event: { data: { requestId: "manual-fixture" } }, step: { run: async (_id, execute) => execute(), enqueueTask: async () => {} } });
  expect(catalog.mock.calls).toEqual([[false, true]]);
  expect(measure.mock.calls.every(call => call[1] === "manual-fixture")).toBe(true);
  expect(measure).toHaveBeenCalledTimes(2);
});

test("a scheduled run during cooldown makes zero provider calls", async () => {
  claim.mockResolvedValueOnce(false);
  measure.mockClear();
  const job = queueJobs.get("ai-model-catalog-cron")!;
  await job.run({ event: { data: {} }, step: { run: async (_id, execute) => execute(), enqueueTask: async () => {} } });
  expect(measure).not.toHaveBeenCalled();
});

test("retries only unverified models and enters cooldown after their results persist", async () => {
  claim.mockResolvedValue(true);
  const job = queueJobs.get("ai-model-catalog-cron")!;
  complete.mockClear();
  let continuation: import("@/lib/queue/cloud-tasks").QueueEvent | undefined;
  const step = {
    run: async <T>(_id: string, work: () => Promise<T>) => work(),
    enqueueTask: async (_id: string, event: import("@/lib/queue/cloud-tasks").QueueEvent) => { continuation = event; },
  };
  measure.mockResolvedValueOnce({ checkedAt: Date.now(), samples: [], status: "incomplete" });
  await job.run({ event: { data: { requestId: "partial" } }, step });
  expect(complete).not.toHaveBeenCalled();
  expect(continuation?.delaySeconds).toBe(300);
  measure.mockClear();
  await job.run({ event: { data: continuation!.data }, step });
  expect(measure.mock.calls.map(([id]) => id)).toEqual(["gemini-3.5-flash-lite"]);
  expect(complete).toHaveBeenCalledWith("partial");
});

test("a failed observation write schedules recovery without starting cooldown", async () => {
  complete.mockClear();
  store.mockRejectedValueOnce(new Error("storage offline"));
  const enqueueTask = mock(async () => {});
  const job = queueJobs.get("ai-model-catalog-cron")!;
  await job.run({ event: { data: { requestId: "write-failure" } }, step: {
    run: async (_id, execute) => execute(), enqueueTask,
  } });
  expect(complete).not.toHaveBeenCalled();
  expect(enqueueTask).toHaveBeenCalledTimes(1);
});
