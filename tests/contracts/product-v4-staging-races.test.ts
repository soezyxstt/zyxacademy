import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/bundle/product-diktat-pdf";
import { PRODUCT_V4_VERIFICATION_POLICY, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";

const { client, testDb } = await createPostgresTestDb();
const fixture = buildLocalVerificationFixture();
const parsed = validateProductBundle(fixture.bytes);
if (!parsed.success) throw new Error("FIXTURE_INVALID");
const bundle = parsed.data;
const actorId = bundle.manifest.curatorId!;
const importId = "v4-staging-race";
const runA = "mcp-run-11111111-1111-4111-8111-111111111111";
const runB = "mcp-run-22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
const objects = new Map<string, Uint8Array>();
let beforeStateWrite: (() => Promise<void>) | undefined;
let beforePdfRead: (() => Promise<void>) | undefined;
let browserProvider: "local_playwright" | "cloudflare" = "cloudflare";
let enqueued = 0;
const previousSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = "test-only-verification-secret-at-least-32-bytes";

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: {
  upload: async (bytes: Uint8Array, _filename: string, _type: string, options: { key: string }) => {
    objects.set(options.key, new Uint8Array(bytes));
    if (options.key.includes("/state-") && beforeStateWrite) { const hook = beforeStateWrite; beforeStateWrite = undefined; await hook(); }
    return { key: options.key, url: "local", size: bytes.length };
  },
  download: async (key: string) => {
    if (key.endsWith(".pdf") && beforePdfRead) { const hook = beforePdfRead; beforePdfRead = undefined; await hook(); }
    const bytes = objects.get(key);
    if (!bytes) throw new Error("FIXTURE_OBJECT_MISSING");
    return bytes;
  },
} }));
mock.module("@/jobs/client", () => ({ inngest: { send: async () => { enqueued++; } } }));
mock.module("@/lib/compute/product-v4-runtime-binding", () => ({ buildProductV4RuntimeBinding: async ({ row, runId }: { row: { id: string }; runId: string }) => ({
  importId: row.id, courseId: bundle.manifest.courseId, runId, revision: 1,
  rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash,
  printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, policyRevision: PRODUCT_V4_VERIFICATION_POLICY, browserProvider,
}) }));

const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { adoptProductDraftRun } = await import("@/lib/bundle/product-staging");
const { createProductV4ApplicationService, requestProductV4LocalAttempt } = await import("@/lib/bundle/product-v4-verification-service");
const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
afterAll(async () => { if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret; await client.close(); });

async function seed() {
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  await testDb.delete(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, importId));
  objects.clear(); beforeStateWrite = undefined; beforePdfRead = undefined; enqueued = 0;
  await testDb.insert(schema.user).values({ id: actorId, name: "Fixture admin", email: "v4-race@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: actorId, role: "admin" });
  await testDb.insert(schema.courses).values({ id: bundle.manifest.courseId, title: "Fixture", category: "Math" });
  await testDb.insert(schema.imporBundle).values({ id: importId, bundleId: bundle.manifest.bundleId, checksum: bundle.checksum, bundleType: "product", courseId: bundle.manifest.courseId, sourceUriOrKey: "fixture.zip", version: 4, status: "draft", validationReport: {}, requestedBy: actorId });
  await testDb.insert(schema.auditMutasi).values({ id: "stage-a", entityType: "product_bundle", entityId: importId, action: "draft_created", correlationId: runA, afterSnapshot: { checksum: bundle.checksum } });
  objects.set("fixture.zip", fixture.bytes);
}
const row = async () => (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, importId)))[0];
const adopt = () => adoptProductDraftRun({ importId, actorId, expectedRevision: bundle.checksum, expectedStagingRunId: runA, runId: runB, expectedCourseId: bundle.manifest.courseId, expectedSourceUriOrKey: "fixture.zip", expectedVersion: 4 });
const execute = async ({ requirement }: { requirement: ProductV4VerificationRequirement }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const bytes = requirement.artifactType === "application/pdf" ? Buffer.from("%PDF-1.7\n%%EOF") : requirement.artifactType === "image/png" ? png : Buffer.from("{}");
  return { checkId: requirement.id, status: "PASS" as const, expected: "Expected fixture", observed: "Observed fixture", artifacts: [{ id: "fixture", mediaType: requirement.artifactType, bytes, ...(requirement.layer === "print" && requirement.artifactType === "image/png" ? { pageNumber: 1 } : {}) }], ...(requirement.layer === "print" ? { pageCount: 1 } : {}) };
};
const scope = (runId: string) => ({ importId, runId, expectedChecksum: bundle.checksum });

for (const mode of ["local", "hosted"] as const) test(`${mode} request cannot attach after adoption and the adopted run can start`, async () => {
  await seed();
  browserProvider = mode === "local" ? "local_playwright" : "cloudflare";
  const serviceA = await createProductV4ApplicationService(execute, mode === "local" ? async () => {} : async () => { enqueued++; }, mode === "local" ? scope(runA) : undefined);
  beforeStateWrite = async () => { await adopt(); };
  const requestA = mode === "local" ? requestProductV4LocalAttempt(serviceA, scope(runA)) : serviceA.request({ importId, runId: runA });
  await expect(requestA).rejects.toThrow("PRODUCT_V4_VERIFICATION_CONFLICT");
  expect((await row()).validationReport.productV4Verification).toBeUndefined();
  expect(enqueued).toBe(0);
  const serviceB = await createProductV4ApplicationService(execute, mode === "local" ? async () => {} : async () => { enqueued++; }, mode === "local" ? scope(runB) : undefined);
  const requested = mode === "local" ? await requestProductV4LocalAttempt(serviceB, scope(runB)) : await serviceB.request({ importId, runId: runB });
  expect(requested.state.status).toBe("pending");
  expect((await row()).validationReport.productV4Verification).toMatchObject({ runId: runB, stagingAuditId: requested.stagingAuditId, attemptId: requested.attemptId });
  expect(enqueued).toBe(mode === "hosted" ? 1 : 0);
}, 30000);

test("an unchanged run and checksum cannot reuse an earlier audit or an unbound legacy reference", async () => {
  await seed(); browserProvider = "cloudflare";
  const service = await createProductV4ApplicationService(execute, async () => {});
  const pending = await service.request({ importId, runId: runA });
  const complete = await service.process({ importId, runId: runA, planHash: pending.plan.planHash, attemptId: pending.attemptId });
  expect(complete.evaluation.ready).toBe(true);
  const current = await row();
  const ref = current.validationReport.productV4Verification as Record<string, unknown>;
  const { stagingAuditId: _oldIdentity, ...legacyRef } = ref;
  await testDb.update(schema.imporBundle).set({ validationReport: { ...current.validationReport, productV4Verification: legacyRef } }).where(eq(schema.imporBundle.id, importId));
  expect((await service.readiness(importId, runA)).evaluation.ready).toBe(false);
  await testDb.update(schema.imporBundle).set({ validationReport: current.validationReport }).where(eq(schema.imporBundle.id, importId));
  await testDb.insert(schema.auditMutasi).values({ id: "stage-new-same-run", entityType: "product_bundle", entityId: importId, action: "draft_replaced", correlationId: runA, afterSnapshot: { checksum: bundle.checksum }, createdAt: new Date("2050-01-01T00:00:00Z") });
  expect((await service.readiness(importId, runA)).evaluation.ready).toBe(false);
  const next = await service.request({ importId, runId: runA });
  expect(next.attemptId).not.toBe(complete.attemptId);
  expect(next.stagingAuditId).toBe("stage-new-same-run");
}, 30000);

test("adoption before finalization makes the worker stale and old references cannot satisfy readiness", async () => {
  await seed(); browserProvider = "cloudflare";
  const service = await createProductV4ApplicationService(execute);
  const pending = await service.request({ importId, runId: runA });
  const oldRef = (await row()).validationReport.productV4Verification;
  await expect(service.process({ importId, runId: runA, planHash: pending.plan.planHash, attemptId: pending.attemptId }, async (id, operation) => {
    if (id === "finalize-verification") await adopt();
    return operation();
  })).rejects.toThrow("PRODUCT_V4_VERIFICATION_CONFLICT");
  expect((await testDb.select().from(schema.buktiPdfBundle).where(eq(schema.buktiPdfBundle.imporBundleId, importId))).length).toBe(0);
  const adopted = await row();
  await testDb.update(schema.imporBundle).set({ validationReport: { ...adopted.validationReport, productV4Verification: oldRef } }).where(eq(schema.imporBundle.id, importId));
  expect((await service.readiness(importId, runB)).evaluation.ready).toBe(false);
  await expect(service.readiness(importId, runA)).rejects.toThrow("PRODUCT_V4_VERIFICATION_CONFLICT");
  expect((await service.request({ importId, runId: runB })).state.status).toBe("pending");
}, 30000);

test("PDF attachment rejects adoption after artifact read, while a current run completes and reads back", async () => {
  await seed(); browserProvider = "cloudflare";
  const service = await createProductV4ApplicationService(execute);
  const pending = await service.request({ importId, runId: runA });
  const complete = await service.process({ importId, runId: runA, planHash: pending.plan.planHash, attemptId: pending.attemptId });
  expect(complete.evaluation.ready).toBe(true);
  expect((await service.readiness(importId, runA)).evaluation.ready).toBe(true);
  const { snapshot } = await service.current(importId, runA);
  beforePdfRead = async () => { await adopt(); };
  await expect(persistProductV4PdfEvidence({ snapshot, plan: complete.plan, attemptId: complete.attemptId, receipt: complete.receipt })).rejects.toThrow("PRODUCT_V4_PDF_EVIDENCE_CONFLICT");
  const evidence = await testDb.select().from(schema.buktiPdfBundle).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence.every(item => item.status === "stale")).toBe(true);
  expect((await service.readiness(importId, runB)).evaluation.ready).toBe(false);
}, 30000);
