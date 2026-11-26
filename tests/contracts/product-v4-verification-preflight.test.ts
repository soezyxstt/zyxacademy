import { expect, test } from "bun:test";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, PRODUCT_V4_VERIFICATION_POLICY, recordProductV4VerificationReport, runProductV4Verification, type ProductV4ObservedCheck, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import { renderProductV4PrintArtifacts } from "@/lib/compute/product-v4-print-artifacts";

const hash = "a".repeat(64);
const authority = { signingKey: "test-only-secret-with-at-least-32-bytes", executorId: "server-test-runner" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function fixture(twoDiktats = false) {
  const { bundle } = buildLocalVerificationFixture();
  const diktat = bundle.products.find(product => product.productType === "diktat")!;
  const products = twoDiktats ? [...bundle.products, { ...diktat, id: `${diktat.id}-second` }] : bundle.products;
  const binding = { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, purpose: "pdf" as const, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
  return deriveProductV4VerificationPlan({ bundle: { ...bundle, products }, binding });
}
const observe = (requirement: ProductV4VerificationRequirement): ProductV4ObservedCheck => ({
  checkId: requirement.id, status: "PASS", expected: requirement.state, observed: "Fixture observed the required state",
  ...(requirement.layer === "print" ? { pageCount: 1 } : {}),
  artifacts: [{ id: `artifact-${requirement.id}`, mediaType: requirement.artifactType,
    bytes: requirement.artifactType === "image/png" ? png : Buffer.from(requirement.artifactType === "application/pdf" ? "%PDF-1.7\n%%EOF" : "{}"),
    ...(requirement.layer === "print" && requirement.artifactType === "image/png" ? { pageNumber: 1 } : {}) }],
});

test("structure and all model checks run before any browser work without changing the required matrix", async () => {
  const plan = fixture();
  const matrix = structuredClone(plan.requirements);
  const calls: ProductV4VerificationRequirement[] = [];
  const receipt = await runProductV4Verification(plan, authority, async requirement => { calls.push(requirement); return observe(requirement); });
  const preflight = matrix.filter(check => ["structure", "model"].includes(check.layer));
  expect(calls.slice(0, preflight.length)).toEqual(preflight);
  expect(plan.requirements).toEqual(matrix);
  expect(receipt.results.map(check => check.checkId)).toEqual(matrix.map(check => check.id));
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(true);
});

for (const failure of ["structure", "model", "all", "untested", "missing-evidence"] as const) test(`${failure} preflight collects cheap findings and leaves every dependent render untested`, async () => {
  const plan = fixture();
  const preflight = plan.requirements.filter(check => ["structure", "model"].includes(check.layer));
  const calls: string[] = [];
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    expect(["structure", "model"]).toContain(requirement.layer);
    calls.push(requirement.id);
    const result = observe(requirement);
    if (failure === "all" || requirement.layer === failure) result.status = "FAIL";
    if (requirement.layer === "structure" && failure === "untested") result.status = "NOT_TESTED";
    if (requirement.layer === "structure" && failure === "missing-evidence") result.artifacts = [];
    return result;
  });
  expect(calls).toEqual(preflight.map(check => check.id));
  expect(receipt.results).toHaveLength(plan.requirements.length);
  for (const requirement of plan.requirements.filter(check => ["web", "print"].includes(check.layer))) {
    expect(receipt.results.find(check => check.checkId === requirement.id)).toMatchObject({ status: "NOT_TESTED", artifacts: [] });
  }
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(false);
});

test("preflight transport exceptions stay errors instead of becoming content failures", async () => {
  const error = new Error("STORAGE_OFFLINE");
  await expect(runProductV4Verification(fixture(), authority, async () => { throw error; })).rejects.toBe(error);
});

for (const persisted of [false, true]) test(`one render per Diktat produces ${persisted ? "persisted" : "raw"} PDF evidence without screenshots`, async () => {
  const plan = fixture(true);
  let renders = 0;
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    const observed = observe(requirement);
    if (requirement.artifactType === "application/pdf") {
      const bytes = Buffer.from(`%PDF-1.7\n${requirement.target}\n%%EOF`);
      const print = await renderProductV4PrintArtifacts({
        renderPdf: async () => { renders++; return bytes; },
        pageCount: async pdf => { expect(pdf).toBe(bytes); return 2; },
      });
      Object.assign(observed, print, { artifacts: print.artifacts.map(artifact => ({ ...artifact, id: `${requirement.id}-${artifact.id}` })) });
    }
    return persisted ? recordProductV4VerificationReport(plan, [observed], authority).results[0] : observed;
  });
  expect(renders).toBe(2);
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(true);
  expect(receipt.results.flatMap(check => check.artifacts).filter(artifact => artifact.mediaType === "image/png")).toHaveLength(0);
  for (const requirement of plan.requirements.filter(check => check.artifactType === "application/pdf")) {
    const source = receipt.results.find(check => check.checkId === requirement.id)!;
    expect(source.artifacts).toHaveLength(1);
    expect(source.pageCount).toBe(2);
  }
});

for (const failure of ["failed-pdf", "missing-pdf", "missing-page-count"] as const) test(`${failure} cannot satisfy final PDF readiness`, async () => {
  const plan = fixture();
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    const result = observe(requirement);
    if (requirement.artifactType === "application/pdf") {
      if (failure === "failed-pdf") result.status = "FAIL";
      if (failure === "missing-pdf") result.artifacts = [];
      if (failure === "missing-page-count") delete result.pageCount;
    }
    return result;
  });
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(false);
});
