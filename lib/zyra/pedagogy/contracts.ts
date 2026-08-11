import { z } from "zod";
import { VisualSpecSchema } from "@/lib/tutor/visual-contracts";

export const PEDAGOGY_VERSION = "zyra-pedagogy-v3";
export const PEDAGOGY_PROMPT_VERSION = "3.0.0";
export const PEDAGOGY_POLICY_VERSION = "3.0.0";
export const PEDAGOGY_RESPONSE_SCHEMA_VERSION = "3.0.0";

export const TeachingStateSchema = z.enum([
  "orient",
  "diagnose",
  "explain",
  "hint_1_concept",
  "hint_2_representation",
  "hint_3_analogous_example",
  "hint_4_partial_step",
  "teach_back",
  "check",
  "clarify",
]);
export type TeachingState = z.infer<typeof TeachingStateSchema>;

export const HintLevelSchema = z.enum([
  "none",
  "hint_1_concept",
  "hint_2_representation",
  "hint_3_analogous_example",
  "hint_4_partial_step",
]);
export type HintLevel = z.infer<typeof HintLevelSchema>;

export const TeachingMoveSchema = z.enum([
  "orient_goal",
  "diagnose_misconception",
  "explain_concept",
  "identify_principle",
  "show_representation",
  "work_analogous_example",
  "reveal_partial_step",
  "teach_back_prompt",
  "check_understanding",
  "clarify_evidence",
]);
export type TeachingMove = z.infer<typeof TeachingMoveSchema>;

export const NextAllowedActionSchema = z.enum([
  "answer_checkpoint",
  "ask_discriminating_question",
  "request_clarification",
  "continue_with_hint",
  "try_analogous_example",
  "review_canonical_material",
  "stop_at_assessment_boundary",
]);
export type NextAllowedAction = z.infer<typeof NextAllowedActionSchema>;

export const LearnerResponseShapeSchema = z.enum([
  "unknown",
  "free_text",
  "short_answer",
  "multiple_choice",
  "equation",
  "prediction",
]);
export type LearnerResponseShape = z.infer<typeof LearnerResponseShapeSchema>;

export const PedagogicalEvidenceSufficiencySchema = z.enum([
  "insufficient",
  "limited",
  "sufficient",
]);
export type PedagogicalEvidenceSufficiency = z.infer<typeof PedagogicalEvidenceSufficiencySchema>;

export const PedagogySourceSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  kind: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  href: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();
export type PedagogySource = z.infer<typeof PedagogySourceSchema>;

export const PedagogyContextSchema = z.object({
  courseId: z.string().min(1),
  chapterId: z.string().nullable(),
  action: z.enum(["new_topic", "follow_up", "hint_request", "teach_back", "check_response"]),
  evidenceSufficiency: PedagogicalEvidenceSufficiencySchema,
  activeAssessment: z.boolean(),
  allowDirectAnswerReveal: z.boolean(),
  assessmentReasonCode: z.string().min(1),
  learnerResponseShape: LearnerResponseShapeSchema,
  previousHintLevel: HintLevelSchema,
  misconceptionUncertain: z.boolean(),
  responseModifiers: z.array(z.string().min(1)).max(8),
  explicitTopic: z.string().min(1).max(500),
}).strict();
export type PedagogyContext = z.infer<typeof PedagogyContextSchema>;

export const PedagogyPromptInputSchema = z.object({
  context: PedagogyContextSchema,
  selectedState: TeachingStateSchema,
  hintLevel: HintLevelSchema,
  evidence: z.array(PedagogySourceSchema).max(12),
  learnerQuestion: z.string().min(1).max(1200),
  outputRules: z.array(z.string().min(1)).min(1).max(16),
}).strict();
export type PedagogyPromptInput = z.infer<typeof PedagogyPromptInputSchema>;

const DiagnosisHypothesisSchema = z.object({
  hypothesis: z.string().min(1).max(500),
  evidenceSufficiency: PedagogicalEvidenceSufficiencySchema,
}).strict();

const ExplanationBlockSchema = z.object({
  kind: z.enum(["goal", "concept", "principle", "representation", "example", "partial_step", "checkpoint"]),
  text: z.string().min(1).max(1200),
}).strict();

const CitationSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersion: z.number().int().positive(),
  claim: z.string().min(1).max(500),
}).strict();

const CheckForUnderstandingSchema = z.object({
  question: z.string().min(5).max(500),
  expectedResponseShape: LearnerResponseShapeSchema,
}).strict();

const AssessmentSafetySchema = z.object({
  decision: z.enum(["allowed", "scaffold_only", "clarify", "refuse"]),
  reasonCode: z.string().min(1),
}).strict();

export const ZyraTeachingResponseSchema = z.object({
  learningGoal: z.string().min(1).max(500),
  observedFacts: z.array(z.string().min(1).max(500)).max(8),
  diagnosisHypotheses: z.array(DiagnosisHypothesisSchema).max(4),
  selectedState: TeachingStateSchema,
  teachingMove: TeachingMoveSchema,
  hintLevel: HintLevelSchema,
  explanationBlocks: z.array(ExplanationBlockSchema).min(1).max(8),
  citations: z.array(CitationSchema).max(12),
  visualSpec: VisualSpecSchema.nullable().optional(),
  checkForUnderstanding: CheckForUnderstandingSchema.nullable(),
  nextAllowedAction: NextAllowedActionSchema,
  assessmentSafety: AssessmentSafetySchema,
  learnerFacingText: z.string().min(1).max(5000),
}).strict();
export type ZyraTeachingResponse = z.infer<typeof ZyraTeachingResponseSchema>;

export type PedagogyFailureCode =
  | "NO_EVIDENCE"
  | "INVALID_STATE"
  | "INVALID_CITATION"
  | "ACTIVE_ASSESSMENT_LEAK"
  | "UNSUPPORTED_CLAIM"
  | "PIPELINE_LANGUAGE"
  | "MISSING_CHECKPOINT"
  | "INVALID_VISUAL_CLAIM"
  | "MODEL_OUTPUT_REJECTED";
