import { z } from "zod";
import { solutionItemDecisionSchema } from "@/lib/solutions/review-contract";

/** Preserve each explicit decision independently in the persisted review. */
export const solutionReviewRequestSchema = z.object({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  expectedReviewVersion: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["approved", "rejected"]),
  items: z.array(solutionItemDecisionSchema).min(1).max(500),
}).strict();

export function normalizeSolutionReviewRequest(input: z.infer<typeof solutionReviewRequestSchema>) {
  if (input.decision === "approved" && input.items.some((item) => item.reasoning !== "approved")) throw new Error("PRODUCT_V5_REVIEW_INCOMPLETE");
  return input.items.map(item => ({ ...item, notes: item.notes?.trim() || undefined }));
}
