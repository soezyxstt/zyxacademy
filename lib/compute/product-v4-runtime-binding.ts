import { verificationBrowserIdentity } from "./product-v4-browser-config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { deterministicProductSerialization, productInteractiveDocuments, productBundleManifestSchema, productDependencySchema, productEntitySchema } from "@/lib/bundle/product-validator";
import { PRODUCT_V4_VERIFICATION_POLICY, assertProductV4VerificationCurrent, deriveProductV4VerificationPlan, formativeDocumentFields, type ProductV4VerificationBinding, type ProductV4VerificationPlan, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import type { ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-core";
import type { DiktatSourceFigureAssets } from "@/lib/materials/diktat-static-visual";
import type { SourceFigureVisualSpec } from "@/lib/materials/visual-contract";
import type { resolveSourceFigureForCourse } from "@/lib/authoring/source-figures";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";
import { verifyInteractiveDocumentAdmissionReceipt } from "@/lib/materials/interactive-document-verified";
import { productV4DocumentPairKey } from "./product-v4-document-wire";

declare const __ZYX_VERIFICATION_BUILD_RUNTIME__: { fingerprint: ProductV4RuntimeFingerprint } | undefined;

type Bundle = ProductV4VerificationSnapshot["bundle"];
type ImportRow = { id: string; bundleType: string; bundleId: string; courseId: string; checksum: string };
type Figure = Awaited<ReturnType<typeof resolveSourceFigureForCourse>>;
type VerifiedFigureVariant = Omit<Figure["variants"][number], "deliveryUrl"> & { bytes: Uint8Array };
export interface ProductV4LiveDependency { type: "idea" | "source_material" | "source_chunk" | "product"; id: string; version: number; hash: string; status: string; courseId: string; sourceId?: string }
interface FigurePorts {
  course(courseId: string): Promise<{ id: string; legacyCourseId: string }>;
  figure(input: { courseId: string; materialId: string; assetId: string }): Promise<Figure>;
  download(key: string): Promise<Uint8Array>;
}
interface RuntimePorts extends FigurePorts {
  dependencies(bundle: Bundle): Promise<ProductV4LiveDependency[]>;
  runtime(): Promise<ProductV4RuntimeFingerprint>;
}
export type ProductV4RuntimeFingerprint = Pick<ProductV4VerificationBinding, "rendererChecksum" | "fontChecksum" | "contractChecksum" | "playbookChecksum" | "printProfile">;
const hash = (value: unknown) => createHash("sha256").update(deterministicProductSerialization(value)).digest("hex");
const bytesHash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const unique = (values: string[]) => [...new Set(values)].sort();
type DocumentAssetReader = (spec: InteractiveDocumentSpec, kind: "document" | "print") => Promise<Uint8Array>;

function verifyDocumentBytes(spec: InteractiveDocumentSpec, kind: "document" | "print", bytes: Uint8Array) {
  const size = kind === "document" ? spec.documentBytes : spec.printBytes;
  const checksum = kind === "document" ? spec.documentSha256 : spec.printSha256;
  if (bytes.byteLength !== size || bytesHash(bytes) !== checksum) throw new Error("INTERACTIVE_DOCUMENT_INTEGRITY");
}

async function readAdmittedDocumentAsset(spec: InteractiveDocumentSpec, kind: "document" | "print") {
  const { storage } = await import("@/lib/storage");
  if (!storage.download) throw new Error("INTERACTIVE_DOCUMENT_STORAGE_UNAVAILABLE");
  verifyInteractiveDocumentAdmissionReceipt(spec, await storage.download(buildInteractiveDocumentAdmissionKey(spec.printSha256)));
  return storage.download(buildInteractiveDocumentAssetKey(kind === "document" ? spec.documentSha256 : spec.printSha256, kind));
}

// Keep this closure in Next output tracing; missing source bytes must invalidate verification.
export const PRODUCT_V4_RUNTIME_FILES = [
  "next.config.ts", "scripts/authoring/prepare-web-verification.ts",
  "scripts/authoring/verify-product-v4-local.ts", "scripts/authoring/run-product-v4-local.mjs", "lib/compute/product-v4-local-operator.ts", "scripts/neon/validate-production-target.ts", "scripts/neon/import-core.ts",
  "deno.json", "workers/deno-background/deno.json", "lib/compute/runtime.ts", "lib/compute/pdf-pages.ts", "lib/compute/pdf-worker.ts",
  "lib/compute/browser-pdf.ts", "lib/compute/pdf-inspection.ts", "scripts/neon/build-worker.mjs",
  "app/globals.css", "app/layout.tsx", "app/authoring-verification/page.tsx",
  "components/providers/telemetry-boundary.tsx", "components/providers/posthog-provider.tsx", "lib/env.ts",
  "components/coding/article-coding.tsx", "components/coding/coding-workspace.tsx", "components/coding/coding-help.tsx", "components/coding/python-editor.tsx", "components/coding/use-coding-draft.ts",
  "lib/coding/article-markdown-scope.ts", "lib/coding/runtime-selection.ts", "lib/coding/draft-reconciliation.ts", "lib/coding/contracts.ts", "lib/coding/browser-runtime.ts", "lib/coding/runtime.ts", "lib/coding/runtime-assets.ts", "lib/coding/frame.html", "public/coding/worker.js", "lib/coding/http-contracts.ts", "lib/coding/zyra.ts",
  "components/course/markdown/flowchart-diagram-renderer.tsx", "lib/visual-layout-service.ts",
  "components/course/article-parts.tsx", "components/course/math-text.tsx", "components/course/markdown-renderer.tsx",
  "lib/markdown-compiler.ts", "lib/materials/embedded-visuals.ts",
  "components/course/product-learning-visual.tsx", "components/course/epsilon-delta-board.tsx", "components/course/geometry-2d-visual.tsx", "components/course/interactive-scene-renderer.tsx", "components/course/interactive-scene-svg.tsx",
  "components/course/interactive-document-visual.tsx", "components/course/interactive-document-context.tsx", "lib/materials/interactive-document.ts", "lib/materials/interactive-document-server.ts", "lib/materials/interactive-document-png-worker.cjs", "lib/materials/interactive-document-assets.ts", "lib/materials/interactive-document-authorization.ts", "lib/materials/interactive-document-grant.ts", "lib/materials/visual-payload-security.ts",
  "app/api/materials/interactive-document/article/route.ts", "app/api/materials/interactive-document/reveal/route.ts",
  "components/course/learning-canvas/learning-canvas-renderer.tsx", "components/ui/slider.tsx",
  "components/course/markdown/flowchart-node.tsx", "lib/flowchart.ts",
  "components/course/product-learning-blocks.tsx", "components/course/article-reading-canvas.tsx", "components/course/structured-article-reader.tsx",
  "components/course/question-image.tsx", "lib/articles/source-figure-resolver.ts", "app/api/courses/[id]/articles/[articleId]/source-figures/[visualId]/route.ts",
  "lib/articles/structured-read-model.ts", "lib/articles/structured-repository.ts", "lib/materials/compiler.ts", "lib/materials/pedagogy-contract.ts",
  "lib/authoring/source-figures.ts", "lib/compute/source-figure.ts", "lib/authoring/mcp-contract-revision.ts", "lib/authoring/mcp-workflows.ts", "lib/authoring/interactive-visual-guidance.ts", "lib/authoring/mcp-playbook.ts",
  "lib/authoring/source-pack.ts", "lib/authoring/question-bank-draft.ts", "lib/authoring/reference-question-draft.ts", "lib/question-authoring-contract.ts", "lib/ide/contracts.ts", "lib/sumber/contracts.ts", "lib/bundle/idea-bundle-v2.ts", "lib/bundle/validator.ts", "lib/bundle/zip-reader.ts", "lib/materials/quality-policy.ts", "lib/materials/quality-policy-constants.ts", "lib/materials/pdf-artifact-contract.ts",
  "lib/math/katex.ts", "lib/math/katex-render.ts", "lib/math/scientific-format.ts", "lib/math/text-segments.ts", "lib/math/unmarked-scientific.ts", "lib/math/visual-function-latex.ts", "lib/math/math-normalizer.ts", "lib/math/scientific-answer-normalizer.ts",
  "lib/materials/article-parts.ts", "lib/materials/article-contract.ts", "lib/materials/visual-contract.ts", "lib/materials/interactive-scene.ts", "lib/materials/interactive-document-markdown.ts", "lib/materials/epsilon-delta.ts",
  "lib/materials/diktat-v4.ts", "lib/materials/diktat-visual-snapshot.ts", "lib/materials/diktat-static-visual.ts", "lib/materials/diktat-print-readiness.ts", "lib/materials/verification-preview.ts",
  "lib/zyra/canvas/contracts.ts", "lib/zyra/canvas/expression.ts", "lib/zyra/canvas/evaluator.ts", "lib/zyra/canvas/viewport.ts",
  "lib/bundle/product-diktat-pdf.ts", "lib/bundle/product-admission.ts", "lib/bundle/product-validator.ts", "lib/bundle/product-v4-verification.ts", "lib/bundle/product-v4-verification-service.ts", "lib/bundle/product-review-gate.ts", "lib/compute/product-v4-runtime-binding.ts",
  "lib/compute/product-v4-pdf-evidence.ts", "lib/compute/product-v4-verification-executor.ts", "lib/compute/product-v4-document-wire.ts", "lib/compute/product-v4-browser-runner.ts", "lib/compute/product-v4-formative-verification.ts", "lib/materials/formative-check-answer.ts", "components/course/formative-check-endpoint-context.tsx", "lib/compute/product-v4-browser-session.ts", "lib/compute/product-v4-browser-config.ts", "scripts/authoring/verification-renderer.ts", "scripts/authoring/build-local-verification-renderer.ts", "jobs/product-verification.ts",
  "lib/materials/diktat-scene-svg.ts",
  "lib/bundle/product-staged-worker.ts", "lib/bundle/product-staging.ts", "lib/storage/keys.ts", "lib/authoring/question-visual-references.ts", "lib/authoring/question-visual-assets.ts",
  "lib/compute/product-diktat-worker-assets.ts",
  "lib/bundle/product-v4-verification-core.ts",
  "lib/bundle/product-v4-verification-worker.ts", "lib/compute/product-v4-pdf-evidence-shared.ts",
  "lib/materials/interactive-document-verified.ts", "lib/compute/product-v4-http-asset-validation.ts",
  "scripts/authoring/local-v4-bundle.ts",
] as const;

function figureSpecs(bundle: Bundle): SourceFigureVisualSpec[] {
  return bundle.products.flatMap(product => product.productType === "article" ? (product.visuals ?? []).filter((visual): visual is SourceFigureVisualSpec => visual.kind === "source_figure") : []);
}

async function verifiedFigures(bundle: Bundle, ports: FigurePorts) {
  const specs = figureSpecs(bundle);
  if (!specs.length) return [];
  const course = await ports.course(bundle.manifest.courseId);
  const result: Array<{ metadata: Omit<Figure, "variants">; variants: VerifiedFigureVariant[] }> = [];
  for (const spec of specs.sort((a, b) => a.assetId.localeCompare(b.assetId) || a.materialId.localeCompare(b.materialId))) {
    const figure = await ports.figure({ courseId: course.legacyCourseId, materialId: spec.materialId, assetId: spec.assetId });
    if (!figure.publicationAllowed || figure.permission === "unknown" || figure.sourceChecksum !== spec.sourceChecksum || figure.assetId !== spec.assetId || figure.materialId !== spec.materialId || figure.courseId !== course.legacyCourseId) throw new Error("PRODUCT_V4_FIGURE_NOT_AUTHORIZED_OR_CURRENT");
    const variants: VerifiedFigureVariant[] = [];
    for (const variant of [...figure.variants].sort((a, b) => a.name.localeCompare(b.name))) {
      const bytes = await ports.download(variant.key);
      if (bytesHash(bytes) !== variant.checksum) throw new Error("PRODUCT_V4_FIGURE_BYTES_CHANGED");
      const { deliveryUrl: _delivery, ...stableVariant } = variant;
      variants.push({ ...stableVariant, bytes });
    }
    const { variants: _variants, ...metadata } = figure;
    result.push({ metadata, variants });
  }
  return result;
}

export async function loadProductV4InteractiveDocumentAssets(input: { bundle: Bundle; plan: ProductV4VerificationPlan; requirement: ProductV4VerificationRequirement }, read?: DocumentAssetReader) {
  const bundle = { manifest: productBundleManifestSchema.parse(input.bundle.manifest), products: input.bundle.products.map(product => productEntitySchema.parse(product)), dependencies: input.bundle.dependencies.map(dependency => productDependencySchema.parse(dependency)) };
  const derived = deriveProductV4VerificationPlan({ bundle, binding: input.plan.binding });
  assertProductV4VerificationCurrent(input.plan, derived);
  const requirement = derived.requirements.find(item => item.id === input.requirement.id);
  if (!requirement || deterministicProductSerialization(requirement) !== deterministicProductSerialization(input.requirement)) throw new Error("VERIFICATION_REQUIREMENT_INVALID");
  const articles = requirement.layer === "web" ? bundle.products.filter(product => product.productType === "article" && (product.id === requirement.target || (product.visuals ?? []).some(visual => `${product.id}/${visual.id}` === requirement.target))) : [];
  const specs = requirement.state === "formative-document-field" ? formativeDocumentFields(bundle.products).filter(field => field.target === requirement.target).map(field => field.spec) : articles.flatMap(product => product.productType === "article" ? [
    ...(product.visuals ?? []).filter(visual => visual.kind === "interactive_document" && (product.id === requirement.target || `${product.id}/${visual.id}` === requirement.target)),
    ...(product.id === requirement.target ? product.sections.flatMap(section => section.blocks.flatMap(block => block.formativeCheckPayload ? (block.parts ?? []).flatMap(part => part.kind === "markdown" ? parseInteractiveDocumentsInMarkdown(part.markdown) : []) : [])) : []),
  ] : []);
  const checked = specs.map(spec => interactiveDocumentSchema.parse(spec));
  const lengths = new Map<string, number>();
  for (const spec of checked) {
    for (const [key, size] of [[`document:${spec.documentSha256}`, spec.documentBytes], [`print:${spec.printSha256}`, spec.printBytes]] as const) {
      if (lengths.has(key) && lengths.get(key) !== size) throw new Error("INTERACTIVE_DOCUMENT_METADATA_CONFLICT");
      lengths.set(key, size);
    }
  }
  if (checked.length > 8 || [...lengths.values()].reduce((sum, size) => sum + size, 0) > 16 * 1024 * 1024) throw new Error("INTERACTIVE_DOCUMENT_TOTAL_LIMIT");
  if (!checked.length) return {};
  const load = read ?? readAdmittedDocumentAsset;
  const result: Record<string, { document: Uint8Array; print: Uint8Array }> = {};
  for (const spec of checked) {
    const key = productV4DocumentPairKey(spec);
    const existing = result[key];
    if (existing) {
      if (bytesHash(existing.print) !== spec.printSha256 || existing.document.length !== spec.documentBytes || existing.print.length !== spec.printBytes) throw new Error("INTERACTIVE_DOCUMENT_METADATA_CONFLICT");
      continue;
    }
    const document = new Uint8Array(await load(spec, "document"));
    const print = new Uint8Array(await load(spec, "print"));
    verifyDocumentBytes(spec, "document", document);
    verifyDocumentBytes(spec, "print", print);
    result[key] = { document, print };
  }
  return result;
}

export async function loadProductV4StaticFigureAssets(bundle: Bundle, ports?: FigurePorts, includeDocumentPrint = true, read?: DocumentAssetReader): Promise<DiktatSourceFigureAssets> {
  const figures = figureSpecs(bundle).length ? await verifiedFigures(bundle, ports ?? await defaultPorts()) : [];
  const assets: Record<string, DiktatSourceFigureAssets[string]> = {};
  for (const figure of figures) {
    const variant = figure.variants.find(item => item.name === "print");
    if (!variant) throw new Error("PRODUCT_V4_FIGURE_PRINT_VARIANT_REQUIRED");
    assets[figure.metadata.assetId] = { bytes: variant.bytes, mimeType: "image/png", sourceChecksum: figure.metadata.sourceChecksum, attribution: figure.metadata.attribution };
  }
  const documents = includeDocumentPrint ? bundle.products.flatMap(product => product.productType === "article" ? (product.visuals ?? []).filter(visual => visual.kind === "interactive_document") : []) : [];
  if (documents.length) {
    const load = read ?? readAdmittedDocumentAsset;
    for (const spec of documents) {
      const bytes = await load(spec, "print");
      verifyDocumentBytes(spec, "print", bytes);
      assets[`interactive_document:${spec.printSha256}`] = { bytes, mimeType: "image/png", sourceChecksum: spec.printSha256 };
    }
  }
  return assets;
}

export function productV4DependencyChecksum(bundle: Bundle, rows: readonly ProductV4LiveDependency[]): string {
  const courseId = bundle.manifest.courseId;
  const byId = new Map(rows.map(row => [`${row.type}:${row.id}`, row]));
  if (byId.size !== rows.length) throw new Error("PRODUCT_V4_DEPENDENCY_AMBIGUOUS");
  const requireRow = (type: ProductV4LiveDependency["type"], id: string, version: number, checksum?: string) => {
    const row = byId.get(`${type}:${id}`);
    if (!row || row.courseId !== courseId || row.version !== version || (checksum && row.hash !== checksum) || (type === "idea" && row.status !== "published") || (type === "source_material" && row.status !== "active") || (type === "product" && !["published", "approved"].includes(row.status))) throw new Error(`PRODUCT_V4_DEPENDENCY_CHANGED:${type}:${id}`);
    return row;
  };
  for (const product of bundle.products) {
    if (product.courseId !== courseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
    for (const idea of product.ideaLinks) requireRow("idea", idea.id, idea.version, idea.semanticHash);
    for (const source of product.sourceRefs) {
      requireRow("source_material", source.sourceId, source.version, source.checksum);
      for (const id of source.excerptIds) if (requireRow("source_chunk", id, source.version).sourceId !== source.sourceId) throw new Error("PRODUCT_V4_EXCERPT_SCOPE_MISMATCH");
    }
  }
  for (const dependency of bundle.dependencies) {
    const downstream = bundle.products.find(product => product.id === dependency.downstreamEntityId && product.productType === dependency.downstreamEntityType);
    if (dependency.freshness !== "UP_TO_DATE" || !downstream || downstream.version !== dependency.downstreamVersion || downstream.generationHash !== dependency.downstreamHash) throw new Error("PRODUCT_V4_DEPENDENCY_STALE");
    const local = dependency.upstreamEntityType === "product" ? bundle.products.find(product => product.id === dependency.upstreamEntityId) : undefined;
    if (local) {
      if (local.version !== dependency.upstreamVersion || local.generationHash !== dependency.upstreamHash) throw new Error("PRODUCT_V4_DEPENDENCY_STALE");
    } else requireRow(dependency.upstreamEntityType, dependency.upstreamEntityId, dependency.upstreamVersion, dependency.upstreamHash);
  }
  for (const row of rows.filter(item => item.type === "source_chunk")) {
    const parent = byId.get(`source_material:${row.sourceId}`);
    if (!parent || parent.courseId !== courseId || parent.status !== "active" || parent.version !== row.version) throw new Error("PRODUCT_V4_EXCERPT_SCOPE_MISMATCH");
  }
  return hash({ dependencies: [...bundle.dependencies].sort((a, b) => a.id.localeCompare(b.id)), live: [...rows].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)) });
}

export async function buildProductV4RuntimeBinding(input: { row: ImportRow; bundle: Bundle; runId: string }, injected?: RuntimePorts, read?: DocumentAssetReader): Promise<ProductV4VerificationBinding> {
  const { row, bundle, runId } = input;
  if (bundle.manifest.schemaVersion !== "product-bundle.v4" || row.bundleType !== "product" || row.bundleId !== bundle.manifest.bundleId || !/^[a-f0-9]{64}$/i.test(row.checksum)) throw new Error("PRODUCT_V4_IMPORT_MISMATCH");
  const ports = injected ?? await defaultPorts();
  const course = await ports.course(bundle.manifest.courseId);
  if (course.id !== bundle.manifest.courseId || row.courseId !== course.legacyCourseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
  const [rows, figures, runtime] = await Promise.all([ports.dependencies(bundle), verifiedFigures(bundle, ports), ports.runtime()]);
  const documents = productInteractiveDocuments(bundle.products);
  const documentAssets: Array<{ id: string; document: string; print: string }> = [];
  if (documents.length) {
    const load = read ?? readAdmittedDocumentAsset;
    for (const spec of documents) {
      const document = await load(spec, "document"), print = await load(spec, "print");
      verifyDocumentBytes(spec, "document", document);
      verifyDocumentBytes(spec, "print", print);
      documentAssets.push({ id: spec.id, document: bytesHash(document), print: bytesHash(print) });
    }
  }
  return { importId: row.id, courseId: course.id, runId, revision: Number.parseInt(row.checksum.slice(0, 8), 16) + 1,
    ...(process.env.NODE_ENV === "production" || typeof (globalThis as { Deno?: unknown }).Deno !== "undefined" || process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER ? verificationBrowserIdentity() : {}),
    ...runtime, policyRevision: PRODUCT_V4_VERIFICATION_POLICY, dependencyChecksum: productV4DependencyChecksum(bundle, rows),
    assetChecksum: hash({ figures: figures.map(figure => ({ metadata: figure.metadata, variants: figure.variants.map(({ bytes, ...variant }) => ({ ...variant, byteLength: bytes.length, readbackChecksum: bytesHash(bytes) })) })), documents: documentAssets }),
  };
}

export function expectedChromiumRuntime(): { browserVersion: string; revision: string } {
  const require = createRequire(import.meta.url);
  const browserManifest = JSON.parse(readFileSync(join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"), "utf8"));
  const chromium = browserManifest.browsers?.find((browser: { name: string }) => browser.name === "chromium");
  if (!chromium || typeof chromium.browserVersion !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(chromium.browserVersion) || typeof chromium.revision !== "string" || !/^\d+$/.test(chromium.revision)) throw new Error("PRODUCT_V4_CHROMIUM_MANIFEST_INVALID");
  return { browserVersion: chromium.browserVersion, revision: chromium.revision };
}

export function assertProductV4RuntimeFingerprint(expected: ProductV4RuntimeFingerprint, actual: ProductV4RuntimeFingerprint): void {
  for (const key of ["rendererChecksum", "fontChecksum", "contractChecksum", "playbookChecksum", "printProfile"] as const) {
    if (!actual[key] || expected[key] !== actual[key]) throw new Error(`PRODUCT_V4_RUNTIME_MISMATCH:${key}`);
  }
}

export async function resolveProductV4LoadedRuntime(embedded: ProductV4RuntimeFingerprint | undefined, readCurrent = readProductV4RuntimeFingerprint): Promise<ProductV4RuntimeFingerprint> {
  const actual = await readCurrent();
  if (embedded) assertProductV4RuntimeFingerprint(embedded, actual);
  return embedded ?? actual;
}

export async function readProductV4ExecutorRuntime(): Promise<ProductV4RuntimeFingerprint> {
  const embedded = typeof __ZYX_VERIFICATION_BUILD_RUNTIME__ === "undefined" ? undefined : __ZYX_VERIFICATION_BUILD_RUNTIME__.fingerprint;
  return resolveProductV4LoadedRuntime(embedded);
}

function runtimePackageManifest(name: string): string {
  // Read the traced manifest directly, including packages that hide it through exports.
  return resolve(/* turbopackIgnore: true */ process.cwd(), "node_modules", name, "package.json");
}

export async function readProductV4RuntimeFingerprint(): Promise<ProductV4RuntimeFingerprint> {
  if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined" || process.env.ZYX_COMPUTE_RUNTIME === "neon" || process.env.NEXT_PUBLIC_V4_WEB_RUNTIME) {
    // Next embeds the build identity; serverless bundles do not retain source module URLs.
    const fingerprint = JSON.parse(typeof (globalThis as { Deno?: unknown }).Deno !== "undefined"
      ? readFileSync(new URL("./product-v4-build-runtime.json", import.meta.url), "utf8")
      : process.env.ZYX_COMPUTE_RUNTIME === "neon" ? process.env.ZYX_COMPUTE_BUILD_RUNTIME! : process.env.NEXT_PUBLIC_V4_WEB_RUNTIME!);
    for (const key of ["rendererChecksum", "fontChecksum", "contractChecksum", "playbookChecksum"]) if (!/^[a-f0-9]{64}$/.test(fingerprint[key] ?? "")) throw new Error("PRODUCT_V4_BUILD_RUNTIME_INVALID");
    if (!fingerprint.printProfile) throw new Error("PRODUCT_V4_BUILD_RUNTIME_INVALID");
    return fingerprint;
  }
  const [{ getStagePlaybookManifest }, { PRODUCT_DIKTAT_PRINT_PROFILE }] = await Promise.all([import("@/lib/authoring/mcp-playbook"), import("@/lib/bundle/product-diktat-pdf")]);
  const require = createRequire(import.meta.url);
  const packages = ["pyodide", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/lang-python", "@codemirror/commands", "react", "react-dom", "next", "katex", "jsxgraph", "zod", "mathjs", "sharp", "pngjs", "tailwindcss", "@tailwindcss/postcss", "@playwright/test", "playwright-core"];
  const versions = packages.map(name => [name, JSON.parse(readFileSync(runtimePackageManifest(name), "utf8")).version]);
  const katexRoot = dirname(require.resolve("katex/package.json"));
  const browsers = readFileSync(join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"));
  const fonts = readdirSync(join(katexRoot, "dist/fonts")).filter(name => name.endsWith(".woff2")).sort();
  if (!fonts.length) throw new Error("PRODUCT_V4_FONTS_MISSING");
  // Git checkouts on Windows use CRLF; bind the same source text on Linux deployments.
  const files = PRODUCT_V4_RUNTIME_FILES.map(path => [path, bytesHash(Buffer.from(readFileSync(resolve(/* turbopackIgnore: true */ process.cwd(), path), "utf8").replace(/\r\n/g, "\n")))] as const);
  // Bun bundling expands Unicode regex escapes; bind contract source, not engine-specific JSON Schema spellings.
  const contractFiles = files.filter(([path]) => /^lib\/(authoring|materials|bundle|ide|sumber|coding|zyra\/canvas)\//.test(path) || path === "lib/question-authoring-contract.ts");
  return { rendererChecksum: hash({ files, versions, browsers: bytesHash(browsers), chromium: expectedChromiumRuntime() }),
    fontChecksum: hash({ stylesheet: bytesHash(readFileSync(join(katexRoot, "dist/katex.min.css"))), fonts: fonts.map(name => [name, bytesHash(readFileSync(join(katexRoot, "dist/fonts", name)))]) }),
    contractChecksum: hash({ files: contractFiles, policy: PRODUCT_V4_VERIFICATION_POLICY }), playbookChecksum: getStagePlaybookManifest("product").playbookChecksum,
    printProfile: PRODUCT_DIKTAT_PRINT_PROFILE,
  };
}

async function defaultPorts(): Promise<RuntimePorts> {
  const [{ db }, schema, { eq, inArray }, { storage }, { resolveSourceFigureForCourse }] = await Promise.all([import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/storage"), import("@/lib/authoring/source-figures")]);
  return {
    async course(id) {
      const [course] = await db.select({ id: schema.mataKuliah.id, legacyCourseId: schema.mataKuliah.legacyCourseId }).from(schema.mataKuliah).where(eq(schema.mataKuliah.id, id)).limit(1);
      if (!course?.legacyCourseId) throw new Error("PRODUCT_V4_COURSE_ALIAS_REQUIRED");
      return { id: course.id, legacyCourseId: course.legacyCourseId };
    },
    figure: resolveSourceFigureForCourse,
    async download(key) { if (!storage.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED"); return storage.download(key); },
    runtime: readProductV4ExecutorRuntime,
    async dependencies(bundle) {
      const rows: ProductV4LiveDependency[] = [];
      const ids = (type: ProductV4LiveDependency["type"]) => bundle.dependencies.filter(item => item.upstreamEntityType === type).map(item => item.upstreamEntityId);
      const ideaIds = unique([...ids("idea"), ...bundle.products.flatMap(product => product.ideaLinks.map(idea => idea.id))]);
      const chunkIds = unique([...ids("source_chunk"), ...bundle.products.flatMap(product => product.sourceRefs.flatMap(source => source.excerptIds))]);
      const chunks = chunkIds.length ? await db.select({ id: schema.potonganSumber.id, version: schema.potonganSumber.sourceVersion, hash: schema.potonganSumber.checksum, sourceId: schema.potonganSumber.sumberMateriId, courseId: schema.sumberMateri.mataKuliahId, status: schema.sumberMateri.status }).from(schema.potonganSumber).innerJoin(schema.sumberMateri, eq(schema.potonganSumber.sumberMateriId, schema.sumberMateri.id)).where(inArray(schema.potonganSumber.id, chunkIds)) : [];
      rows.push(...chunks.map(row => ({ ...row, type: "source_chunk" as const })));
      const sourceIds = unique([...ids("source_material"), ...chunks.map(row => row.sourceId), ...bundle.products.flatMap(product => product.sourceRefs.map(source => source.sourceId))]);
      if (ideaIds.length) rows.push(...(await db.select({ id: schema.ide.id, version: schema.ide.version, hash: schema.ide.semanticHash, status: schema.ide.status, courseId: schema.ide.mataKuliahId }).from(schema.ide).where(inArray(schema.ide.id, ideaIds))).map(row => ({ ...row, type: "idea" as const })));
      if (sourceIds.length) rows.push(...(await db.select({ id: schema.sumberMateri.id, version: schema.sumberMateri.version, hash: schema.sumberMateri.checksum, status: schema.sumberMateri.status, courseId: schema.sumberMateri.mataKuliahId }).from(schema.sumberMateri).where(inArray(schema.sumberMateri.id, sourceIds))).map(row => ({ ...row, type: "source_material" as const })));
      const productIds = unique(ids("product").filter(id => !bundle.products.some(product => product.id === id)));
      for (const table of [schema.artikel, schema.diktatMateri, schema.soal, schema.setFlashcard, schema.blueprintAsesmen]) if (productIds.length) {
        rows.push(...(await db.select({ id: table.id, version: table.version, hash: table.generationHash, status: table.status, courseId: table.mataKuliahId }).from(table).where(inArray(table.id, productIds))).map(row => ({ ...row, type: "product" as const })));
      }
      if (productIds.length) {
        rows.push(...(await db.select({ id: schema.flashcard.id, version: schema.flashcard.version, hash: schema.flashcard.generationHash, status: schema.flashcard.status, courseId: schema.setFlashcard.mataKuliahId }).from(schema.flashcard).innerJoin(schema.setFlashcard, eq(schema.flashcard.setFlashcardId, schema.setFlashcard.id)).where(inArray(schema.flashcard.id, productIds))).map(row => ({ ...row, type: "product" as const })));
        rows.push(...(await db.select({ id: schema.pembahasanSoal.id, version: schema.pembahasanSoal.version, hash: schema.pembahasanSoal.generationHash, status: schema.pembahasanSoal.status, courseId: schema.soal.mataKuliahId }).from(schema.pembahasanSoal).innerJoin(schema.soal, eq(schema.pembahasanSoal.soalId, schema.soal.id)).where(inArray(schema.pembahasanSoal.id, productIds))).map(row => ({ ...row, type: "product" as const })));
      }
      return rows;
    },
  };
}
