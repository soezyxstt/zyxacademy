import { expect, mock, test } from "bun:test";
import { zipSync, unzipSync } from "fflate";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { auditMutasi } from "@/db/schema";
import { PRODUCT_V4_VERIFICATION_POLICY } from "@/lib/bundle/product-v4-verification";

const fixture = buildLocalVerificationFixture().bundle;
let bytes = zipSync(Object.fromEntries(fixture.files));
let row = { id: "import", version: 4, status: "draft", bundleType: "product", bundleId: fixture.manifest.bundleId, courseId: "course", checksum: fixture.checksum, sourceUriOrKey: "verified-bundle", validationReport: { valid: true } };
let bindingCalls = 0, writes = 0;
let stagingChecksum = fixture.checksum;
mock.module("@/db", () => ({ db: { select: () => ({ from: (table: unknown) => {
  const query = { where() { return query; }, orderBy() { return query; }, limit: async () => table === auditMutasi
    ? [{ id: "stage", action: "draft_created", correlationId: "run", afterSnapshot: { checksum: stagingChecksum } }]
    : [row] };
  return query;
} }) } }));
mock.module("@/lib/storage", () => ({ storage: { download: async () => bytes, upload: async () => { writes++; } } }));
mock.module("@/jobs/client", () => ({ inngest: { send: async () => {} } }));
mock.module("@/lib/compute/product-v4-runtime-binding", () => ({ buildProductV4RuntimeBinding: async ({ bundle }: { bundle: typeof fixture }) => {
  bindingCalls++;
  expect(bundle.checksum).toBe(fixture.checksum);
  const hash = "a".repeat(64);
  return { importId: "import", courseId: bundle.manifest.courseId, runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: PRODUCT_V4_VERIFICATION_POLICY };
} }));
const { failProductV4VerificationJob } = await import("@/lib/bundle/product-v4-verification-worker");
const { readProductBundleForDiktat } = await import("@/lib/bundle/product-staged-worker");

test("worker rechecks the staged archive before computing a verification binding", async () => {
  const job = { importId: "import", runId: "run", planHash: "a".repeat(64), attemptId: "d9428888-122b-4d72-b3d7-2b54fa040000" };
  await expect(failProductV4VerificationJob({ ...job, runId: "other-run" })).rejects.toThrow("PRODUCT_V4_VERIFICATION_CONFLICT");
  expect(bindingCalls).toBe(0);
  await failProductV4VerificationJob(job);
  expect((await readProductBundleForDiktat("import")).checksum).toBe(fixture.checksum);
  expect(bindingCalls).toBe(1);
  expect(writes).toBe(0);
  row = { ...row, validationReport: { valid: false } };
  await expect(failProductV4VerificationJob(job)).rejects.toThrow("PRODUCT_BUNDLE_ADMISSION_REQUIRED");
  await expect(readProductBundleForDiktat("import")).rejects.toThrow("PRODUCT_BUNDLE_ADMISSION_REQUIRED");
  row = { ...row, validationReport: { valid: true } };
  row = { ...row, checksum: "b".repeat(64) };
  stagingChecksum = row.checksum;
  await expect(failProductV4VerificationJob(job)).rejects.toThrow("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  row = { ...row, checksum: fixture.checksum };
  stagingChecksum = row.checksum;
  const files = unzipSync(bytes);
  files["products.json"] = new TextEncoder().encode("[]");
  bytes = zipSync(files);
  await expect(failProductV4VerificationJob(job)).rejects.toThrow("PRODUCT_BUNDLE_VALIDATION_FAILED");
  expect(bindingCalls).toBe(1);
  expect(writes).toBe(0);
});
