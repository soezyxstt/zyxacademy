import { discoveredModel, getModelEntry, MODEL_IDS, type GatewayModelProvider, type ModelId } from "./model-registry";

const selectedGoogleFlash = new Set<string>([
  MODEL_IDS.default,
  MODEL_IDS.fallbackFlashLite,
  MODEL_IDS.flash3Preview,
  MODEL_IDS.flash38,
  MODEL_IDS.stableFlash,
]);

const selectedOpenAi = new Set<string>([
  "gpt-6-luna",
  "gpt-5.6-luna",
  "gpt-6.1-terra",
  "gpt-5.5",
  "gpt-5.5-mini",
  "gpt-5.4",
  "gpt-5.4-mini",
]);

export function selectedUpstream(provider: GatewayModelProvider, model: string) {
  if (provider === "gemini") return selectedGoogleFlash.has(model) || /^gemma-[a-z0-9._-]+$/i.test(model);
  if (provider === "openai") return selectedOpenAi.has(model);
  return provider === "muse" && ["muse-spark-1.2-contributor", "muse-spark-1.3-contributor", "muse-ember-1.0"].includes(model);
}

export const defaultGenerationModels = [MODEL_IDS.default, MODEL_IDS.fallbackFlashLite, MODEL_IDS.emergencyText] as const;

export function selectedGenerationModel(id: ModelId) {
  const upstream = discoveredModel(id);
  return getModelEntry(id).ordinaryRoutingAllowed && selectedUpstream(upstream?.provider ?? "gemini", upstream?.model ?? id);
}
