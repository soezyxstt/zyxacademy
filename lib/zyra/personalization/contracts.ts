import { z } from "zod";

export const ZYRA_PERSONALIZATION_VERSION = "zyra-personalization-v1" as const;
export const ZYRA_PROFILE_EXPIRY_DAYS = 30;
export const ZYRA_EVIDENCE_RETENTION_DAYS = 90;
export const ZYRA_MIN_INFERENCE_EVIDENCE = 3;

export const paceValues = ["slow", "standard", "fast"] as const;
export const representationValues = ["text", "visual", "stepwise", "example", "mixed"] as const;
export const explanationLengthValues = ["concise", "standard", "detailed"] as const;
export const checkpointTypeValues = ["free_text", "teach_back", "choice"] as const;

export const ZyraLearnerPreferencesSchema = z.object({
  pace: z.enum(paceValues).optional(),
  representation: z.enum(representationValues).optional(),
  explanationLength: z.enum(explanationLengthValues).optional(),
  checkpointType: z.enum(checkpointTypeValues).optional(),
}).strict();

export type ZyraLearnerPreferences = z.infer<typeof ZyraLearnerPreferencesSchema>;

export const ZyraLearningEventInputSchema = z.object({
  courseId: z.string().trim().min(1).max(160),
  ideaId: z.string().trim().min(1).max(160).nullable().optional(),
  eventKind: z.enum([
    "tutor_question",
    "hint_requested",
    "checkpoint_answered",
    "teach_back",
    "flashcard_review",
    "quiz_answer",
    "material_completed",
  ]),
  sourceType: z.enum(["tutor", "flashcard", "quiz", "material", "explicit"]),
  evidenceRef: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/).nullable().optional(),
  outcome: z.enum(["success", "failure", "neutral", "unknown"]).optional(),
  correctness: z.number().min(0).max(1).nullable().optional(),
  responseLatencyBucket: z.enum(["very_fast", "fast", "standard", "slow", "unknown"]).optional(),
  hintLevel: z.enum(["none", "hint_1", "hint_2", "hint_3", "hint_4", "unknown"]).optional(),
  representation: z.enum(["text", "visual", "stepwise", "example", "mixed", "unknown"]).optional(),
  weight: z.number().finite().min(0.1).max(1).optional(),
}).strict();

export type ZyraLearningEventInput = z.infer<typeof ZyraLearningEventInputSchema>;

export type InferredPace = "unknown" | "slow" | "standard" | "fast";
export type InferredRepresentation = "unknown" | "text" | "visual" | "stepwise" | "example" | "mixed";
export type InferredSupportIntensity = "unknown" | "light" | "standard" | "high";
export type InferredExplanationLength = "unknown" | "concise" | "standard" | "detailed";
export type InferredCheckpointType = "unknown" | "free_text" | "teach_back" | "choice";

export interface ZyraAdaptationDecision {
  profileVersion: typeof ZYRA_PERSONALIZATION_VERSION;
  inferred: {
    pace: InferredPace;
    representation: InferredRepresentation;
    supportIntensity: InferredSupportIntensity;
    explanationLength: InferredExplanationLength;
    checkpointType: InferredCheckpointType;
  };
  pace: InferredPace;
  representation: InferredRepresentation;
  supportIntensity: InferredSupportIntensity;
  explanationLength: InferredExplanationLength;
  checkpointType: InferredCheckpointType;
  confidence: number;
  evidenceCount: number;
  reasonCodes: string[];
  lastEvidenceAt: Date | null;
  expiresAt: Date | null;
  explicitPreferences: ZyraLearnerPreferences;
}

export const ZyraAdaptationDecisionSchema = z.object({
  profileVersion: z.literal(ZYRA_PERSONALIZATION_VERSION),
  inferred: z.object({
    pace: z.enum(["unknown", ...paceValues]),
    representation: z.enum(["unknown", ...representationValues]),
    supportIntensity: z.enum(["unknown", "light", "standard", "high"]),
    explanationLength: z.enum(["unknown", ...explanationLengthValues]),
    checkpointType: z.enum(["unknown", ...checkpointTypeValues]),
  }),
  pace: z.enum(["unknown", ...paceValues]),
  representation: z.enum(["unknown", ...representationValues]),
  supportIntensity: z.enum(["unknown", "light", "standard", "high"]),
  explanationLength: z.enum(["unknown", ...explanationLengthValues]),
  checkpointType: z.enum(["unknown", ...checkpointTypeValues]),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  reasonCodes: z.array(z.string().regex(/^[A-Z0-9_]+$/)).max(32),
  lastEvidenceAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  explicitPreferences: ZyraLearnerPreferencesSchema,
});

export interface ZyraEvidenceRow {
  eventKind: ZyraLearningEventInput["eventKind"];
  sourceType: ZyraLearningEventInput["sourceType"];
  evidenceRef: string | null;
  outcome: NonNullable<ZyraLearningEventInput["outcome"]> | null;
  correctness: number | null;
  responseLatencyBucket: NonNullable<ZyraLearningEventInput["responseLatencyBucket"]>;
  hintLevel: NonNullable<ZyraLearningEventInput["hintLevel"]>;
  representation: NonNullable<ZyraLearningEventInput["representation"]>;
  weight: number;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * Explicit allowlist for fields that may influence presentation adaptation.
 * Raw prompts, responses, filenames, and identity-bearing text are absent by
 * construction and must not be added without a new privacy review.
 */
export const ZYRA_EVIDENCE_ALLOWLIST = {
  zyra_learning_events: [
    "eventKind",
    "sourceType",
    "evidenceRef",
    "outcome",
    "correctness",
    "responseLatencyBucket",
    "hintLevel",
    "representation",
    "weight",
    "createdAt",
    "expiresAt",
  ],
  explicit_preferences: ["pace", "representation", "explanationLength", "checkpointType"],
} as const;

export function isAllowedEvidenceField(source: keyof typeof ZYRA_EVIDENCE_ALLOWLIST, field: string): boolean {
  return (ZYRA_EVIDENCE_ALLOWLIST[source] as readonly string[]).includes(field);
}

export function toAdaptationSnapshot(decision: ZyraAdaptationDecision) {
  return {
    profileVersion: decision.profileVersion,
    pace: decision.pace,
    representation: decision.representation,
    supportIntensity: decision.supportIntensity,
    explanationLength: decision.explanationLength,
    checkpointType: decision.checkpointType,
    confidence: decision.confidence,
    evidenceCount: decision.evidenceCount,
    reasonCodes: [...decision.reasonCodes],
    lastEvidenceAt: decision.lastEvidenceAt?.toISOString() ?? null,
    expiresAt: decision.expiresAt?.toISOString() ?? null,
    explicitPreferences: { ...decision.explicitPreferences },
  };
}
