import { expect, mock, test } from "bun:test";
import type { ModelId } from "@/lib/ai/provider/model-registry";
const catalog = mock(async () => new Set(["gemini-3.5-flash-lite", "gateway:openai:gpt-fixture"]));
const measure = mock(async (_id: ModelId, _cycle: number | string) => ({ checkedAt: 1000, samples: [1, 3, 2], status: "complete" }));
const store = mock(async () => {});
mock.module("@/lib/ai/provider/selector-catalog", () => ({ selectorCatalog: catalog }));
mock.module("@/lib/ai/provider/model-latency", () => ({ measureModelLatency: measure, storeModelLatencies: store }));
const { queueJobs } = await import("@/jobs/define-job");
await import("@/jobs/ai-model-catalog");
test("the 12-hour job reuses the weekly catalog and measures durable per-model steps", async () => {
  Object.assign(process.env, { CF_ACCOUNT_ID: "fixture", CF_KV_NAMESPACE_ID: "fixture", CF_API_TOKEN: "fixture", AI_PROVIDERS: "gemini,openai" });
  const job = queueJobs.get("ai-model-catalog-cron")!, steps: string[] = [];
  expect(job.definition.triggers).toEqual([{ cron: "0 */12 * * *" }, { event: "ai-model-catalog-cron" }]);
  await job.run({ event: { data: {} }, step: { run: async (id, execute) => { steps.push(id); return execute(); }, enqueueTask: async () => {} } });
  expect(catalog.mock.calls).toEqual([[]]);
  expect(measure).toHaveBeenCalledTimes(2); expect(store).toHaveBeenCalledTimes(2);
  expect(steps).toContain("latency-gateway:openai:gpt-fixture");
});

test("manual latency refresh uses its request identity without forcing catalog discovery", async () => {
  catalog.mockClear(); measure.mockClear(); store.mockClear();
  const job = queueJobs.get("ai-model-catalog-cron")!;
  await job.run({ event: { data: { requestId: "manual-fixture" } }, step: { run: async (_id, execute) => execute(), enqueueTask: async () => {} } });
  expect(catalog.mock.calls).toEqual([[]]);
  expect(measure.mock.calls.every(call => call[1] === "manual-fixture")).toBe(true);
  expect(measure).toHaveBeenCalledTimes(2);
});
