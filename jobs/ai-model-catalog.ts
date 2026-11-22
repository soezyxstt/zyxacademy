import { claimLatencyCycle, completeLatencyCycle } from "@/lib/ai/model-latency-cooldown";
import { selectedGenerationModel } from "@/lib/ai/provider/selected-models";
import { defineJob } from "./define-job";
import { selectorCatalog } from "@/lib/ai/provider/selector-catalog";
import { measureModelLatency, storeModelLatencies } from "@/lib/ai/provider/model-latency";
import { discoveredModel } from "@/lib/ai/provider/model-registry";
import { modelLatencySchema, type ModelLatency } from "@/lib/ai/provider/model-observations";
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
  const round = Number(event.data.round) || 0;
  if (!await step.run("claim-cycle", () => claimLatencyCycle(String(cycle), undefined, round > 0))) return { models: 0 };
  const previous = event.data.verified as Partial<Record<ModelId, ModelLatency>> | undefined;
  const verified: Partial<Record<ModelId, ModelLatency>> = {};
  const models = await step.run("read-model-catalog", async () => {
    try { return [...await selectorCatalog(false, true)].filter(selectedGenerationModel); }
    catch { return []; }
  });
  for (const provider of enabledGatewayProviders()) {
    const results: Partial<Record<ModelId, ModelLatency>> = {};
    for (const id of models.filter(id => (discoveredModel(id)?.provider ?? "gemini") === provider)) {
      const prior = modelLatencySchema.safeParse(previous?.[id]);
      if (prior.success && prior.data.status === "complete" && Date.now() - prior.data.checkedAt < 6 * 86400_000) {
        verified[id] = results[id] = prior.data;
        continue;
      }
      results[id] = await step.run(`latency-${id}`, async () => {
        try { return await measureModelLatency(id, round ? `${cycle}:${round}` : cycle); }
        catch { return { checkedAt: Date.now(), samples: [], status: "unavailable" as const }; }
      });
    }
    if (!Object.keys(results).some(id => !verified[id as ModelId])) continue;
    const saved = await step.run(`store-latency-${provider}`, async () => {
      try { await storeModelLatencies(provider, results); return true; }
      catch { return false; }
    });
    if (saved) for (const [id, result] of Object.entries(results)) {
      if (result?.status === "complete") verified[id as ModelId] = result;
    }
  }
  if (models.length && models.every(id => verified[id])) {
    await step.run("complete-cycle", () => completeLatencyCycle(String(cycle)));
  } else {
    await step.enqueueTask("retry-incomplete", {
      name: "ai-model-catalog-cron", id: `model-latency:${cycle}:retry:${round + 1}`,
      data: { requestId: String(cycle), round: round + 1, verified: models.length ? verified : previous ?? {} },
      delaySeconds: Math.min(3600, 300 * 2 ** Math.min(round, 4)),
    });
  }
  return { models: models.length };
});
