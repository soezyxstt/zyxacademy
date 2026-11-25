import assert from "node:assert/strict";
import { buildProductDraft, productDraftInputSchema, type ProductDraftContext } from "../../lib/authoring/product-draft-builder";
import { projectRevisionResponse, selectRevisionContent } from "../../lib/authoring/revision-response";
import { createProductV4VerificationService, type ProductV4VerificationPorts, type ProductV4VerificationSnapshot } from "../../lib/bundle/product-v4-verification-core";
import { productV4VerificationBatchKey } from "../../lib/bundle/product-v4-verification-checkpoint";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, PRODUCT_V4_VERIFICATION_POLICY, runProductV4Verification, type ProductV4ObservedCheck, type ProductV4VerificationPlan, type ProductV4VerificationRequirement } from "../../lib/bundle/product-v4-verification";
import { renderProductV4PrintArtifacts } from "../../lib/compute/product-v4-print-artifacts";
import { buildLocalVerificationFixture } from "./local-verification-fixture";

const hash = "a".repeat(64);
const authority = { executorId: "synthetic-benchmark-only", signingKey: "synthetic-benchmark-key-not-a-service-credential" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const reductionPercent = (before: number, after: number) => Number(((1 - after / before) * 100).toFixed(2));

/** Deterministic payload fixtures, not content or visual-quality evaluations. */
export function buildAuthoringBenchmarkFixture(size: "short" | "long") {
  const source = buildLocalVerificationFixture().bundle;
  const products = source.products.map(product => {
    const common = { id: product.id, title: "title" in product ? product.title : "", ideaIds: product.ideaLinks.map(link => link.id),
      ideaLinks: product.ideaLinks.map(({ id, weight, role }) => ({ id, weight, role })),
      sourceRefs: product.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })),
    };
    if (product.productType === "article") return { ...common, productType: "article", slug: product.slug, visuals: product.visuals,
      sections: product.sections.map(({ orderIndex: _order, sourceRefs: _sources, ...section }) => ({ ...section,
        blocks: section.blocks.map(({ orderIndex: _index, contentMarkdown: _markdown, visualIds: _visuals, sourceRefs: _blockSources, ideaIds: _ideas, ...block }) => ({ ...block, parts: block.parts! })),
      })),
    };
    if (product.productType !== "diktat") throw new Error("BENCHMARK_FIXTURE_PRODUCT_UNSUPPORTED");
    return { ...common, productType: "diktat", sourceArticleId: product.sourceArticleId,
      units: product.units!.map(unit => ({ ...unit, parts: unit.parts.map(part => {
        if (part.kind !== "visual_ref") return part;
        const { staticSnapshot: _snapshot, ...authored } = part;
        return authored;
      }) })),
    };
  });
  const input = productDraftInputSchema.parse({ products });
  if (size === "long") {
    const article = input.products.find(product => product.productType === "article")!;
    if (article.productType !== "article") throw new Error("BENCHMARK_ARTICLE_REQUIRED");
    const template = article.sections.find(section => section.kind === "topic")!;
    const diktat = input.products.find(product => product.productType === "diktat")!;
    if (diktat.productType !== "diktat") throw new Error("BENCHMARK_DIKTAT_REQUIRED");
    const sourceRefs = diktat.units.map(unit => [...unit.sourceElementRefs ?? []]);
    // Scale valid lesson structure instead of inflating one topic past its prose gate.
    for (let copy = 1; copy <= 12; copy++) {
      const replacements = new Map<string, string>();
      const collectIds = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(collectIds);
        else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
          if ((key === "id" || key === "learningSectionId") && typeof child === "string") replacements.set(child, `${child}-copy-${copy}`);
          else collectIds(child);
        }
      };
      collectIds(template);
      template.ideaIds.forEach(id => replacements.set(id, `${id}-copy-${copy}`));
      const rewrite = (value: unknown): unknown => {
        if (typeof value === "string") return replacements.get(value) ?? value;
        if (Array.isArray(value)) return value.map(rewrite);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
        return value;
      };
      const section = rewrite(template) as typeof template;
      section.slug = `${template.slug}-copy-${copy}`;
      article.sections.splice(article.sections.length - 1, 0, section);
      article.ideaIds.push(...section.ideaIds);
      diktat.ideaIds.push(...section.ideaIds);
      diktat.units.forEach((unit, index) => {
        unit.sourceElementRefs!.push(...sourceRefs[index].flatMap(id => replacements.has(id) ? [replacements.get(id)!] : []));
        unit.ideaIds.push(...section.ideaIds);
      });
    }
    for (const product of [article, diktat]) product.ideaLinks = product.ideaIds.map(id => ({ id, weight: 1 / product.ideaIds.length, role: "primary" }));
  }
  const reference = source.products[0];
  const context: ProductDraftContext = { bundleId: `benchmark-${size}`, courseId: reference.courseId, chapterId: reference.chapterId,
    creatorId: "synthetic-author", createdAt: "2026-11-25T00:00:00.000Z",
    ideas: [...new Set(input.products.flatMap(product => product.ideaIds))].map(id => ({ id, version: 1, semanticHash: hash })),
    sources: reference.sourceRefs,
    learningSectionIds: input.products.flatMap(product => product.productType === "article" ? product.sections.flatMap(section => section.learningSectionId ? [section.learningSectionId] : []) : []),
  };
  const built = buildProductDraft(input, context);
  if (!built.success) throw new Error(`BENCHMARK_FIXTURE_INVALID:${JSON.stringify(built.issues)}`);
  return { input, context, built };
}

function binding(courseId: string) {
  return { importId: "synthetic-import", courseId, runId: "synthetic-run", revision: 1,
    rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash,
    fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
}

function observe(requirement: ProductV4VerificationRequirement): ProductV4ObservedCheck {
  return { checkId: requirement.id, status: "PASS", expected: requirement.state, observed: "Synthetic executor observation; no browser or scientific validation ran.",
    ...(requirement.layer === "print" ? { pageCount: 1 } : {}),
    artifacts: [{ id: `synthetic-${requirement.id}`, mediaType: requirement.artifactType,
      bytes: requirement.artifactType === "image/png" ? png : Buffer.from(requirement.artifactType === "application/pdf" ? "%PDF-1.7\n%%EOF" : "{}"),
      ...(requirement.layer === "print" && requirement.artifactType === "image/png" ? { pageNumber: 1 } : {}) }],
  };
}

async function countVerificationWork(plan: ProductV4VerificationPlan) {
  let pdfCalls = 0;
  let executeCalls = 0;
  let browserCalls = 0;
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    executeCalls++;
    if (requirement.layer === "web" || requirement.layer === "print") browserCalls++;
    const observed = observe(requirement);
    if (requirement.layer === "print") {
      const print = await renderProductV4PrintArtifacts({
        renderPdf: async () => { pdfCalls++; return Buffer.from("%PDF-1.7\n%%EOF"); },
        pageCount: async () => 1,
        capturePages: async (_pdf, numbers) => numbers.map(pageNumber => ({ pageNumber, png })),
      });
      Object.assign(observed, print, { artifacts: print.artifacts.map(artifact => ({ ...artifact, id: `${requirement.id}-${artifact.id}` })) });
    }
    return observed;
  });
  assert.ok(evaluateProductV4Verification(plan, [receipt], authority).ready);
  let blockedBrowserCalls = 0;
  const blocked = await runProductV4Verification(plan, authority, async requirement => {
    if (requirement.layer === "web" || requirement.layer === "print") blockedBrowserCalls++;
    return { ...observe(requirement), ...(requirement.layer === "structure" ? { status: "FAIL" as const } : {}) };
  });
  assert.equal(evaluateProductV4Verification(plan, [blocked], authority).ready, false);
  return { baseline: { method: "Declared pre-PR matrix; each print requirement invokes PDF once", executeCalls: plan.requirements.length,
    browserCalls: plan.requirements.filter(check => check.layer === "web" || check.layer === "print").length,
    pdfCalls: plan.requirements.filter(check => check.layer === "print").length },
    current: { executeCalls, browserCalls, pdfCalls },
    invalidStructure: { currentBrowserCalls: blockedBrowserCalls, untestedChecks: blocked.results.filter(result => result.status === "NOT_TESTED").length },
    requiredChecks: plan.requirements.length, recordedChecks: receipt.results.length };
}

/** Real retry coordinator and signed checkpoint code with isolated in-memory ports. */
async function countRetryWork(fixture: ReturnType<typeof buildAuthoringBenchmarkFixture>, cache: boolean) {
  const bundle = { ...fixture.built.bundle, products: fixture.built.bundle.products.filter(product => product.productType === "article") };
  const bound = binding(bundle.manifest.courseId);
  let snapshot: ProductV4VerificationSnapshot = { importId: bound.importId, checksum: fixture.built.bundle.checksum,
    sourceUriOrKey: "synthetic-bundle.zip", stagingAuditId: "synthetic-audit", stagingRunId: bound.runId,
    importState: { bundleType: "product", bundleId: bundle.manifest.bundleId, courseId: bound.courseId, version: 4, status: "draft", validationReport: {} }, binding: bound, bundle };
  const objects = new Map<string, Uint8Array>();
  const plan = deriveProductV4VerificationPlan({ bundle, binding: bound });
  const interruptAt = plan.requirements.filter(check => check.layer === "web")[1].id;
  let interrupt = true;
  let calls = 0;
  let renderCalls = 0;
  const ports: ProductV4VerificationPorts = {
    load: async () => snapshot,
    read: async key => objects.get(key) ?? null,
    write: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); },
    enqueue: async () => {},
    attach: async (_snapshot, planHash, attemptId, expectedAttemptId) => {
      if ((snapshot.verificationAttemptId ?? null) !== expectedAttemptId) return false;
      snapshot = { ...snapshot, verificationPlanHash: planHash, verificationAttemptId: attemptId };
      return true;
    },
    persistPdfEvidence: async () => { throw new Error("BENCHMARK_HAS_NO_PRINT_TARGET"); },
    hasPdfEvidence: async () => false,
    authority: () => authority,
    execute: async ({ requirement }) => {
      calls++;
      if (requirement.layer === "web") renderCalls++;
      if (interrupt && requirement.id === interruptAt) throw new Error("SYNTHETIC_WORKER_INTERRUPTION");
      return observe(requirement);
    },
  };
  const service = createProductV4VerificationService(ports);
  const request = { importId: bound.importId, runId: bound.runId };
  const first = await service.request(request);
  await assert.rejects(() => service.process({ ...request, planHash: first.plan.planHash, attemptId: first.attemptId }), /SYNTHETIC_WORKER_INTERRUPTION/);
  const firstAttempt = { executeCalls: calls, browserCalls: renderCalls };
  if (!cache) for (const requirement of plan.requirements) objects.delete(productV4VerificationBatchKey({
    planHash: plan.planHash, stagingAuditId: snapshot.stagingAuditId, checkId: requirement.id,
    captureOffset: 0, captureLimit: requirement.layer === "web" ? 2 : null,
  }));
  interrupt = false;
  calls = 0;
  renderCalls = 0;
  const next = await service.request({ ...request, retry: true });
  const complete = await service.process({ ...request, planHash: next.plan.planHash, attemptId: next.attemptId });
  assert.ok(complete.evaluation.ready);
  return { firstAttempt, retry: { executeCalls: calls, browserCalls: renderCalls }, requiredChecks: plan.requirements.length,
    recordedChecks: complete.receipt.results.length };
}

export async function benchmarkAgentWorkflow() {
  const cases = [];
  for (const size of ["short", "long"] as const) {
    const fixture = buildAuthoringBenchmarkFixture(size);
    const { input, built } = fixture;
    const article = built.bundle.products.find(product => product.productType === "article")!;
    if (article.productType !== "article") throw new Error("BENCHMARK_ARTICLE_REQUIRED");
    const target = { entityType: "article", entityId: article.id, sectionId: article.sections[0].id, blockId: article.sections[0].blocks[0].id };
    const artifact = { manifest: built.bundle.manifest, products: built.bundle.products, dependencies: built.bundle.dependencies };
    // Equal metadata on both sides; omit live reviews and tokens from this isolated fixture.
    const full = { kind: "product", importId: "synthetic-import", revision: built.bundle.checksum, version: 4,
      schemaVersion: "product-bundle.v4", status: "draft", scope: { courseId: built.bundle.manifest.courseId }, stagingRunId: "synthetic-run",
      draftLineage: null, bundle: artifact, reviewContext: null, reviewReuse: null, nextActions: ["authoring.patch_revision"] };
    const compact = projectRevisionResponse(full, { responseMode: "compact" });
    const targeted = projectRevisionResponse({ ...full, selection: selectRevisionContent(built.bundle, target) }, { responseMode: "compact", target });
    const fullBytes = jsonBytes(full), compactBytes = jsonBytes(compact), targetedBytes = jsonBytes(targeted);
    const plan = deriveProductV4VerificationPlan({ bundle: built.bundle, binding: binding(built.bundle.manifest.courseId) });
    cases.push({ size, content: { authoredJsonBytes: jsonBytes(input), canonicalJsonBytes: jsonBytes(artifact),
      archiveBytes: built.bytes.byteLength, archiveBase64Bytes: Buffer.byteLength(Buffer.from(built.bytes).toString("base64"), "utf8") },
      editResponse: { fullBytes, compactBytes, targetedBytes, compactReductionPercent: reductionPercent(fullBytes, compactBytes), targetedReductionPercent: reductionPercent(fullBytes, targetedBytes) },
      verification: await countVerificationWork(plan),
      retry: { withoutCheckpoint: await countRetryWork(fixture, false), withCheckpoint: await countRetryWork(fixture, true) },
    });
  }
  return { schemaVersion: "authoring-agent-benchmark.v1", synthetic: true,
    measured: ["UTF-8 JSON and archive bytes", "actual scheduling and retry orchestration with synthetic observations"],
    notMeasured: ["model tokens or money", "wall-clock savings", "database or storage latency", "browser rendering or visual quality", "hosted MCP acceptance", "Idea draft authoring"],
    interpretation: "Direct content removes author-managed hashes and ZIP work. Compressed archive wire bytes may be smaller than authored JSON. Compact responses still load and validate the archive. Retry reuse applies only to an unchanged plan and audit.", cases };
}

if (import.meta.main) console.log(JSON.stringify(await benchmarkAgentWorkflow(), null, 2));
