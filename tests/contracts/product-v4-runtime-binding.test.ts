import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { productBundleManifestSchema, productEntitySchema } from "@/lib/bundle/product-validator";
import { PRODUCT_V4_RUNTIME_FILES, readProductV4RuntimeFingerprint, assertProductV4RuntimeFingerprint, buildProductV4RuntimeBinding, expectedChromiumRuntime, loadProductV4StaticFigureAssets, productV4DependencyChecksum, resolveProductV4LoadedRuntime, type ProductV4LiveDependency } from "@/lib/compute/product-v4-runtime-binding";
import { loadDiktatWorkerAssets } from "@/lib/compute/product-diktat-worker-assets";

const hash = "a".repeat(64);
const manifest = productBundleManifestSchema.parse({ bundleId: "bundle", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course", creatorId: "creator", createdAt: "2026-10-21T00:00:00.000Z", entityFiles: ["products", "dependencies"].map(entityType => ({ entityType, path: `${entityType}.json`, checksum: hash, stableIds: [] })), bundleChecksum: hash });
const article = productEntitySchema.parse({ id: "article", productType: "article", courseId: "course", version: 1, status: "draft", ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1 }], sourceRefs: [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }], schemaVersion: "article.v4", sourceHash: hash, generationHash: hash, creatorId: "creator", slug: "article", title: "Limit" });
const bundle = { manifest, products: [article], dependencies: [] };
const rows: ProductV4LiveDependency[] = [
  { type: "idea", id: "idea", courseId: "course", version: 1, hash, status: "published" },
  { type: "source_material", id: "source", courseId: "course", version: 1, hash, status: "active" },
  { type: "source_chunk", id: "excerpt", courseId: "course", version: 1, hash, status: "active", sourceId: "source" },
];
const runtime = { rendererChecksum: hash, fontChecksum: hash, contractChecksum: hash, playbookChecksum: hash, printProfile: "fixed-a4" };
const ports = {
  async course() { return { id: "course", legacyCourseId: "legacy-course" }; },
  async figure(): Promise<never> { throw new Error("No figures expected"); },
  async download(): Promise<Uint8Array> { throw new Error("No bytes expected"); },
  async dependencies() { return rows; }, async runtime() { return runtime; },
};
const row = { id: "import", bundleId: "bundle", bundleType: "product" as const, courseId: "legacy-course", checksum: hash, updatedAt: new Date() };

test("runtime closure binds interactive guidance, scene and shared expression sources", () => {
  for (const file of ["lib/authoring/interactive-visual-guidance.ts", "lib/authoring/question-visual-references.ts", "lib/authoring/question-visual-assets.ts", "lib/bundle/product-staged-worker.ts", "lib/bundle/product-v4-verification-core.ts", "lib/bundle/product-v4-verification-worker.ts", "lib/compute/product-diktat-worker-assets.ts", "lib/compute/product-v4-pdf-evidence-shared.ts", "lib/compute/product-v4-http-asset-validation.ts", "lib/materials/interactive-document-png-worker.cjs", "lib/materials/interactive-scene.ts", "lib/materials/diktat-scene-svg.ts", "lib/materials/interactive-document-verified.ts", "lib/materials/interactive-document-markdown.ts", "lib/compute/product-v4-document-wire.ts", "lib/zyra/canvas/expression.ts", "scripts/authoring/local-v4-bundle.ts"] as const) expect(PRODUCT_V4_RUNTIME_FILES).toContain(file);
});

test("runtime attestation rejects every changed fingerprint field and reads installed Chromium metadata", () => {
  expect(() => assertProductV4RuntimeFingerprint(runtime, { ...runtime })).not.toThrow();
  for (const key of ["rendererChecksum", "fontChecksum", "contractChecksum", "playbookChecksum", "printProfile"] as const) {
    expect(() => assertProductV4RuntimeFingerprint(runtime, { ...runtime, [key]: "changed" })).toThrow(`RUNTIME_MISMATCH:${key}`);
  }
  expect(expectedChromiumRuntime().browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  expect(expectedChromiumRuntime().revision).toMatch(/^\d+$/);
});

test("a bundled renderer rejects changed workspace dependencies before retaining its build identity", async () => {
  let reads = 0;
  const newer = { ...runtime, rendererChecksum: "b".repeat(64) };
  await expect(resolveProductV4LoadedRuntime(runtime, async () => { reads++; return newer; })).rejects.toThrow("RUNTIME_MISMATCH:rendererChecksum");
  expect(reads).toBe(1);
  const loaded = await resolveProductV4LoadedRuntime(runtime, async () => ({ ...runtime }));
  expect(loaded).toEqual(runtime);
  expect(() => assertProductV4RuntimeFingerprint(newer, loaded)).toThrow("RUNTIME_MISMATCH:rendererChecksum");
});

test("binding is independent of mutable evidence attachment timestamps and row ordering", async () => {
  const first = await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports);
  const changedTime = { ...row, updatedAt: new Date(0) };
  expect(await buildProductV4RuntimeBinding({ row: changedTime, bundle, runId: "run" }, { ...ports, dependencies: async () => [...rows].reverse() })).toEqual(first);
  expect(first.revision).toBe(Number.parseInt(hash.slice(0, 8), 16) + 1);
  expect((await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, { ...ports, runtime: async () => ({ ...runtime, rendererChecksum: "b".repeat(64) }) })).rendererChecksum).not.toBe(first.rendererChecksum);
});

test("live dependency closure rejects stale versions, hashes, statuses, course and excerpt scope", () => {
  const original = productV4DependencyChecksum(bundle, rows);
  for (const mutation of [{ version: 2 }, { hash: "b".repeat(64) }, { status: "withdrawn" }, { courseId: "other" }]) {
    expect(() => productV4DependencyChecksum(bundle, [{ ...rows[0], ...mutation }, ...rows.slice(1)])).toThrow("DEPENDENCY_CHANGED");
  }
  expect(() => productV4DependencyChecksum(bundle, rows.slice(1))).toThrow("DEPENDENCY_CHANGED");
  expect(() => productV4DependencyChecksum(bundle, [...rows, rows[0]])).toThrow("DEPENDENCY_AMBIGUOUS");
  expect(() => productV4DependencyChecksum(bundle, [...rows.slice(0, 2), { ...rows[2], sourceId: "other" }])).toThrow("EXCERPT_SCOPE");
  expect(productV4DependencyChecksum(bundle, [...rows.slice(0, 2), { ...rows[2], hash: "b".repeat(64) }])).not.toBe(original);
});

test("binding rejects import/course swaps and includes dependency edge identities", async () => {
  await expect(buildProductV4RuntimeBinding({ row: { ...row, bundleId: "other" }, bundle, runId: "run" }, ports)).rejects.toThrow("IMPORT_MISMATCH");
  await expect(buildProductV4RuntimeBinding({ row: { ...row, courseId: "other" }, bundle, runId: "run" }, ports)).rejects.toThrow("COURSE_MISMATCH");
  const edge = { id: "dependency", upstreamEntityType: "idea" as const, upstreamEntityId: "idea", upstreamVersion: 1, upstreamHash: hash, downstreamEntityType: "article" as const, downstreamEntityId: "article", downstreamVersion: 1, downstreamHash: hash, freshness: "UP_TO_DATE" as const };
  const withEdge = { ...bundle, dependencies: [edge] };
  expect(productV4DependencyChecksum(withEdge, rows)).not.toBe(productV4DependencyChecksum(bundle, rows));
  expect(() => productV4DependencyChecksum({ ...bundle, dependencies: [{ ...edge, upstreamHash: "b".repeat(64) }] }, rows)).toThrow("DEPENDENCY_CHANGED");
});

test("source figures resolve through the DB course alias, verify bytes and omit expiring URLs", async () => {
  if (article.productType !== "article") throw new Error("Fixture requires article");
  const bytes = new Uint8Array([1, 2, 3]);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const assetId = "b".repeat(64);
  const figureArticle = { ...article, visuals: [{ id: "figure", kind: "source_figure" as const, interactive: false as const, label: "Figure", description: "Source geometry", assetId, materialId: "material", sourceChecksum: hash, staticFallback: { type: "text" as const, summary: "Source", content: "Geometry" } }] };
  const figureBundle = { ...bundle, products: [figureArticle] };
  let deliveryUrl = "https://signed.example/first";
  let permission: "owned" | "unknown" = "owned";
  const figurePorts = { ...ports, async figure(input: { courseId: string; materialId: string; assetId: string }) {
    expect(input).toEqual({ courseId: "legacy-course", materialId: "material", assetId });
    return { ...input, schemaVersion: "source-figure.v1" as const, sourceChecksum: hash, sourcePackChecksum: hash, sourceDocumentId: "source-document", sourcePackImportId: "source-import", sourceVersion: 1, sourceVisualId: "source-visual", pageNumber: 1, crop: [0, 0, 1, 1] as [number, number, number, number], attribution: "Owned source", permission, publicationAllowed: permission !== "unknown", renderer: "pdfjs-5.4.296-pdf-parse-worker-2.4.5-napi-canvas-0.1.80-figure-v1" as const, pdfPointBbox: [0, 0, 1, 1], cropBox: [0, 0, 1, 1], transform: [1, 0, 0, 1, 0, 0], rotation: 0 as const, rounding: "floor-start-ceil-end" as const, variants: (["preview", "print"] as const).map(name => ({ name, key: `verified/${name}.png`, checksum, width: 1, height: 1, deliveryUrl })) };
  }, async download() { return bytes; } };
  const first = await buildProductV4RuntimeBinding({ row, bundle: figureBundle, runId: "run" }, figurePorts);
  deliveryUrl = "https://signed.example/renewed";
  expect((await buildProductV4RuntimeBinding({ row, bundle: figureBundle, runId: "run" }, figurePorts)).assetChecksum).toBe(first.assetChecksum);
  expect((await loadProductV4StaticFigureAssets(figureBundle, figurePorts))[assetId]).toEqual({ bytes, mimeType: "image/png", sourceChecksum: hash, attribution: "Owned source" });
  expect((await loadDiktatWorkerAssets(figureBundle, figurePorts))[assetId]).toEqual({ bytes, mimeType: "image/png", sourceChecksum: hash, attribution: "Owned source" });
  await expect(loadProductV4StaticFigureAssets(figureBundle, { ...figurePorts, download: async () => new Uint8Array([4]) })).rejects.toThrow("BYTES_CHANGED");
  await expect(loadDiktatWorkerAssets(figureBundle, { ...figurePorts, download: async () => new Uint8Array([4]) })).rejects.toThrow("BYTES_CHANGED");
  permission = "unknown";
  await expect(loadProductV4StaticFigureAssets(figureBundle, figurePorts)).rejects.toThrow("NOT_AUTHORIZED");
  await expect(loadDiktatWorkerAssets(figureBundle, figurePorts)).rejects.toThrow("NOT_AUTHORIZED");
});


test("Next serverless verification uses its validated embedded build identity", async () => {
  const previous = process.env.NEXT_PUBLIC_V4_WEB_RUNTIME;
  try {
    process.env.NEXT_PUBLIC_V4_WEB_RUNTIME = JSON.stringify(runtime);
    expect(await readProductV4RuntimeFingerprint()).toEqual(runtime);
    process.env.NEXT_PUBLIC_V4_WEB_RUNTIME = JSON.stringify({ ...runtime, fontChecksum: "invalid" });
    await expect(readProductV4RuntimeFingerprint()).rejects.toThrow("PRODUCT_V4_BUILD_RUNTIME_INVALID");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_V4_WEB_RUNTIME;
    else process.env.NEXT_PUBLIC_V4_WEB_RUNTIME = previous;
  }
});

test("provider and reviewed browser version bind separate plans and cannot reuse receipts", async () => {
  const { deriveProductV4VerificationPlan } = await import("@/lib/bundle/product-v4-verification");
  const beforeProvider = process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER;
  const beforeVersion = process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION;
  try {
    process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = "cloudflare";
    const cf = await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports);
    process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = "steel";
    process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION = cf.browserVersion;
    const steel = await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports);
    const cfPlan = deriveProductV4VerificationPlan({ bundle, binding: cf });
    const steelPlan = deriveProductV4VerificationPlan({ bundle, binding: steel });
    expect(steel.browserProvider).toBe("steel");
    expect(steelPlan.planHash).not.toBe(cfPlan.planHash);
    process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION = "140.0.1.2";
    const changed = await buildProductV4RuntimeBinding({ row, bundle, runId: "run" }, ports);
    expect(deriveProductV4VerificationPlan({ bundle, binding: changed }).planHash).not.toBe(steelPlan.planHash);
  } finally {
    if (beforeProvider === undefined) delete process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER;
    else process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = beforeProvider;
    if (beforeVersion === undefined) delete process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION;
    else process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION = beforeVersion;
  }
});
