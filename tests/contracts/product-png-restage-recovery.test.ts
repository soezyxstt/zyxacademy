import { expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";

const schema = await import("@/db/schema");
const events: string[] = [];
let failPrevious = true;
let lookup = 0;
const old = { id: "draft", bundleId: "bundle", status: "draft", sourceUriOrKey: "old", checksum: "a".repeat(64) };
const review = { id: "review", targetType: "article_section", targetId: "section" };
const previous = { checksum: old.checksum, manifest: { bundleId: "bundle" }, products: [], dependencies: [] };
const next = { checksum: "b".repeat(64), manifest: { bundleId: "bundle", courseId: "course", creatorId: "authoring-mcp", curatorId: "authoring-mcp", schemaVersion: "product-bundle.v4", visualAssets: [] }, products: [], dependencies: [], files: new Map(), issues: [], publicationBlocked: false };
const db = {
  select() { return { from(table: unknown) { return { where() { return {
    limit: async () => table === schema.pengguna ? [{ id: "actor" }] : table === schema.courses ? [{ id: "course" }] : table === schema.imporBundle ? (++lookup % 2 ? [] : [old]) : [],
    then: (resolve: (value: unknown) => void) => resolve(table === schema.reviewItemBundle ? [review] : []),
  }; } }; } }; },
  transaction: async (fn: (tx: unknown) => Promise<void>) => { events.push("transaction"); await fn({
    delete(table: unknown) { events.push(`delete:${getTableName(table as never)}`); return { where: async () => {} }; },
    update(table: unknown) { events.push(`update:${getTableName(table as never)}`); return { set: () => ({ where: async () => {} }) }; },
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
  const input = { runId: "run", bundleId: "bundle", courseId: "course", checksum: next.checksum, bytes: new Uint8Array([1]), requestedBy: "actor", bundle: next as never, preserveUnchangedItemReviews: true };
  await expect(stageProductBundle(input)).rejects.toThrow("PRODUCT_BUNDLE_PREVIOUS_VALIDATION_FAILED:INTERACTIVE_DOCUMENT_PRINT_BUSY");
  expect(events).toEqual([]);
  failPrevious = false;
  const result = await stageProductBundle(input);
  expect(result.replaced).toBe(true);
  expect(events.some(event => event.startsWith("insert:review_item_bundle:") && event.includes('"id":"review"'))).toBe(true);
  expect(events.some(event => event === "delete:review_pedagogi_bundle")).toBe(false);
  expect(events.some(event => event === "update:bukti_pdf_bundle")).toBe(false);
  expect(events).toContain("delete:object");
});
