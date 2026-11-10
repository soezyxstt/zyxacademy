import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildProductPdfSmokeFixture, productPdfSmokeTarget, assertProductPdfInspection } from "../../scripts/neon/smoke-product-pdf";
import { parseProductBundleZip } from "../../lib/bundle/product-bundle-v2";

test("product PDF acceptance rejects other targets and extra arguments before config loading", () => {
  for (const args of [[], ["prod"], ["staging"], ["production", "--publish"]]) expect(() => productPdfSmokeTarget(args)).toThrow();
  expect(productPdfSmokeTarget(["production"]).output).toBe("artifacts/neon-worker/production");
});

test("owned V3 fixture validates and preserves article lineage and authored content", () => {
  const id = "neon-product-pdf-owned";
  const fixture = buildProductPdfSmokeFixture(id);
  const parsed = parseProductBundleZip(fixture.bytes);
  expect(parsed.success).toBe(true);
  expect(fixture.bundle.manifest.schemaVersion).toBe("product-bundle.v3");
  expect(fixture.bundle.manifest.courseId).toBe(id);
  expect(fixture.bundle.publicationBlocked).toBe(false);
  expect(fixture.bundle.issues).toHaveLength(0);
  expect(fixture.bundle.products).toHaveLength(2);
  expect(fixture.bundle.products.every(product => product.courseId === id && product.creatorId === id && product.status === "draft")).toBe(true);
  expect(fixture.article.sections.every(section => section.id.startsWith(id) && section.blocks.every(block => block.id.startsWith(id)))).toBe(true);
  expect(fixture.diktat.sourceArticleId).toBe(fixture.article.id);
  expect(fixture.diktat.sourceArticleHash).toBe(fixture.article.generationHash);
  expect(fixture.diktat.contentMarkdown).toContain("Bukti mandiri PDF produksi");
  expect(fixture.diktat.contentMarkdown).toContain("\\delta=\\varepsilon/2");
});

const bytes = Buffer.from(`%PDF-1.7\n${" ".repeat(1100)}`);
const inspection = { pageCount: 2, text: "Bukti mandiri PDF produksi. Contoh perhitungan. zyxacademy.com" };
test("PDF acceptance requires actual bytes, bounded matching pages, authored text and footer", () => {
  assertProductPdfInspection(bytes, inspection, 2);
  expect(() => assertProductPdfInspection(Buffer.from("not PDF"), inspection, 2)).toThrow("PRODUCT_PDF_SMOKE_INVALID_BYTES");
  expect(() => assertProductPdfInspection(Buffer.from("%PDF-"), inspection, 2)).toThrow("PRODUCT_PDF_SMOKE_EMPTY_BYTES");
  expect(() => assertProductPdfInspection(bytes, { ...inspection, pageCount: 5 }, 5)).toThrow("PRODUCT_PDF_SMOKE_PAGE_BUDGET");
  expect(() => assertProductPdfInspection(bytes, inspection, 1)).toThrow("PRODUCT_PDF_SMOKE_PAGE_MISMATCH");
  expect(() => assertProductPdfInspection(bytes, { ...inspection, text: "zyxacademy.com" }, 2)).toThrow("PRODUCT_PDF_SMOKE_CONTENT_MISSING");
  expect(() => assertProductPdfInspection(bytes, { ...inspection, text: inspection.text + " [object Object]" }, 2)).toThrow("PRODUCT_PDF_SMOKE_CORRUPT_TEXT");
});

test("identity preflight precedes mutations and successful content inspection precedes exact cleanup", () => {
  const source = readFileSync("scripts/neon/smoke-product-pdf.ts", "utf8");
  const firstWrite = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", 'assert.equal(database.rows[0].name, "neondb")',
    "assert.equal(environments.data[0].id, target.inngestEnvironment)", "Inngest event key target mismatch",
    "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)"]) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(firstWrite);
  }
  expect(source).toContain("await stageProductBundle(");
  expect(source).toContain("/apps/zyx-academy/functions/product-diktat-pdf-worker/invoke");
  expect(source).toContain('idempotencyKey: `${id}-render`');
  expect(source.indexOf("assertProductPdfInspection(bytes, inspected, row.pageCount!)")).toBeLessThan(source.indexOf("evidence.accepted = true"));
  expect(source.indexOf("PRODUCT_PDF_SMOKE_READBACK_HASH_MISMATCH")).toBeLessThan(source.indexOf("await storage.delete(key)"));
  expect(source.indexOf('assert.equal(draft.status, "draft")')).toBeLessThan(source.indexOf("await storage.delete(key)"));
  expect(source).toContain("for (const key of [pdfKey, sourceKey])");
  expect(source).toContain("if (fixturesCreated && !evidence.cleanupComplete)");
  expect(source).toContain("product-pdf-retained.json");
  expect(source).not.toContain("publishProductBundle");
  expect(source).not.toContain("sendOptionalEmail");
});
