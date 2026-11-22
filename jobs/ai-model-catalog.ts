import { defineJob } from "./define-job";
import { selectorCatalog } from "@/lib/ai/provider/selector-catalog";
import { measureModelLatency, storeModelLatencies } from "@/lib/ai/provider/model-latency";
import { discoveredModel } from "@/lib/ai/provider/model-registry";
import type { ModelLatency } from "@/lib/ai/provider/model-observations";
import type { ModelId } from "@/lib/ai/provider/model-registry";
import { enabledGatewayProviders } from "@/lib/ai/provider/gateway";

export const aiModelCatalogCron = defineJob({
  id: "ai-model-catalog-cron", triggers: [{ cron: "0 */12 * * *" }, { event: "ai-model-catalog-cron" }],
  concurrency: { limit: 1 }, retries: 2,
}, async ({ step, event }) => {
  if (!process.env.CF_KV_NAMESPACE_ID || !process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
    throw new Error("Shared model catalog cache unavailable");
  }
  const cycle = await step.run("probe-cycle", async () => typeof event.data.requestId === "string"
    ? event.data.requestId : Math.floor(Date.now() / (12 * 60 * 60_000)));
  const models = await step.run("read-model-catalog", async () => [...await selectorCatalog()]);
  for (const provider of enabledGatewayProviders()) {
    const results: Partial<Record<ModelId, ModelLatency>> = {};
    for (const id of models.filter(id => (discoveredModel(id)?.provider ?? "gemini") === provider)) {
      results[id] = await step.run(`latency-${id}`, () => measureModelLatency(id, cycle));
    }
    await step.run(`store-latency-${provider}`, () => storeModelLatencies(provider, results));
  }
  return { models: models.length };
});
