import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProductEntity } from "./product-validator";
import { sectionReviewFingerprint } from "./product-review-preservation";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION, type PedagogicRubricItem } from "@/lib/materials/quality-policy";

type Article = Extract<ProductEntity, { productType: "article" }>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sectionDecisionsSchema = z.array(z.object({ productId: z.string().min(1).optional(), sectionId: z.string().min(1), semanticHash: hash, decision: z.enum(["approved", "changes_requested"]), notes: z.string().trim().max(4000).optional() }).strict()).min(1);
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

export type ScopedProductSectionDecision = ProductV4SectionDecision & { productId: string };
export function productSectionReviewKey(productId: string, sectionId: string): string {
  return JSON.stringify([productId, sectionId]);
}

/** An omitted owner is accepted only when exactly one Article owns the section ID. */
export function normalizeProductSectionDecisions(articles: readonly Article[], values: readonly ProductV4SectionDecision[], prefix = "PRODUCT_REVIEW"): ScopedProductSectionDecision[] {
  const seen = new Set<string>();
  return values.map(value => {
    const decision = sectionDecisionsSchema.element.parse(value);
    const owners = articles.filter(article => article.sections.some(section => section.id === decision.sectionId) && (!decision.productId || article.id === decision.productId));
    if (owners.length > 1) throw new Error(`${prefix}_SECTION_OWNER_REQUIRED`);
    const owner = owners[0];
    if (!owner || computeProductV4SectionSemanticHash(owner, decision.sectionId) !== decision.semanticHash) throw new Error(`${prefix}_SECTION_STALE`);
    const key = productSectionReviewKey(owner.id, decision.sectionId);
    if (seen.has(key)) throw new Error(`${prefix}_SECTION_DUPLICATE`);
    seen.add(key);
    if (decision.decision === "changes_requested" && !decision.notes?.trim()) throw new Error(`${prefix}_SECTION_REASON_REQUIRED`);
    return { ...decision, productId: owner.id };
  });
}

export function validateProductV4ReviewContext(input: {
  article: Article; importId: string; checksum: string; fingerprint: string;
  review: { decision: string; expectedRevision?: string | number | null; policyVersion?: string; contentFingerprint?: string; verificationPlanHash?: string; verificationReceiptSignature?: string; sectionDecisions?: ProductV4SectionDecision[]; criteria?: PedagogicRubricItem[] };
  verification?: { ready: boolean; planHash: string; importId: string; receiptSignature: string | null };
}) {
  const review = input.review;
  const decisions = normalizeProductSectionDecisions([input.article], review.sectionDecisions ?? [], "PRODUCT_V4_REVIEW");
  const seen = new Set(decisions.map(decision => productSectionReviewKey(decision.productId, decision.sectionId)));
  if (review.decision !== "approved") return decisions;
  if (review.expectedRevision !== input.checksum || review.policyVersion !== QUALITY_POLICY_VERSION || review.contentFingerprint !== input.fingerprint) throw new Error("PRODUCT_V4_REVIEW_CONTEXT_STALE");
  if (seen.size !== input.article.sections.length || decisions.some(decision => decision.decision !== "approved")) throw new Error("PRODUCT_V4_REVIEW_ALL_SECTIONS_REQUIRED");
  const criteria = review.criteria ?? [];
  if (criteria.length !== PEDAGOGIC_CRITERION_IDS.length || PEDAGOGIC_CRITERION_IDS.some(id => criteria.filter(item => item.criterionId === id && item.status === "met" && item.contentAnchors.length > 0).length !== 1)) throw new Error("PRODUCT_V4_REVIEW_COMPLETE_RUBRIC_REQUIRED");
  if (!input.verification?.ready || input.verification.importId !== input.importId || !review.verificationPlanHash || input.verification.planHash !== review.verificationPlanHash || !review.verificationReceiptSignature || input.verification.receiptSignature !== review.verificationReceiptSignature) throw new Error("PRODUCT_V4_REVIEW_VERIFICATION_REQUIRED");
  return decisions;
}
