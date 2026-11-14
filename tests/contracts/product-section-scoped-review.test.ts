import { expect, test } from "bun:test";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { computeProductV4SectionSemanticHash, normalizeProductSectionDecisions, productSectionReviewKey, validateProductV4ReviewContext } from "@/lib/bundle/product-v4-review";
import { assertProductSectionReviews, productSectionReviewState } from "@/lib/bundle/product-review-gate";
import { unchangedArticleSectionIds } from "@/lib/bundle/product-review-preservation";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

type Article = Extract<ProductEntity, { productType: "article" }>;
function articles() {
  const article = structuredClone(buildLocalVerificationFixture().bundle.products.find(product => product.productType === "article")) as Article;
  return [{ ...article, id: "article-a" }, { ...structuredClone(article), id: "article-b" }] as const;
}
function decision(article: Article, productId: string | undefined = article.id) {
  const sectionId = article.sections[0].id;
  return { productId, sectionId, semanticHash: computeProductV4SectionSemanticHash(article, sectionId), decision: "approved" as const };
}
function row(productId: string | null, sectionId: string, status = "approved") {
  return { productId, targetId: sectionId, reviewerId: "admin", targetType: "article_section", status };
}

test("multi-Article review distinguishes identical section IDs and rejects ambiguous owner inference", () => {
  const [a, b] = articles();
  const normalized = normalizeProductSectionDecisions([a, b], [decision(a), decision(b)]);
  expect(normalized.map(item => item.productId)).toEqual([a.id, b.id]);
  expect(new Set(normalized.map(item => productSectionReviewKey(item.productId, item.sectionId))).size).toBe(2);
  const { productId: _productId, ...ambiguous } = decision(a);
  expect(() => normalizeProductSectionDecisions([a, b], [ambiguous])).toThrow("PRODUCT_REVIEW_SECTION_OWNER_REQUIRED");
  expect(() => normalizeProductSectionDecisions([a, b], [decision(a), decision(a)])).toThrow("PRODUCT_REVIEW_SECTION_DUPLICATE");
  expect(() => normalizeProductSectionDecisions([a, b], [decision(a, "unknown-article")])).toThrow("PRODUCT_REVIEW_SECTION_STALE");
});

test("single-Article clients retain unambiguous inference while V4 rejects a different product owner", () => {
  const [article] = articles();
  const { productId: _productId, ...unscoped } = decision(article);
  expect(normalizeProductSectionDecisions([article], [unscoped])[0].productId).toBe(article.id);
  expect(() => validateProductV4ReviewContext({ article, importId: "draft", checksum: "a".repeat(64), fingerprint: "fingerprint", review: { decision: "changes_requested", sectionDecisions: [{ ...decision(article, "other-article"), decision: "changes_requested", notes: "Revise explanation" }] } })).toThrow("PRODUCT_V4_REVIEW_SECTION_STALE");
});

test("publication and readiness cannot reuse Article A approval for Article B's same-named section", () => {
  const sectionId = "same-section";
  const requiredSections = [{ productId: "article-a", sectionId }, { productId: "article-b", sectionId }];
  const approvedA = row("article-a", sectionId);
  expect(productSectionReviewState({ requiredSections, reviewerId: "admin", reviews: [approvedA] }).missing).toEqual([requiredSections[1]]);
  expect(() => assertProductSectionReviews({ requiredSections, reviewerId: "admin", reviews: [approvedA] })).toThrow("PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED");
  expect(productSectionReviewState({ requiredSections, reviewerId: "admin", reviews: [row(null, sectionId)] }).missing).toHaveLength(2);
  expect(() => assertProductSectionReviews({ requiredSections, reviewerId: "admin", reviews: [approvedA, row("article-b", sectionId)] })).not.toThrow();
  expect(() => assertProductSectionReviews({ requiredSections, reviewerId: "admin", reviews: [approvedA, row("article-b", sectionId, "changes_requested")] })).toThrow("PRODUCT_BUNDLE_SECTION_CHANGES_REQUESTED");
  expect(() => assertProductSectionReviews({ requiredSections: [requiredSections[0]], reviewerId: "admin", reviews: [row(null, sectionId)] })).not.toThrow();
});

test("restage preservation compares the specific Article owner, not another Article's unchanged section", () => {
  const original = buildLocalVerificationFixture().bundle;
  const [a, b] = articles();
  const before = { ...original, products: [a, b] };
  const changedA = structuredClone(a);
  changedA.sections[0].title += " revised";
  const after = { ...original, products: [changedA, b] };
  const sectionId = a.sections[0].id;
  expect(unchangedArticleSectionIds(before, after).has(sectionId)).toBe(true);
  expect(unchangedArticleSectionIds(before, after, a.id).has(sectionId)).toBe(false);
  expect(unchangedArticleSectionIds(before, after, b.id).has(sectionId)).toBe(true);
});
