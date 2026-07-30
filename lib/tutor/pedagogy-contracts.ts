import { z } from "zod";

/**
 * Plan 006: Tutor Pedagogy Contracts
 * Defines typed schemas for concept explanations, mistake analysis, and socratic questions
 * without forcing artificial analogies or ungrounded misconception claims.
 */

export const AnalogySpecSchema = z.object({
  analogyText: z.string().min(5),
  limitationBoundary: z.string().min(5, "Stated boundary where analogy stops matching is required"),
});
export type AnalogySpec = z.infer<typeof AnalogySpecSchema>;

export const MisconceptionSpecSchema = z.object({
  misconceptionText: z.string().min(5),
  verifiedSourceId: z.string().min(1),
});
export type MisconceptionSpec = z.infer<typeof MisconceptionSpecSchema>;

export const ConceptExplanationSchema = z.object({
  directExplanation: z.string().min(10),
  prerequisiteReminder: z.string().nullable().optional(),
  analogy: AnalogySpecSchema.nullable().optional(),
  commonMisconception: MisconceptionSpecSchema.nullable().optional(),
  checkForUnderstanding: z.string().nullable().optional(),
});
export type ConceptExplanation = z.infer<typeof ConceptExplanationSchema>;

export const EvidenceSufficiencySchema = z.enum(["insufficient", "limited", "sufficient"]);
export type EvidenceSufficiency = z.infer<typeof EvidenceSufficiencySchema>;

export const HypothesizedExplanationSchema = z.object({
  hypothesis: z.string().min(5),
  evidenceLabel: EvidenceSufficiencySchema,
});
export type HypothesizedExplanation = z.infer<typeof HypothesizedExplanationSchema>;

export const MistakeAnalysisSchema = z.object({
  observed: z.object({
    selectedOptionIndex: z.number().optional(),
    submittedAnswer: z.string().optional(),
  }),
  possibleExplanations: z.array(HypothesizedExplanationSchema),
  evidenceSufficiency: EvidenceSufficiencySchema,
  diagnosticQuestion: z.string().nullable().optional(),
  mathematicalError: z.string().nullable().optional(),
});
export type MistakeAnalysis = z.infer<typeof MistakeAnalysisSchema>;

export const SocraticQuestionsSchema = z.array(z.string().min(5)).max(2);
export type SocraticQuestions = z.infer<typeof SocraticQuestionsSchema>;

/**
 * Validates that an analogy specification includes a valid limitation boundary.
 */
export function validateAnalogyBoundary(analogy: AnalogySpec | null | undefined): boolean {
  if (!analogy) return true;
  return typeof analogy.limitationBoundary === "string" && analogy.limitationBoundary.trim().length >= 5;
}

/**
 * Validates that mistake analysis does not claim certain misconception when evidence is insufficient.
 */
export function validateMistakeAnalysisEvidence(analysis: MistakeAnalysis): boolean {
  if (analysis.evidenceSufficiency === "insufficient") {
    // Insufficient evidence must not claim mathematical error as certainty without work
    if (analysis.possibleExplanations.some((e) => e.evidenceLabel === "sufficient")) {
      return false;
    }
  }
  return true;
}
