import { expect, test } from "bun:test";
import { validateProductLegacyLocalInput, productLegacyLocalFailure, assertProductLegacyReadback } from "../../scripts/authoring/verify-product-legacy-local";
import { assertLegacyDiktatDraft, assertLegacyLearningProducts, selectLegacyPdfTarget } from "@/lib/compute/product-diktat-inspector";

const checksum = "a".repeat(64);
const runId = "mcp-run-00000000-0000-4000-8000-000000000000";
const input = { privateFile: "/tmp/private.json", sourceRevision: "b".repeat(40), importId: `impor-product-${"c".repeat(32)}`, runId, expectedChecksum: checksum, actorId: "admin-1" };
const audit = { id: "audit-1", action: "draft_created", correlationId: runId, afterSnapshot: { checksum } };
const row = { bundleType: "product" as const, version: 3, status: "draft" as const, checksum };
const products = [{ productType: "article", schemaVersion: "article.v3" }, { productType: "diktat", schemaVersion: "diktat.v3" }];

test("legacy operator accepts only explicit bounded identity fields", () => {
  expect(validateProductLegacyLocalInput(input)).toEqual(input);
  expect(validateProductLegacyLocalInput({ ...input, articleId: "article" }).articleId).toBe("article");
  expect(validateProductLegacyLocalInput({ ...input, diktatId: "diktat" }).diktatId).toBe("diktat");
  for (const invalid of [{ ...input, privateFile: "relative" }, { ...input, actorId: "" }, { ...input, sourceRevision: "HEAD" }, { ...input, expectedChecksum: "latest" }, { ...input, runId: "latest" }, { ...input, retry: true }, { ...input, articleId: " " }, { ...input, articleId: "a", diktatId: "d" }]) expect(() => validateProductLegacyLocalInput(invalid)).toThrow("EXACT_INPUT_REQUIRED");
  expect(JSON.stringify(productLegacyLocalFailure(new Error("secret token and connection URL")))).not.toContain("secret");
});

test("the current draft and its original staging audit must match exactly", () => {
  expect(() => assertLegacyDiktatDraft(row, input, audit)).not.toThrow();
  for (const change of [{ version: 4 }, { version: 5 }, { status: "published" as const }, { bundleType: "assessment" as const }]) expect(() => assertLegacyDiktatDraft({ ...row, ...change }, input, audit)).toThrow();
  for (const change of [{ checksum: "d".repeat(64) }, { correlationId: "another" }, { action: "reviewed" }]) {
    if ("checksum" in change) expect(() => assertLegacyDiktatDraft({ ...row, checksum: change.checksum! }, input, audit)).toThrow("EXACT_DRAFT_REQUIRED");
    else expect(() => assertLegacyDiktatDraft(row, input, { ...audit, ...change })).toThrow("EXACT_DRAFT_REQUIRED");
  }
  expect(() => assertLegacyDiktatDraft(row, input, undefined)).toThrow("EXACT_DRAFT_REQUIRED");
});

test("legacy drafts require learning products and exclude assessment and later schemas", () => {
  const bundle = { manifest: { schemaVersion: "product-bundle.v3" }, products };
  expect(() => assertLegacyLearningProducts(bundle, 3)).not.toThrow();
  expect(() => assertLegacyLearningProducts({ ...bundle, products: [products[0]] }, 3)).not.toThrow();
  for (const invalid of [
    { ...bundle, manifest: { schemaVersion: "product-bundle.v4" } },
    { ...bundle, products: [...products, { productType: "question", schemaVersion: "question.v2" }] },
    { ...bundle, products: [...products, { productType: "solution_collection", schemaVersion: "solution_collection.v1" }] },
    { ...bundle, products: [products[0], { ...products[1], schemaVersion: "diktat.v4" }] },
    { ...bundle, products: [products[0], { ...products[1], units: [] }] },
    { ...bundle, products: [products[1]] },
  ]) expect(() => assertLegacyLearningProducts(invalid, 3)).toThrow("LEARNING_ONLY_REQUIRED");
});

test("target selection matches each linked Diktat and unlinked Article", () => {
  const a = { id: "a", productType: "article" }, b = { id: "b", productType: "article" };
  const d = { id: "d", productType: "diktat", sourceArticleId: "a" };
  expect(selectLegacyPdfTarget([a] as any, input)).toEqual({ article: a, diktat: undefined });
  expect(selectLegacyPdfTarget([a, d] as any, input)).toEqual({ article: a, diktat: d });
  expect(() => selectLegacyPdfTarget([a, b, d] as any, input)).toThrow("EXACT_PRODUCT_REQUIRED");
  expect(selectLegacyPdfTarget([a, b, d] as any, { ...input, articleId: "b" })).toEqual({ article: b, diktat: undefined });
  expect(selectLegacyPdfTarget([a, b, d] as any, { ...input, diktatId: "d" })).toEqual({ article: a, diktat: d });
  expect(() => selectLegacyPdfTarget([a, b, d] as any, { ...input, articleId: "a" })).toThrow("SOURCE_MISSING");
  expect(() => selectLegacyPdfTarget([a, b, d] as any, { ...input, articleId: "b", diktatId: "d" })).toThrow("EXACT_PRODUCT_REQUIRED");
  expect(() => selectLegacyPdfTarget([a, { ...d, sourceArticleId: "missing" }] as any, { ...input, diktatId: "d" })).toThrow("SOURCE_MISSING");
});

test("final readback requires the same staging audit and Article evidence identity", () => {
  const state = {
    importId: input.importId, runId, checksum, printProfile: "profile",
    result: { productId: "article", stagingAuditId: "audit-1", storageKey: "article.pdf", pageCount: 1, articleVersion: 1, articleHash: checksum, diktatHash: checksum },
    row: { status: "draft", checksum, version: 3 },
    staging: { id: "audit-1", correlationId: runId, afterSnapshot: { checksum } },
    evidence: { imporBundleId: input.importId, productId: "article", articleVersion: 1, articleHash: checksum, diktatHash: checksum, status: "ready", storageKey: "article.pdf", pageCount: 1, failureCode: null, printProfile: "profile" },
  };
  expect(() => assertProductLegacyReadback(state)).not.toThrow();
  for (const invalid of [
    { ...state, staging: { ...state.staging, id: "restage-same-run" } },
    { ...state, staging: { ...state.staging, correlationId: "adopted-run" } },
    { ...state, row: { ...state.row, status: "published" } },
    { ...state, evidence: { ...state.evidence, productId: "other" } },
    { ...state, evidence: { ...state.evidence, articleHash: "b".repeat(64) } },
    { ...state, evidence: { ...state.evidence, storageKey: "other.pdf" } },
    { ...state, evidence: { ...state.evidence, status: "failed" } },
    { ...state, evidence: { ...state.evidence, printProfile: "old" } },
  ]) expect(() => assertProductLegacyReadback(invalid)).toThrow("READBACK_MISMATCH");
});
