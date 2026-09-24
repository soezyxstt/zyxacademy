import { ProviderAdapterError } from "@/lib/ai/provider/errors";

export const MODEL_IDS = {
  default: "gemini-3.1-flash-lite",
  premiumPedagogy: "gemini-3.5-flash",
  premiumVisual: "gemini-3.6-flash",
  stableFlash: "gemini-2.5-flash",
  stableFlashLite: "gemini-2.5-flash-lite",
  emergencyText: "gemma-4-31b-it",
  embedding: "gemini-embedding-2",
  legacyEmbedding: "gemini-embedding-001",
  quarantinedFlashLite: "gemini-3.5-flash-lite",
  quarantinedPreview: "gemini-3-flash-preview",
  quarantinedGemma: "gemma-4-26b-a4b-it",
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];
export type ModelFamily = "generate-content" | "interactions" | "embedding";
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

const FLASH_LITE_HEALTH_GATE = {
  required: true,
  minimumSuccessRate: 0.95,
  maximumP95LatencyMs: 4_000,
  minimumSampleSize: 20,
} as const satisfies ModelHealthGate;

const GENERATION_LIMITS = {
  perProjectRpm: 15,
  perProjectTpm: 1_000_000,
} as const;

const REGISTRY = {
  [MODEL_IDS.default]: {
    id: MODEL_IDS.default,
    family: "generate-content",
    stability: "stable",
    operations: ["generate"],
    ordinaryRoutingAllowed: true,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 500, initialUsableRpd: 1_800 },
    deadlineMs: 15_000,
    thinking: { kind: "level", level: "minimal" },
    outputFloor: 512,
    routeClasses: ["default"],
    input: TEXT_INPUT,
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
  [MODEL_IDS.quarantinedFlashLite]: {
    id: MODEL_IDS.quarantinedFlashLite,
    family: "generate-content",
    stability: "quarantined",
    operations: ["generate"],
    ordinaryRoutingAllowed: false,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 500, initialUsableRpd: 0 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 1_024,
    routeClasses: [],
    input: TEXT_INPUT,
    healthGate: FLASH_LITE_HEALTH_GATE,
  },
  [MODEL_IDS.quarantinedPreview]: {
    id: MODEL_IDS.quarantinedPreview,
    family: "generate-content",
    stability: "quarantined",
    operations: ["generate"],
    ordinaryRoutingAllowed: false,
    limits: { ...GENERATION_LIMITS, perProjectRpd: 20, initialUsableRpd: 0 },
    deadlineMs: 15_000,
    thinking: { kind: "none" },
    outputFloor: 1_024,
    routeClasses: [],
    input: TEXT_INPUT,
    healthGate: { required: true, minimumSuccessRate: 0.95, maximumP95LatencyMs: 4_000, minimumSampleSize: 20 },
  },
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
} as const satisfies Record<ModelId, ModelRegistryEntry>;

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
  default: [MODEL_IDS.default, MODEL_IDS.stableFlash, MODEL_IDS.stableFlashLite],
  premiumPedagogy: [MODEL_IDS.premiumPedagogy, MODEL_IDS.default, MODEL_IDS.stableFlash],
  premiumVisual: [MODEL_IDS.premiumVisual, MODEL_IDS.stableFlash],
  emergency: [MODEL_IDS.emergencyText],
} as const;

/**
 * Cloudflare's Google AI Studio gateway supports the generateContent family.
 * Gemini Interactions uses a different endpoint and must use the direct client.
 */
export function modelSupportsAiGateway(modelId: string): boolean {
  return getModelEntry(modelId).family !== "interactions";
}

export function normalizeModelId(modelId: string): ModelId {
  const normalized = modelId.startsWith("models/") ? modelId.slice("models/".length) : modelId;
  if (!(normalized in MODEL_REGISTRY)) {
    throw new ProviderAdapterError({
      code: "UNKNOWN_MODEL",
      message: `unknown Gemini model ${normalized}`,
      retryClassification: "invalid_request",
      modelId: normalized,
    });
  }
  return normalized as ModelId;
}

export function getModelEntry(modelId: string): ModelRegistryEntry {
  return MODEL_REGISTRY[normalizeModelId(modelId)];
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
 * Resolves distinct provider project aliases with fallback defaults for missing or blank entries.
 */
export function getProjectAliases(input: Partial<Record<`GEMINI_PROJECT_ALIAS_${1 | 2 | 3 | 4}`, string>> = {}): readonly string[] {
  const aliases = [1, 2, 3, 4].map((index) => {
    const raw = input[`GEMINI_PROJECT_ALIAS_${index as 1 | 2 | 3 | 4}`];
    return raw && raw.trim().length > 0 ? raw.trim() : `gemini-project-${index}`;
  });
  if (new Set(aliases).size !== aliases.length) {
    throw new Error("GEMINI_PROJECT_ALIASES_MUST_BE_DISTINCT");
  }
  return aliases;
}
