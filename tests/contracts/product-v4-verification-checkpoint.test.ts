import { expect, test } from "bun:test";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { createProductV4VerificationService, type ProductV4VerificationPorts, type ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-core";
import { issueProductV4VerificationCheckpoint, productV4VerificationBatchKey, readProductV4VerificationCheckpoint, type ProductV4VerificationBatchScope } from "@/lib/bundle/product-v4-verification-checkpoint";
import { deriveProductV4VerificationPlan, PRODUCT_V4_VERIFICATION_POLICY, recordProductV4VerificationReport, type ProductV4ObservedCheck, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import { buildProductVerificationKey } from "@/lib/storage/keys";

const hash = "a".repeat(64);
const authority = { executorId: "application-test-executor", signingKey: "only-for-tests-with-at-least-32-bytes" };
const attempt = "00000000-0000-4000-8000-000000000001";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array) => JSON.parse(new TextDecoder().decode(value));
function observe(requirement: ProductV4VerificationRequirement): ProductV4ObservedCheck {
  return { checkId: requirement.id, status: "PASS", expected: requirement.state, observed: "Observed by the application executor",
    artifacts: [{ id: "raw", mediaType: requirement.artifactType, bytes: requirement.artifactType === "image/png" ? png : Buffer.from("{}") }] };
}
function fixture() {
  const source = buildLocalVerificationFixture().bundle;
  const bundle = { ...source, products: source.products.filter(product => product.productType === "article") };
  const binding = { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, logicChecksum: hash, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
  let snapshot: ProductV4VerificationSnapshot = { importId: "import", checksum: hash, sourceUriOrKey: "bundle.zip", stagingAuditId: "audit-one", stagingRunId: "run", importState: { bundleType: "product", bundleId: bundle.manifest.bundleId, courseId: binding.courseId, version: 4, status: "draft", validationReport: {} }, binding, bundle };
  const objects = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const ports: ProductV4VerificationPorts = {
    load: async () => snapshot,
    read: async key => objects.get(key) ?? null,
    write: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); },
    enqueue: async () => {},
    attach: async (_snapshot, planHash, attemptId, expectedAttemptId) => {
      if ((snapshot.verificationAttemptId ?? null) !== expectedAttemptId) return false;
      snapshot = { ...snapshot, verificationAttemptId: attemptId, verificationPlanHash: planHash };
      return true;
    },
    persistPdfEvidence: async () => {}, hasPdfEvidence: async () => true,
    execute: async ({ requirement, captureOffset }) => { calls.push(`${requirement.id}:${captureOffset ?? 0}`); return observe(requirement); },
    authority: () => authority,
  };
  return { service: createProductV4VerificationService(ports), ports, objects, calls,
    get snapshot() { return snapshot; }, set snapshot(value: ProductV4VerificationSnapshot) { snapshot = value; },
    plan: deriveProductV4VerificationPlan({ bundle, binding }) };
}
function proofFixture() {
  const context = fixture();
  const requirement = context.plan.requirements[0];
  const scope: ProductV4VerificationBatchScope = { planHash: context.plan.planHash, stagingAuditId: context.snapshot.stagingAuditId, checkId: requirement.id, captureOffset: 0, captureLimit: null };
  const raw = observe(requirement);
  raw.artifacts[0].id = `artifact-${attempt}-${requirement.id}-0.json`;
  const report = recordProductV4VerificationReport(context.plan, [raw], authority);
  const result = report.results[0];
  const input = { scope, requirement, sourceAttemptId: attempt, result };
  const proof = issueProductV4VerificationCheckpoint(input, authority)!;
  context.objects.set(productV4VerificationBatchKey(scope), proof);
  context.objects.set(buildProductVerificationKey(scope.planHash, result.artifacts[0].id), raw.artifacts[0].bytes);
  return { ...context, scope, requirement, input, proof, report,
    read: () => readProductV4VerificationCheckpoint({ scope, requirement, authority, read: context.ports.read }) };
}

test("signed checkpoints recover exact bytes only within the same plan, audit and capture scope", async () => {
  const value = proofFixture();
  const restored = await value.read();
  expect(restored).toMatchObject({ checkId: value.requirement.id, status: "PASS" });
  expect(restored!.artifacts[0].bytes).toEqual(Buffer.from("{}"));
  for (const scope of [
    { ...value.scope, planHash: "b".repeat(64) }, { ...value.scope, stagingAuditId: "audit-two" },
    { ...value.scope, checkId: "c".repeat(64) }, { ...value.scope, captureOffset: 1 }, { ...value.scope, captureLimit: 2 },
  ]) {
    value.objects.set(productV4VerificationBatchKey(scope), value.proof);
    expect(await readProductV4VerificationCheckpoint({ scope, requirement: value.requirement, authority, read: value.ports.read })).toBeNull();
  }
  expect(await readProductV4VerificationCheckpoint({ scope: value.scope, requirement: value.requirement, authority: { ...authority, executorId: "different" }, read: value.ports.read })).toBeNull();
  expect(await readProductV4VerificationCheckpoint({ scope: value.scope, requirement: value.requirement, authority: { ...authority, signingKey: "different-key-with-at-least-32-bytes" }, read: value.ports.read })).toBeNull();
});

test("tampered or malformed checkpoint metadata and uploaded reports never become execution proof", async () => {
  const value = proofFixture();
  const original = decode(value.proof);
  const corrupt = [
    { ...original, signature: "0".repeat(64) }, { ...original, executorId: "different" },
    { ...original, result: { ...original.result, observed: "changed" } },
    { ...original, result: { ...original.result, unexpected: true } }, { ...original, unexpected: true },
    value.report, { ...value.report, origin: "server_observed" },
  ];
  for (const metadata of corrupt) {
    value.objects.set(productV4VerificationBatchKey(value.scope), encode(metadata));
    expect(await value.read()).toBeNull();
  }
  for (const bytes of [new Uint8Array([0xff]), Buffer.from("invalid json"), new Uint8Array(5 * 1024 * 1024 + 1)]) {
    value.objects.set(productV4VerificationBatchKey(value.scope), bytes);
    expect(await value.read()).toBeNull();
  }
});

test("failed, untested or evidence-free results cannot issue reusable proof", () => {
  const value = proofFixture();
  for (const status of ["FAIL", "NOT_TESTED"] as const) expect(issueProductV4VerificationCheckpoint({ ...value.input, result: { ...value.input.result, status } }, authority)).toBeNull();
  expect(issueProductV4VerificationCheckpoint({ ...value.input, result: { ...value.input.result, artifacts: [] } }, authority)).toBeNull();
  expect(issueProductV4VerificationCheckpoint({ ...value.input, sourceAttemptId: "00000000-0000-4000-8000-000000000099" }, authority)).toBeNull();
});

test("checkpoint read rehashes artifacts and preserves storage transport failures", async () => {
  const value = proofFixture();
  const key = buildProductVerificationKey(value.scope.planHash, value.input.result.artifacts[0].id);
  value.objects.set(key, Buffer.from("[]")); // Same byte count, different checksum.
  expect(await value.read()).toBeNull();
  value.objects.delete(key);
  expect(await value.read()).toBeNull();
  const failure = new Error("STORAGE_DENIED");
  const read = async (selected: string) => { if (selected === key) throw failure; return value.objects.get(selected) ?? null; };
  await expect(readProductV4VerificationCheckpoint({ scope: value.scope, requirement: value.requirement, authority, read })).rejects.toBe(failure);
});

test("a retry reuses completed logic evidence and copies it to the new attempt", async () => {
  const value = fixture();
  const [structure, model] = value.plan.requirements;
  const execute = value.ports.execute;
  let interrupt = true;
  value.ports.execute = async input => {
    if (input.requirement.id === model.id && interrupt) throw new Error("LATER_CHECK_INTERRUPTED");
    return execute(input);
  };
  const first = await value.service.request({ importId: "import", runId: "run" });
  await expect(value.service.process({ importId: "import", runId: "run", planHash: first.plan.planHash, attemptId: first.attemptId })).rejects.toThrow("LATER_CHECK_INTERRUPTED");
  interrupt = false;
  value.calls.length = 0;
  const retry = await value.service.request({ importId: "import", runId: "run", retry: true });
  const completed = await value.service.process({ importId: "import", runId: "run", planHash: retry.plan.planHash, attemptId: retry.attemptId });
  expect(completed.evaluation.ready).toBe(true);
  expect(value.calls).toEqual([`${model.id}:0`]);
  expect(value.calls).not.toContain(`${structure.id}:0`);
  for (const result of completed.receipt.results) for (const artifact of result.artifacts) {
    expect(artifact.id.startsWith(`artifact-${retry.attemptId}-`)).toBe(true);
    expect(artifact.mediaType).toBe("application/json");
    expect(decode(value.objects.get(buildProductVerificationKey(retry.plan.planHash, artifact.id))!)).toEqual({});
  }
});

for (const status of ["FAIL", "NOT_TESTED"] as const) test(`${status} executes again while successful independent checks resume`, async () => {
  const value = fixture();
  const structure = value.plan.requirements.find(check => check.layer === "structure")!;
  const model = value.plan.requirements.find(check => check.layer === "model")!;
  const execute = value.ports.execute;
  value.ports.execute = async input => ({ ...await execute(input), ...(input.requirement.id === structure.id ? { status } : {}) });
  const first = await value.service.request({ importId: "import", runId: "run" });
  const failed = await value.service.process({ importId: "import", runId: "run", planHash: first.plan.planHash, attemptId: first.attemptId });
  expect(failed.evaluation.ready).toBe(false);
  expect(failed.state.completedChecks).toBe(failed.plan.requirements.length);
  expect(value.calls).toEqual([`${structure.id}:0`, `${model.id}:0`]);
  value.calls.length = 0;
  value.ports.execute = execute;
  const retry = await value.service.request({ importId: "import", runId: "run", retry: true });
  expect((await value.service.process({ importId: "import", runId: "run", planHash: retry.plan.planHash, attemptId: retry.attemptId })).evaluation.ready).toBe(true);
  expect(value.calls).toContain(`${structure.id}:0`);
  expect(value.calls).not.toContain(`${model.id}:0`);
});

async function interrupted() {
  const value = fixture();
  const execute = value.ports.execute;
  let calls = 0;
  value.ports.execute = async input => { if (++calls === 2) throw new Error("INTERRUPTED"); return execute(input); };
  const first = await value.service.request({ importId: "import", runId: "run" });
  await expect(value.service.process({ importId: "import", runId: "run", planHash: first.plan.planHash, attemptId: first.attemptId })).rejects.toThrow("INTERRUPTED");
  value.ports.execute = execute;
  value.calls.length = 0;
  const requirement = value.plan.requirements[0];
  const scope: ProductV4VerificationBatchScope = { planHash: value.plan.planHash, stagingAuditId: value.snapshot.stagingAuditId, checkId: requirement.id, captureOffset: 0, captureLimit: null };
  return { value, first, requirement, scope };
}

for (const damage of ["metadata", "bytes", "missing"]) test(`a retry repairs ${damage} instead of trusting damaged evidence`, async () => {
  const { value, requirement, scope } = await interrupted();
  const key = productV4VerificationBatchKey(scope);
  const proof = decode(value.objects.get(key)!);
  if (damage === "metadata") value.objects.set(key, encode({ ...proof, signature: "0".repeat(64) }));
  else {
    const artifactKey = buildProductVerificationKey(scope.planHash, proof.result.artifacts[0].id);
    if (damage === "bytes") value.objects.set(artifactKey, Buffer.from("[]")); else value.objects.delete(artifactKey);
  }
  const retry = await value.service.request({ importId: "import", runId: "run", retry: true });
  expect((await value.service.process({ importId: "import", runId: "run", planHash: retry.plan.planHash, attemptId: retry.attemptId })).evaluation.ready).toBe(true);
  expect(value.calls).toContain(`${requirement.id}:0`);
});

for (const change of ["revision", "logic-runtime", "audit"]) test(`changed ${change} cannot reuse an earlier checkpoint`, async () => {
  const { value, requirement } = await interrupted();
  value.snapshot = { ...value.snapshot, verificationAttemptId: null, verificationPlanHash: null,
    ...(change === "audit" ? { stagingAuditId: "audit-two" } : { binding: { ...value.snapshot.binding,
      ...(change === "revision" ? { revision: 2 } : { logicChecksum: "b".repeat(64) }) } }) };
  const next = await value.service.request({ importId: "import", runId: "run" });
  expect((await value.service.process({ importId: "import", runId: "run", planHash: next.plan.planHash, attemptId: next.attemptId })).evaluation.ready).toBe(true);
  expect(value.calls).toContain(`${requirement.id}:0`);
});

test("an attempt superseded during cache read cannot publish a receipt", async () => {
  const { value, first } = await interrupted();
  const retry = await value.service.request({ importId: "import", runId: "run", retry: true });
  const read = value.ports.read;
  value.ports.read = async key => {
    const bytes = await read(key);
    if (key.includes(`/artifact-${first.attemptId}-`)) value.snapshot = { ...value.snapshot, verificationAttemptId: "00000000-0000-4000-8000-000000000099" };
    return bytes;
  };
  await expect(value.service.process({ importId: "import", runId: "run", planHash: retry.plan.planHash, attemptId: retry.attemptId })).rejects.toThrow("ATTEMPT_STALE");
  expect(value.objects.has(buildProductVerificationKey(retry.plan.planHash, `receipt-${retry.attemptId}.json`))).toBe(false);
});
