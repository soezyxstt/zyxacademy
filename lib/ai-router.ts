import {
  ROUTE_POLICY,
  getRpdLimit as getRegistryRpdLimit,
  getRpmLimit as getRegistryRpmLimit,
  getTpmLimit as getRegistryTpmLimit,
  type ModelId,
  type ModelRouteClass,
} from "@/lib/ai/provider/model-registry";

export const USE_CASES = {
  GROUNDED_RAG: "grounded-rag",
  EXPLAIN_CONCEPT: "explain-concept",
  CHAPTER_SUMMARY: "chapter-summary",
  MISTAKE_FEEDBACK: "mistake-feedback",
  FLASHCARD_GEN: "flashcard-gen",
  MATERIAL_GEN: "material-gen",
  PRACTICE_QUESTION_GEN: "practice-question-gen",
  UNGROUNDED_TUTOR: "ungrounded-tutor",
  UNGROUNDED_TUTOR_GEMMA: "ungrounded-tutor-gemma",
  KO_EXTRACTION: "ko-extraction",
  KO_VALIDATION: "ko-validation",
  QUESTION_REVIEW: "question-review",
  WEAK_CONCEPT_GUIDANCE: "weak-concept-guidance",
  WEAK_CONCEPT_GUIDANCE_GEMMA: "weak-concept-guidance-gemma",
  DIKTAT_AUDIT: "diktat-audit",
  DIKTAT_PDF_AUDIT: "diktat-pdf-audit",
  DIKTAT_EXAM_PATTERNS: "diktat-exam-patterns",
  DIKTAT_QUICK_METHODS: "diktat-quick-methods",
} as const;

export type UseCase = (typeof USE_CASES)[keyof typeof USE_CASES];

type ModelChain = readonly ModelId[];

export type ProviderRouteRequest = {
  readonly useCase?: string;
  readonly feature?: string;
  readonly visualMode?: boolean;
  readonly multimodal?: boolean;
  readonly evidenceSize?: number;
  readonly assessmentState?: "active" | "inactive";
  readonly explicitUserAction?: "explain" | "diagnose" | "visualize" | "summarize" | "generate" | "emergency";
};

export type ProviderRoutePlan = {
  readonly routeClass: ModelRouteClass;
  readonly models: readonly ModelId[];
  readonly premium: boolean;
};

const REGISTRY_CHAINS: Record<string, ModelChain> = {
  [USE_CASES.GROUNDED_RAG]: ROUTE_POLICY.default,
  [USE_CASES.EXPLAIN_CONCEPT]: ROUTE_POLICY.default,
  [USE_CASES.CHAPTER_SUMMARY]: ROUTE_POLICY.default,
  [USE_CASES.MISTAKE_FEEDBACK]: ROUTE_POLICY.default,
  [USE_CASES.FLASHCARD_GEN]: ROUTE_POLICY.default,
  [USE_CASES.MATERIAL_GEN]: ROUTE_POLICY.default,
  [USE_CASES.PRACTICE_QUESTION_GEN]: ROUTE_POLICY.default,
  [USE_CASES.UNGROUNDED_TUTOR]: ROUTE_POLICY.default,
  [USE_CASES.UNGROUNDED_TUTOR_GEMMA]: ROUTE_POLICY.default,
  [USE_CASES.KO_EXTRACTION]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.KO_VALIDATION]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.QUESTION_REVIEW]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.WEAK_CONCEPT_GUIDANCE]: ROUTE_POLICY.default,
  [USE_CASES.WEAK_CONCEPT_GUIDANCE_GEMMA]: ROUTE_POLICY.default,
  [USE_CASES.DIKTAT_AUDIT]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.DIKTAT_PDF_AUDIT]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.DIKTAT_EXAM_PATTERNS]: ROUTE_POLICY.premiumPedagogy,
  [USE_CASES.DIKTAT_QUICK_METHODS]: ROUTE_POLICY.premiumPedagogy,
  default: ROUTE_POLICY.default,
};

const DIAGNOSTIC_USE_CASES = new Set<string>([
  USE_CASES.MISTAKE_FEEDBACK,
  USE_CASES.QUESTION_REVIEW,
  USE_CASES.DIKTAT_AUDIT,
  USE_CASES.DIKTAT_PDF_AUDIT,
]);

const EMERGENCY_USE_CASES = new Set<string>([]);

/** Classifies only server-owned request attributes. Model names in prompts are ignored. */
export function classifyProviderRoute(input: ProviderRouteRequest = {}): ProviderRoutePlan {
  if (input.explicitUserAction === "emergency" || EMERGENCY_USE_CASES.has(input.useCase ?? "")) {
    return { routeClass: "emergency", models: ROUTE_POLICY.emergency, premium: false };
  }

  if (input.visualMode === true || input.multimodal === true) {
    return { routeClass: "premium-visual", models: ROUTE_POLICY.premiumVisual, premium: true };
  }

  if (input.explicitUserAction === "diagnose" || DIAGNOSTIC_USE_CASES.has(input.useCase ?? "")) {
    return { routeClass: "premium-pedagogy", models: ROUTE_POLICY.premiumPedagogy, premium: true };
  }

  return { routeClass: "default", models: ROUTE_POLICY.default, premium: false };
}

export function providerRouterV2Enabled(): boolean {
  return Boolean(process.env.ZYRA_CONTROL_PLANE_URL && process.env.ZYRA_CONTROL_PLANE_TOKEN);
}

export function getModelChain(useCase?: string): string[] {
  const chains = REGISTRY_CHAINS;
  return [...(useCase && chains[useCase] ? chains[useCase] : chains.default)];
}

export function getProviderRoutePlan(input: ProviderRouteRequest = {}): ProviderRoutePlan {
  return classifyProviderRoute(input);
}

export function getRpdLimit(modelId: string): number {
  return getRegistryRpdLimit(modelId);
}

export function getRpmLimit(modelId: string): number {
  return getRegistryRpmLimit(modelId);
}

export function getTpmLimit(modelId: string): number {
  return getRegistryTpmLimit(modelId);
}
