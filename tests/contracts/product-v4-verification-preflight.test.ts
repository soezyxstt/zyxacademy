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
  const binding = { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
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

for (const persisted of [false, true]) test(`one PDF render per target satisfies both print checks using ${persisted ? "persisted" : "raw"} page evidence`, async () => {
  const plan = fixture(true);
  const calls: ProductV4VerificationRequirement[] = [];
  let renders = 0;
  const execute = async (requirement: ProductV4VerificationRequirement) => {
    calls.push(requirement);
    const observed = observe(requirement);
    if (requirement.artifactType === "application/pdf") {
      const bytes = Buffer.from(`%PDF-1.7\n${requirement.target}\n%%EOF`);
      const print = await renderProductV4PrintArtifacts({
        renderPdf: async () => { renders++; return bytes; },
        pageCount: async pdf => { expect(pdf).toBe(bytes); return 2; },
        capturePages: async (pdf, pages) => { expect(pdf).toBe(bytes); return pages.map(pageNumber => ({ pageNumber, png })); },
      });
      Object.assign(observed, print, { artifacts: print.artifacts.map(artifact => ({ ...artifact, id: `${requirement.id}-${artifact.id}` })) });
    }
    return persisted ? recordProductV4VerificationReport(plan, [observed], authority).results[0] : observed;
  };
  const receipt = await runProductV4Verification(plan, authority, execute);
  expect(renders).toBe(2);
  expect(calls.filter(check => check.state === "every-page-rendering-and-overflow")).toHaveLength(0);
  expect(receipt.results).toHaveLength(plan.requirements.length);
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(true);
  for (const requirement of plan.requirements.filter(check => check.artifactType === "application/pdf")) {
    const source = receipt.results.find(check => check.checkId === requirement.id)!;
    const pageCheck = plan.requirements.find(check => check.target === requirement.target && check.state === "every-page-rendering-and-overflow")!;
    const pages = receipt.results.find(check => check.checkId === pageCheck.id)!;
    expect(pages.artifacts).toEqual(source.artifacts.filter(artifact => artifact.mediaType === "image/png"));
    expect(pages.pageCount).toBe(2);
  }
  // Reuse belongs to this invocation's exact plan, never another run or runtime binding.
  await runProductV4Verification(plan, authority, execute);
  expect(renders).toBe(4);
});

test("older PDF-only executors still execute the separate page requirement", async () => {
  const plan = fixture();
  const calls: string[] = [];
  const receipt = await runProductV4Verification(plan, authority, async requirement => { calls.push(requirement.state); return observe(requirement); });
  expect(calls).toContain("every-page-rendering-and-overflow");
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(true);
});

for (const failure of ["failed-pdf", "missing-page", "duplicate-page"] as const) test(`${failure} cannot fabricate a successful paired print check`, async () => {
  const plan = fixture();
  let pageChecks = 0;
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    const result = observe(requirement);
    if (requirement.artifactType === "application/pdf") {
      result.pageCount = 2;
      result.artifacts.push({ id: "page-1.png", mediaType: "image/png", bytes: png, pageNumber: 1 });
      if (failure !== "missing-page") result.artifacts.push({ id: "page-2.png", mediaType: "image/png", bytes: png, pageNumber: failure === "duplicate-page" ? 1 : 2 });
      if (failure === "failed-pdf") result.status = "FAIL";
    }
    if (requirement.state === "every-page-rendering-and-overflow") { pageChecks++; result.status = "FAIL"; }
    return result;
  });
  expect(pageChecks).toBe(1);
  expect(evaluateProductV4Verification(plan, [receipt], authority).ready).toBe(false);
});
