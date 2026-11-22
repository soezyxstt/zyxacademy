import { createHash } from "node:crypto";
import { z } from "zod";
import { kvGet, kvPut } from "@/lib/kv-cache";
import { ControlPlaneClient } from "../control-plane-client";
import { createProviderInvokerFromEnvironment } from "./runtime-invoker";
import { enabledGatewayProviders, type GatewayProviderName } from "./gateway";
import { getModelEntry, type ModelId } from "./model-registry";
import { modelLatencySchema, type ModelLatency } from "./model-observations";
import { selectorCacheKey } from "./selector-catalog";

const observationsSchema = z.record(z.string(), modelLatencySchema);
const RETAIN_SECONDS = 7 * 24 * 60 * 60;
export async function readModelLatencies(): Promise<Partial<Record<ModelId, ModelLatency>>> {
  const groups = await Promise.all([...enabledGatewayProviders()].map(async provider => {
    const result = observationsSchema.safeParse(await kvGet(selectorCacheKey(provider) + ":latency"));
    return result.success ? result.data : {};
  }));
  return Object.assign({}, ...groups);
}
export async function storeModelLatencies(provider: GatewayProviderName, values: Partial<Record<ModelId, ModelLatency>>) {
  await kvPut(selectorCacheKey(provider) + ":latency", observationsSchema.parse(values), RETAIN_SECONDS);
}

export async function measureModelLatency(
  modelId: ModelId, cycle: number | string,
  control = new ControlPlaneClient(), invoke?: ReturnType<typeof createProviderInvokerFromEnvironment>,
): Promise<ModelLatency> {
  const samples: number[] = [];
  const checkedAt = Date.now();
  if (!process.env.ZYRA_CONTROL_PLANE_URL || !process.env.ZYRA_CONTROL_PLANE_TOKEN) return { checkedAt, samples, status: "unavailable" };
  invoke ??= createProviderInvokerFromEnvironment();
  const entry = getModelEntry(modelId), routeClass = entry.routeClasses[0];
  const identity = createHash("sha256").update(modelId).digest("hex");
  for (let sample = 0; sample < 3; sample++) {
    const requestId = `model-latency:${cycle}:${identity}:${sample}`;
    const reserved = await control.reserve({ idempotencyKey: requestId, userId: "system:model-latency", role: "admin", feature: "playground", routeClass, modelId, cacheStatus: "bypass" });
    if (reserved.status !== "reserved") return { checkedAt, samples, status: "quota" };
    const lease = reserved.lease;
    const dispatched = await control.dispatch(lease.leaseId);
    // A retried job must never replay a possibly billed provider attempt.
    if (dispatched.status !== "updated") return { checkedAt, samples, status: "incomplete" };
    let success = false, latencyMs: number | undefined;
    try {
      const result = await invoke({ requestId, userCohort: "system", feature: "playground", routeClass, modelId, projectAlias: lease.projectAlias,
        parts: [{ type: "text", text: "Reply with only the word OK." }], config: { maxOutputTokens: 512 }, singleDispatch: true, cachePolicy: "bypass" });
      success = result.text.trim() === "OK";
      if (success && Number.isFinite(result.latencyMs) && result.latencyMs >= 0) latencyMs = result.latencyMs;
    } catch { /* Failed attempts are accounted for, never counted as fast responses. */ }
    const committed = await control.commit({ leaseId: lease.leaseId, providerAttemptId: requestId, outcomeCode: success ? "PROBE_OK" : "PROBE_FAILED", outcomeClass: success ? "success" : "unknown", latencyMs });
    if (committed.status === "rejected") throw new Error("Latency probe quota reconciliation failed");
    if (latencyMs !== undefined) samples.push(latencyMs);
  }
  return { checkedAt, samples, status: samples.length === 3 ? "complete" : "incomplete" };
}
