import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProductEntity } from "./product-validator";
import { sectionReviewFingerprint } from "./product-review-preservation";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION, type PedagogicRubricItem } from "@/lib/materials/quality-policy";

type Article = Extract<ProductEntity, { productType: "article" }>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sectionDecisionsSchema = z.array(z.object({ sectionId: z.string().min(1), semanticHash: hash, decision: z.enum(["approved", "changes_requested"]), notes: z.string().trim().max(4000).optional() }).strict()).min(1);
export const productV4ReviewContextShape = { verificationPlanHash: hash.optional(), verificationReceiptSignature: hash.optional(), sectionDecisions: sectionDecisionsSchema.optional() };
export type ProductV4SectionDecision = z.infer<typeof sectionDecisionsSchema>[number];
export function assertProductV4ReviewCardinality(products: readonly ProductEntity[]) {
  if (products.filter(product => product.productType === "article").length !== 1 || products.filter(product => product.productType === "diktat").length > 1) throw new Error("PRODUCT_V4_SINGLE_ARTICLE_REQUIRED");
}
export function computeProductV4SectionSemanticHash(article: Article, sectionId: string) {
  const section = article.sections.find(section => section.id === sectionId);
  if (!section) throw new Error("PRODUCT_V4_REVIEW_SECTION_NOT_FOUND");
  return createHash("sha256").update(sectionReviewFingerprint(section, article.visuals)).digest("hex");
}

export function validateProductV4ReviewContext(input: {
  article: Article; importId: string; checksum: string; fingerprint: string;
  review: { decision: string; expectedRevision?: string | number | null; policyVersion?: string; contentFingerprint?: string; verificationPlanHash?: string; verificationReceiptSignature?: string; sectionDecisions?: ProductV4SectionDecision[]; criteria?: PedagogicRubricItem[] };
  verification?: { ready: boolean; planHash: string; importId: string; receiptSignature: string | null };
}) {
  const review = input.review;
  const decisions = review.sectionDecisions ? sectionDecisionsSchema.parse(review.sectionDecisions) : [];
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (seen.has(decision.sectionId)) throw new Error("PRODUCT_V4_REVIEW_SECTION_DUPLICATE");
    seen.add(decision.sectionId);
    if (computeProductV4SectionSemanticHash(input.article, decision.sectionId) !== decision.semanticHash) throw new Error("PRODUCT_V4_REVIEW_SECTION_STALE");
    if (decision.decision === "changes_requested" && !decision.notes?.trim()) throw new Error("PRODUCT_V4_REVIEW_SECTION_REASON_REQUIRED");
  }
  if (review.decision !== "approved") return decisions;
  if (review.expectedRevision !== input.checksum || review.policyVersion !== QUALITY_POLICY_VERSION || review.contentFingerprint !== input.fingerprint) throw new Error("PRODUCT_V4_REVIEW_CONTEXT_STALE");
  if (seen.size !== input.article.sections.length || decisions.some(decision => decision.decision !== "approved")) throw new Error("PRODUCT_V4_REVIEW_ALL_SECTIONS_REQUIRED");
  const criteria = review.criteria ?? [];
  if (criteria.length !== PEDAGOGIC_CRITERION_IDS.length || PEDAGOGIC_CRITERION_IDS.some(id => criteria.filter(item => item.criterionId === id && item.status === "met" && item.contentAnchors.length > 0).length !== 1)) throw new Error("PRODUCT_V4_REVIEW_COMPLETE_RUBRIC_REQUIRED");
  if (!input.verification?.ready || input.verification.importId !== input.importId || !review.verificationPlanHash || input.verification.planHash !== review.verificationPlanHash || !review.verificationReceiptSignature || input.verification.receiptSignature !== review.verificationReceiptSignature) throw new Error("PRODUCT_V4_REVIEW_VERIFICATION_REQUIRED");
  return decisions;
}
