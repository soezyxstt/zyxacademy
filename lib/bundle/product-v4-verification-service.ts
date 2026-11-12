import { z } from "zod";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { assertProductV4VerificationCurrent } from "./product-v4-verification";
import { createProductV4VerificationService, readProductVerificationObject, type ProductV4VerificationPorts, type ProductV4VerificationCheckpoint } from "./product-v4-verification-core";

export * from "./product-v4-verification-core";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

async function applicationService(execute?: ProductV4VerificationPorts["execute"], enqueue?: ProductV4VerificationPorts["enqueue"]) {
  const [{ db }, { imporBundle }, { and, eq }, { storage }, { inngest }, staged, runtimeBinding, { resolveAuthSecret }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/storage"), import("@/jobs/client"),
    import("./product-staging"), import("@/lib/compute/product-v4-runtime-binding"), import("@/lib/auth-secret"),
  ]);
  return createProductV4VerificationService({
    async load(importId, runId) {
      const row = await staged.getProductBundleImport(importId);
      if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
      if (!row.courseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
      const bundle = await staged.parseStagedProductBundle(importId);
      const binding = await runtimeBinding.buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId });
      const previous = row.validationReport.productV4Verification as { attemptId?: unknown; planHash?: unknown } | undefined;
      return { importId, checksum: row.checksum, sourceUriOrKey: row.sourceUriOrKey, binding,
        verificationAttemptId: typeof previous?.attemptId === "string" ? previous.attemptId : null,
        verificationPlanHash: typeof previous?.planHash === "string" ? previous.planHash : null,
        bundle: { manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies } };
    },
    read: key => readProductVerificationObject(storage, key),
    async write(key, bytes, mediaType) { await storage.upload(bytes, key.split("/").pop()!, mediaType, { key }); },
    enqueue: enqueue ?? (async data => {
      if (process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") return;
      await inngest.send({ id: `product-verification-${data.planHash}-${data.attemptId}`, name: "product.verification.requested", data });
    }),
    async attach(snapshot, planHash, attemptId, expectedAttemptId) {
      const row = await staged.getProductBundleImport(snapshot.importId);
      if (!row || row.checksum !== snapshot.checksum || row.sourceUriOrKey !== snapshot.sourceUriOrKey) return false;
      const current = row.validationReport.productV4Verification as { attemptId?: unknown } | undefined;
      if ((typeof current?.attemptId === "string" ? current.attemptId : null) !== expectedAttemptId) return false;
      const rows = await db.update(imporBundle).set({ validationReport: { ...row.validationReport, productV4Verification: { planHash, runId: snapshot.binding.runId, attemptId } }, updatedAt: new Date() }).where(and(
        eq(imporBundle.id, snapshot.importId), eq(imporBundle.checksum, snapshot.checksum), eq(imporBundle.sourceUriOrKey, snapshot.sourceUriOrKey), eq(imporBundle.validationReport, row.validationReport),
      )).returning({ id: imporBundle.id });
      return rows.length === 1;
    },
    execute: execute ?? (async () => { throw new Error("PRODUCT_V4_COMPUTE_EXECUTOR_REQUIRED"); }),
    authority() {
      if (!process.env.BETTER_AUTH_SECRET) throw new Error("PRODUCT_V4_VERIFICATION_KEY_REQUIRED");
      return { signingKey: resolveAuthSecret(), executorId: "zyx-product-v4-server-runner.v1" };
    },
  });
}

export async function requestProductV4Verification(input: { importId: string; runId: string; expectedPlanHash?: string; retry?: boolean }) {
  return (await applicationService()).request(input);
}
/** Private local operator path; publication and review remain separate operations. */
export async function requestProductV4VerificationLocally(input: { importId: string; runId: string; expectedChecksum: string }) {
  const { assertProductV4LocalTarget, assertProductV4LocalDraft } = await import("@/lib/compute/product-v4-local-operator");
  assertProductV4LocalTarget(process.env);
  z.object({ importId: z.string().min(1), runId: z.string().min(1), expectedChecksum: hash }).strict().parse(input);
  const { getProductBundleImport } = await import("./product-staging");
  const row = await getProductBundleImport(input.importId);
  assertProductV4LocalDraft(row, input);
  const service = await applicationService(undefined, async () => {});
  const selected = await service.current(input.importId, input.runId);
  if (selected.snapshot.checksum !== input.expectedChecksum) throw new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED");
  const current = await service.readiness(input.importId, input.runId);
  assertProductV4VerificationCurrent(selected.plan, current.plan);
  if (current.plan.binding.browserProvider !== "local_playwright") throw new Error("PRODUCT_V4_LOCAL_BROWSER_REQUIRED");
  if (current.state.status === "running") throw new Error("PRODUCT_V4_LOCAL_ATTEMPT_RUNNING");
  if (current.evaluation.ready || (current.jobId && current.state.status === "pending")) return service.request({ importId: input.importId, runId: input.runId, expectedPlanHash: current.plan.planHash });
  return service.request({ importId: input.importId, runId: input.runId, expectedPlanHash: current.plan.planHash, retry: true });
}
export async function getProductV4Verification(input: { importId: string; runId: string; planHash: string }) {
  return (await applicationService()).get(input);
}
export async function failProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string }) {
  return (await applicationService()).fail(input);
}
export async function processProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId?: string }, checkpoint: ProductV4VerificationCheckpoint | undefined, execute: ProductV4VerificationPorts["execute"]) {
  const service = await applicationService(execute);
  checkpoint ??= (_id, operation) => operation();
  const result = await service.process(input, checkpoint);
  if (result.evaluation.ready) {
    await checkpoint("persist-pdf-evidence", async () => {
      const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
      try {
        await persistProductV4PdfEvidence({ snapshot: (await service.current(input.importId, input.runId)).snapshot, plan: result.plan, attemptId: result.attemptId, receipt: result.receipt });
      } catch (error) {
        const fresh = await service.current(input.importId, input.runId);
        if (fresh.plan.planHash === result.plan.planHash && fresh.snapshot.verificationAttemptId === result.attemptId) {
          const { storage } = await import("@/lib/storage");
          const key = buildProductVerificationKey(result.plan.planHash, `state-${result.attemptId}.json`);
          await storage.upload(encode({ attemptId: result.attemptId, status: "failed", receiptKey: `receipt-${result.attemptId}.json`, failureCode: "PRODUCT_V4_PDF_EVIDENCE_PERSIST_FAILED" }), key.split("/").pop()!, "application/json", { key });
        }
        throw error;
      }
    });
  }
  return result;
}
export async function getProductV4VerificationReadiness(importId: string, runId: string) {
  const service = await applicationService();
  return service.readiness(importId, runId);
}
