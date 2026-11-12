import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { zipSync } from "fflate";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { computeProductBundleChecksum, deterministicProductSerialization } from "@/lib/bundle/product-validator";
import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { assertNoHiddenFormativeDocuments } from "@/lib/compute/product-v4-formative-verification";

mock.module("server-only", () => ({}));
const { validateProductBundleAdmission } = await import("@/lib/bundle/product-admission");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));

test.each(["document", "graph"])("admitted hidden document and visible %s with equal IDs retain only visible assets", async mode => {
  const visibleHtml = Buffer.from("<!doctype html><p>Visible</p>");
  const hiddenHtml = Buffer.from("<!doctype html><p>Hidden answer</p>");
  const visiblePng = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const hiddenPng = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  const source = buildLocalVerificationFixture().bundle;
  const draft = createProductBundleDraft(source);
  const article = draft.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article" || !article.visuals?.[0]) throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const document = { id: article.visuals[0].id, kind: "interactive_document", version: 1, label: "Visible model", description: "Model", documentSha256: sha(visibleHtml), documentBytes: visibleHtml.length, printSha256: sha(visiblePng), printBytes: visiblePng.length, height: 400, staticFallback: { type: "text", summary: "Visible", content: "Visible fallback" }, printCaption: "Visible" } as const;
  if (mode === "graph" && article.visuals[0].kind !== "epsilon_delta_graph") throw new Error("FIXTURE_GRAPH_REQUIRED");
  const visible = mode === "graph" ? article.visuals[0] : document;
  const hidden = { ...document, label: "SECRET answer", documentSha256: sha(hiddenHtml), documentBytes: hiddenHtml.length, printSha256: sha(hiddenPng), printBytes: hiddenPng.length };
  article.visuals[0] = visible;
  const finalized = finalizeProductBundleDraft(source, draft).bundle;
  const products = structuredClone(finalized.products);
  const product = products.find(item => item.productType === "article");
  if (!product || product.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const check = product.sections.flatMap(section => section.blocks).find(block => block.formativeCheckPayload);
  if (!check?.formativeCheckPayload) throw new Error("FIXTURE_CHECK_REQUIRED");
  check.formativeCheckPayload.explanation = `\`\`\`zyx-visual\n${JSON.stringify(hidden)}\n\`\`\``;
  const files = new Map(finalized.files);
  files.set("products.json", encode(products));
  const assets: [string, string, Uint8Array][] = [[hidden.documentSha256, "html", hiddenHtml], [hidden.printSha256, "png", hiddenPng]];
  if (mode === "document") assets.push([document.documentSha256, "html", visibleHtml], [document.printSha256, "png", visiblePng]);
  for (const [hash, extension, bytes] of assets) files.set(`visuals/${hash}.${extension}`, bytes);
  const entityFiles = finalized.manifest.entityFiles.map(file => ({ ...file, checksum: sha(files.get(file.path)!) }));
  const visualAssets = assets.map(([hash, extension, bytes]) => ({ path: `visuals/${hash}.${extension}`, sha256: hash, bytes: bytes.length }));
  const manifest = { ...finalized.manifest, entityFiles, visualAssets, bundleChecksum: undefined };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const admitted = await validateProductBundleAdmission(zipSync(Object.fromEntries(files)));
  if (!admitted.success) throw new Error(JSON.stringify(admitted.issues));
  const admittedArticle = admitted.data.products.find(item => item.productType === "article");
  if (!admittedArticle || admittedArticle.productType !== "article") throw new Error("ADMITTED_ARTICLE_REQUIRED");
  expect(() => assertNoHiddenFormativeDocuments(admittedArticle, { visuals: admittedArticle.visuals, visualId: visible.id })).not.toThrow();
  expect(() => assertNoHiddenFormativeDocuments(admittedArticle, { visuals: [hidden] })).toThrow("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
  expect(() => assertNoHiddenFormativeDocuments(admittedArticle, { visuals: [{ ...visible, kind: "invalid" }], visualId: hidden.id })).toThrow("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
  expect(() => assertNoHiddenFormativeDocuments(admittedArticle, { parts: [{ kind: "visual_ref", visualId: hidden.id }] })).toThrow("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
  const section = admittedArticle.sections.find(item => item.blocks.some(block => block.parts?.some(part => part.kind === "visual_ref" && part.visualId === visible.id)));
  if (!section) throw new Error("VISIBLE_REFERENCE_REQUIRED");
  const blocks = admittedArticle.sections.flatMap(item => item.blocks.map(block => ({ ...block, bagianArtikelId: item.id, content: block.contentMarkdown })));
  const model = buildPublicArticleReadModel(
    { id: admittedArticle.id, courseId: "course", slug: "article", title: "Article", version: 1, visuals: admittedArticle.visuals },
    admittedArticle.sections.map(item => ({ id: item.id, slug: item.id, title: item.title })), blocks,
  );
  const json = JSON.stringify(model);
  const publicVisual = model.visuals?.find(item => item.id === visible.id);
  expect(publicVisual?.kind).toBe(visible.kind);
  if (visible.kind === "interactive_document") {
    expect(publicVisual?.kind === "interactive_document" && publicVisual.documentSha256).toBe(visible.documentSha256);
  }
  expect(json).toContain(`"visualId":"${visible.id}"`);
  expect(json).not.toContain(hidden.documentSha256);
  expect(json).not.toContain(hidden.printSha256);
  expect(json).not.toContain("SECRET answer");
});
