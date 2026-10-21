import { expect, test } from "bun:test";
import { productBundleManifestSchema, productEntitySchema } from "@/lib/bundle/product-validator";
import { createProductV4VerificationService, type ProductV4VerificationPorts, type ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-service";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { assertProductV4VerificationCurrent, deriveProductV4VerificationPlan, evaluateProductV4Verification, PRODUCT_V4_VERIFICATION_POLICY, recordProductV4VerificationReport, runProductV4Verification, type ProductV4ObservedCheck, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";

const hash = "a".repeat(64);
const authority = { signingKey: "test-only-secret-with-at-least-32-bytes", executorId: "server-test-runner" };
const binding = { importId: "import", courseId: "course", runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
const manifest = productBundleManifestSchema.parse({ bundleId: "bundle", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course", creatorId: "creator", createdAt: "2026-10-21T00:00:00.000Z", entityFiles: ["products", "dependencies"].map((entityType) => ({ entityType, path: `${entityType}.json`, checksum: hash, stableIds: [] })), bundleChecksum: hash });
const article = productEntitySchema.parse({ id: "article", productType: "article", courseId: "course", version: 1, status: "draft", ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1 }], sourceRefs: [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }], schemaVersion: "article.v4", sourceHash: hash, generationHash: hash, creatorId: "creator", slug: "article", title: "Limit", visuals: [{ id: "graph", kind: "epsilon_delta_graph", label: "Limit", description: "A quadratic limit", bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 5 }, staticFallback: { type: "text", summary: "Limit", content: "Approach zero" }, limitPoint: 0, limitValue: 0, defaultEpsilon: 1, defaultDelta: 0.5, functionModel: { kind: "quadratic", a: 1, b: 0, c: 0 } }] });
const bundle = { manifest, products: [article], dependencies: [] };
const plan = () => deriveProductV4VerificationPlan({ bundle, binding });
const observe = (requirement: ProductV4VerificationRequirement): ProductV4ObservedCheck => ({ checkId: requirement.id, status: "PASS", expected: "Expected behavior", observed: "Observed behavior", artifacts: [{ id: `artifact-${requirement.id}`, mediaType: requirement.artifactType, bytes: requirement.artifactType === "image/png" ? Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") : new TextEncoder().encode(requirement.artifactType === "application/pdf" ? "%PDF-1.7\n%%EOF" : "{}") }] });

test("derives exact full state and viewport matrix rather than accepting a requested subset", () => {
  const value = plan();
  expect(value.requirements).toHaveLength(20);
  expect(value.requirements.filter((requirement) => requirement.state === "resolution-limited")).toHaveLength(0);
  expect(plan()).toEqual(value);
  expect(evaluateProductV4Verification(value, [], authority).ready).toBe(false);
});

test("only application-executed checks can produce a trusted passing receipt", async () => {
  const value = plan();
  const receipt = await runProductV4Verification(value, authority, async (requirement) => observe(requirement));
  expect(evaluateProductV4Verification(value, [receipt], authority)).toEqual({ ready: true, missingCheckIds: [], invalidReceiptCount: 0 });
  const local = recordProductV4VerificationReport(value, value.requirements.map(observe), authority);
  expect(local.origin).toBe("local_runner_reported");
  expect(evaluateProductV4Verification(value, [local], authority).ready).toBe(false);
  expect(evaluateProductV4Verification(value, [{ ...local, origin: "server_observed" }], authority).invalidReceiptCount).toBe(1);
});

test("rejects forged, modified, unknown, duplicate and wrong-scope evidence", async () => {
  const value = plan();
  const receipt = await runProductV4Verification(value, authority, async (requirement) => observe(requirement));
  expect(evaluateProductV4Verification(value, [{ ...receipt, signature: "0".repeat(64) }], authority).ready).toBe(false);
  expect(evaluateProductV4Verification(value, [receipt], { ...authority, executorId: "another-runner" }).ready).toBe(false);
  const edited = structuredClone(receipt);
  edited.results[0].artifacts[0].checksum = "b".repeat(64);
  expect(evaluateProductV4Verification(value, [edited], authority).ready).toBe(false);
  expect(() => deriveProductV4VerificationPlan({ bundle, binding: { ...binding, courseId: "another-course" } })).toThrow("SCOPE_MISMATCH");
  expect(() => recordProductV4VerificationReport(value, [observe(value.requirements[0]), observe(value.requirements[0])], authority)).toThrow("CHECK_INVALID");
  expect(() => recordProductV4VerificationReport(value, [{ ...observe(value.requirements[0]), checkId: "b".repeat(64) }], authority)).toThrow("CHECK_INVALID");
});

test("missing artifacts, failed checks, and partial reports cannot satisfy the matrix", async () => {
  const value = plan();
  for (const mutation of ["artifact", "fail", "not-tested"] as const) {
    const receipt = await runProductV4Verification(value, authority, async (requirement) => {
      const result = observe(requirement);
      if (requirement.id === value.requirements[0].id) {
        if (mutation === "artifact") result.artifacts = [];
        else result.status = mutation === "fail" ? "FAIL" : "NOT_TESTED";
      }
      return result;
    });
    expect(evaluateProductV4Verification(value, [receipt], authority).missingCheckIds).toEqual([value.requirements[0].id]);
  }
  const subset = recordProductV4VerificationReport(value, [observe(value.requirements[0])], authority);
  expect(evaluateProductV4Verification(value, [subset], authority).missingCheckIds.length).toBe(value.requirements.length);
});

test("content, source, Idea, scope and runtime changes invalidate old evidence and publication snapshots", async () => {
  const value = plan();
  const receipt = await runProductV4Verification(value, authority, async (requirement) => observe(requirement));
  for (const field of ["rendererChecksum", "dependencyChecksum", "contractChecksum", "playbookChecksum", "fontChecksum", "assetChecksum"] as const) {
    const changed = deriveProductV4VerificationPlan({ bundle, binding: { ...binding, [field]: "b".repeat(64) } });
    expect(evaluateProductV4Verification(changed, [receipt], authority).ready).toBe(false);
    expect(() => assertProductV4VerificationCurrent(value, changed)).toThrow("CONFLICT");
  }
  const changed = structuredClone(bundle);
  changed.products[0].sourceRefs[0].checksum = "b".repeat(64);
  changed.products[0].ideaLinks[0].semanticHash = "b".repeat(64);
  const changedPlan = deriveProductV4VerificationPlan({ bundle: changed, binding });
  expect(evaluateProductV4Verification(changedPlan, [receipt], authority).ready).toBe(false);
  expect(() => assertProductV4VerificationCurrent(value, changedPlan)).toThrow("CONFLICT");
  const tamperedPlan = structuredClone(value);
  tamperedPlan.requirements = [];
  expect(() => evaluateProductV4Verification(tamperedPlan, [receipt], authority)).toThrow("PLAN_INVALID");
});

test("executor cannot swap check identity or pass NA to remove an obligation", async () => {
  const value = plan();
  await expect(runProductV4Verification(value, authority, async (requirement) => ({ ...observe(requirement), checkId: "b".repeat(64) }))).rejects.toThrow("CHECK_INVALID");
  const receipt = await runProductV4Verification(value, authority, async (requirement) => observe(requirement));
  expect(evaluateProductV4Verification(value, [{ ...receipt, results: [{ ...receipt.results[0], status: "NOT_APPLICABLE" }] }], authority).ready).toBe(false);
});

function serviceFixture() {
  const objects = new Map<string, Uint8Array>();
  const mutable: { snapshot: ProductV4VerificationSnapshot; allowAttach: boolean; executeCount: number; enqueueCount: number; mutateDuringExecution: boolean; reportedStatus: ProductV4ObservedCheck["status"]; enqueueFails: boolean; changeAttemptDuringExecution: boolean } = { snapshot: { importId: "import", checksum: hash, sourceUriOrKey: "bundle.zip", binding, bundle }, allowAttach: true, executeCount: 0, enqueueCount: 0, mutateDuringExecution: false, reportedStatus: "PASS", enqueueFails: false, changeAttemptDuringExecution: false };
  const ports: ProductV4VerificationPorts = {
    async load() { return mutable.snapshot; },
    async read(key) { return objects.get(key) ?? null; },
    async write(key, bytes) { objects.set(key, bytes); },
    async enqueue() { mutable.enqueueCount++; if (mutable.enqueueFails) throw new Error("QUEUE_UNAVAILABLE"); },
    async attach(_snapshot, planHash, attemptId, expectedAttemptId) {
      if (!mutable.allowAttach || (mutable.snapshot.verificationAttemptId ?? null) !== expectedAttemptId) return false;
      mutable.snapshot = { ...mutable.snapshot, verificationAttemptId: attemptId, verificationPlanHash: planHash };
      return true;
    },
    async execute({ requirement }) {
      mutable.executeCount++;
      if (mutable.mutateDuringExecution) mutable.snapshot = { ...mutable.snapshot, binding: { ...binding, revision: 2 } };
      if (mutable.changeAttemptDuringExecution) mutable.snapshot = { ...mutable.snapshot, verificationAttemptId: "00000000-0000-4000-8000-000000000000" };
      return { ...observe(requirement), status: mutable.reportedStatus };
    },
    authority: () => authority,
  };
  return { service: createProductV4VerificationService(ports), mutable, objects };
}

test("persisted job only becomes ready after actual execution and intact artifact readback", async () => {
  const { service, mutable, objects } = serviceFixture();
  const before = await service.readiness("import", "run");
  expect(before.jobId).toBeNull();
  expect(objects.size).toBe(0);
  await expect(service.get({ importId: "import", runId: "run", planHash: before.plan.planHash })).rejects.toThrow("JOB_NOT_FOUND");
  const requested = await service.request({ importId: "import", runId: "run" });
  expect(requested.evaluation.ready).toBe(false);
  expect(mutable.executeCount).toBe(0);
  const input = { importId: "import", runId: "run", planHash: requested.jobId };
  const result = await service.process(input);
  expect(result.evaluation.ready).toBe(true);
  expect(mutable.executeCount).toBe(20);
  await service.get(input);
  await service.process(input);
  expect(mutable.executeCount).toBe(20);
  const artifact = result.receipt.results[0].artifacts[0];
  objects.set(buildProductVerificationKey(input.planHash, artifact.id), new TextEncoder().encode("changed bytes"));
  await expect(service.get(input)).rejects.toThrow("ARTIFACT_MISSING_OR_CHANGED");
});

test("concurrent edits and failed conditional attachment cannot mark a receipt complete", async () => {
  const fixture = serviceFixture();
  const request = await fixture.service.request({ importId: "import", runId: "run" });
  fixture.mutable.mutateDuringExecution = true;
  await expect(fixture.service.process({ importId: "import", runId: "run", planHash: request.jobId })).rejects.toThrow("CONFLICT");
  expect([...fixture.objects.keys()].some((key) => key.includes("/receipt-"))).toBe(false);
  const other = serviceFixture();
  other.mutable.allowAttach = false;
  await expect(other.service.request({ importId: "import", runId: "run" })).rejects.toThrow("CONFLICT");
});

test("conflicting execution attempts cannot be combined into readiness", async () => {
  const value = plan();
  const passed = await runProductV4Verification(value, authority, async (requirement) => observe(requirement));
  const failed = await runProductV4Verification(value, authority, async (requirement) => ({ ...observe(requirement), status: "FAIL" }));
  expect(evaluateProductV4Verification(value, [passed, failed], authority).ready).toBe(false);
  expect(evaluateProductV4Verification(value, [passed, passed], authority).ready).toBe(false);
});

test("print completion requires captures for every inspected PDF page", async () => {
  const diktat = productEntitySchema.parse({ id: "diktat", productType: "diktat", courseId: article.courseId, version: 1, status: "draft", ideaLinks: article.ideaLinks, sourceRefs: article.sourceRefs, schemaVersion: "diktat.v4", sourceHash: hash, generationHash: hash, creatorId: "creator", title: "Summary", contentMarkdown: "Summary", sourceArticleId: article.id, sourceArticleVersion: 1, sourceArticleHash: hash });
  const value = deriveProductV4VerificationPlan({ bundle: { ...bundle, products: [article, diktat] }, binding });
  const receipt = await runProductV4Verification(value, authority, async (requirement) => {
    const result = observe(requirement);
    if (requirement.artifactType === "application/pdf") result.pageCount = 2;
    if (requirement.state === "every-page-rendering-and-overflow") { result.pageCount = 2; result.artifacts[0].pageNumber = 1; }
    return result;
  });
  expect(evaluateProductV4Verification(value, [receipt], authority).ready).toBe(false);
  const complete = await runProductV4Verification(value, authority, async (requirement) => {
    const result = observe(requirement);
    if (requirement.artifactType === "application/pdf") result.pageCount = 2;
    if (requirement.state === "every-page-rendering-and-overflow") {
      result.pageCount = 2;
      result.artifacts = [{ ...result.artifacts[0], pageNumber: 1 }, { ...result.artifacts[0], id: "page-2", pageNumber: 2 }];
    }
    return result;
  });
  expect(evaluateProductV4Verification(value, [complete], authority).ready).toBe(true);
});

test("artifact media type cannot substitute unrelated bytes", () => {
  const value = plan();
  const image = value.requirements.find((requirement) => requirement.artifactType === "image/png")!;
  const result = observe(image);
  result.artifacts[0].bytes = new TextEncoder().encode('{"status":"PASS"}');
  expect(() => recordProductV4VerificationReport(value, [result], authority)).toThrow("ARTIFACT_INVALID");
});

test("server-only staging metadata does not change the canonical verification plan", () => {
  const staged = { ...bundle, files: new Map([["products.json", new Uint8Array([1])]]), checksum: hash, publicationBlocked: true, issues: [{ code: "DRAFT_ONLY" }] };
  expect(deriveProductV4VerificationPlan({ bundle: staged, binding })).toEqual(plan());
});

test("explicit retry recovers NOT_TESTED or FAIL without changing content or reusing an attempt", async () => {
  for (const initialStatus of ["NOT_TESTED", "FAIL"] as const) {
    const { service, mutable, objects } = serviceFixture();
    mutable.reportedStatus = initialStatus;
    const first = await service.request({ importId: "import", runId: "run" });
    const input = { importId: "import", runId: "run", planHash: first.jobId, attemptId: first.attemptId };
    const incomplete = await service.process(input);
    expect(incomplete.evaluation.ready).toBe(false);
    await service.get({ importId: "import", runId: "run", planHash: first.jobId });
    const unchanged = await service.request({ importId: "import", runId: "run" });
    expect(unchanged.attemptId).toBe(first.attemptId);
    expect(mutable.enqueueCount).toBe(1);
    const next = await service.request({ importId: "import", runId: "run", retry: true });
    expect(next.attemptId).not.toBe(first.attemptId);
    expect(mutable.enqueueCount).toBe(2);
    await expect(service.process(input)).rejects.toThrow("ATTEMPT_STALE");
    mutable.reportedStatus = "PASS";
    const complete = await service.process({ ...input, attemptId: next.attemptId });
    expect(complete.evaluation.ready).toBe(true);
    expect(objects.has(buildProductVerificationKey(first.jobId, `receipt-${first.attemptId}.json`))).toBe(true);
    expect(objects.has(buildProductVerificationKey(first.jobId, `receipt-${next.attemptId}.json`))).toBe(true);
  }
});

test("enqueue failure can be explicitly retried; polling never enqueues", async () => {
  const { service, mutable } = serviceFixture();
  mutable.enqueueFails = true;
  await expect(service.request({ importId: "import", runId: "run" })).rejects.toThrow("QUEUE_UNAVAILABLE");
  const failed = await service.readiness("import", "run");
  expect(failed.evaluation.ready).toBe(false);
  expect(mutable.enqueueCount).toBe(1);
  const failedAttempt = mutable.snapshot.verificationAttemptId;
  mutable.enqueueFails = false;
  const retried = await service.request({ importId: "import", runId: "run", retry: true });
  expect(retried.attemptId).not.toBe(failedAttempt);
  expect(mutable.enqueueCount).toBe(2);
  await expect(service.request({ importId: "import", runId: "run", retry: true })).rejects.toThrow("RETRY_NOT_ALLOWED");
});

test("a superseded attempt cannot write completion or a current receipt", async () => {
  const { service, mutable, objects } = serviceFixture();
  const first = await service.request({ importId: "import", runId: "run" });
  mutable.changeAttemptDuringExecution = true;
  await expect(service.process({ importId: "import", runId: "run", planHash: first.jobId, attemptId: first.attemptId })).rejects.toThrow("ATTEMPT_STALE");
  expect(objects.has(buildProductVerificationKey(first.jobId, `receipt-${first.attemptId}.json`))).toBe(false);
  const state = JSON.parse(new TextDecoder().decode(objects.get(buildProductVerificationKey(first.jobId, `state-${first.attemptId}.json`))));
  expect(state.status).toBe("stale");
});
