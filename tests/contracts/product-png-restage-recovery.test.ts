import { expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";

const schema = await import("@/db/schema");
const events: string[] = [];
let failPrevious = true;
let lookup = 0;
const old = { id: "draft", bundleId: "bundle", status: "draft", sourceUriOrKey: "old", checksum: "a".repeat(64), bundleType: "product", version: 4, courseId: "course", validationReport: { valid: true } };
const article = { id: "article", productType: "article", schemaVersion: "article.v4", version: 1, generationHash: "c".repeat(64), creatorId: "authoring-mcp", title: "Article", sections: [{ id: "section", orderIndex: 0, blocks: [] }], visuals: [] };
const review = { id: "review", productId: article.id, targetType: "article_section", targetId: "section" };
const previous = { checksum: old.checksum, manifest: { bundleId: "bundle" }, products: [article], dependencies: [] };
const next = { checksum: "b".repeat(64), manifest: { bundleId: "bundle", courseId: "course", creatorId: "authoring-mcp", curatorId: "authoring-mcp", schemaVersion: "product-bundle.v4", visualAssets: [] }, products: [article], dependencies: [], files: new Map(), issues: [], publicationBlocked: false };
function select(transactional = false) {
  return { from(table: unknown) {
    const rows = table === schema.user ? [{ role: "admin" }]
      : table === schema.pengguna ? [{ id: "actor", status: "active" }]
      : table === schema.penggunaPeran ? [{ code: "admin" }]
      : table === schema.courses ? [{ id: "course" }]
      : table === schema.imporBundle ? (transactional || ++lookup % 2 === 0 ? [old] : [])
      : table === schema.reviewItemBundle ? [review] : [];
    const query = {
      innerJoin() { return query; }, where() { return query; }, orderBy() { return query; },
      limit() { return query; }, for() { return query; },
      then(resolve: (value: typeof rows) => unknown) { return Promise.resolve(rows).then(resolve); },
    };
    return query;
  } };
}
const db = {
  select: () => select(),
  transaction: async (fn: (tx: unknown) => Promise<void>) => { events.push("transaction"); await fn({
    select: () => select(true),
    execute: async () => {},
    delete(table: unknown) { events.push(`delete:${getTableName(table as never)}`); return { where: async () => {} }; },
    update(table: unknown) { events.push(`update:${getTableName(table as never)}`); return { set: () => ({ where: () => ({ returning: async () => [{ id: old.id }] }) }) }; },
    insert(table: unknown) { return { values: async (values: unknown) => { events.push(`insert:${getTableName(table as never)}:${JSON.stringify(values)}`); } }; },
  }); },
};
mock.module("@/db", () => ({ db }));
mock.module("@/lib/bundle/product-admission", () => ({ validateProductBundleAdmission: async (bytes: Uint8Array) => bytes[0] === 1 ? { success: true, data: next } : failPrevious ? { success: false, issues: [{ code: "INTERACTIVE_DOCUMENT_PRINT_BUSY" }] } : { success: true, data: previous } }));
mock.module("@/lib/storage", () => ({ storage: { download: async () => new Uint8Array([2]), upload: async () => { events.push("upload"); }, delete: async () => { events.push("delete:object"); } } }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ validateInteractiveDocumentArchive: async () => [], stageInteractiveDocumentAssets: async () => { events.push("stage assets"); }, verifyAdmittedInteractiveDocumentArchive: async () => {} }));
mock.module("@/lib/bundle/product-review-preservation", () => ({ canPreservePedagogicReview: () => true, findStalePdfEvidenceProductIds: () => new Set(), unchangedArticleSectionIds: () => new Set(["section"]) }));
mock.module("@/lib/auth/authorization", () => ({ hasPeran: async () => false }));
mock.module("@/lib/auth/tutor-access", () => ({ checkTutorCourseAccess: async () => false }));
const { stageProductBundle } = await import("@/lib/bundle/product-staging");

test("transient previous admission failure preserves the draft and a retry preserves unchanged review", async () => {
  const input = { runId: "run", bundleId: "bundle", courseId: "course", checksum: next.checksum, bytes: new Uint8Array([1]), requestedBy: "actor", bundle: next as never, preserveUnchangedItemReviews: true, expectedPreviousChecksum: old.checksum };
  await expect(stageProductBundle(input)).rejects.toThrow("PRODUCT_BUNDLE_PREVIOUS_VALIDATION_FAILED:INTERACTIVE_DOCUMENT_PRINT_BUSY");
  expect(events).toEqual([]);
  failPrevious = false;
  const result = await stageProductBundle(input);
  expect(result.replaced).toBe(true);
  expect(events.some(event => event.startsWith("insert:review_item_bundle:") && event.includes('"id":"review"'))).toBe(true);
  expect(events.some(event => event === "delete:review_pedagogi_bundle")).toBe(false);
  expect(events.some(event => event === "update:bukti_pdf_bundle")).toBe(false);
  expect(events).not.toContain("delete:object");
});
