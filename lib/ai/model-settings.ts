import { z } from "zod";
import {
  MODEL_IDS,
  MODEL_REGISTRY,
  ROUTE_POLICY,
  getModelEntry,
  type ModelFamily,
  type ModelId,
  type ModelStability,
} from "./provider/model-registry";

export const MODEL_FEATURE_GROUPS = [
  ["interactive", "Interaktif utama"],
  ["learning", "Pembelajaran dan evaluasi"],
  ["generation", "Generasi materi dan konten"],
  ["documents", "Audit diktat dan dokumen"],
] as const;

export type ModelFeatureGroup = (typeof MODEL_FEATURE_GROUPS)[number][0];

export interface ModelFeatureDefinition {
  readonly id: string;
  readonly label: string;
  readonly group: ModelFeatureGroup;
  readonly description: string;
  readonly requiresStreamingTools: boolean;
  readonly supportsImages: boolean;
  readonly runtimeDefaultModels: readonly ModelId[];
  readonly editableDefaultModels: readonly [ModelId, ModelId, ModelId];
}

const DEFAULT_EDITABLE_TRIO: readonly [ModelId, ModelId, ModelId] = [
  MODEL_IDS.default,
  MODEL_IDS.fallbackFlashLite,
  MODEL_IDS.stableFlash,
];

const PREMIUM_PEDAGOGY_TRIO: readonly [ModelId, ModelId, ModelId] = [
  MODEL_IDS.premiumPedagogy,
  MODEL_IDS.default,
  MODEL_IDS.stableFlash,
];

const OPS_AI_EDITABLE_TRIO: readonly [ModelId, ModelId, ModelId] = [
  MODEL_IDS.stableFlash,
  MODEL_IDS.default,
  MODEL_IDS.fallbackFlashLite,
];

export const MODEL_FEATURE_CATALOG = [
  {
    id: "zyra",
    label: "Zyra",
    group: "interactive",
    description: "Tutor materi, diskusi bab, latihan terpandu, dan bantuan gambar.",
    requiresStreamingTools: false,
    supportsImages: true,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "playground",
    label: "Playground",
    group: "interactive",
    description: "Bantuan koding interaktif, analisis galat, dan alur eksekusi kode.",
    requiresStreamingTools: false,
    supportsImages: true,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "admin-ops-ai",
    label: "Ops AI",
    group: "interactive",
    description: "Asisten operasional admin dengan streaming respons dan pemanggilan tool.",
    requiresStreamingTools: true,
    supportsImages: false,
    runtimeDefaultModels: [MODEL_IDS.stableFlash],
    editableDefaultModels: OPS_AI_EDITABLE_TRIO,
  },
  {
    id: "explain-concept",
    label: "Penjelasan konsep",
    group: "learning",
    description: "Penjelasan terstruktur untuk konsep dan analisis pilihan jawaban.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "chapter-summary",
    label: "Ringkasan bab",
    group: "learning",
    description: "Ringkasan konsep inti, kesalahan umum, dan rumus penting per bab.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "mistake-feedback",
    label: "Umpan balik",
    group: "learning",
    description: "Umpan balik jawaban murid dan evaluasi formatif artikel.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "weak-concept-guidance",
    label: "Diagnosis belajar",
    group: "learning",
    description: "Diagnosis konsep lemah dan panduan belajar terpersonalisasi.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "admin-quiz-insights",
    label: "Analisis kuis",
    group: "learning",
    description: "Analisis pedagogis mendalam untuk performa butir soal dan distraktor.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "material-gen",
    label: "Generasi materi",
    group: "generation",
    description: "Penyusunan materi kuliah terstruktur dari objek pengetahuan.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "flashcard-gen",
    label: "Generasi flashcard",
    group: "generation",
    description: "Pembuatan kartu belajar dari materi bab aktif.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "practice-question-gen",
    label: "Generasi soal",
    group: "generation",
    description: "Pembuatan soal latihan dan verifikasi solver independen.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "question-review",
    label: "Review soal",
    group: "generation",
    description: "Pemeriksaan kualitas dan validitas pedagogis butir soal.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "ko-extraction",
    label: "Ekstraksi pengetahuan",
    group: "generation",
    description: "Ekstraksi objek pengetahuan dan butir asesmen dari dokumen sumber.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "ko-validation",
    label: "Validasi pengetahuan",
    group: "generation",
    description: "Kanonikalisasi dan validasi konsistensi objek pengetahuan.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "blog-summary",
    label: "Ringkasan blog",
    group: "generation",
    description: "Pembuatan ringkasan singkat otomatis untuk draf artikel blog.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "diktat-audit",
    label: "Audit diktat",
    group: "documents",
    description: "Audit kelengkapan isi dan struktur pedagogis diktat.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "diktat-pdf-audit",
    label: "Audit PDF diktat",
    group: "documents",
    description: "Pemeriksaan kualitas teks hasil render PDF diktat.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "diktat-exam-patterns",
    label: "Pola ujian",
    group: "documents",
    description: "Analisis pola soal ujian dari arsip akademik.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "diktat-quick-methods",
    label: "Metode cepat",
    group: "documents",
    description: "Penyusunan strategi penyelesaian cepat yang terverifikasi.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.premiumPedagogy,
    editableDefaultModels: PREMIUM_PEDAGOGY_TRIO,
  },
  {
    id: "academic-document-standardizer",
    label: "Standardisasi dokumen",
    group: "documents",
    description: "Penamaan baku dan pemetaan bab untuk satu berkas akademik.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
  {
    id: "academic-batch-document-standardizer",
    label: "Standardisasi dokumen batch",
    group: "documents",
    description: "Penamaan baku dan pemetaan bab untuk kumpulan berkas akademik.",
    requiresStreamingTools: false,
    supportsImages: false,
    runtimeDefaultModels: ROUTE_POLICY.default,
    editableDefaultModels: DEFAULT_EDITABLE_TRIO,
  },
] as const satisfies readonly ModelFeatureDefinition[];

export type ModelFeature = (typeof MODEL_FEATURE_CATALOG)[number]["id"];

export const MODEL_FEATURES: readonly (readonly [ModelFeature, string])[] =
  MODEL_FEATURE_CATALOG.map((entry) => [entry.id, entry.label] as const);

const FEATURE_DEFINITION_MAP = new Map<ModelFeature, (typeof MODEL_FEATURE_CATALOG)[number]>(
  MODEL_FEATURE_CATALOG.map((entry) => [entry.id, entry]),
);

const MODEL_DISPLAY_NAMES: Readonly<Partial<Record<ModelId, string>>> = {
  [MODEL_IDS.default]: "Gemini 3.5 Flash Lite",
  [MODEL_IDS.fallbackFlashLite]: "Gemini 3.1 Flash Lite",
  [MODEL_IDS.premiumPedagogy]: "Gemini 3.5 Flash",
  [MODEL_IDS.premiumVisual]: "Gemini 3.6 Flash",
  [MODEL_IDS.stableFlash]: "Gemini 2.5 Flash",
  [MODEL_IDS.stableFlashLite]: "Gemini 2.5 Flash Lite",
  [MODEL_IDS.emergencyText]: "Gemma 4 31B IT",
};

export interface SelectableModelOption {
  readonly id: ModelId;
  readonly label: string;
  readonly family: ModelFamily;
  readonly stability: ModelStability;
  readonly supportsImage: boolean;
  readonly rpdLimit: number;
}

export const selectableModels: readonly ModelId[] = Object.values(MODEL_REGISTRY)
  .filter((entry) => entry.ordinaryRoutingAllowed && entry.operations.includes("generate"))
  .map((entry) => entry.id);

export const generateContentSelectableModels: readonly ModelId[] = selectableModels.filter(
  (id) => getModelEntry(id).family === "generate-content",
);

export function getFeatureDefinition(feature: ModelFeature): (typeof MODEL_FEATURE_CATALOG)[number] {
  const found = FEATURE_DEFINITION_MAP.get(feature);
  if (!found) {
    throw new Error(`Fitur model AI tidak dikenal: ${feature}`);
  }
  return found;
}

export function selectableModelsForFeature(feature: ModelFeature): readonly ModelId[] {
  const def = getFeatureDefinition(feature);
  if (def.requiresStreamingTools) {
    return generateContentSelectableModels;
  }
  return selectableModels;
}

export function getSelectableModelOption(id: ModelId): SelectableModelOption {
  const entry = getModelEntry(id);
  return {
    id,
    label: MODEL_DISPLAY_NAMES[id] ?? id,
    family: entry.family,
    stability: entry.stability,
    supportsImage: entry.input.image,
    rpdLimit: entry.limits.perProjectRpd,
  };
}

export function defaultEditableModels(feature: ModelFeature): readonly [ModelId, ModelId, ModelId] {
  return getFeatureDefinition(feature).editableDefaultModels;
}

export function runtimeDefaultModels(feature: ModelFeature): readonly ModelId[] {
  return getFeatureDefinition(feature).runtimeDefaultModels;
}

const featureEnumValues = MODEL_FEATURE_CATALOG.map((entry) => entry.id) as [
  ModelFeature,
  ...ModelFeature[],
];
const modelEnumValues = selectableModels as [ModelId, ...ModelId[]];

export const modelSettingSchema = z
  .object({
    feature: z.enum(featureEnumValues),
    models: z
      .array(z.enum(modelEnumValues))
      .length(3, "Pilih tepat tiga prioritas model.")
      .refine((models) => new Set(models).size === models.length, "Pilih tiga model berbeda."),
  })
  .superRefine((value, ctx) => {
    const allowed = new Set(selectableModelsForFeature(value.feature));
    value.models.forEach((modelId, index) => {
      if (!allowed.has(modelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["models", index],
          message:
            "Model ini belum mendukung streaming tool untuk Ops AI. Pilih model keluarga generate-content.",
        });
      }
    });
  });

export type ValidatedModelSetting = z.infer<typeof modelSettingSchema>;

const ZYRA_USE_CASES = new Set<string>([
  "grounded-rag",
  "ungrounded-tutor",
  "ungrounded-tutor-gemma",
  "ZYRA_PEDAGOGY_V3",
]);

export function modelFeature(feature?: string, useCase?: string): ModelFeature | undefined {
  if (feature === "playground") return "playground";
  if (feature && FEATURE_DEFINITION_MAP.has(feature as ModelFeature)) {
    return feature as ModelFeature;
  }
  if (useCase && FEATURE_DEFINITION_MAP.has(useCase as ModelFeature)) {
    return useCase as ModelFeature;
  }
  if (useCase === "weak-concept-guidance-gemma") {
    return "weak-concept-guidance";
  }
  if ((useCase && ZYRA_USE_CASES.has(useCase)) || (feature && feature !== "zyra-provider-request" && feature.startsWith("zyra-"))) {
    return "zyra";
  }
  return undefined;
}

export function compatibleModelChain(
  models: readonly ModelId[],
  visualOrOptions:
    | boolean
    | {
        readonly visual?: boolean;
        readonly fallbackModels?: readonly ModelId[];
        readonly requireGenerateContent?: boolean;
      },
): ModelId[] {
  const options =
    typeof visualOrOptions === "boolean"
      ? { visual: visualOrOptions }
      : visualOrOptions;
  const visual = Boolean(options.visual);
  const requireGenerateContent = Boolean(options.requireGenerateContent);

  const isCompatible = (id: ModelId): boolean => {
    const entry = getModelEntry(id);
    if (visual && !entry.input.image) return false;
    if (requireGenerateContent && entry.family !== "generate-content") return false;
    return true;
  };

  const primary = models.filter(isCompatible);
  if (!visual || !options.fallbackModels?.length) {
    return primary;
  }

  // Only 2 models in MODEL_REGISTRY accept image input (gemini-3.6-flash and gemini-2.5-flash).
  // Preserve admin priority for any selected image-capable models, then append remaining
  // visual fallback models so image turns never fail solely from a text-only trio override.
  const seen = new Set<ModelId>(primary);
  for (const fallbackId of options.fallbackModels) {
    if (!seen.has(fallbackId) && isCompatible(fallbackId)) {
      seen.add(fallbackId);
      primary.push(fallbackId);
    }
  }
  return primary;
}

export interface StoredModelSettingRow {
  readonly feature: string;
  readonly models: readonly string[];
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
}

export interface FeatureModelSettingView {
  readonly feature: ModelFeature;
  readonly label: string;
  readonly group: ModelFeatureGroup;
  readonly description: string;
  readonly isCustom: boolean;
  readonly models: readonly [ModelId, ModelId, ModelId];
  readonly runtimeDefaultModels: readonly ModelId[];
  readonly editableDefaultModels: readonly [ModelId, ModelId, ModelId];
  readonly selectableModels: readonly ModelId[];
  readonly requiresStreamingTools: boolean;
  readonly supportsImages: boolean;
  readonly updatedBy: string | null;
  readonly updatedAt: string | null;
}

export function buildFeatureModelSettingViews(
  rows: readonly StoredModelSettingRow[],
): FeatureModelSettingView[] {
  const byFeature = new Map<string, StoredModelSettingRow>();
  for (const row of rows) {
    byFeature.set(row.feature, row);
  }

  return MODEL_FEATURE_CATALOG.map((entry) => {
    const stored = byFeature.get(entry.id);
    const parsed = stored
      ? modelSettingSchema.safeParse({
          feature: stored.feature,
          models: stored.models,
        })
      : null;
    const isValidStored = Boolean(stored && parsed?.success);
    const activeModels =
      isValidStored && parsed?.success
        ? (parsed.data.models as [ModelId, ModelId, ModelId])
        : defaultEditableModels(entry.id);

    return {
      feature: entry.id,
      label: entry.label,
      group: entry.group,
      description: entry.description,
      isCustom: isValidStored,
      models: activeModels,
      runtimeDefaultModels: runtimeDefaultModels(entry.id),
      editableDefaultModels: defaultEditableModels(entry.id),
      selectableModels: selectableModelsForFeature(entry.id),
      requiresStreamingTools: entry.requiresStreamingTools,
      supportsImages: entry.supportsImages,
      updatedBy: isValidStored && stored ? stored.updatedBy : null,
      updatedAt:
        isValidStored && stored
          ? stored.updatedAt instanceof Date
            ? stored.updatedAt.toISOString()
            : new Date(stored.updatedAt).toISOString()
          : null,
    };
  });
}
