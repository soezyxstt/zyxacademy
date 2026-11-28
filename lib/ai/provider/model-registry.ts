import { ProviderAdapterError } from "./errors";

export const MODEL_IDS = {
  openai: "openai-gpt",
  openai2: "openai-gpt-2",
  openai3: "openai-gpt-3",
  openai4: "openai-gpt-4",
  deepseek: "deepseek-text",
  deepseek2: "deepseek-text-2",
  deepseek3: "deepseek-text-3",
  meta: "meta-muse",
  meta2: "meta-muse-2",
  meta3: "meta-muse-3",
  meta4: "meta-muse-4",
  meta5: "meta-muse-5",
  compatibleText: "compatible-text-pilot",
  compatibleText2: "compatible-text-pilot-2",
  compatibleText3: "compatible-text-pilot-3",
  neon: "gemini-4-neon",
  argon: "gemini-4-argon",
  carbon: "gemini-4-carbon",
  hydrogen: "gemini-4-hydrogen",
  flash38: "gemini-3.8-flash",
  default: "gemini-3.5-flash-lite",
  fallbackFlashLite: "gemini-3.1-flash-lite",
  premiumPedagogy: "gemini-3.5-flash",
  premiumVisual: "gemini-3.6-flash",
  stableFlash: "gemini-2.5-flash",
  stableFlashLite: "gemini-2.5-flash-lite",
  emergencyText: "gemma-4-31b-it",
  embedding: "gemini-embedding-2",
  legacyEmbedding: "gemini-embedding-001",
  flash3Preview: "gemini-3-flash-preview",
  quarantinedGemma: "gemma-4-26b-a4b-it",
} as const;

type BuiltInModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];
export type GatewayModelProvider = "gemini" | "openai" | "muse" | "deepseek";
export type DiscoveredModelId = `gateway:${GatewayModelProvider}:${string}`;
export type ModelId = BuiltInModelId | DiscoveredModelId;

export function discoveredModel(id: string): { provider: GatewayModelProvider; model: string } | undefined {
  const match = /^gateway:(gemini|openai|muse|deepseek):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(id);
  return match ? { provider: match[1] as GatewayModelProvider, model: match[2] } : undefined;
}

export function upstreamModelName(id: string): string {
  return discoveredModel(id)?.model ?? id;
}

export function discoveredModelId(provider: GatewayModelProvider, model: string): ModelId {
  if (provider === "gemini" && Object.hasOwn(MODEL_REGISTRY, model)) return model as BuiltInModelId;
  const id: DiscoveredModelId = `gateway:${provider}:${model}`;
  if (!discoveredModel(id)) throw new Error("Invalid gateway model ID");
  return id;
}
export type ModelFamily = "chat-completions" | "generate-content" | "interactions" | "embedding";
export type ModelStability = "stable" | "premium" | "emergency" | "quarantined" | "legacy";
export type ModelOperation = "generate" | "embed";
export type ModelRouteClass =
  | "default"
  | "premium-pedagogy"
  | "premium-visual"
  | "stable-fallback"
  | "emergency"
  | "embedding"
  | "legacy-rollback";

export interface ModelLimits {
  readonly providerManaged?: boolean;
  readonly perProjectRpm: number;
  readonly perProjectTpm: number;
  readonly perProjectRpd: number;
  readonly initialUsableRpd: number;
}
export interface ModelThinkingPolicy {
  readonly kind: "none" | "level";
  readonly level?: "minimal" | "low" | "medium" | "high";
}

export interface ModelInputCapabilities {
  readonly text: true;
  readonly image: boolean;
  readonly acceptedImageMimeTypes: readonly string[];
  readonly maxInlineImageBytes: number;
  readonly structuredVisualOutput: boolean;
}

export interface ModelHealthGate {
  readonly required: boolean;
  readonly minimumSuccessRate?: number;
  readonly maximumP95LatencyMs?: number;
  readonly minimumSampleSize?: number;
}

export interface ModelRegistryEntry {
  readonly id: ModelId;
  readonly family: ModelFamily;
  readonly stability: ModelStability;
  readonly operations: readonly ModelOperation[];
  readonly ordinaryRoutingAllowed: boolean;
  readonly limits: ModelLimits;
  readonly deadlineMs: number;
  readonly thinking: ModelThinkingPolicy;
  readonly outputFloor: number;
  readonly routeClasses: readonly ModelRouteClass[];
  readonly input: ModelInputCapabilities;
  readonly healthGate: ModelHealthGate;
  readonly dimensions?: number;
}

const TEXT_INPUT = {
  text: true,
  image: false,
  acceptedImageMimeTypes: [],
  maxInlineImageBytes: 0,
  structuredVisualOutput: false,
} as const satisfies ModelInputCapabilities;

const VISUAL_INPUT = {
  text: true,
  image: true,
  acceptedImageMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  maxInlineImageBytes: 10 * 1024 * 1024,
  structuredVisualOutput: true,
} as const satisfies ModelInputCapabilities;

const STANDARD_HEALTH_GATE = {
  required: false,
} as const satisfies ModelHealthGate;

const GENERATION_LIMITS = {
  perProjectRpm: 15,
  perProjectTpm: 1_000_000,
} as const;

export const TEXT_PROFILES = {
  [MODEL_IDS.compatibleText]: { modelSuffix: "", label: "Custom", prefix: "AI_COMPATIBLE", group: "compatible-text", route: "" },
  [MODEL_IDS.compatibleText2]: { modelSuffix: "_2", label: "Custom", prefix: "AI_COMPATIBLE", group: "compatible-text", route: "" },
  [MODEL_IDS.compatibleText3]: { modelSuffix: "_3", label: "Custom", prefix: "AI_COMPATIBLE", group: "compatible-text", route: "" },
  [MODEL_IDS.openai]: { modelSuffix: "", label: "OpenAI GPT", prefix: "AI_OPENAI", group: "openai", route: "openai" },
  [MODEL_IDS.openai2]: { modelSuffix: "_2", label: "OpenAI GPT", prefix: "AI_OPENAI", group: "openai", route: "openai" },
  [MODEL_IDS.openai3]: { modelSuffix: "_3", label: "OpenAI GPT", prefix: "AI_OPENAI", group: "openai", route: "openai" },
  [MODEL_IDS.openai4]: { modelSuffix: "_4", label: "OpenAI GPT", prefix: "AI_OPENAI", group: "openai", route: "openai" },
  [MODEL_IDS.deepseek]: { modelSuffix: "", label: "DeepSeek", prefix: "AI_DEEPSEEK", group: "deepseek", route: "deepseek" },
  [MODEL_IDS.deepseek2]: { modelSuffix: "_2", label: "DeepSeek", prefix: "AI_DEEPSEEK", group: "deepseek", route: "deepseek" },
  [MODEL_IDS.deepseek3]: { modelSuffix: "_3", label: "DeepSeek", prefix: "AI_DEEPSEEK", group: "deepseek", route: "deepseek" },
  [MODEL_IDS.meta]: { modelSuffix: "", label: "Meta Muse", prefix: "AI_META", group: "meta", route: "" },
  [MODEL_IDS.meta2]: { modelSuffix: "_2", label: "Meta Muse", prefix: "AI_META", group: "meta", route: "" },
  [MODEL_IDS.meta3]: { modelSuffix: "_3", label: "Meta Muse", prefix: "AI_META", group: "meta", route: "" },
  [MODEL_IDS.meta4]: { modelSuffix: "_4", label: "Meta Muse", prefix: "AI_META", group: "meta", route: "" },
  [MODEL_IDS.meta5]: { modelSuffix: "_5", label: "Meta Muse", prefix: "AI_META", group: "meta", route: "" },
} as const;
// Only answer generation stages can invoke a configured text provider.
export function supportsTextProvider(feature?: string) {
  return feature === "playground" || feature === "zyra" || feature === "zyra-pedagogy" || feature === "discussion-tutor";
}

export type TextProfileId = keyof typeof TEXT_PROFILES | `gateway:${Exclude<GatewayModelProvider, "gemini">}:${string}`;
export const textProfileIds = Object.keys(TEXT_PROFILES) as TextProfileId[];
export function isTextProfile(id: string): id is TextProfileId {
  return Boolean(getTextProfile(id));
}

export function getTextProfile(id: string): { modelSuffix: string; label: string; prefix: string; group: string; route: string; model?: string } | undefined {
  if (Object.hasOwn(TEXT_PROFILES, id)) return TEXT_PROFILES[id as keyof typeof TEXT_PROFILES];
  const model = discoveredModel(id);
  if (!model || model.provider === "gemini") return undefined;
  const base = model.provider === "openai" ? MODEL_IDS.openai : model.provider === "muse" ? MODEL_IDS.meta : MODEL_IDS.deepseek;
  return { ...TEXT_PROFILES[base], model: model.model };
}
const textDefaults = {
    family: "chat-completions", stability: "stable",
    operations: ["generate"], ordinaryRoutingAllowed: true,
    // Provider-managed limits are unknown locally; zero is not a routing ceiling.
    limits: { providerManaged: true, perProjectRpm: 0, perProjectTpm: 0, perProjectRpd: 0, initialUsableRpd: 0 },
    deadlineMs: 15000, thinking: { kind: "none" }, outputFloor: 512, routeClasses: ["default"],
    input: TEXT_INPUT, healthGate: STANDARD_HEALTH_GATE,
} as const;
// Conservative internal ceilings for individually assigned generation models.
const assignedGoogleModel = {
  family: "generate-content", stability: "stable", operations: ["generate"], ordinaryRoutingAllowed: true,
  limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 64 },
  deadlineMs: 15_000, thinking: { kind: "none" }, outputFloor: 512,
  routeClasses: ["default"], input: TEXT_INPUT, healthGate: STANDARD_HEALTH_GATE,
} as const;
const REGISTRY = {
  [MODEL_IDS.neon]: { ...assignedGoogleModel, id: MODEL_IDS.neon },
  [MODEL_IDS.argon]: { ...assignedGoogleModel, id: MODEL_IDS.argon },
  [MODEL_IDS.carbon]: { ...assignedGoogleModel, id: MODEL_IDS.carbon },
  [MODEL_IDS.hydrogen]: { ...assignedGoogleModel, id: MODEL_IDS.hydrogen },
  [MODEL_IDS.flash38]: { ...assignedGoogleModel, id: MODEL_IDS.flash38 },
  [MODEL_IDS.compatibleText]: { ...textDefaults, id: MODEL_IDS.compatibleText },
  [MODEL_IDS.compatibleText2]: { ...textDefaults, id: MODEL_IDS.compatibleText2 },
  [MODEL_IDS.compatibleText3]: { ...textDefaults, id: MODEL_IDS.compatibleText3 },
  [MODEL_IDS.openai]: { ...textDefaults, id: MODEL_IDS.openai },
  [MODEL_IDS.openai2]: { ...textDefaults, id: MODEL_IDS.openai2 },
  [MODEL_IDS.openai3]: { ...textDefaults, id: MODEL_IDS.openai3 },
  [MODEL_IDS.openai4]: { ...textDefaults, id: MODEL_IDS.openai4 },
  [MODEL_IDS.deepseek]: { ...textDefaults, id: MODEL_IDS.deepseek },
  [MODEL_IDS.deepseek2]: { ...textDefaults, id: MODEL_IDS.deepseek2 },
  [MODEL_IDS.deepseek3]: { ...textDefaults, id: MODEL_IDS.deepseek3 },
  [MODEL_IDS.meta]: { ...textDefaults, id: MODEL_IDS.meta },
  [MODEL_IDS.meta2]: { ...textDefaults, id: MODEL_IDS.meta2 },
  [MODEL_IDS.meta3]: { ...textDefaults, id: MODEL_IDS.meta3 },
  [MODEL_IDS.meta4]: { ...textDefaults, id: MODEL_IDS.meta4 },
  [MODEL_IDS.meta5]: { ...textDefaults, id: MODEL_IDS.meta5 },
  [MODEL_IDS.default]: {
    id: MODEL_IDS.default,
    family: "generate-content",
    stability: "stable",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 500, initialUsableRpd: 1_800 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 512,
    routeClasses: ["default"],
    input: VISUAL_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
  },
  [MODEL_IDS.fallbackFlashLite]: {
    id: MODEL_IDS.fallbackFlashLite,
    family: "generate-content",
    stability: "stable",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 500, initialUsableRpd: 1_800 },
    deadlineMs: 15_000,
    thinking: { kind: "level", level: "minimal" },
    outputFloor: 512,
    routeClasses: ["default"],
    input: VISUAL_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
  },
  [MODEL_IDS.premiumPedagogy]: {
    id: MODEL_IDS.premiumPedagogy,
    family: "interactions",
    stability: "premium",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 64 },
    deadlineMs: 15_000,
    thinking: { kind: "level", level: "high" },
    outputFloor: 1_024,
    routeClasses: ["premium-pedagogy"],
    input: TEXT_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
  },
  [MODEL_IDS.premiumVisual]: {
    id: MODEL_IDS.premiumVisual,
    family: "interactions",
    stability: "premium",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 64 },
    deadlineMs: 15_000,
    thinking: { kind: "level", level: "medium" },
    outputFloor: 1_024,
    routeClasses: ["premium-visual"],
    input: VISUAL_INPUT,
    healthGate: { required: true, minimumSuccessRate: 0.95, maximumP95LatencyMs: 15_000, minimumSampleSize: 20 },
  },
  [MODEL_IDS.stableFlash]: {
    id: MODEL_IDS.stableFlash,
    family: "generate-content",
    stability: "stable",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 64 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 512,
    routeClasses: ["stable-fallback"],
    input: VISUAL_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
  },
  [MODEL_IDS.stableFlashLite]: {
    id: MODEL_IDS.stableFlashLite,
    family: "generate-content",
    stability: "stable",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 64 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 512,
    routeClasses: ["stable-fallback"],
    input: TEXT_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
  },
  [MODEL_IDS.emergencyText]: {
    id: MODEL_IDS.emergencyText,
    family: "generate-content",
    stability: "emergency",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 1_500, initialUsableRpd: 1_500 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 512,
    routeClasses: ["emergency"],
    input: TEXT_INPUT,
    healthGate: { required: true, minimumSuccessRate: 0.95, maximumP95LatencyMs: 5_000, minimumSampleSize: 20 },
  },
  [MODEL_IDS.embedding]: {
    id: MODEL_IDS.embedding,
    family: "embedding",
    stability: "stable",
    operations: ["embed"],
    ordinaryRoutingAllowed: true,
    limits: { perProjectRpm: 1_500, perProjectTpm: 1_000_000, perProjectRpd: 1_000, initialUsableRpd: 3_600 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 0,
    routeClasses: ["embedding"],
    input: TEXT_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
    dimensions: 768,
  },
  [MODEL_IDS.legacyEmbedding]: {
    id: MODEL_IDS.legacyEmbedding,
    family: "embedding",
    stability: "legacy",
    operations: ["embed"],
    ordinaryRoutingAllowed: false,
    limits: { perProjectRpm: 1_500, perProjectTpm: 1_000_000, perProjectRpd: 1_000, initialUsableRpd: 0 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 0,
    routeClasses: ["legacy-rollback"],
    input: TEXT_INPUT,
    healthGate: STANDARD_HEALTH_GATE,
    dimensions: 768,
  },
  [MODEL_IDS.flash3Preview]: { ...assignedGoogleModel, id: MODEL_IDS.flash3Preview },
  [MODEL_IDS.quarantinedGemma]: {
    id: MODEL_IDS.quarantinedGemma,
    family: "generate-content",
    stability: "quarantined",
    operations: ["generate"],
    ordinaryRoutingAllowed: false,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 1_500, initialUsableRpd: 0 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 1_024,
    routeClasses: [],
    input: TEXT_INPUT,
    healthGate: { required: true, minimumSuccessRate: 0.95, maximumP95LatencyMs: 5_000, minimumSampleSize: 20 },
  },
} as const satisfies Record<BuiltInModelId, ModelRegistryEntry>;

export const MODEL_REGISTRY: Readonly<Record<ModelId, ModelRegistryEntry>> = Object.freeze(REGISTRY);

export const EMBEDDING_PROFILES = {
  "canonical-content-v2": {
    id: "canonical-content-v2",
    purpose: "canonical-content-retrieval",
    model: MODEL_IDS.embedding,
    dimensions: 768,
    metric: "cosine",
    normalization: "provider-normalized-mrl-v1",
    taskInstructionVersion: "gemini-embedding-2-retrieval-prefix-v1",
    contentSerializationVersion: "canonical-content-v2",
    indexAlias: "zyx-vectors-staging-v2",
  },
  "zyra-semantic-cache-v1": {
    id: "zyra-semantic-cache-v1",
    purpose: "zyra-semantic-response-cache",
    model: MODEL_IDS.embedding,
    dimensions: 768,
    metric: "cosine",
    normalization: "provider-normalized-mrl-v1",
    taskInstructionVersion: "gemini-embedding-2-semantic-cache-prefix-v1",
    contentSerializationVersion: "zyra-semantic-cache-v1",
    indexAlias: "zyx-zyra-cache-staging",
  },
} as const;

export type EmbeddingProfileId = keyof typeof EMBEDDING_PROFILES;
export type EmbeddingProfile = (typeof EMBEDDING_PROFILES)[EmbeddingProfileId];

export const ROUTE_POLICY = {
  default: [MODEL_IDS.default, MODEL_IDS.fallbackFlashLite, MODEL_IDS.stableFlash, MODEL_IDS.stableFlashLite],
  premiumPedagogy: [MODEL_IDS.premiumPedagogy, MODEL_IDS.default, MODEL_IDS.stableFlash],
  premiumVisual: [MODEL_IDS.premiumVisual, MODEL_IDS.stableFlash],
  emergency: [MODEL_IDS.emergencyText],
} as const;

export function normalizeModelId(modelId: string): ModelId {
  let normalized = modelId.startsWith("models/") ? modelId.slice("models/".length) : modelId;
  const discovered = discoveredModel(normalized);
  if (discovered?.provider === "gemini" && Object.hasOwn(MODEL_REGISTRY, discovered.model)) normalized = discovered.model;
  if (!Object.hasOwn(MODEL_REGISTRY, normalized) && !discoveredModel(normalized)) {
    throw new ProviderAdapterError({
      code: "UNKNOWN_MODEL",
      message: `unknown Gemini model ${normalized}`,
      retryClassification: "invalid_request",
      modelId: normalized,
    });
  }
  return normalized as ModelId;
}

const visualChatModels = new Set<ModelId>([
  "gateway:openai:gpt-6.1-terra",
  "gateway:openai:gpt-6-luna",
  "gateway:openai:gpt-5.5",
  "gateway:openai:gpt-5.5-mini",
  "gateway:openai:gpt-5.4",
  "gateway:openai:gpt-5.4-mini",
  "gateway:muse:muse-spark-1.3-contributor",
]);

export function getModelEntry(modelId: string): ModelRegistryEntry {
  const id = normalizeModelId(modelId);
  if (visualChatModels.has(id)) return { ...textDefaults, id, input: { ...VISUAL_INPUT, structuredVisualOutput: false } };
  return MODEL_REGISTRY[id] ?? { ...(discoveredModel(id)?.provider === "gemini" ? assignedGoogleModel : textDefaults), id };
}

export function assertOrdinaryRoutingAllowed(modelId: string): ModelRegistryEntry {
  const entry = getModelEntry(modelId);
  if (!entry.ordinaryRoutingAllowed || entry.stability === "quarantined" || entry.stability === "legacy") {
    throw new ProviderAdapterError({
      code: "MODEL_QUARANTINED",
      message: `Gemini model ${entry.id} is not available for ordinary routing`,
      retryClassification: "quarantined",
      modelId: entry.id,
    });
  }
  return entry;
}

export function getRpdLimit(modelId: string): number {
  return getModelEntry(modelId).limits.perProjectRpd;
}

export function getRpmLimit(modelId: string): number {
  return getModelEntry(modelId).limits.perProjectRpm;
}

export function getTpmLimit(modelId: string): number {
  return getModelEntry(modelId).limits.perProjectTpm;
}

/**
 * Resolves provider project aliases with fallback defaults for missing or blank entries.
 */
export function getProjectAliases(input: Partial<Record<`GEMINI_PROJECT_ALIAS_${1 | 2 | 3 | 4}`, string>> = {}): readonly string[] {
  const aliases = [1, 2, 3, 4].map((index) => {
    const raw = input[`GEMINI_PROJECT_ALIAS_${index as 1 | 2 | 3 | 4}`];
    return raw && raw.trim().length > 0 ? raw.trim() : `gemini-project-${index}`;
  });
  return aliases;
}
