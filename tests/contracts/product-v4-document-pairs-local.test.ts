import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { zipSync } from "fflate";

mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: { download: () => { throw new Error("REMOTE_STORAGE_FORBIDDEN"); }, exists: () => { throw new Error("REMOTE_STORAGE_FORBIDDEN"); }, upload: () => { throw new Error("REMOTE_STORAGE_FORBIDDEN"); } } }));
mock.module("@/db", () => { throw new Error("DATABASE_FORBIDDEN"); });

const { buildLocalVerificationFixture } = await import("../../scripts/authoring/local-verification-fixture");
const { createProductBundleDraft, finalizeProductBundleDraft } = await import("@/lib/bundle/product-draft");
const { computeProductBundleChecksum, deterministicProductSerialization } = await import("@/lib/bundle/product-validator");
const { admitLocalV4Bundle, localV4DocumentReader } = await import("../../scripts/authoring/local-v4-bundle");
const { deriveProductV4VerificationPlan } = await import("@/lib/bundle/product-v4-verification");
const { buildProductV4RuntimeBinding, loadProductV4InteractiveDocumentAssets, loadProductV4StaticFigureAssets } = await import("@/lib/compute/product-v4-runtime-binding");
const { productV4DocumentPairKey, encodeProductV4DocumentWire, decodeProductV4DocumentWire } = await import("@/lib/compute/product-v4-document-wire");
const { executeProductV4VerificationCheck } = await import("@/lib/compute/product-v4-verification-executor");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("wire permits the exact unique-byte budget with per-asset padding and rejects one extra byte", () => {
  const assets = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const document = Buffer.alloc(1024 * 1024, index * 2), print = Buffer.alloc(1024 * 1024, index * 2 + 1);
    return [`${digest(document)}:${digest(print)}`, { document, print }];
  }));
  const wire = encodeProductV4DocumentWire(assets);
  const decoded = decodeProductV4DocumentWire(wire);
  expect(Object.values(decoded).reduce((sum, pair) => sum + pair.document.length + pair.print.length, 0)).toBe(16 * 1024 * 1024);
  const key = Object.keys(assets)[0];
  assets[key].document = Buffer.concat([assets[key].document, Buffer.from([0])]);
  expect(() => encodeProductV4DocumentWire(assets)).toThrow("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
  wire.documents[key.split(":")[0]] = assets[key].document.toString("base64");
  expect(() => decodeProductV4DocumentWire(wire)).toThrow("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
});

test("wire counts shared document bytes once and rejects inconsistent shared bytes", () => {
  const document = new Uint8Array(5 * 1024 * 1024).fill(42);
  const documentHash = digest(document);
  const assets = Object.fromEntries(Array.from({ length: 4 }, (_, index) => {
    const print = new Uint8Array([index + 1]);
    return [`${documentHash}:${digest(print)}`, { document, print }];
  }));
  const wire = encodeProductV4DocumentWire(assets);
  expect(Object.keys(wire.documents)).toHaveLength(1);
  expect(Object.keys(decodeProductV4DocumentWire(wire))).toHaveLength(4);
  const keys = Object.keys(assets);
  assets[keys[1]] = { ...assets[keys[1]], document: new Uint8Array([2]) };
  expect(() => encodeProductV4DocumentWire(assets)).toThrow("VERIFICATION_DOCUMENT_WIRE_INVALID");
});

test("admitted ZIP retains both print pairs through binding, wire and local executor", async () => {
  const image = { create: { width: 64, height: 40, channels: 4 as const, background: "#2470ab" } };
  const printA = await sharp(image).png({ compressionLevel: 1 }).toBuffer();
  const printB = await sharp(image).png({ compressionLevel: 9 }).toBuffer();
  expect(digest(printA)).not.toBe(digest(printB));
  expect(await sharp(printA).raw().toBuffer()).toEqual(await sharp(printB).raw().toBuffer());
  const document = Buffer.from("<!doctype html><button>Visual</button>");
  const fixture = buildLocalVerificationFixture().bundle;
  const draft = createProductBundleDraft(fixture);
  const article = draft.products.find(product => product.productType === "article");
  if (!article || article.productType !== "article" || !article.visuals?.[0]) throw new Error("fixture");
  const specA = { id: article.visuals[0].id, kind: "interactive_document" as const, version: 1 as const, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(printA), printBytes: printA.length, height: 400, staticFallback: { type: "text" as const, summary: "Visual", content: "Visual" }, printCaption: "Visual" };
  const specB = { ...specA, id: "second-document", printSha256: digest(printB), printBytes: printB.length };
  article.visuals = [specA, specB];
  const block = article.sections.flatMap(section => section.blocks).find(item => item.parts?.some(part => part.kind === "visual_ref"));
  if (!block?.parts) throw new Error("fixture-part");
  block.parts.push({ id: "second-document-ref", kind: "visual_ref", visualId: specB.id });
  const finalized = finalizeProductBundleDraft(fixture, draft).bundle;
  const files = new Map(finalized.files);
  const dependencies = finalized.dependencies.map(dependency => ({ ...dependency, freshness: "UP_TO_DATE" as const }));
  const dependencyFile = finalized.manifest.entityFiles.find(file => file.entityType === "dependencies")!;
  const dependencyBytes = new TextEncoder().encode(deterministicProductSerialization(dependencies));
  files.set(dependencyFile.path, dependencyBytes);
  const entries = [
    { path: `visuals/${digest(document)}.html`, sha256: digest(document), bytes: document.length, data: document },
    { path: `visuals/${digest(printA)}.png`, sha256: digest(printA), bytes: printA.length, data: printA },
    { path: `visuals/${digest(printB)}.png`, sha256: digest(printB), bytes: printB.length, data: printB },
  ];
  for (const entry of entries) files.set(entry.path, entry.data);
  const base = { ...finalized.manifest, entityFiles: finalized.manifest.entityFiles.map(file => file.path === dependencyFile.path ? { ...file, checksum: digest(dependencyBytes) } : file), visualAssets: entries.map(({ data: _, ...entry }) => entry), bundleChecksum: undefined };
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) })));
  const invalidFiles = new Map(files);
  const badPrint = Buffer.from(printA); badPrint[30] ^= 0xff;
  const badHash = digest(badPrint);
  const productsFile = base.entityFiles.find(file => file.entityType === "products")!;
  const invalidProducts = JSON.parse(new TextDecoder().decode(invalidFiles.get(productsFile.path)!));
  const invalidArticle = invalidProducts.find((product: { id: string }) => product.id === article.id);
  invalidArticle.visuals[1].printSha256 = badHash;
  invalidArticle.visuals[1].printBytes = badPrint.length;
  const invalidProductsBytes = new TextEncoder().encode(deterministicProductSerialization(invalidProducts));
  invalidFiles.set(productsFile.path, invalidProductsBytes);
  invalidFiles.delete(`visuals/${specB.printSha256}.png`);
  invalidFiles.set(`visuals/${badHash}.png`, badPrint);
  const invalidBase = { ...base, entityFiles: base.entityFiles.map(file => file.path === productsFile.path ? { ...file, checksum: digest(invalidProductsBytes) } : file), visualAssets: base.visualAssets.map(entry => entry.sha256 === specB.printSha256 ? { path: `visuals/${badHash}.png`, sha256: badHash, bytes: badPrint.length } : entry) };
  invalidFiles.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization({ ...invalidBase, bundleChecksum: computeProductBundleChecksum(invalidBase, invalidFiles) })));
  await expect(admitLocalV4Bundle(zipSync(Object.fromEntries(invalidFiles)))).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  const { bundle } = await admitLocalV4Bundle(zipSync(Object.fromEntries(files)));
  const read = localV4DocumentReader(bundle.files);
  await expect(read({ ...specA, printSha256: "0".repeat(64) }, "print")).rejects.toThrow("LOCAL_BUNDLE_ASSET_MISSING");
  const hash = "a".repeat(64);
  const ports = { course: async () => ({ id: bundle.manifest.courseId, legacyCourseId: "local" }), dependencies: async () => bundle.products.flatMap(product => [...product.ideaLinks.map(idea => ({ type: "idea" as const, id: idea.id, version: idea.version, hash: idea.semanticHash, status: "published", courseId: product.courseId })), ...product.sourceRefs.flatMap(source => [{ type: "source_material" as const, id: source.sourceId, version: source.version, hash: source.checksum, status: "active", courseId: product.courseId }, ...source.excerptIds.map(id => ({ type: "source_chunk" as const, id, version: source.version, hash: source.checksum, status: "active", courseId: product.courseId, sourceId: source.sourceId }))])]), runtime: async () => ({ rendererChecksum: hash, fontChecksum: hash, contractChecksum: hash, playbookChecksum: hash, printProfile: "a4" }), figure: async (): Promise<never> => { throw new Error("DATABASE_FORBIDDEN"); }, download: async (): Promise<never> => { throw new Error("REMOTE_STORAGE_FORBIDDEN"); } };
  const unique = new Map((await ports.dependencies()).map(row => [`${row.type}:${row.id}`, row]));
  ports.dependencies = async () => [...unique.values()];
  const row = { id: "local", bundleType: "product" as const, bundleId: bundle.manifest.bundleId, courseId: "local", checksum: bundle.manifest.bundleChecksum };
  const binding = await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports, read);
  const plan = deriveProductV4VerificationPlan({ bundle, binding });
  const requirement = plan.requirements.find(item => item.target === article.id && item.layer === "web")!;
  const assets = await loadProductV4InteractiveDocumentAssets({ bundle, plan, requirement }, read);
  const decoded = decodeProductV4DocumentWire(encodeProductV4DocumentWire(assets));
  expect(decoded[productV4DocumentPairKey(specA)].print).toEqual(new Uint8Array(printA));
  expect(decoded[productV4DocumentPairKey(specB)].print).toEqual(new Uint8Array(printB));
  expect(Object.keys(decoded)).toHaveLength(2);
  const prints = await loadProductV4StaticFigureAssets(bundle, ports, true, read);
  expect(prints[`interactive_document:${specA.printSha256}`].bytes).toEqual(new Uint8Array(printA));
  expect(prints[`interactive_document:${specB.printSha256}`].bytes).toEqual(new Uint8Array(printB));
  await expect(buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports, async () => new Uint8Array([0]))).rejects.toThrow("INTEGRITY");
  const previousFetch = globalThis.fetch, previousUrl = process.env.AUTHORING_VERIFICATION_RENDERER_URL, previousSecret = process.env.AUTHORING_VERIFICATION_RENDERER_SECRET;
  try {
    process.env.AUTHORING_VERIFICATION_RENDERER_URL = "http://127.0.0.1:9876";
    process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = "local-only";
    let printCheck = false;
    globalThis.fetch = (async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (printCheck) {
        expect(body.staticFigureAssets[`interactive_document:${specA.printSha256}`].base64).toBe(printA.toString("base64"));
        expect(body.staticFigureAssets[`interactive_document:${specB.printSha256}`].base64).toBe(printB.toString("base64"));
      } else {
        const decodedWire = decodeProductV4DocumentWire(body.interactiveDocumentAssets);
        expect(decodedWire[productV4DocumentPairKey(specA)].print).toEqual(new Uint8Array(printA));
        expect(decodedWire[productV4DocumentPairKey(specB)].print).toEqual(new Uint8Array(printB));
      }
      return Response.json({ checkId: body.requirement.id, status: "PASS", expected: "expected", observed: "observed", artifacts: [] });
    }) as typeof fetch;
    expect((await executeProductV4VerificationCheck({ bundle, plan, requirement }, read, ports)).status).toBe("PASS");
    printCheck = true;
    const printRequirement = plan.requirements.find(item => item.layer === "print")!;
    expect((await executeProductV4VerificationCheck({ bundle, plan, requirement: printRequirement }, read, ports)).status).toBe("PASS");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.AUTHORING_VERIFICATION_RENDERER_URL; else process.env.AUTHORING_VERIFICATION_RENDERER_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.AUTHORING_VERIFICATION_RENDERER_SECRET; else process.env.AUTHORING_VERIFICATION_RENDERER_SECRET = previousSecret;
  }
});
