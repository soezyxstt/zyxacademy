import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { minutesAgo } from "@/lib/date-utils";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/materials/diktat-renderer-policy";
import { randomUUID } from "node:crypto";

const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
const store = {
  async upload(file: File | Buffer | Uint8Array, _name: string, _mime: string, options?: { key: string }) { const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer()); const key = options!.key; objects.set(key, bytes.slice()); return { key, url: "memory", size: bytes.length }; },
  async download(key: string) { const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes.slice(); },
  async delete(key: string) { objects.delete(key); },
  async exists(key: string) { return objects.has(key); },
  getUrl() { return "memory"; },
  async copy() { throw new Error("unused"); },
};
const checksum = "a".repeat(64);
const runId = "mcp-run-00000000-0000-4000-8000-000000000000";
const importId = `impor-product-${"b".repeat(32)}`;
const articleHash = "c".repeat(64);
const diktatHash = "d".repeat(64);
const bundle = { checksum, manifest: { schemaVersion: "product-bundle.v3", bundleChecksum: checksum }, products: [
  { id: "article", productType: "article", schemaVersion: "article.v3", version: 1, generationHash: articleHash },
  { id: "diktat", productType: "diktat", schemaVersion: "diktat.v3", generationHash: diktatHash, sourceArticleId: "article", sourceArticleVersion: 1, sourceArticleHash: articleHash, title: "Diktat", contentMarkdown: "## Topic\nLearning content." },
] };
const originalProducts = structuredClone(bundle.products);
function useArticleOnly(version: 2 | 3 = 3) {
  const article = version === 2
    ? { id: "article", productType: "article", schemaVersion: "1.0", version: 1, generationHash: articleHash, title: "Artikel", sections: [], blocks: [{ id: "b", orderIndex: 0, blockType: "explanation", content: "Learning content $x^2$." }], visuals: [] }
    : { id: "article", productType: "article", schemaVersion: "article.v3", version: 1, generationHash: articleHash, title: "Artikel", blocks: [], sections: [{ id: "s", title: "Bagian", orderIndex: 0, blocks: [{ id: "b", orderIndex: 0, contentMarkdown: "Learning content $x^2$." }] }], visuals: [] };
  bundle.products.splice(0, bundle.products.length, article as any);
  bundle.manifest.schemaVersion = `product-bundle.v${version}`;
}
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: store }));
mock.module("@/lib/bundle/product-staging", () => ({
  parseStagedProductBundle: async () => bundle,
  getProductBundleImport: async (id: string) => (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, id)))[0],
}));
mock.module("@/lib/compute/pdf-inspection", () => ({ inspectPdfText: async () => ({ pageCount: 1, text: "Learning content" }) }));
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { generateProductDiktatPdfEvidence } = await import("@/lib/compute/product-diktat-inspector");
const { registerLegacyPdfRequest, getLegacyPdfRequestOutcome, rejectLegacyPdfRequest, listProcessingLegacyPdfRequests, reserveLegacyDiktatPdfAttempt, failLegacyDiktatPdfEnqueue, LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES, LEGACY_PDF_REQUEST_TIMEOUT_MINUTES } = await import("@/lib/bundle/product-diktat-queue");
const { selectDiktatPdfStatus } = await import("@/lib/bundle/product-diktat-evidence");
const { evaluateProductBundleQualityPolicy, evaluateProductBundleReviewAndPdfGate } = await import("@/lib/bundle/product-review-gate");
const pdf = new TextEncoder().encode("%PDF-1.7 synthetic parser fixture");
const request = { importId, requestedBy: "admin-1", exactLegacyDraft: { runId, expectedChecksum: checksum }, verifyReadback: true, storageProvider: store };
const queuedRequest = { importId, requestedBy: "admin-1", storageProvider: store, productId: "diktat", expectedRevision: checksum };
async function snapshot() { return (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, importId)))[0]; }
function requestScope(requestId = randomUUID(), expectedRevision = bundle.checksum) { return { requestId, importId, productId: "diktat", expectedRevision, requestedBy: "admin-1" }; }
async function reserve(now?: Date) { const current = await snapshot(); const scope = requestScope(randomUUID(), current.checksum); await registerLegacyPdfRequest(scope, now); return reserveLegacyDiktatPdfAttempt({ snapshot: current, bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId, now }); }
async function status(revision = checksum) {
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  return selectDiktatPdfStatus({ importId, revision, bundle: bundle as any, productId: "diktat", rows, validationReport: {}, verification: null });
}

beforeEach(async () => {
  objects.clear();
  bundle.checksum = checksum;
  bundle.manifest.bundleChecksum = checksum;
  bundle.manifest.schemaVersion = "product-bundle.v3";
  bundle.products.splice(0, bundle.products.length, ...structuredClone(originalProducts));
  await testDb.delete(schema.buktiPdfBundle);
  await testDb.delete(schema.auditMutasi);
  await testDb.delete(schema.imporBundle);
  await testDb.delete(schema.penggunaPeran);
  await testDb.delete(schema.peran);
  await testDb.delete(schema.pengguna);
  await testDb.delete(schema.user);
  await testDb.insert(schema.user).values({ id: "admin-1", name: "Admin", email: "admin@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin-1", role: "admin" });
  await testDb.insert(schema.imporBundle).values({ id: importId, bundleId: "bundle", bundleType: "product", version: 3, status: "draft", checksum, sourceUriOrKey: "source-a", requestedBy: "admin-1", validationReport: {} });
  await testDb.insert(schema.auditMutasi).values({ id: "stage-a", actorId: "admin-1", entityType: "product_bundle", entityId: importId, action: "draft_created", correlationId: runId, afterSnapshot: { checksum } });
});
afterAll(async () => { await client.close(); });

test("restaging during a successful render cannot make old evidence ready", async () => {
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.update(schema.imporBundle).set({ checksum: "e".repeat(64), sourceUriOrKey: "source-b" }).where(eq(schema.imporBundle.id, importId));
    return pdf;
  } })).rejects.toThrow("SNAPSHOT_CONFLICT");
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(rows.some(row => row.status === "ready")).toBe(false);
  expect(objects.size).toBe(0);
});

test("a failed render cannot overwrite evidence after publication or restaging", async () => {
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.update(schema.imporBundle).set({ status: "published" }).where(eq(schema.imporBundle.id, importId));
    throw new Error("RENDERER_UNAVAILABLE");
  } })).rejects.toThrow("SNAPSHOT_CONFLICT");
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(rows.some(row => row.status === "failed" || row.status === "ready")).toBe(false);
});

test("a replaced staging audit rejects old output even if content checksum is unchanged", async () => {
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.insert(schema.auditMutasi).values({ id: "stage-z", actorId: "admin-1", entityType: "product_bundle", entityId: importId, action: "draft_replaced", correlationId: "another-run", afterSnapshot: { checksum }, createdAt: new Date(Date.now() + 1000) });
    return pdf;
  } })).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect((await testDb.select().from(schema.buktiPdfBundle)).some(row => row.status === "ready")).toBe(false);
  expect(objects.size).toBe(0);
});

test("a superseded attempt cannot replace a later attempt on the same draft", async () => {
  let release!: () => void;
  let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const first = generateProductDiktatPdfEvidence({ ...request, renderer: async () => { started(); await wait; return pdf; } });
  await entered;
  const second = await generateProductDiktatPdfEvidence({ ...request, renderer: async () => pdf });
  release();
  await expect(first).rejects.toThrow("SNAPSHOT_CONFLICT");
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(second.status).toBe("ready");
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(second.evidenceId);
  expect(rows[0].status).toBe("ready");
  expect(objects.size).toBe(1);
});

test("inactive or mismatched admin and stale staging audit fail before evidence writes", async () => {
  await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin-1"));
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => pdf })).rejects.toThrow("FORBIDDEN");
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin-1"));
  await expect(generateProductDiktatPdfEvidence({ ...request, exactLegacyDraft: { runId: "wrong", expectedChecksum: checksum }, renderer: async () => pdf })).rejects.toThrow("EXACT_DRAFT_REQUIRED");
  expect(await testDb.select().from(schema.buktiPdfBundle)).toHaveLength(0);
});

test("a storage readback mismatch never produces ready evidence", async () => {
  const corrupt = { ...store, async download(_key: string) { return new Uint8Array([0]); } };
  const result = await generateProductDiktatPdfEvidence({ ...request, storageProvider: corrupt, renderer: async () => pdf });
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(result.status).toBe("failed");
  expect(result.failureCode).toBe("STORAGE_UNAVAILABLE");
  expect(rows[0].status).toBe("failed");
  expect(rows[0].storageKey).toBeNull();
  expect(objects.size).toBe(0);
});

for (const version of [2, 3] as const) test(`Article-only V${version} produces real Article-owned evidence accepted by the unchanged gate`, async () => {
  useArticleOnly(version);
  await testDb.update(schema.imporBundle).set({ version }).where(eq(schema.imporBundle.id, importId));
  const result = await generateProductDiktatPdfEvidence({ ...request, renderer: async html => { expect(html).toContain("Learning content"); expect(html).toContain("katex"); return pdf; } });
  const [row] = await testDb.select().from(schema.buktiPdfBundle);
  expect(result).toMatchObject({ productId: "article", status: "ready", pageCount: 1 });
  expect(row).toMatchObject({ productId: "article", articleVersion: 1, articleHash, diktatHash: articleHash, status: "ready", printProfile: PRODUCT_DIKTAT_PRINT_PROFILE });
  const gate = evaluateProductBundleReviewAndPdfGate({ imporBundleId: importId, hasArticle: true, articleId: "article", contentFingerprint: "", articleVersion: 1, articleGenerationHash: articleHash, pdfEvidenceRows: [{ ...row, storageKey: row.storageKey ?? undefined, pageCount: row.pageCount ?? undefined, failureCode: row.failureCode ?? undefined }] as any });
  expect(gate.pdfEvidenceStatus).toBe("ready");
  expect(gate.selectedPdfEvidence?.id).toBe(result.evidenceId);
  expect(evaluateProductBundleReviewAndPdfGate({ imporBundleId: importId, hasArticle: true, articleId: "article", contentFingerprint: "", articleVersion: 2, articleGenerationHash: articleHash, pdfEvidenceRows: [row] as any }).pdfEvidenceStatus).toBe("stale");
});

test("Article-only pending and failed replacements mask old ready evidence and failed readback", async () => {
  useArticleOnly();
  await testDb.insert(schema.buktiPdfBundle).values({ id: "historical-diktat-fallback", imporBundleId: importId, productId: "article", articleVersion: 1, articleHash, diktatHash, rendererVersion: "legacy", printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, storageKey: "old-diktat.pdf", pageCount: 1, status: "ready" });
  expect(evaluateProductBundleReviewAndPdfGate({ imporBundleId: importId, hasArticle: true, articleId: "article", contentFingerprint: "", articleVersion: 1, articleGenerationHash: articleHash, pdfEvidenceRows: await testDb.select().from(schema.buktiPdfBundle) as any }).selectedPdfEvidence).toBeNull();
  await generateProductDiktatPdfEvidence({ ...request, renderer: async () => pdf });
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = generateProductDiktatPdfEvidence({ ...request, renderer: async () => { entered(); await waiting; return pdf; }, storageProvider: { ...store, async download() { return new Uint8Array([0]); } } });
  await started;
  const evaluate = async () => evaluateProductBundleReviewAndPdfGate({ imporBundleId: importId, hasArticle: true, articleId: "article", contentFingerprint: "", articleVersion: 1, articleGenerationHash: articleHash, pdfEvidenceRows: await testDb.select().from(schema.buktiPdfBundle) as any });
  expect((await evaluate()).pdfEvidenceStatus).toBe("pending");
  release();
  expect((await pending).status).toBe("failed");
  expect((await evaluate()).pdfEvidenceStatus).toBe("failed");
});

test("an earlier Article-only attempt cannot complete or fail a newer ready attempt", async () => {
  useArticleOnly();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const first = generateProductDiktatPdfEvidence({ ...request, renderer: async () => { entered(); await waiting; throw new Error("RENDERER_UNAVAILABLE"); } });
  await started;
  const second = await generateProductDiktatPdfEvidence({ ...request, renderer: async () => pdf });
  release();
  await expect(first).rejects.toThrow("SNAPSHOT_CONFLICT");
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: second.evidenceId, productId: "article", status: "ready" });
});

test("Article-only claims reject stale actor, audit, restage, adoption and superseded writes", async () => {
  useArticleOnly();
  await expect(generateProductDiktatPdfEvidence({ ...request, exactLegacyDraft: { runId: "wrong", expectedChecksum: checksum, articleId: "article" }, renderer: async () => pdf })).rejects.toThrow("EXACT_DRAFT_REQUIRED");
  await expect(generateProductDiktatPdfEvidence({ ...request, exactLegacyDraft: { runId, expectedChecksum: "e".repeat(64), articleId: "article" }, renderer: async () => pdf })).rejects.toThrow("EXACT_DRAFT_REQUIRED");
  await expect(generateProductDiktatPdfEvidence({ ...request, verifyReadback: false, renderer: async () => pdf })).rejects.toThrow("LOCAL_RENDERER_REQUIRED");
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin-1"));
    return pdf;
  } })).rejects.toThrow("FORBIDDEN");
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin-1"));
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.update(schema.imporBundle).set({ checksum: "e".repeat(64) }).where(eq(schema.imporBundle.id, importId));
    return pdf;
  } })).rejects.toThrow("SNAPSHOT_CONFLICT");
  await testDb.update(schema.imporBundle).set({ checksum }).where(eq(schema.imporBundle.id, importId));
  await expect(generateProductDiktatPdfEvidence({ ...request, renderer: async () => {
    await testDb.insert(schema.auditMutasi).values({ id: "stage-adopted", actorId: "admin-1", entityType: "product_bundle", entityId: importId, action: "draft_replaced", correlationId: "new-run", afterSnapshot: { checksum, operation: "run_adoption" }, createdAt: new Date(Date.now() + 1000) });
    throw new Error("RENDERER_UNAVAILABLE");
  } })).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect((await testDb.select().from(schema.buktiPdfBundle)).some(row => row.status === "ready" || row.status === "failed")).toBe(false);
  expect(objects.size).toBe(0);
});


test("queued rendering requires the exact target and revision", async () => {
  const queued = { ...queuedRequest, attemptId: "unreserved" };
  await expect(generateProductDiktatPdfEvidence({ ...queued, expectedRevision: "f".repeat(64), renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  await expect(generateProductDiktatPdfEvidence({ ...queued, productId: "other", renderer: async () => pdf })).rejects.toThrow("SOURCE_MISSING");
  await expect(generateProductDiktatPdfEvidence({ importId, requestedBy: "admin-1", renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  await expect(generateProductDiktatPdfEvidence({ ...queued, renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect(await testDb.select().from(schema.buktiPdfBundle)).toHaveLength(0);
  const { attemptId } = await reserve();
  expect((await generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId, renderer: async () => pdf })).productId).toBe("diktat");
});

test("reservation persists pending evidence before enqueue and deduplicates later readers", async () => {
  await testDb.insert(schema.buktiPdfBundle).values({ id: "old-ready", imporBundleId: importId, productId: "diktat", articleVersion: 1, articleHash, diktatHash, rendererVersion: "old", printProfile: "old", status: "ready", storageKey: "old.pdf", pageCount: 1 });
  await testDb.insert(schema.buktiPdfBundle).values({ id: "current-ready", imporBundleId: importId, productId: "diktat", articleVersion: 1, articleHash, diktatHash, rendererVersion: "old", printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, status: "ready", storageKey: "current.pdf", pageCount: 1 });
  const first = await reserve();
  const reloaded = await status();
  const second = await reserve();
  expect(first.duplicate).toBe(false);
  expect(reloaded).toMatchObject({ status: "pending", evidence: { id: first.attemptId, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE } });
  expect(second).toEqual({ attemptId: first.attemptId, duplicate: true });
  const audit = (await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.id, first.attemptId)))[0];
  expect(audit.afterSnapshot).toMatchObject({ revision: checksum, productId: "diktat" });
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  const gate = evaluateProductBundleReviewAndPdfGate({ imporBundleId: importId, hasArticle: true, articleId: "article", diktatId: "diktat", contentFingerprint: "", articleVersion: 1, articleGenerationHash: articleHash, diktatGenerationHash: diktatHash, pdfEvidenceRows: rows as any });
  expect(gate.pdfEvidenceStatus).toBe("pending");
  expect(gate.selectedPdfEvidence).toBeNull();
});

test("simultaneous reservations of the same snapshot return one attempt", async () => {
  const current = await snapshot();
  const scopes = [requestScope(), requestScope()];
  await Promise.all(scopes.map(scope => registerLegacyPdfRequest(scope)));
  const results = await Promise.all(scopes.map(scope => reserveLegacyDiktatPdfAttempt({ snapshot: current, bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId })));
  expect(results[0].attemptId).toBe(results[1].attemptId);
  expect(results.filter(result => result.duplicate)).toHaveLength(1);
  expect(await testDb.select().from(schema.buktiPdfBundle)).toHaveLength(1);
});

test("request lookup remains unknown until registration and follows the exact delayed acceptance", async () => {
  const scope = requestScope();
  expect(await getLegacyPdfRequestOutcome(scope)).toEqual({ requestId: scope.requestId, outcome: "unknown" });
  expect(await registerLegacyPdfRequest(scope)).toEqual({ requestId: scope.requestId, outcome: "processing" });
  expect(await getLegacyPdfRequestOutcome(scope)).toEqual({ requestId: scope.requestId, outcome: "processing" });
  const accepted = await reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId });
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ requestId: scope.requestId, outcome: "accepted", attemptId: accepted.attemptId });
  expect(await rejectLegacyPdfRequest(scope, "PRODUCT_DIKTAT_NOT_FOUND")).toMatchObject({ outcome: "accepted", attemptId: accepted.attemptId });
  await failLegacyDiktatPdfEnqueue(importId, accepted.attemptId);
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "accepted", attemptId: accepted.attemptId });
  expect(await status()).toMatchObject({ status: "failed", evidence: { id: accepted.attemptId } });
});

test("accepted outcomes attest superseding queued and local evidence without changing history", async () => {
  const scope = requestScope();
  await registerLegacyPdfRequest(scope);
  const accepted = await reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId });
  await failLegacyDiktatPdfEnqueue(importId, accepted.attemptId);
  const next = requestScope();
  await registerLegacyPdfRequest(next);
  const replacement = await reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: next.productId, requestedBy: next.requestedBy, requestId: next.requestId });
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "accepted", attemptId: accepted.attemptId, supersededByAttemptId: replacement.attemptId });
  await testDb.update(schema.buktiPdfBundle).set({ id: "local-operator-replacement" }).where(eq(schema.buktiPdfBundle.id, replacement.attemptId));
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "accepted", attemptId: accepted.attemptId, supersededByAttemptId: "local-operator-replacement" });
  const [audit] = await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.id, `pdf-request-outcome-${scope.requestId}`));
  expect(audit.afterSnapshot).toMatchObject({ outcome: "accepted", attemptId: accepted.attemptId });
  expect(audit.afterSnapshot).not.toHaveProperty("supersededByAttemptId");
});

test("unregistered old revision settles to durable rejection before a late reservation", async () => {
  const scope = requestScope();
  const old = await snapshot();
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "unknown" });
  await testDb.update(schema.imporBundle).set({ checksum: "e".repeat(64) }).where(eq(schema.imporBundle.id, importId));
  expect(await registerLegacyPdfRequest(scope)).toMatchObject({ outcome: "rejected", error: "PRODUCT_BUNDLE_STALE_CONTEXT" });
  await expect(reserveLegacyDiktatPdfAttempt({ snapshot: old, bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "rejected", error: "PRODUCT_BUNDLE_STALE_CONTEXT" });
});

test("same request replays once and rejects another actor, product, revision or import", async () => {
  await testDb.insert(schema.user).values({ id: "admin-2", name: "Other admin", email: "admin2@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin-2", role: "admin" });
  const scope = requestScope();
  const current = await snapshot();
  await registerLegacyPdfRequest(scope);
  const input = { snapshot: current, bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId };
  const results = await Promise.all([reserveLegacyDiktatPdfAttempt(input), reserveLegacyDiktatPdfAttempt(input)]);
  expect(results[0].attemptId).toBe(results[1].attemptId);
  expect(results.filter(result => result.duplicate)).toHaveLength(1);
  for (const mismatch of [{ requestedBy: "admin-2" }, { productId: "other" }, { expectedRevision: "f".repeat(64) }, { importId: "other" }]) {
    await expect(getLegacyPdfRequestOutcome({ ...scope, ...mismatch })).rejects.toThrow("PRODUCT_DIKTAT_REQUEST_CONFLICT");
    await expect(registerLegacyPdfRequest({ ...scope, ...mismatch })).rejects.toThrow("PRODUCT_DIKTAT_REQUEST_CONFLICT");
  }
});

test("a second authorized actor receives an alias for the existing attempt", async () => {
  await testDb.insert(schema.user).values({ id: "admin-2", name: "Other admin", email: "admin2@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin-2", role: "admin" });
  const first = await reserve();
  const scope = { ...requestScope(), requestedBy: "admin-2" };
  await registerLegacyPdfRequest(scope);
  const second = await reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId });
  expect(second).toEqual({ attemptId: first.attemptId, duplicate: true });
  expect(await getLegacyPdfRequestOutcome(scope)).toMatchObject({ outcome: "accepted", attemptId: first.attemptId });
  const attemptAudit = (await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.id, first.attemptId)))[0];
  expect(attemptAudit.actorId).toBe("admin-1");
});

test("concurrent rejection and reservation settle one immutable outcome", async () => {
  const scope = requestScope();
  await registerLegacyPdfRequest(scope);
  const current = await snapshot();
  const [reserved, rejected] = await Promise.allSettled([
    reserveLegacyDiktatPdfAttempt({ snapshot: current, bundle: bundle as any, productId: scope.productId, requestedBy: scope.requestedBy, requestId: scope.requestId }),
    rejectLegacyPdfRequest(scope, "PRODUCT_DIKTAT_NOT_FOUND"),
  ]);
  const outcome = await getLegacyPdfRequestOutcome(scope);
  expect(rejected.status).toBe("fulfilled");
  if (outcome.outcome === "accepted") {
    expect(reserved.status).toBe("fulfilled");
    expect(rejected.status === "fulfilled" && rejected.value).toMatchObject({ outcome: "accepted", attemptId: outcome.attemptId });
  } else {
    expect(outcome).toMatchObject({ outcome: "rejected", error: "PRODUCT_DIKTAT_NOT_FOUND" });
    expect(reserved.status).toBe("rejected");
    expect(await testDb.select().from(schema.buktiPdfBundle)).toHaveLength(0);
  }
});

test("terminal rejection and timeout prevent a late reservation", async () => {
  const missing = { ...requestScope(), importId: "missing-import" };
  expect(await registerLegacyPdfRequest(missing)).toMatchObject({ outcome: "rejected", error: "PRODUCT_BUNDLE_NOT_FOUND" });
  expect(await getLegacyPdfRequestOutcome(missing)).toMatchObject({ outcome: "rejected", error: "PRODUCT_BUNDLE_NOT_FOUND" });
  const rejected = requestScope();
  await registerLegacyPdfRequest(rejected);
  expect(await rejectLegacyPdfRequest(rejected, "PRODUCT_DIKTAT_NOT_FOUND")).toMatchObject({ outcome: "rejected", error: "PRODUCT_DIKTAT_NOT_FOUND" });
  await expect(reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: rejected.productId, requestedBy: rejected.requestedBy, requestId: rejected.requestId })).rejects.toThrow("PRODUCT_DIKTAT_NOT_FOUND");
  const expired = requestScope();
  await registerLegacyPdfRequest(expired, minutesAgo(LEGACY_PDF_REQUEST_TIMEOUT_MINUTES + 1));
  expect(await getLegacyPdfRequestOutcome(expired)).toMatchObject({ outcome: "rejected", error: "PRODUCT_DIKTAT_REQUEST_TIMEOUT" });
  await expect(reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: expired.productId, requestedBy: expired.requestedBy, requestId: expired.requestId })).rejects.toThrow("PRODUCT_DIKTAT_REQUEST_TIMEOUT");
  const unobservedExpiry = requestScope();
  await registerLegacyPdfRequest(unobservedExpiry, minutesAgo(LEGACY_PDF_REQUEST_TIMEOUT_MINUTES + 1));
  await expect(reserveLegacyDiktatPdfAttempt({ snapshot: await snapshot(), bundle: bundle as any, productId: unobservedExpiry.productId, requestedBy: unobservedExpiry.requestedBy, requestId: unobservedExpiry.requestId })).rejects.toThrow("PRODUCT_DIKTAT_REQUEST_TIMEOUT");
  expect(await getLegacyPdfRequestOutcome(unobservedExpiry)).toMatchObject({ outcome: "rejected", error: "PRODUCT_DIKTAT_REQUEST_TIMEOUT" });
  expect(await testDb.select().from(schema.buktiPdfBundle)).toHaveLength(0);
});

test("unresolved registration blocks shared readiness and masks old ready status without evidence", async () => {
  await testDb.insert(schema.buktiPdfBundle).values({ id: "old-ready", imporBundleId: importId, productId: "diktat", articleVersion: 1, articleHash, diktatHash, rendererVersion: "old", printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, status: "ready", storageKey: "old.pdf", pageCount: 1 });
  const rows = await testDb.select().from(schema.buktiPdfBundle);
  expect(selectDiktatPdfStatus({ importId, revision: checksum, bundle: bundle as any, productId: "diktat", rows, validationReport: {}, verification: null }).status).toBe("ready");
  const scope = requestScope();
  await registerLegacyPdfRequest(scope);
  const processing = await listProcessingLegacyPdfRequests({ importId, expectedRevision: checksum });
  expect(processing).toEqual([{ requestId: scope.requestId, productId: scope.productId }]);
  const selected = selectDiktatPdfStatus({ importId, revision: checksum, bundle: bundle as any, productId: "diktat", rows, validationReport: {}, verification: null, requestProcessing: true });
  expect(selected).toMatchObject({ status: "pending", evidence: undefined });
  const quality = await evaluateProductBundleQualityPolicy({ products: [], manifest: bundle.manifest as any }, { imporBundleId: importId, pedagogicReview: null, pdfEvidence: [] });
  expect(quality.publicationReady).toBe(false);
  expect(quality.issues).toContainEqual(expect.objectContaining({ code: "PDF_REQUEST_PROCESSING", severity: "blocking" }));
  await rejectLegacyPdfRequest(scope, "PRODUCT_DIKTAT_NOT_FOUND");
  expect(await listProcessingLegacyPdfRequests({ importId, expectedRevision: checksum })).toEqual([]);
});

test("enqueue failure is recoverable and cannot clobber a replacement or ready attempt", async () => {
  const first = await reserve();
  await failLegacyDiktatPdfEnqueue(importId, first.attemptId);
  expect(await status()).toMatchObject({ status: "failed", evidence: { id: first.attemptId, failureCode: "RENDER_UNAVAILABLE" } });
  const second = await reserve();
  expect(second.attemptId).not.toBe(first.attemptId);
  await failLegacyDiktatPdfEnqueue(importId, first.attemptId);
  expect(await status()).toMatchObject({ status: "pending", evidence: { id: second.attemptId } });
  await generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: second.attemptId, renderer: async () => pdf });
  await failLegacyDiktatPdfEnqueue(importId, second.attemptId);
  expect(await status()).toMatchObject({ status: "ready", evidence: { id: second.attemptId } });
});

test("an attempt with no worker becomes retryable after its fixed deadline", async () => {
  const first = await reserve(minutesAgo(LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES + 1));
  expect(await status()).toMatchObject({ status: "failed", evidence: { id: first.attemptId, failureCode: "RENDER_TIMEOUT" } });
  const second = await reserve();
  expect(second).toMatchObject({ duplicate: false });
  expect(second.attemptId).not.toBe(first.attemptId);
  await expect(generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: first.attemptId, renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect(await status()).toMatchObject({ status: "pending", evidence: { id: second.attemptId } });
});

test("expired attempts expose recovery and cannot render or commit", async () => {
  const first = await reserve();
  let release!: () => void;
  let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const running = generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: first.attemptId, renderer: async () => { started(); await wait; return pdf; } });
  await entered;
  await testDb.update(schema.buktiPdfBundle).set({ createdAt: minutesAgo(LEGACY_PDF_ATTEMPT_TIMEOUT_MINUTES + 1) }).where(eq(schema.buktiPdfBundle.id, first.attemptId));
  expect(await status()).toMatchObject({ status: "failed", evidence: { id: first.attemptId, failureCode: "RENDER_TIMEOUT" } });
  await expect(generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: first.attemptId, renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  release();
  await expect(running).rejects.toThrow("SNAPSHOT_CONFLICT");
  const second = await reserve();
  expect(second.attemptId).not.toBe(first.attemptId);
  expect(await status()).toMatchObject({ status: "pending", evidence: { id: second.attemptId } });
  expect(objects.size).toBe(0);
});

test("a superseded queued worker cannot complete or fail its replacement", async () => {
  const first = await reserve();
  let release!: () => void;
  let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const running = generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: first.attemptId, renderer: async () => { started(); await wait; return pdf; } });
  await entered;
  await failLegacyDiktatPdfEnqueue(importId, first.attemptId);
  const second = await reserve();
  release();
  await expect(running).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect(await status()).toMatchObject({ status: "pending", evidence: { id: second.attemptId } });
  expect(objects.size).toBe(0);
});

test("new revisions do not deduplicate old pending attempts or accept stale workers", async () => {
  const first = await reserve();
  const oldSnapshot = await snapshot();
  const staleRequest = requestScope();
  await registerLegacyPdfRequest(staleRequest);
  const revision = "e".repeat(64);
  await testDb.update(schema.imporBundle).set({ checksum: revision }).where(eq(schema.imporBundle.id, importId));
  bundle.checksum = revision;
  bundle.manifest.bundleChecksum = revision;
  expect((await status(revision)).status).toBe("stale");
  await expect(reserveLegacyDiktatPdfAttempt({ snapshot: oldSnapshot, bundle: { ...bundle, checksum } as any, productId: "diktat", requestedBy: "admin-1", requestId: staleRequest.requestId })).rejects.toThrow("SNAPSHOT_CONFLICT");
  const second = await reserve();
  expect(second).toMatchObject({ duplicate: false });
  expect(second.attemptId).not.toBe(first.attemptId);
  await expect(generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId: first.attemptId, renderer: async () => pdf })).rejects.toThrow("SNAPSHOT_CONFLICT");
  expect(await status(revision)).toMatchObject({ status: "pending", evidence: { id: second.attemptId } });
});

test("worker retries and replays the same ID without replacing its evidence", async () => {
  const { attemptId } = await reserve();
  await expect(generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId, throwOnFailure: true, renderer: async () => { throw new Error("RENDERER_UNAVAILABLE"); } })).rejects.toThrow("RETRYABLE");
  expect(await status()).toMatchObject({ status: "pending", evidence: { id: attemptId } });
  const completed = await generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId, throwOnFailure: true, renderer: async () => pdf });
  expect(completed).toMatchObject({ status: "ready", evidenceId: attemptId });
  const replay = await generateProductDiktatPdfEvidence({ ...queuedRequest, attemptId, renderer: async () => { throw new Error("must not render"); } });
  expect(replay).toMatchObject({ status: "ready", evidenceId: attemptId });
  expect(objects.size).toBe(1);
});
