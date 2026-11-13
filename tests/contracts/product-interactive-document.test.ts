import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { unzipSync, zipSync } from "fflate";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle } from "@/lib/bundle/product-validator";
import { renderDiktatStaticVisual, buildDiktatVisualSnapshot } from "@/lib/materials/diktat-static-visual";
import { sanitizeVisualSpec } from "@/lib/articles/structured-read-model";
import { materializeArticleParts } from "@/lib/materials/article-parts";
import { parseAdmittedProductBundle } from "@/lib/bundle/product-staged-worker";
import { loadDiktatWorkerAssets } from "@/lib/compute/product-diktat-worker-assets";
import { validateProductV4HttpAssets } from "@/lib/compute/product-v4-http-asset-validation";
import { productV4DocumentPairKey } from "@/lib/compute/product-v4-document-wire";
import { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";
import { interactiveDocumentAdmissionReceipt } from "@/lib/materials/interactive-document-verified";

mock.module("server-only", () => ({}));
const { validateProductBundleAdmission } = await import("@/lib/bundle/product-admission");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
const html = new TextEncoder().encode("<!doctype html><canvas></canvas><script>document.querySelector('canvas').width=240</script>");
const png = await sharp({ create: { width: 64, height: 40, channels: 4, background: "#2470ab" } }).png().toBuffer();
const bundle = buildLocalVerificationFixture().bundle;
const draft = createProductBundleDraft(bundle);
const article = draft.products.find(product => product.productType === "article");
if (!article || article.productType !== "article" || !article.visuals?.[0]) throw new Error("FIXTURE_MISSING");
const spec = { id: article.visuals[0].id, kind: "interactive_document", version: 1, label: "Model", description: "Model interaktif", documentSha256: digest(html), documentBytes: html.length, printSha256: digest(png), printBytes: png.length, height: 400, staticFallback: { type: "text", summary: "Model", content: "Keadaan awal" }, printCaption: "Keadaan awal" } as const;
article.visuals[0] = spec;
const finalized = finalizeProductBundleDraft(bundle, draft).bundle;
const documentPath = `visuals/${spec.documentSha256}.html`;
const printPath = `visuals/${spec.printSha256}.png`;
const manifestEntries = [{ path: documentPath, sha256: spec.documentSha256, bytes: html.length }, { path: printPath, sha256: spec.printSha256, bytes: png.length }];
function archive(options: { missing?: boolean; orphan?: boolean; badHash?: boolean; badPng?: boolean; noManifest?: boolean } = {}) {
  const files = new Map(finalized.files);
  let printBytes: Uint8Array = png;
  let currentSpec = spec;
  if (options.badPng) {
    printBytes = new TextEncoder().encode("not a PNG");
    currentSpec = { ...spec, printSha256: digest(printBytes), printBytes: printBytes.length };
    const products = structuredClone(finalized.products);
    const changed = products.find(product => product.productType === "article");
    if (!changed || changed.productType !== "article") throw new Error("FIXTURE_MISSING");
    changed.visuals = [currentSpec];
    // Remove the Diktat so its visual snapshot cannot mask PNG admission.
    const articles = products.filter(product => product.productType === "article");
    files.set("products.json", encode(articles));
    files.set("dependencies.json", encode([]));
  }
  files.set(documentPath, options.badHash ? new Uint8Array(html.length) : html);
  if (!options.missing) files.set(`visuals/${currentSpec.printSha256}.png`, printBytes);
  if (options.orphan) files.set("visuals/orphan.png", png);
  const entries = options.badPng ? [manifestEntries[0], { path: `visuals/${currentSpec.printSha256}.png`, sha256: currentSpec.printSha256, bytes: printBytes.length }] : manifestEntries;
  const entityFiles = finalized.manifest.entityFiles.map(file => ({ ...file, checksum: digest(files.get(file.path)!), stableIds: options.badPng ? file.entityType === "products" ? [article!.id] : [] : file.stableIds }));
  const base = { ...finalized.manifest, entityFiles, ...(options.noManifest ? {} : { visualAssets: entries }), bundleChecksum: undefined };
  files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) }));
  return zipSync(Object.fromEntries(files));
}

test("Product admission verifies a complete ZIP and refuses structural-only success", async () => {
  expect(validateProductBundle(archive()).success).toBe(false);
  const result = await validateProductBundleAdmission(archive());
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  expect(result.success).toBe(true);
  for (const [options, code] of [[{ missing: true }, "INTERACTIVE_DOCUMENT_ASSET_MISSING"], [{ orphan: true }, "INTERACTIVE_DOCUMENT_ORPHAN_ASSET"], [{ badHash: true }, "INTERACTIVE_DOCUMENT_INTEGRITY"], [{ noManifest: true }, "INTERACTIVE_DOCUMENT_MANIFEST_MISMATCH"], [{ badPng: true }, "INTERACTIVE_DOCUMENT_PRINT_INVALID"]] as const) {
    const invalid = await validateProductBundleAdmission(archive(options));
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.issues[0].code).toBe(code);
  }
});

test("Diktat worker reads only the exact admitted archive contents", async () => {
  const bytes = archive();
  const admitted = await validateProductBundleAdmission(bytes);
  if (!admitted.success) throw new Error(JSON.stringify(admitted.issues));
  const row = { bundleId: admitted.data.manifest.bundleId, checksum: admitted.data.checksum };
  expect(parseAdmittedProductBundle(bytes, row).files.get(printPath)).toEqual(png);
  expect(() => parseAdmittedProductBundle(new Uint8Array([1, 2, 3]), row)).toThrow("PRODUCT_BUNDLE_VALIDATION_FAILED:");
  const receiptKey = buildInteractiveDocumentAdmissionKey(spec.printSha256);
  const assetKey = buildInteractiveDocumentAssetKey(spec.printSha256, "print");
  const download = async (key: string, asset: Uint8Array = png) => {
    if (key === receiptKey) return interactiveDocumentAdmissionReceipt(spec);
    if (key === assetKey) return asset;
    throw new Error(`Unexpected storage read: ${key}`);
  };
  const ports = { course: async () => { throw new Error("Unexpected course lookup"); }, figure: async () => { throw new Error("Unexpected figure lookup"); }, download };
  expect((await loadDiktatWorkerAssets(admitted.data, ports))[`interactive_document:${spec.printSha256}`].bytes).toEqual(png);
  await expect(loadDiktatWorkerAssets(admitted.data, { ...ports, download: key => download(key, new Uint8Array(png.length)) })).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  expect(() => parseAdmittedProductBundle(bytes, { ...row, bundleId: "other" })).toThrow("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  const tampered = unzipSync(bytes);
  tampered[printPath] = new Uint8Array(png.length);
  expect(() => parseAdmittedProductBundle(zipSync(tampered), row)).toThrow("PRODUCT_BUNDLE_VALIDATION_FAILED:PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  expect(() => parseAdmittedProductBundle(archive({ badPng: true }), row)).toThrow("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  const rejected = await validateProductBundleAdmission(archive({ badPng: true }));
  expect(rejected.success).toBe(false);
});

test("projection and print bind metadata and exact PNG, with no inline code", () => {
  expect(sanitizeVisualSpec(spec)).toEqual(spec);
  expect(sanitizeVisualSpec({ ...spec, html: "<script>" })).toBeNull();
  expect(() => renderDiktatStaticVisual(spec)).toThrow("DIKTAT_INTERACTIVE_DOCUMENT_ASSET_REQUIRED");
  const assets = { [`interactive_document:${spec.printSha256}`]: { bytes: png, mimeType: "image/png" as const, sourceChecksum: spec.printSha256 } };
  const rendered = renderDiktatStaticVisual(spec, assets);
  expect(rendered).toContain("data:image/png;base64,");
  expect(rendered).not.toContain("<script>");
  expect(buildDiktatVisualSnapshot(spec).stateHash).not.toBe(buildDiktatVisualSnapshot({ ...spec, printCaption: "Berbeda" }).stateHash);
  expect(() => renderDiktatStaticVisual(spec, { [`interactive_document:${spec.printSha256}`]: { ...assets[`interactive_document:${spec.printSha256}`], bytes: new Uint8Array(png.length) } })).toThrow();
});

test("HTTP receiver fully decodes every matched document print, including print-only assets", async () => {
  const key = productV4DocumentPairKey(spec);
  const figures = { [`interactive_document:${spec.printSha256}`]: { bytes: png } };
  await validateProductV4HttpAssets(finalized.products, { [key]: { document: html, print: png } }, figures);
  await expect(validateProductV4HttpAssets(finalized.products, { [key]: { document: html, print: new Uint8Array(png.length) } }, {})).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  await expect(validateProductV4HttpAssets(finalized.products, { [`${"0".repeat(64)}:${spec.printSha256}`]: { document: html, print: png } }, {})).rejects.toThrow("VERIFICATION_DOCUMENT_ASSET_UNAVAILABLE");
  const corrupt = Buffer.from(png); corrupt[30] ^= 0xff;
  const badSpec = { ...spec, printSha256: digest(corrupt) };
  const products = structuredClone(finalized.products);
  const changed = products.find(product => product.productType === "article");
  if (!changed || changed.productType !== "article") throw new Error("FIXTURE_MISSING");
  changed.visuals = [badSpec];
  await expect(validateProductV4HttpAssets(products, { [productV4DocumentPairKey(badSpec)]: { document: html, print: corrupt } }, {})).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  await expect(validateProductV4HttpAssets(products, {}, { [`interactive_document:${badSpec.printSha256}`]: { bytes: corrupt } })).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
});

test("real V4 ZIP admits formative document fields and rejects cross-question disclosure", async () => {
  const hiddenHtml = new TextEncoder().encode("<!doctype html><p>Jawaban</p>");
  const hiddenPng = await sharp({ create: { width: 3, height: 3, channels: 4, background: "red" } }).png().toBuffer();
  const hidden = { ...spec, id: "hidden", documentSha256: digest(hiddenHtml), documentBytes: hiddenHtml.length, printSha256: digest(hiddenPng), printBytes: hiddenPng.length };
  const fence = (value: unknown) => `\`\`\`zyx-visual\n${JSON.stringify(value)}\n\`\`\``;
  const makeArchive = (reuse: boolean, embeddedPayload = false) => {
    const files = new Map(finalized.files);
    const products = structuredClone(finalized.products);
    const current = products.find(product => product.productType === "article");
    if (!current || current.productType !== "article") throw new Error("FIXTURE_MISSING");
    const checks = current.sections.flatMap(section => section.blocks).filter(block => block.formativeCheckPayload);
    if (checks.length < 2 || !checks[0].parts || !checks[0].formativeCheckPayload || !checks[1].formativeCheckPayload) throw new Error("FORMATIVE_FIXTURE_MISSING");
    checks[0].parts.push({ id: "question-document", kind: "markdown", markdown: embeddedPayload ? '<!--__ZYX_V4_BLOCK_PAYLOAD__:e30-->' : fence(spec) });
    checks[0].contentMarkdown = materializeArticleParts(checks[0].parts);
    const option = checks[0].formativeCheckPayload.options?.[0];
    if (!option) throw new Error("OPTION_FIXTURE_MISSING");
    option.text = fence(spec);
    checks[1].formativeCheckPayload.answer = fence(reuse ? spec : hidden);
    checks[1].formativeCheckPayload.explanation = fence(hidden);
    files.set("products.json", encode(products));
    files.set(documentPath, html);
    files.set(printPath, png);
    files.set(`visuals/${hidden.documentSha256}.html`, hiddenHtml);
    files.set(`visuals/${hidden.printSha256}.png`, hiddenPng);
    const entityFiles = finalized.manifest.entityFiles.map(file => ({ ...file, checksum: digest(files.get(file.path)!) }));
    const visualAssets = [...manifestEntries, { path: `visuals/${hidden.documentSha256}.html`, sha256: hidden.documentSha256, bytes: hiddenHtml.length }, { path: `visuals/${hidden.printSha256}.png`, sha256: hidden.printSha256, bytes: hiddenPng.length }];
    const base = { ...finalized.manifest, entityFiles, visualAssets, bundleChecksum: undefined };
    files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) }));
    return zipSync(Object.fromEntries(files));
  };
  const admitted = await validateProductBundleAdmission(makeArchive(false));
  if (!admitted.success) throw new Error(JSON.stringify(admitted.issues));
  expect(admitted.success).toBe(true);
  const reused = await validateProductBundleAdmission(makeArchive(true));
  expect(reused.success).toBe(false);
  if (!reused.success) expect(reused.issues[0].code).toBe("QUESTION_VISUAL_DISCLOSURE");
  expect((await validateProductBundleAdmission(makeArchive(false, true))).success).toBe(false);
});
