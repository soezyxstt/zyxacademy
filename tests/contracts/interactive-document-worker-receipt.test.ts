import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";
import { interactiveDocumentAdmissionReceipt } from "@/lib/materials/interactive-document-verified";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import type { ProductV4LiveDependency } from "@/lib/compute/product-v4-runtime-binding";

const objects = new Map<string, Uint8Array>();
const download = async (key: string) => {
  const bytes = objects.get(key);
  if (!bytes) throw new Error("MISSING_RECEIPT_OR_ASSET");
  return bytes;
};
mock.module("@/lib/storage", () => ({ storage: { download } }));
const { loadDiktatWorkerAssets } = await import("@/lib/compute/product-diktat-worker-assets");
const { loadProductV4StaticFigureAssets, buildProductV4RuntimeBinding } = await import("@/lib/compute/product-v4-runtime-binding");

test("compute readers require an exact admission receipt before returning immutable assets", async () => {
  const document = Buffer.from("<!doctype html><p>Visual</p>");
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const bundle = structuredClone(buildLocalVerificationFixture().bundle);
  const article = bundle.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article") throw new Error("ARTICLE_REQUIRED");
  const spec = interactiveDocumentSchema.parse({ id: article.visuals![0].id, kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Visual" }, printCaption: "Visual" });
  article.visuals = [spec];
  const hash = "a".repeat(64);
  const dependencies = new Map<string, ProductV4LiveDependency>();
  for (const product of bundle.products) {
    for (const idea of product.ideaLinks) dependencies.set(`idea:${idea.id}`, { type: "idea", id: idea.id, version: idea.version, hash: idea.semanticHash, courseId: bundle.manifest.courseId, status: "published" });
    for (const source of product.sourceRefs) {
      dependencies.set(`source_material:${source.sourceId}`, { type: "source_material", id: source.sourceId, version: source.version, hash: source.checksum, courseId: bundle.manifest.courseId, status: "active" });
      for (const id of source.excerptIds) dependencies.set(`source_chunk:${id}`, { type: "source_chunk", id, sourceId: source.sourceId, version: source.version, hash: source.checksum, courseId: bundle.manifest.courseId, status: "active" });
    }
  }
  const row = { id: "import", bundleType: "product" as const, bundleId: bundle.manifest.bundleId, courseId: "legacy", checksum: bundle.checksum };
  const ports = { download, async course() { return { id: bundle.manifest.courseId, legacyCourseId: "legacy" }; },
    async dependencies() { return [...dependencies.values()]; }, async logicRuntime() { return { logicChecksum: hash, contractChecksum: hash, playbookChecksum: hash }; },
    async runtime(): Promise<never> { throw new Error("BROWSER_RUNTIME_FORBIDDEN"); }, async figure(): Promise<never> { throw new Error("NO_FIGURE_READ"); } };
  const loads = [
    () => loadDiktatWorkerAssets(bundle, ports),
    () => loadProductV4StaticFigureAssets(bundle),
    () => buildProductV4RuntimeBinding({ row, bundle, runId: "run", purpose: "logic" }, ports),
  ];
  objects.set(buildInteractiveDocumentAssetKey(spec.documentSha256, "document"), document);
  objects.set(buildInteractiveDocumentAssetKey(spec.printSha256, "print"), print);
  const receiptKey = buildInteractiveDocumentAdmissionKey(spec.printSha256);
  for (const load of loads) await expect(load()).rejects.toThrow("MISSING_RECEIPT");
  for (const change of [{ version: 0 }, { sha256: hash }, { bytes: print.length + 1 }]) {
    objects.set(receiptKey, Buffer.from(JSON.stringify({ version: 1, sha256: spec.printSha256, bytes: spec.printBytes, ...change })));
    for (const load of loads) await expect(load()).rejects.toThrow("ADMISSION_REQUIRED");
  }
  objects.set(receiptKey, interactiveDocumentAdmissionReceipt(spec));
  for (const load of loads) expect(Object.keys(await load())).not.toHaveLength(0);
  objects.set(buildInteractiveDocumentAssetKey(spec.printSha256, "print"), Buffer.from(print).fill(0));
  for (const load of loads) await expect(load()).rejects.toThrow("INTEGRITY");
});
