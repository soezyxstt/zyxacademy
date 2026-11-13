import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createPostgresTestDb } from "../../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { fixture } from "./pdf-verification-receipt";
import { buildProductVerificationKey } from "@/lib/storage/keys";

const input = await fixture();
process.env.BETTER_AUTH_SECRET = input.authority.signingKey;
const { client, testDb: local } = await createPostgresTestDb();
type Tx = Parameters<Parameters<typeof local.transaction>[0]>[0];
let activeTx: Tx | null = null;
let changeReport = false;
let transactions = 0;
await local.insert(schema.user).values({ id: "local-test-author", name: "PDF fixture", email: "pdf-fixture@example.invalid" });
await local.insert(schema.pengguna).values({ id: "local-test-author", status: "active" });
await local.insert(schema.courses).values({ id: "course", title: "PDF fixture", category: "Matematika" });
await local.insert(schema.imporBundle).values({ id: "import", bundleId: input.snapshot.bundle.manifest.bundleId, checksum: input.snapshot.checksum, bundleType: "product", courseId: "course", sourceUriOrKey: input.snapshot.sourceUriOrKey, version: 4, status: "draft", validationReport: {}, requestedBy: "local-test-author" });
await local.insert(schema.auditMutasi).values({ id: "stage-a", entityType: "product_bundle", entityId: "import", action: "draft_created", correlationId: "run", afterSnapshot: { checksum: input.snapshot.checksum } });
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
  parseStagedProductBundle: async () => ({ ...input.snapshot.bundle, checksum: input.snapshot.checksum }),
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
const { executeProductV4VerificationCheck } = await import("@/lib/compute/product-v4-verification-executor");
const processJob = (input: Parameters<typeof service.processProductV4VerificationJob>[0]) => service.processProductV4VerificationJob(input, undefined, executeProductV4VerificationCheck);
const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
const request = () => service.requestProductV4Verification({ importId: "import", runId: "run" });
const first = await request();
const complete = await processJob({ importId: "import", runId: "run", planHash: first.jobId, attemptId: first.attemptId });
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
await assert.rejects(processJob({ importId: "import", runId: "run", planHash: racing.jobId, attemptId: racing.attemptId }), /EVIDENCE_CONFLICT/);
assert.equal((await local.select().from(schema.buktiPdfBundle)).length, 0);
const failed = await service.getProductV4VerificationReadiness("import", "run");
assert.equal(failed.state.status, "failed");
assert.equal(failed.evaluation.ready, false);
changeReport = false;
const retry = await service.requestProductV4Verification({ importId: "import", runId: "run", retry: true });
assert.notEqual(retry.attemptId, racing.attemptId);
const recovered = await processJob({ importId: "import", runId: "run", planHash: retry.jobId, attemptId: retry.attemptId });
assert.equal(recovered.evaluation.ready, true);
assert.equal((await local.select().from(schema.buktiPdfBundle)).length, 1);
await assert.rejects(processJob({ importId: "import", runId: "run", planHash: racing.jobId, attemptId: racing.attemptId }), /ATTEMPT_STALE/);
assert.ok(transactions >= 4);
await client.close();
console.log(JSON.stringify({ status: "PASS", boundaries: ["exact signed PDF artifact reuse", "read-only readiness", "stale attempt blocked", "PostgreSQL report CAS rollback", "explicit retry recovery", "late attempt blocked"], transactions }));
