import { expect, test } from "bun:test";
import { canPublishProduct, readProductReview, reviewTargets } from "../../apps/mobile-native/features/academic/administration/product-review-client";
import { applyProductFields, productDraftFields } from "../../apps/mobile-native/features/academic/administration/product-draft-fields";
import type { AcademicTransport } from "../../apps/mobile-native/features/academic/client";

const scope = { id: "bundle-1", courseId: "course", checksum: "a".repeat(64) };
const body = {
  bundle: { ...scope, bundleId: "teaching", currentReview: { status: "approved", notes: null }, status: "draft" },
  manifest: { schemaVersion: "product-bundle.v3" }, draft: { products: [{ id: "article", productType: "article", title: "Besaran",
    sections: [{ id: "length", orderIndex: 0, title: "Panjang", learningObjective: "Mengenal panjang", blocks: [
      { id: "b", orderIndex: 1, contentMarkdown: "Kedua", blockType: "summary" }, { id: "a", orderIndex: 0, contentMarkdown: "Pertama", blockType: "intro" },
    ] }] }] },
  previews: [], blockReviews: [], publicationBlocked: false, qualityEvaluation: { publicationReady: true },
  pedagogicReview: null, v4ReviewContext: null, pdfStatuses: [],
};
const signal = new AbortController().signal;
function transport(detail: unknown, revision = scope.checksum): AcademicTransport {
  return { locale: "id", accountId: "admin", origin: "https://example.test", async get(path) {
    return { status: 200, ok: true, json: async () => path.endsWith("/review") ? {
      expectedRevision: revision, policyVersion: "1", contentFingerprint: scope.checksum, sections: [],
    } : detail };
  } };
}
test("review binds the course, bundle and both server revisions before offering actions", async () => {
  const data = await readProductReview(transport(body), scope, signal);
  expect(reviewTargets(data.draft.products[0])[0].content).toBe("Mengenal panjang\n\nPertama\n\nKedua");
  expect(canPublishProduct(data)).toBe(true);
  expect(canPublishProduct({ ...data, publicationBlocked: true })).toBe(false);
  expect(canPublishProduct({ ...data, pdfStatuses: [{ status: "pending", revision: scope.checksum }] })).toBe(false);
  expect(canPublishProduct({ ...data, bundle: { ...data.bundle, currentReview: null } })).toBe(false);
  for (const changed of [{ ...scope, courseId: "wrong" }, { ...scope, id: "other" }, { ...scope, checksum: "c".repeat(64) }]) {
    await expect(readProductReview(transport(body), changed, signal)).rejects.toThrow();
  }
  await expect(readProductReview(transport(body, "stale"), scope, signal)).rejects.toThrow();
});
test("legacy Article review addresses immutable block IDs in reading order", () => {
  const targets = reviewTargets({ id: "legacy", productType: "article", blocks: [
    { id: "second", blockType: "summary", orderIndex: 2, content: "Dua" }, { id: "first", blockType: "intro", orderIndex: 1, content: "Satu" },
  ] });
  expect(targets.map(row => [row.targetType, row.targetId, row.content])).toEqual([["article_block","first","Satu"],["article_block","second","Dua"]]);
});

test("draft editing preserves source identity, answer types and unedited nested records", () => {
  const question = { id: "q", productType: "question", options: [{ id: "a", isCorrect: false, text: "Satu" }],
    ideaLinks: [{ id: "idea", weight: 0.5, role: "primary" }], ideaRelations: [{ ideaId: "i", rationale: null }],
    itbSource: { referenceId: "protected" } };
  const update = applyProductFields(question, {
    '["options",0,"isCorrect"]': "true", '["ideaLinks",0,"weight"]': "0.8",
    '["ideaRelations",0,"rationale"]': "Catatan", '["itbSource","referenceId"]': "different",
  });
  expect(update).toEqual({ ...question, options: [{ ...question.options[0], isCorrect: true }],
    ideaLinks: [{ ...question.ideaLinks[0], weight: 0.8 }], ideaRelations: [{ ideaId: "i", rationale: "Catatan" }] });
  expect(question.options[0].isCorrect).toBe(false);
  expect(applyProductFields(question, { '["ideaLinks",0,"weight"]': "0" })).toBeNull();
  expect(applyProductFields(question, { '["ideaLinks",0,"role"]': "unknown" })).toBeNull();
  expect(productDraftFields({ id: "d", productType: "diktat", units: [] })).toEqual([]);
  expect(productDraftFields({ id: "a", productType: "article", schemaVersion: "article.v4" })).toEqual([]);
});
