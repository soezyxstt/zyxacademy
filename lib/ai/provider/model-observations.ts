import { z } from "zod";
import { discoveredModel, type ModelId } from "./model-registry";
import { officialRelease } from "./recent-models";

export const modelDateSchema = z.object({ timestamp: z.number().int().positive(), kind: z.enum(["created", "released"]), source: z.string().url() });
export type ModelDate = z.infer<typeof modelDateSchema>;
export const modelLatencySchema = z.object({
  checkedAt: z.number().int().positive(), samples: z.array(z.number().finite().nonnegative()).max(3),
  status: z.enum(["complete", "incomplete", "quota", "unavailable"]),
}).refine(value => value.status !== "complete" || value.samples.length === 3, "A complete measurement requires three samples");
export type ModelLatency = z.infer<typeof modelLatencySchema>;

export function modelDate(id: ModelId, created?: number, now = Date.now()): ModelDate | undefined {
  const release = officialRelease(discoveredModel(id)?.model ?? id);
  const timestamp = release && Date.parse(release.released + "T00:00:00Z");
  if (timestamp && timestamp <= now) return { timestamp, kind: "released", source: release!.source };
  if (created && Number.isSafeInteger(created) && created > 0 && created * 1000 <= now) {
    const provider = discoveredModel(id)?.provider;
    const source = provider === "muse" ? "https://dev.meta.ai/docs/models" : provider === "deepseek" ? "https://api-docs.deepseek.com/api/list-models" : "https://developers.openai.com/api/reference/resources/models";
    return { timestamp: created * 1000, kind: "created", source };
  }
  return undefined;
}

export function sortModelsByDate(ids: readonly ModelId[], dates: Partial<Record<ModelId, ModelDate>>): ModelId[] {
  // Preserve provider order on equal or unknown dates; never infer age from a model name.
  return [...ids].sort((a, b) => (dates[b]?.timestamp ?? 0) - (dates[a]?.timestamp ?? 0));
}

export function medianModelLatency(value: ModelLatency | undefined): number | undefined {
  return value?.status === "complete" && value.samples.length === 3 ? [...value.samples].sort((a, b) => a - b)[1] : undefined;
}
