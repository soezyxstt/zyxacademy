import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { fixture } from "./pdf-verification-receipt";
import { buildProductVerificationKey } from "@/lib/storage/keys";

const input = await fixture();
process.env.BETTER_AUTH_SECRET = input.authority.signingKey;
const client = createClient({ url: "file::memory:?cache=shared" });
const local = drizzle(client, { schema });
type Tx = Parameters<Parameters<typeof local.transaction>[0]>[0];
let activeTx: Tx | null = null;
let changeReport = false;
let transactions = 0;
await client.executeMultiple(`
CREATE TABLE impor_bundle (id TEXT PRIMARY KEY, bundle_id TEXT NOT NULL, checksum TEXT NOT NULL, bundle_type TEXT NOT NULL, course_id TEXT, source_uri_or_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 4, status TEXT NOT NULL DEFAULT 'draft', validation_report TEXT NOT NULL DEFAULT '{}', requested_by TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE bukti_pdf_bundle (id TEXT PRIMARY KEY, impor_bundle_id TEXT NOT NULL REFERENCES impor_bundle(id), product_id TEXT NOT NULL, article_version INTEGER NOT NULL CHECK(article_version > 0), article_hash TEXT NOT NULL, diktat_hash TEXT NOT NULL, renderer_version TEXT NOT NULL, print_profile TEXT NOT NULL, storage_key TEXT, page_count INTEGER CHECK(page_count IS NULL OR page_count BETWEEN 1 AND 4), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','stale')), failure_code TEXT, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, UNIQUE(impor_bundle_id,product_id,diktat_hash,print_profile));
`);
await local.insert(schema.imporBundle).values({ id: "import", bundleId: input.snapshot.bundle.manifest.bundleId, checksum: input.snapshot.checksum, bundleType: "product", courseId: "course", sourceUriOrKey: input.snapshot.sourceUriOrKey, version: 4, status: "draft", validationReport: {}, requestedBy: "local-test-author" });
const objects = new Map<string, Uint8Array>();
mock.module("@/db", () => ({ db: new Proxy(local, { get(target, property) {
  if (property === "transaction") return async (callback: (tx: Tx) => Promise<unknown>) => local.transaction(async (tx) => { transactions++; activeTx = tx; try { return await callback(tx); } finally { activeTx = null; } });
  return Reflect.get(target, property, target);
} }) }));
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key), download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("MISSING_LOCAL_OBJECT"); return bytes; },
  upload: async (bytes: Uint8Array, _filename: string, _type: string, options: { key: string }) => { objects.set(options.key, new Uint8Array(bytes)); return { key: options.key, url: "local-only", size: bytes.length }; },
} }));
mock.module("@/jobs/client", () => ({ inngest: { send: async () => ({ ids: [] }) } }));
mock.module("@/lib/bundle/product-staging", () => ({
  getProductBundleImport: async (id: string) => (await local.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, id)))[0],
  parseStagedProductBundle: async () => input.snapshot.bundle,
}));
mock.module("@/lib/compute/product-v4-verification-executor", () => ({
  buildProductV4RuntimeBinding: async () => input.snapshot.binding,
  executeProductV4VerificationCheck: async ({ requirement }: { requirement: { id: string } }) => input.checks.find((check) => check.checkId === requirement.id)!,
}));
mock.module("@/lib/compute/product-v4-runtime-binding", () => ({ buildProductV4RuntimeBinding: async () => {
  if (changeReport && activeTx) {
    const [row] = await activeTx.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "import"));
    await activeTx.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, changedDuringClaim: true } }).where(eq(schema.imporBundle.id, "import"));
  }
  return input.snapshot.binding;
} }));
const service = await import("@/lib/bundle/product-v4-verification-service");
const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
const request = () => service.requestProductV4Verification({ importId: "import", runId: "run" });
const first = await request();
const complete = await service.processProductV4VerificationJob({ importId: "import", runId: "run", planHash: first.jobId, attemptId: first.attemptId });
assert.equal(complete.evaluation.ready, true);
const [pdf] = await local.select().from(schema.buktiPdfBundle);
const signedPdf = complete.receipt.results.flatMap((check: { artifacts: { id: string; mediaType: string }[] }) => check.artifacts).find((artifact: { mediaType: string }) => artifact.mediaType === "application/pdf")!;
assert.equal(pdf.storageKey, buildProductVerificationKey(complete.plan.planHash, signedPdf.id));
assert.equal(pdf.pageCount, 1);
assert.equal(pdf.status, "ready");
const writes = objects.size;
await service.getProductV4VerificationReadiness("import", "run");
assert.equal(objects.size, writes);

await local.delete(schema.buktiPdfBundle);
await local.update(schema.imporBundle).set({ validationReport: { productV4Verification: { planHash: complete.plan.planHash, attemptId: "00000000-0000-4000-8000-000000000099", runId: "run" } } }).where(eq(schema.imporBundle.id, "import"));
await assert.rejects(persistProductV4PdfEvidence({ snapshot: { ...input.snapshot, verificationAttemptId: complete.attemptId, verificationPlanHash: complete.plan.planHash }, plan: complete.plan, attemptId: complete.attemptId, receipt: complete.receipt }), /EVIDENCE_CONFLICT/);
assert.equal((await local.select().from(schema.buktiPdfBundle)).length, 0);

await local.update(schema.imporBundle).set({ validationReport: {} }).where(eq(schema.imporBundle.id, "import"));
const racing = await request();
changeReport = true;
await assert.rejects(service.processProductV4VerificationJob({ importId: "import", runId: "run", planHash: racing.jobId, attemptId: racing.attemptId }), /EVIDENCE_CONFLICT/);
assert.equal((await local.select().from(schema.buktiPdfBundle)).length, 0);
const failed = await service.getProductV4VerificationReadiness("import", "run");
assert.equal(failed.state.status, "failed");
assert.equal(failed.evaluation.ready, false);
changeReport = false;
const retry = await service.requestProductV4Verification({ importId: "import", runId: "run", retry: true });
assert.notEqual(retry.attemptId, racing.attemptId);
const recovered = await service.processProductV4VerificationJob({ importId: "import", runId: "run", planHash: retry.jobId, attemptId: retry.attemptId });
assert.equal(recovered.evaluation.ready, true);
assert.equal((await local.select().from(schema.buktiPdfBundle)).length, 1);
await assert.rejects(service.processProductV4VerificationJob({ importId: "import", runId: "run", planHash: racing.jobId, attemptId: racing.attemptId }), /ATTEMPT_STALE/);
assert.ok(transactions >= 4);
client.close();
console.log(JSON.stringify({ status: "PASS", boundaries: ["exact signed PDF artifact reuse", "read-only readiness", "stale attempt blocked", "SQLite report CAS rollback", "explicit retry recovery", "late attempt blocked"], transactions }));
