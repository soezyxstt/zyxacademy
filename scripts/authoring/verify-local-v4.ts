import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateProductBundle } from "../../lib/bundle/product-validator";
import path from "node:path";
import { buildLocalVerificationFixture } from "./local-verification-fixture";
import { createProductV4VerificationService, type ProductV4VerificationSnapshot } from "../../lib/bundle/product-v4-verification-service";
import { executeProductV4VerificationCheck } from "../../lib/compute/product-v4-verification-executor";
import { buildProductV4RuntimeBinding, readProductV4RuntimeFingerprint, type ProductV4LiveDependency } from "../../lib/compute/product-v4-runtime-binding";
import { deriveProductV4PdfEvidence } from "../../lib/compute/product-v4-pdf-evidence";
import { getProductV4VerificationReceiptSignature } from "../../lib/bundle/product-v4-verification";
import { validateProductV4ReviewContext } from "../../lib/bundle/product-v4-review";
import { computePedagogyContentFingerprint, QUALITY_POLICY_VERSION } from "../../lib/materials/quality-policy";
import { buildProductVerificationKey } from "../../lib/storage/keys";
import { closeProductV4BrowserRunner, validateDeployedVerificationBaseUrl } from "../../lib/compute/product-v4-browser-runner";

const flag = process.argv.indexOf("--renderer");
const renderer = new URL(flag >= 0 ? process.argv[flag + 1] : "http://127.0.0.1:3101");
if (renderer.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(renderer.hostname) || renderer.pathname !== "/" || renderer.username || renderer.password || renderer.search || renderer.hash) throw new Error("LOCAL_RENDERER_ORIGIN_REQUIRED");
const webFlag = process.argv.indexOf("--web");
if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") {
  if (webFlag < 0) throw new Error("DEPLOYED_WEB_ORIGIN_REQUIRED");
  process.env.NEXT_PUBLIC_APP_URL = validateDeployedVerificationBaseUrl(process.argv[webFlag + 1]);
} else {
  if (!process.env.AUTHORING_VERIFICATION_RENDERER_SECRET) throw new Error("AUTHORING_VERIFICATION_RENDERER_SECRET_REQUIRED");
  process.env.AUTHORING_VERIFICATION_RENDERER_URL = renderer.origin;
}
const outputFlag = process.argv.indexOf("--output");
const root = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : "artifacts/authoring-verification/local-run");
await mkdir(root, { recursive: true });
const bundleFlag = process.argv.indexOf("--bundle");
const fixture = bundleFlag < 0 ? buildLocalVerificationFixture() : await (async () => {
  const bytes = new Uint8Array(await readFile(process.argv[bundleFlag + 1]));
  const parsed = validateProductBundle(bytes);
  if (!parsed.success) throw new Error(`LOCAL_BUNDLE_INVALID:${parsed.issues.map(issue => issue.code).join(",")}`);
  return { bytes, bundle: parsed.data };
})();
await writeFile(path.join(root, "bundle.zip"), fixture.bytes);
const bundle = { manifest: fixture.bundle.manifest, products: fixture.bundle.products, dependencies: fixture.bundle.dependencies };
const live = new Map<string, ProductV4LiveDependency>();
for (const product of bundle.products) {
  for (const idea of product.ideaLinks) live.set(`idea:${idea.id}`, { type: "idea", id: idea.id, version: idea.version, hash: idea.semanticHash, status: "published", courseId: bundle.manifest.courseId });
  for (const source of product.sourceRefs) {
    live.set(`source_material:${source.sourceId}`, { type: "source_material", id: source.sourceId, version: source.version, hash: source.checksum, status: "active", courseId: bundle.manifest.courseId });
    for (const id of source.excerptIds) live.set(`source_chunk:${id}`, { type: "source_chunk", id, version: source.version, hash: source.checksum, status: "active", courseId: bundle.manifest.courseId, sourceId: source.sourceId });
  }
}
const row = { id: "local-verification-import", bundleType: "product" as const, bundleId: bundle.manifest.bundleId, courseId: "local-course", checksum: bundle.manifest.bundleChecksum };
const runtimePorts = { course: async () => ({ id: bundle.manifest.courseId, legacyCourseId: "local-course" }), dependencies: async () => [...live.values()], runtime: readProductV4RuntimeFingerprint,
  figure: async (): Promise<never> => { throw new Error("LOCAL_FIXTURE_HAS_NO_SOURCE_FIGURES"); }, download: async (): Promise<never> => { throw new Error("REMOTE_STORAGE_FORBIDDEN"); } };
const runId = "local-v4-verification";
let snapshot: ProductV4VerificationSnapshot = { importId: row.id, checksum: row.checksum, sourceUriOrKey: "local-fixture.zip", bundle, binding: await buildProductV4RuntimeBinding({ row, bundle, runId }, runtimePorts) };
const objects = new Map<string, Uint8Array>();
const queue: { importId: string; runId: string; planHash: string; attemptId: string }[] = [];
const authority = { signingKey: "local-only-verification-receipt-key-not-for-deployment", executorId: "zyx-product-v4-server-runner.v1" };
const service = createProductV4VerificationService({
  async load() { snapshot = { ...snapshot, binding: await buildProductV4RuntimeBinding({ row, bundle, runId }, runtimePorts) }; return snapshot; },
  async read(key) { return objects.get(key) ?? null; },
  async write(key, bytes) { objects.set(key, bytes); const output = path.join(root, "objects", key); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, bytes); },
  async enqueue(input) { queue.push(input); },
  async attach(_snapshot, planHash, attemptId, expectedAttemptId) {
    if ((snapshot.verificationAttemptId ?? null) !== expectedAttemptId) return false;
    snapshot = { ...snapshot, verificationPlanHash: planHash, verificationAttemptId: attemptId };
    return true;
  },
  execute: executeProductV4VerificationCheck,
  authority: () => authority,
});
const before = await service.readiness(row.id, runId);
assert.equal(before.evaluation.ready, false);
assert.equal(objects.size, 0);
const requested = await service.request({ importId: row.id, runId });
await writeFile(path.join(root, "plan.json"), JSON.stringify(requested.plan, null, 2));
assert.equal(queue.length, 1);
try {
const result = await service.process(queue[0]);
await writeFile(path.join(root, "result.json"), JSON.stringify(result, null, 2));
if (!result.evaluation.ready) throw new Error(`LOCAL_VERIFICATION_NOT_READY:${result.evaluation.missingCheckIds.join(",")}`);
const artifactBytes = new Map<string, Uint8Array>();
for (const check of result.receipt.results) for (const artifact of check.artifacts) artifactBytes.set(artifact.id, objects.get(buildProductVerificationKey(result.plan.planHash, artifact.id))!);
const pdfEvidence = deriveProductV4PdfEvidence({ snapshot, plan: result.plan, attemptId: result.attemptId, receipt: result.receipt, artifactBytes, authority });
await writeFile(path.join(root, "pdf-evidence.json"), JSON.stringify(pdfEvidence, null, 2));
const article = bundle.products.find((product) => product.productType === "article")!;
const diktat = bundle.products.find((product) => product.productType === "diktat");
if (article.productType !== "article") throw new Error("ARTICLE_REQUIRED");
const fingerprint = computePedagogyContentFingerprint({ article, diktat });
assert.throws(() => validateProductV4ReviewContext({ article, importId: row.id, checksum: row.checksum, fingerprint,
  review: { decision: "approved", expectedRevision: row.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, verificationPlanHash: result.plan.planHash, verificationReceiptSignature: getProductV4VerificationReceiptSignature(result.receipt) ?? undefined },
  verification: { ready: true, importId: row.id, planHash: result.plan.planHash, receiptSignature: getProductV4VerificationReceiptSignature(result.receipt) } }), /ALL_SECTIONS_REQUIRED/);
const summary = { status: "PASS", requirementCount: result.plan.requirements.length, planHash: result.plan.planHash, attemptId: result.attemptId, pdfEvidence,
  review: "Missing explicit section decisions correctly rejected; no pedagogic approval generated.", boundaries: { fixture: bundleFlag < 0 ? "Synthetic canonical V4 ZIP" : "Supplied canonical V4 ZIP with simulated local dependency records", storage: "Local memory and files", databasePromotion: "Not exercised", mcpTransport: "Not exercised", production: "Not accessed" } };
await writeFile(path.join(root, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ status: summary.status, requirementCount: summary.requirementCount, outputDirectory: root }));
} finally {
  await closeProductV4BrowserRunner();
}
