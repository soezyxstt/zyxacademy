import { z } from "zod";

/**
 * Plan 012: Evidence-Calibrated Learner Analytics Contracts
 * Separates observed quantitative facts, tentative interpretations, and bounded recommendations.
 */

export const EvidenceSufficiencySchema = z.enum([
  "insufficient",
  "limited",
  "sufficient",
]);
export type EvidenceSufficiency = z.infer<typeof EvidenceSufficiencySchema>;

export const ObservedAnalyticsSchema = z.object({
  totalQuestions: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  accuracyPercentage: z.number().min(0).max(100),
  timingAvailable: z.boolean(),
  perQuestionTimingAvailable: z.boolean(),
  attemptDurationSeconds: z.number().nullable().optional(),
});
export type ObservedAnalytics = z.infer<typeof ObservedAnalyticsSchema>;

export const InterpretedHypothesisSchema = z.object({
  hypothesis: z.string().min(3),
  evidenceLabel: EvidenceSufficiencySchema,
  supportingObservationIds: z.array(z.string()).default([]),
  alternativeExplanations: z.array(z.string()).default([]),
});
export type InterpretedHypothesis = z.infer<typeof InterpretedHypothesisSchema>;

export const RecommendedActionSchema = z.object({
  actionSummary: z.string().min(3),
  resourceId: z.string().optional(),
  reason: z.string().min(3),
});
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

export const CalibratedAnalyticsResultSchema = z.object({
  evidenceSufficiency: EvidenceSufficiencySchema,
  observed: ObservedAnalyticsSchema,
  interpreted: z.array(InterpretedHypothesisSchema),
  recommended: z.array(RecommendedActionSchema),
});
export type CalibratedAnalyticsResult = z.infer<typeof CalibratedAnalyticsResultSchema>;

/**
 * Evaluates evidence sufficiency deterministically based on sample size and response data.
 */
export function evaluateEvidenceSufficiency(totalQuestions: number): EvidenceSufficiency {
  if (totalQuestions < 3) return "insufficient";
  if (totalQuestions <= 5) return "limited";
  return "sufficient";
}
