import { z } from "zod";

export const CognitiveProcessSchema = z.enum([
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);
export type CognitiveProcess = z.infer<typeof CognitiveProcessSchema>;

export const ItemFormatSchema = z.enum(["multiple_choice", "multiple_choices"]);
export type ItemFormat = z.infer<typeof ItemFormatSchema>;

export const AnswerCardinalitySchema = z.enum(["single", "multiple"]);
export type AnswerCardinality = z.infer<typeof AnswerCardinalitySchema>;

export const DifficultyTargetSchema = z.enum(["easy", "medium", "hard"]);
export type DifficultyTarget = z.infer<typeof DifficultyTargetSchema>;

export const ReasoningPatternSchema = z.enum([
  "procedural",
  "conceptual",
  "analytical",
  "direct_computation",
  "graph_interpretation",
  "proof",
  "parameter_analysis",
  "modeling",
  "other",
]);
export type ReasoningPattern = z.infer<typeof ReasoningPatternSchema>;

export const MisconceptionFamilySchema = z.enum([
  "calc_error",
  "unit_error",
  "vocab_swap",
  "misconception",
  "formula_inversion",
  "sign_error",
  "none",
  "other",
]);
export type MisconceptionFamily = z.infer<typeof MisconceptionFamilySchema>;

export const MappingMethodSchema = z.enum([
  "exact_ko",
  "heuristic_pattern",
  "lexical_overlap",
  "embedding_similarity",
  "manual_override",
  "unknown",
]);
export type MappingMethod = z.infer<typeof MappingMethodSchema>;

export const UncertaintyStateSchema = z.enum(["confident", "ambiguous", "unknown"]);
export type UncertaintyState = z.infer<typeof UncertaintyStateSchema>;

export const BlueprintSlotSchema = z.object({
  slotId: z.string().min(1),
  learningObjectiveId: z.string().nullable().optional(),
  knowledgeObjectId: z.string().min(1, "knowledgeObjectId is required for every blueprint slot"),
  ideaIds: z.array(z.string().min(1)).min(1).optional(),
  requiredIdeaRelations: z.array(z.string().min(1)).default([]),
  ideaCount: z.number().int().positive().optional(),
  cognitiveProcess: CognitiveProcessSchema,
  difficultyTarget: DifficultyTargetSchema,
  difficultyBasis: z.string().min(1),
  reasoningPattern: ReasoningPatternSchema,
  itemFormat: ItemFormatSchema,
  answerCardinality: AnswerCardinalitySchema,
  targetedMisconceptions: z.array(
    z.object({
      optionId: z.string(),
      family: MisconceptionFamilySchema,
      description: z.string(),
    })
  ),
  sourceRequirements: z.object({
    sourceSectionId: z.string().optional(),
    sourceMtdId: z.string().optional(),
    sourceMtdVersion: z.number().optional(),
  }),
  assessmentContext: z.enum(["quiz", "uts", "uas", "practice", "tryout", "tutorial"]),
  releasePolicy: z.enum(["immediate", "delayed", "scheduled"]),
  applicationLevel: z.number().int().min(0).max(5).optional(),
  estimatedSteps: z.number().int().positive().optional(),
});
export type BlueprintSlot = z.infer<typeof BlueprintSlotSchema>;

export interface AssessmentBlueprint {
  blueprintId: string;
  version: string; // e.g. "2.0"
  courseId: string;
  chapterId?: string;
  seed: number;
  slots: BlueprintSlot[];
  crossDimensionCounts: Record<string, number>;
  tolerances: {
    minEasyRatio: number;
    maxHardRatio: number;
    maxAllowedPerKO: number;
  };
}

export interface UnshuffledDraftOption {
  id: string; // e.g. "opt_0", "opt_1", "opt_2", "opt_3"
  text: string;
  isCorrect: boolean;
  misconceptionFamily?: MisconceptionFamily;
  targetMisconceptionKoId?: string | null;
}

export interface UnshuffledQuestionDraft {
  slotId: string;
  knowledgeObjectId: string;
  ideaIds?: string[];
  requiredIdeaRelations?: string[];
  prompt: string;
  options: UnshuffledDraftOption[];
  explanation: string;
  bloomLevel: CognitiveProcess;
  pattern: ReasoningPattern;
  applicationLevel?: number;
  estimatedSteps: number;
}

export interface DistractorProvenanceRecord {
  optionIndex: number;
  stableOptionId: string;
  targetedMisconception: MisconceptionFamily;
  misconceptionKoId: string | null;
  supportingSourceIds: string[];
  mappingMethod: MappingMethod;
  score: number;
  methodVersion: string;
  uncertaintyState: UncertaintyState;
}

export interface ShuffledQuestion {
  slotId: string;
  knowledgeObjectId: string;
  ideaIds?: string[];
  requiredIdeaRelations?: string[];
  prompt: string;
  options: string[];
  correctIndices: number[];
  explanation: string;
  stableOptionIds: string[];
  distractorProvenances: DistractorProvenanceRecord[];
  shuffleSeed: number;
  bloomLevel: CognitiveProcess;
  pattern: ReasoningPattern;
  applicationLevel?: number;
  estimatedSteps: number;
}

export interface ExtractedAssessmentObject {
  id?: string;
  sourceQuestionNumber: string;
  questionType: string;
  difficulty: "easy" | "medium" | "hard";
  rawDifficulty: number | string;
  applicationLevel: number;
  concepts: string[];
  pattern: ReasoningPattern;
  reasoningType: "procedural" | "conceptual" | "analytical";
  estimatedSteps: number;
  questionMarkdown: string;
  answerMarkdown?: string | null;
  options?: string[] | null;
}

export interface ExtractionResult {
  status: "accepted" | "needs_review" | "failed";
  objects: ExtractedAssessmentObject[];
  errors: string[];
  diagnostics?: string[];
}
