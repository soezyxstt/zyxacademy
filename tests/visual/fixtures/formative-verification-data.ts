import { createHash } from "node:crypto";
import sharp from "sharp";
import { zipSync } from "fflate";
import { buildLocalVerificationFixture } from "../../../scripts/authoring/local-verification-fixture";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundleAdmission } from "@/lib/bundle/product-validator";
import { materializeArticleParts } from "@/lib/materials/article-parts";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { visualSpecSchema } from "@/lib/materials/visual-contract";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));

export async function admittedFormativeVerificationFixture() {
  const fixture = buildLocalVerificationFixture().bundle;
  const products = structuredClone(fixture.products);
  const article = products.find(product => product.productType === "article");
  if (!article || article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const block = article.sections.flatMap(section => section.blocks).find(item => item.formativeCheckPayload?.options?.some(option => option.isCorrect));
  if (!block?.parts || !block.formativeCheckPayload?.options) throw new Error("FIXTURE_FORMATIVE_REQUIRED");
  const files = new Map(fixture.files);
  const specs = [];
  const assets: Record<string, { document: Uint8Array; print: Uint8Array }> = {};
  for (const [index, id] of ["prompt", "option", "explanation"].entries()) {
    const document = Buffer.from(`<!doctype html><html><body><main><h1>${id} visual</h1><label>Nilai <input type="range" min="0" max="2" value="1" oninput="document.getElementById('value').textContent=this.value"></label><p id="value">1</p></main></body></html>`);
    const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: index * 70, g: 100, b: 160, alpha: 1 } } }).png().toBuffer();
    const spec = interactiveDocumentSchema.parse({ id, kind: "interactive_document", version: 1, label: `${id} visual`, description: "Ubah nilai", documentSha256: hash(document), documentBytes: document.length, printSha256: hash(print), printBytes: print.length, height: 300, staticFallback: { type: "text", summary: `${id} fallback`, content: "Nilai awal 1" }, printCaption: "Nilai awal" });
    specs.push(spec); assets[spec.documentSha256] = { document, print };
    files.set(`visuals/${spec.documentSha256}.html`, document);
    files.set(`visuals/${spec.printSha256}.png`, print);
  }
  const scene = visualSpecSchema.parse({ id: "preceding_scene", kind: "interactive_scene", label: "Diagram pendamping", description: "Lingkaran", viewBox: { x: 0, y: 0, width: 100, height: 30 }, parameters: [{ id: "x", label: "Posisi", min: 0, max: 100, step: 1, initial: 50, control: "range" }], shapes: [{ type: "circle", cx: "x", cy: 15, r: 5 }], staticFallback: { type: "text", summary: "Lingkaran", content: "Lingkaran di tengah." } });
  const embed = (index: number) => `\`\`\`zyx-visual\n${JSON.stringify(scene)}\n\`\`\`\n\n\`\`\`zyx-visual\n${JSON.stringify(specs[index])}\n\`\`\``;
  block.parts.push({ id: "verification-prompt-document", kind: "markdown", markdown: embed(0) });
  block.contentMarkdown = materializeArticleParts(block.parts);
  block.formativeCheckPayload.options.find(option => option.isCorrect)!.text = embed(1);
  block.formativeCheckPayload.answer = "Jawaban tersimpan";
  block.formativeCheckPayload.explanation = embed(2);
  files.set("products.json", encode(products));
  const entityFiles = fixture.manifest.entityFiles.map(file => ({ ...file, checksum: hash(files.get(file.path)!) }));
  const visualAssets = specs.flatMap(spec => [{ path: `visuals/${spec.documentSha256}.html`, sha256: spec.documentSha256, bytes: spec.documentBytes }, { path: `visuals/${spec.printSha256}.png`, sha256: spec.printSha256, bytes: spec.printBytes }]);
  const base = { ...fixture.manifest, entityFiles, visualAssets, bundleChecksum: undefined };
  files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) }));
  const admitted = await validateProductBundleAdmission(zipSync(Object.fromEntries(files)));
  if (!admitted.success) throw new Error(`FIXTURE_NOT_ADMITTED:${JSON.stringify(admitted.issues)}`);
  return { bundle: admitted.data, assets, specs };
}
