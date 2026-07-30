import { z } from "zod";

/**
 * Plan 013: Atomic Active-Recall Flashcard Contract (V2)
 * Ensures every flashcard tests exactly ONE explicit recall target,
 * preserves source provenance, and separates content complexity from learner difficulty.
 */

export const PromptTypeSchema = z.enum([
  "definition",
  "formula",
  "cloze",
  "process_step",
  "reverse_concept",
]);
export type PromptType = z.infer<typeof PromptTypeSchema>;

export const ContentComplexitySchema = z.enum(["low", "medium", "high"]);
export type ContentComplexity = z.infer<typeof ContentComplexitySchema>;

export const FlashcardContractV2Schema = z.object({
  id: z.string().min(1),
  recallTarget: z.string().min(3),
  promptType: PromptTypeSchema,
  front: z.string().min(5),
  canonicalAnswer: z.string().min(1),
  atomicKeyPoints: z.array(z.string().min(1)).min(1),
  acceptableVariants: z.array(z.string()).default([]),
  nonAcceptedConfusions: z.array(z.string()).default([]),
  sourceKoIds: z.array(z.string().min(1)).min(1),
  sourceSpanIds: z.array(z.string()).default([]),
  contentComplexity: ContentComplexitySchema,
});
export type FlashcardContractV2 = z.infer<typeof FlashcardContractV2Schema>;
