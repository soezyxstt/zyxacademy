import { describe, expect, test } from "bun:test";
import { buildProductV4AdminReviewInput, type ProductV4AdminReviewContext, type ProductV4AdminReviewDraft } from "@/components/admin/product-v4-review-form";
import { PEDAGOGIC_CRITERION_IDS } from "@/lib/materials/quality-policy-constants";
import { explainBundleError } from "@/lib/bundle/admin-errors";

const context: ProductV4AdminReviewContext = { expectedRevision: "a".repeat(64), policyVersion: "policy", contentFingerprint: "b".repeat(64), verificationReady: true, verificationPlanHash: "c".repeat(64), verificationReceiptSignature: "d".repeat(64), sections: [{ sectionId: "s1", semanticHash: "e".repeat(64), title: "Definisi" }, { sectionId: "s2", semanticHash: "f".repeat(64), title: "Contoh" }] };
const complete = (): ProductV4AdminReviewDraft => ({ approvedSectionIds: ["s1", "s2"], criteria: Object.fromEntries(PEDAGOGIC_CRITERION_IDS.map((id) => [id, { status: "met", reason: "Alasan berbasis bagian", sectionId: "s1" }])) });
describe("explicit V4 admin pedagogic review", () => {
 test("does not create implicit approvals or rubric answers", () => {
  const input = buildProductV4AdminReviewInput(context, { approvedSectionIds: [], criteria: {} });
  expect(input.ready).toBe(false);
  expect(input.request.sectionDecisions).toBeUndefined();
  expect(input.request.criteria).toEqual([]);
 });
 test("binds each explicit decision to the current semantic hash and verification signature", () => {
  const input = buildProductV4AdminReviewInput(context, complete());
  expect(input.ready).toBe(true);
  expect(input.request.verificationReceiptSignature).toBe(context.verificationReceiptSignature);
  expect(input.request.sectionDecisions).toEqual(context.sections.map((section) => ({ sectionId: section.sectionId, semanticHash: section.semanticHash, decision: "approved" })));
  expect(input.request.criteria).toHaveLength(8);
 });
 test("missing section, incomplete rubric, unverified revision and stale evidence never enable approval", () => {
  expect(buildProductV4AdminReviewInput(context, { ...complete(), approvedSectionIds: ["s1"] }).ready).toBe(false);
  const draft = complete();
  draft.criteria.concept_accuracy = { status: "met", reason: "", sectionId: "s1" };
  expect(buildProductV4AdminReviewInput(context, draft).ready).toBe(false);
  expect(buildProductV4AdminReviewInput(context, draft).request.criteria).toEqual([]);
  expect(buildProductV4AdminReviewInput({ ...context, verificationReady: false }, complete()).ready).toBe(false);
  expect(buildProductV4AdminReviewInput({ ...context, verificationReceiptSignature: null }, complete()).ready).toBe(false);
  const badAnchor = complete(); badAnchor.criteria.concept_accuracy = { status: "met", reason: "Bukti", sectionId: "removed" };
  expect(buildProductV4AdminReviewInput(context, badAnchor).ready).toBe(false);
 });
 test("context failures have human-readable recovery messages", () => {
  expect(explainBundleError("PRODUCT_V4_REVIEW_CONTEXT_STALE")).toContain("Muat ulang");
  expect(explainBundleError("PRODUCT_V4_REVIEW_VERIFICATION_REQUIRED")).not.toContain("PRODUCT_V4");
 });
});
