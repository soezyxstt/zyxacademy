import { createHash } from "node:crypto";
import { z } from "zod";
import { deterministicProductSerialization, type ProductEntity } from "@/lib/bundle/product-validator";

export type SolutionCollectionProduct = Extract<ProductEntity, { productType: "solution_collection" }>;
const decision = z.enum(["approved", "changes_requested"]);
export const solutionItemDecisionSchema = z.object({
  itemId: z.string().min(1),
  itemHash: z.string().regex(/^[a-f0-9]{64}$/),
  correctness: decision,
  reasoning: decision,
  problemProvenance: decision,
  solutionProvenance: decision,
  release: decision,
  notes: z.string().trim().max(2000).optional(),
}).strict();
export const solutionReviewSchema = z.object({
  policy: z.literal("solution-collection-review.v1"),
  reviewVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  productId: z.string().min(1),
  items: z.array(solutionItemDecisionSchema).min(1).max(500),
}).strict();
export type SolutionItemDecision = z.infer<typeof solutionItemDecisionSchema>;
export type SolutionReview = z.infer<typeof solutionReviewSchema>;

export function solutionItemHash(item: SolutionCollectionProduct["collection"]["items"][number]): string {
  return createHash("sha256").update(deterministicProductSerialization(item), "utf8").digest("hex");
}

/** A review covers each complete item, including both provenances and release. */
export function validateSolutionReview(input: { product: SolutionCollectionProduct; revision: string; review: unknown; requireApproval: boolean }): SolutionReview {
  const review = solutionReviewSchema.parse(input.review);
  if (review.revision !== input.revision || review.productId !== input.product.id) throw new Error("PRODUCT_V5_REVIEW_STALE");
  const decisions = new Map(review.items.map(item => [item.itemId, item]));
  if (decisions.size !== review.items.length || decisions.size !== input.product.collection.items.length) throw new Error("PRODUCT_V5_REVIEW_INCOMPLETE");
  for (const item of input.product.collection.items) {
    const entry = decisions.get(item.id);
    if (!entry || entry.itemHash !== solutionItemHash(item)) throw new Error("PRODUCT_V5_REVIEW_STALE");
    if (input.requireApproval && [entry.correctness, entry.reasoning, entry.problemProvenance, entry.solutionProvenance, entry.release].some(value => value !== "approved")) throw new Error("PRODUCT_V5_REVIEW_CHANGES_REQUIRED");
  }
  return review;
}
