import { expect, test } from "bun:test";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { buildRevisionArtifact, type RevisionPatchOperation } from "@/lib/authoring/revision-artifact";
import { createProductV4VerificationService, type ProductV4VerificationPorts, type ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-core";
import { productV4DependencyChecksum, productV4TargetInputHashes, type ProductV4LiveDependency } from "@/lib/compute/product-v4-runtime-binding";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, parseProductV4VerificationReceipt, PRODUCT_V4_VERIFICATION_POLICY, type ProductV4ObservedCheck, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import { productV4ReuseKey, productV4ReuseScope, readProductV4ReuseProof } from "@/lib/bundle/product-v4-verification-reuse";
import { selectProductV4ReusableDiktatVersions, type ProductV4RevisionReusePorts } from "@/lib/bundle/product-v4-revision-reuse";
import { buildProductVerificationKey } from "@/lib/storage/keys";

type Bundle = ReturnType<typeof buildLocalVerificationFixture>["bundle"];
const hash = "a".repeat(64);
const rootImportId = `impor-product-${"a".repeat(32)}`;
const revisionImportId = "impor-product-revision-11111111-1111-4111-8111-111111111111";
const authority = { signingKey: "test-only-server-key-at-least-32-bytes", executorId: "test-server" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const pdf = new TextEncoder().encode("%PDF-1.7\nverified-fixture\n%%EOF");
const emptyAssets = { figures: [], documents: [] };
function rowsFor(bundle: Bundle): ProductV4LiveDependency[] {
  const values = new Map<string, ProductV4LiveDependency>();
  const add = (row: ProductV4LiveDependency) => values.set(`${row.type}:${row.id}`, row);
  for (const product of bundle.products) {
    for (const idea of product.ideaLinks) add({ type: "idea", id: idea.id, courseId: product.courseId, version: idea.version, hash: idea.semanticHash, status: "published" });
    for (const source of product.sourceRefs) {
      add({ type: "source_material", id: source.sourceId, courseId: product.courseId, version: source.version, hash: source.checksum, status: "active" });
      for (const id of source.excerptIds) add({ type: "source_chunk", id, courseId: product.courseId, version: source.version, hash: "c".repeat(64), status: "active", sourceId: source.sourceId });
    }
  }
  return [...values.values()];
}
function snapshot(bundle: Bundle, importId = rootImportId, root = rootImportId): ProductV4VerificationSnapshot {
  const rows = rowsFor(bundle);
  return {
    importId, checksum: bundle.checksum, sourceUriOrKey: `${importId}.zip`, stagingAuditId: `audit-${importId}`, stagingRunId: "run",
    importState: { bundleType: "product", bundleId: bundle.manifest.bundleId, courseId: "legacy-course", version: 4, status: "draft", validationReport: { revisionLineage: { schema: "authoring-revision.v1", rootImportId: root } } },
    bundle, binding: { importId, courseId: bundle.manifest.courseId, runId: "run", revision: Number.parseInt(bundle.checksum.slice(0, 8), 16) + 1,
      rendererChecksum: hash, dependencyChecksum: productV4DependencyChecksum(bundle, rows), contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash,
      printProfile: "fixed-a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY, browserProvider: "cloudflare", browserVersion: "152.0.7977.64", executionOrigin: "https://staging.zyxacademy.com",
      targetInputHashes: productV4TargetInputHashes(bundle, rows, emptyAssets),
    },
  };
}
function withCards() {
  const original = buildLocalVerificationFixture().bundle;
  const article = original.products.find(product => product.productType === "article")!;
  const shared = { courseId: article.courseId, chapterId: article.chapterId, version: 1, status: "draft", schemaVersion: "1.0", ideaLinks: article.ideaLinks, sourceRefs: article.sourceRefs,
    sourceHash: article.sourceHash, generationHash: article.generationHash, creatorId: article.creatorId, curatorId: article.curatorId };
  return buildRevisionArtifact({ kind: "product", original, bundleId: "with-cards", operations: [
    { op: "add", target: { entityType: "flashcard_set", entityId: "set" }, value: { ...shared, id: "set", productType: "flashcard_set", title: "Kartu", cards: ["card"] } },
    { op: "add", target: { entityType: "flashcard", entityId: "card" }, value: { ...shared, id: "card", productType: "flashcard", setId: "set", front: "Satu", back: "Dua", atomic: true } },
    { op: "add", target: { entityType: "dependency", entityId: "card-idea" }, value: { id: "card-idea", upstreamEntityType: "idea", upstreamEntityId: article.ideaLinks[0].id, upstreamVersion: article.ideaLinks[0].version, upstreamHash: article.ideaLinks[0].semanticHash,
      downstreamEntityType: "flashcard", downstreamEntityId: "card", downstreamVersion: 1, downstreamHash: shared.generationHash, freshness: "UP_TO_DATE" } },
  ] }).bundle as Bundle;
}
const editCard: RevisionPatchOperation[] = [{ op: "set", target: { entityType: "flashcard", entityId: "card" }, field: "back", value: "Jawaban kartu yang diperbaiki." }];
function revised(original: Bundle, preserveUnchangedDiktatIds: string[] = []) {
  return buildRevisionArtifact({ kind: "product", original, bundleId: "card-edit", operations: editCard, preserveUnchangedDiktatIds }).bundle as Bundle;
}
function observed(requirement: ProductV4VerificationRequirement): ProductV4ObservedCheck {
  const result: ProductV4ObservedCheck = { checkId: requirement.id, status: "PASS", expected: "Complete verified check", observed: "Complete verified fixture", artifacts: [{ id: "observed", mediaType: requirement.artifactType,
    bytes: requirement.artifactType === "image/png" ? png : requirement.artifactType === "application/pdf" ? pdf : new TextEncoder().encode("{}") }] };
  if (requirement.layer === "print") {
    result.pageCount = 1;
    if (requirement.artifactType === "image/png") result.artifacts[0].pageNumber = 1;
    else result.artifacts.push({ id: "page", mediaType: "image/png", bytes: png, pageNumber: 1 });
  }
  return result;
}
function fixture(bundle = withCards()) {
  const objects = new Map<string, Uint8Array>();
  const calls: ProductV4VerificationRequirement[] = [];
  const mutable = { snapshot: snapshot(bundle), canonicalKey: "canonical.pdf", canonicalExists: true, canonicalMatching: true };
  objects.set(mutable.canonicalKey, pdf);
  const ports: ProductV4VerificationPorts = {
    async load() { return mutable.snapshot; }, async read(key) { return objects.get(key) ?? null; }, async write(key, bytes) { objects.set(key, bytes); }, async enqueue() {},
    async attach(_snapshot, planHash, attemptId, expected) {
      if ((mutable.snapshot.verificationAttemptId ?? null) !== expected) return false;
      mutable.snapshot = { ...mutable.snapshot, verificationPlanHash: planHash, verificationAttemptId: attemptId }; return true;
    },
    async persistPdfEvidence({ plan, attemptId, receipt }) { mutable.snapshot.pdfEvidenceAttachment = { planHash: plan.planHash, attemptId, receiptSignature: receipt.signature }; },
    async hasPdfEvidence() { return true; }, async execute({ requirement }) { calls.push(requirement); return observed(requirement); }, authority: () => authority,
  };
  const service = createProductV4VerificationService(ports);
  const selectionPorts: ProductV4RevisionReusePorts = {
    async binding({ bundle: candidate }) { return snapshot(candidate as Bundle).binding; }, read: ports.read, authority: () => authority,
    async canonicalPdf(_product, courseId) {
      expect(courseId).toBe(bundle.manifest.courseId);
      return { exists: mutable.canonicalExists, matching: mutable.canonicalMatching, key: mutable.canonicalKey };
    },
  };
  const select = (candidate = revised(bundle, ["local-diktat"])) => selectProductV4ReusableDiktatVersions({
    source: { id: rootImportId, bundleType: "product", bundleId: bundle.manifest.bundleId, courseId: "legacy-course", checksum: bundle.checksum, validationReport: {} },
    original: bundle, candidate, runId: "run", rootImportId,
  }, selectionPorts);
  const process = async () => {
    const request = await service.request({ importId: mutable.snapshot.importId, runId: "run" });
    const complete = await service.process({ importId: mutable.snapshot.importId, runId: "run", planHash: request.plan.planHash, attemptId: request.attemptId });
    return { ...complete, receipt: parseProductV4VerificationReceipt(complete.receipt) };
  };
  return { bundle, mutable, objects, calls, service, ports, selectionPorts, select, process };
}

test("a real card-only revision reuses unchanged target checks and PDF with a new exact receipt", async () => {
  const f = fixture();
  const first = await f.process();
  expect(first.evaluation.ready).toBe(true);
  const firstCount = f.calls.length;
  const choice = await f.select();
  expect(choice).toEqual({ preserveUnchangedDiktatIds: ["local-diktat"], reason: "verified" });
  const next = revised(f.bundle, choice.preserveUnchangedDiktatIds);
  const before = f.mutable.snapshot;
  f.mutable.snapshot = snapshot(next, revisionImportId);
  expect(f.mutable.snapshot.binding.dependencyChecksum).not.toBe(before.binding.dependencyChecksum);
  expect(f.mutable.snapshot.binding.targetInputHashes).toEqual(before.binding.targetInputHashes);
  const second = await f.process();
  expect(second.evaluation.ready).toBe(true);
  expect(f.calls.slice(firstCount).map(check => check.layer)).toEqual(["structure"]);
  expect(second.plan.planHash).not.toBe(first.plan.planHash);
  expect(second.attemptId).not.toBe(first.attemptId);
  expect(evaluateProductV4Verification(second.plan, [first.receipt], authority).ready).toBe(false);
  expect(second.receipt.results.every(result => result.artifacts.every(artifact => artifact.id.startsWith(`artifact-${second.attemptId}-`)))).toBe(true);
  expect(f.mutable.snapshot.pdfEvidenceAttachment).toEqual({ planHash: second.plan.planHash, attemptId: second.attemptId, receiptSignature: second.receipt.signature });
  const currentPdf = second.receipt.results.flatMap(result => result.artifacts).find(artifact => artifact.mediaType === "application/pdf")!;
  expect(f.objects.get(buildProductVerificationKey(second.plan.planHash, currentPdf.id))).toEqual(pdf);
});

test("a real Diktat edit reuses the unchanged Article while rerunning both print checks", async () => {
  const original = buildLocalVerificationFixture().bundle;
  const f = fixture(original);
  await f.process();
  const firstCount = f.calls.length;
  const next = buildRevisionArtifact({ kind: "product", original, bundleId: "diktat-edit", operations: [{ op: "set", target: { entityType: "diktat", entityId: "local-diktat" }, field: "units[local-summary].parts[summary-heading].markdown", value: "## Toleransi input dan keluaran diperjelas" }] }).bundle as Bundle;
  const before = f.mutable.snapshot;
  f.mutable.snapshot = snapshot(next, revisionImportId);
  const articleId = original.products.find(product => product.productType === "article")!.id;
  expect(f.mutable.snapshot.binding.targetInputHashes![articleId]).toBe(before.binding.targetInputHashes![articleId]);
  expect(f.mutable.snapshot.binding.targetInputHashes!["local-diktat"]).not.toBe(before.binding.targetInputHashes!["local-diktat"]);
  expect((await f.process()).evaluation.ready).toBe(true);
  expect(f.calls.slice(firstCount).filter(check => check.layer === "print")).toHaveLength(1);
  expect(f.calls.slice(firstCount).every(check => check.layer === "structure" || check.target === "local-diktat")).toBe(true);
});

test("cold legacy checkpoints cause an automatic evidence-version bump and fresh valid verification", async () => {
  const f = fixture();
  delete f.mutable.snapshot.binding.targetInputHashes;
  delete f.mutable.snapshot.binding.executionOrigin;
  await f.process();
  const before = f.calls.length;
  expect([...f.objects.keys()].some(key => key.includes("product-verification-reuse"))).toBe(false);
  const choice = await f.select();
  expect(choice).toEqual({ preserveUnchangedDiktatIds: [], reason: "proof_missing" });
  const next = revised(f.bundle, choice.preserveUnchangedDiktatIds);
  expect(next.products.find(product => product.productType === "diktat")!.version).toBe(f.bundle.products.find(product => product.productType === "diktat")!.version + 1);
  f.mutable.snapshot = snapshot(next, revisionImportId);
  const result = await f.process();
  expect(result.evaluation.ready).toBe(true);
  expect(f.calls.length - before).toBe(result.plan.requirements.length - 1);
});

test("missing pages, changed canonical PDF, tampered proof, and storage failure never preserve Diktat version", async () => {
  const f = fixture();
  const first = await f.process();
  const originalObjects = new Map(f.objects);
  const reset = () => { f.objects.clear(); for (const [key, value] of originalObjects) f.objects.set(key, value); };
  const pdfPage = first.receipt.results.filter(result => first.plan.requirements.find(check => check.id === result.checkId)?.layer === "print").flatMap(result => result.artifacts).find(artifact => artifact.mediaType === "image/png")!;
  f.objects.delete(buildProductVerificationKey(first.plan.planHash, pdfPage.id));
  expect((await f.select()).preserveUnchangedDiktatIds).toEqual([]);
  reset(); f.objects.set(f.mutable.canonicalKey, new TextEncoder().encode("%PDF-different"));
  expect((await f.select()).preserveUnchangedDiktatIds).toEqual([]);
  reset();
  const print = first.plan.requirements.find(check => check.layer === "print")!;
  const scope = productV4ReuseScope(f.mutable.snapshot, first.plan, print, 0, null)!;
  const key = productV4ReuseKey(scope);
  const proof = JSON.parse(new TextDecoder().decode(f.objects.get(key)!));
  proof.scope.rootImportId = "another-root";
  f.objects.set(key, new TextEncoder().encode(JSON.stringify(proof)));
  expect((await f.select()).preserveUnchangedDiktatIds).toEqual([]);
  reset();
  f.selectionPorts.read = async () => { throw new Error("STORAGE_OFFLINE"); };
  expect(await f.select()).toEqual({ preserveUnchangedDiktatIds: [], reason: "runtime_unavailable" });
});

test("reusable proof is bound to root, origin, target dependencies, browser, fonts, and all runtime pins", async () => {
  const f = fixture();
  const first = await f.process();
  const next = revised(f.bundle, ["local-diktat"]);
  const selected = snapshot(next, revisionImportId);
  const check = first.plan.requirements.find(requirement => requirement.layer === "print")!;
  const keyFor = (value: ProductV4VerificationSnapshot) => productV4ReuseScope(value, deriveProductV4VerificationPlan({ bundle: value.bundle, binding: value.binding }), check, 0, null)!;
  const oldScope = keyFor(f.mutable.snapshot);
  expect(productV4ReuseKey(keyFor(selected))).toBe(productV4ReuseKey(oldScope));
  for (const patch of [
    { executionOrigin: "https://www.zyxacademy.com" }, { browserProvider: "steel" as const }, { browserVersion: "153.0.0.1" },
    { fontChecksum: "b".repeat(64) }, { rendererChecksum: "b".repeat(64) }, { contractChecksum: "b".repeat(64) }, { playbookChecksum: "b".repeat(64) },
    { printProfile: "changed-a4" }, { policyRevision: "next-policy" },
  ]) {
    const changed = { ...selected, binding: { ...selected.binding, ...patch } };
    const scope = keyFor(changed);
    expect(productV4ReuseKey(scope)).not.toBe(productV4ReuseKey(oldScope));
    expect(await readProductV4ReuseProof({ scope, requirement: check, authority, read: f.ports.read })).toBeNull();
    // Copying the proof under a new key does not change its signed scope.
    f.objects.set(productV4ReuseKey(scope), f.objects.get(productV4ReuseKey(oldScope))!);
    expect(await readProductV4ReuseProof({ scope, requirement: check, authority, read: f.ports.read })).toBeNull();
  }
  const otherRoot = snapshot(next, revisionImportId, "other-root");
  expect(productV4ReuseKey(keyFor(otherRoot))).not.toBe(productV4ReuseKey(oldScope));
  const otherCourse = structuredClone(next);
  otherCourse.manifest.courseId = "other-course";
  for (const product of otherCourse.products) product.courseId = "other-course";
  expect(productV4ReuseKey(keyFor(snapshot(otherCourse, revisionImportId)))).not.toBe(productV4ReuseKey(oldScope));
  const changedRows = rowsFor(next).map(row => row.type === "source_chunk" ? { ...row, hash: "b".repeat(64) } : row);
  const changedDependencies = { ...selected, binding: { ...selected.binding, targetInputHashes: productV4TargetInputHashes(next, changedRows, emptyAssets) } };
  expect(productV4ReuseKey(keyFor(changedDependencies))).not.toBe(productV4ReuseKey(oldScope));
  const unchangedMetadata = structuredClone(next);
  const target = unchangedMetadata.products.find(product => product.productType === "diktat")!;
  if (target.productType !== "diktat") throw new Error("FIXTURE_REQUIRED");
  target.title = "Changed printed title";
  expect(productV4TargetInputHashes(unchangedMetadata, rowsFor(unchangedMetadata), emptyAssets)[target.id]).not.toBe(selected.binding.targetInputHashes![target.id]);
});

test("target asset closure includes source figure metadata and verified bytes but excludes unrelated assets", () => {
  const bundle = buildLocalVerificationFixture().bundle;
  const article = bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("ARTICLE_FIXTURE_REQUIRED");
  const assetId = "d".repeat(64);
  article.visuals = [...(article.visuals ?? []), { id: "source-figure", kind: "source_figure", interactive: false, label: "Source", description: "Source diagram", assetId, materialId: "material", sourceChecksum: hash,
    staticFallback: { type: "text", summary: "Source diagram", content: "Source diagram description" } }];
  const figure = { metadata: { assetId, materialId: "material", attribution: "Original attribution", permission: "owned" }, variants: [{ name: "print", readbackChecksum: hash, byteLength: 100, width: 10, height: 10 }] };
  const assets = { figures: [figure], documents: [] };
  const before = productV4TargetInputHashes(bundle, rowsFor(bundle), assets);
  const extra = { metadata: { assetId: "e".repeat(64), materialId: "unrelated" }, variants: [] };
  expect(productV4TargetInputHashes(bundle, rowsFor(bundle), { ...assets, figures: [...assets.figures, extra] })).toEqual(before);
  for (const changed of [
    { ...figure, metadata: { ...figure.metadata, attribution: "Updated attribution" } },
    { ...figure, variants: [{ ...figure.variants[0], readbackChecksum: "f".repeat(64) }] },
  ]) {
    const after = productV4TargetInputHashes(bundle, rowsFor(bundle), { ...assets, figures: [changed] });
    expect(after[article.id]).not.toBe(before[article.id]);
    // The Diktat's upstream Article is part of its print dependency closure.
    expect(after["local-diktat"]).not.toBe(before["local-diktat"]);
  }
});

test("preserved proof loss after sealing fails before browser work with an explicit refresh action", async () => {
  const f = fixture();
  await f.process();
  const choice = await f.select();
  const next = revised(f.bundle, choice.preserveUnchangedDiktatIds);
  f.mutable.snapshot = snapshot(next, revisionImportId);
  f.mutable.snapshot.importState.validationReport.revisionLineage = { schema: "authoring-revision.v1", rootImportId,
    impact: { printVersionReuse: { preservedEntityIds: choice.preserveUnchangedDiktatIds } } };
  for (const key of f.objects.keys()) if (key.includes("product-verification-reuse")) f.objects.delete(key);
  const before = f.calls.length;
  await expect(f.process()).rejects.toThrow("PRODUCT_V4_PRINT_REUSE_CHANGED");
  expect(f.calls.length).toBe(before);
  const current = await f.service.readiness(revisionImportId, "run");
  expect(current).toMatchObject({ state: { status: "failed", failureCode: "PRODUCT_V4_PRINT_REUSE_CHANGED" }, nextAction: { kind: "refresh_verification", tool: "authoring.patch_revision", refreshPrintEvidence: true, operations: [] } });
});
