import { z } from "zod";

/**
 * Plan 015: Golden AI Evaluation Contracts
 * Defines labeled golden test cases and zero-tolerance release threshold invariants.
 */

export const GoldenCategorySchema = z.enum([
  "tutor",
  "knowledge",
  "material",
  "questions",
  "analytics",
  "flashcards",
  "diktat",
]);
export type GoldenCategory = z.infer<typeof GoldenCategorySchema>;

export const GoldenCaseSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  category: GoldenCategorySchema,
  input: z.record(z.string(), z.any()),
  expectedOutcome: z.string(),
  prohibitedOutputs: z.array(z.string()).optional().default([]),
  zeroToleranceInvariant: z.enum([
    "active_attempt_redaction",
    "cache_user_isolation",
    "unknown_citation_rejection",
    "provider_failure_fail_closed",
    "unverified_question_rejection",
    "diktat_qa_fail_closed",
  ]).optional(),
});
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export interface EvaluationSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  zeroToleranceViolations: number;
  passedInvariants: boolean;
}
