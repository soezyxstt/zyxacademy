import { db } from "@/db";
import { imporBundle } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { inngest } from "@/jobs/client";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { buildProductV4RuntimeBinding } from "@/lib/compute/product-v4-runtime-binding";
import { persistProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence-shared";
import { parseAdmittedProductBundle } from "./product-staged-worker";
import { createProductV4VerificationService, readProductVerificationObject, type ProductV4VerificationPorts, type ProductV4VerificationCheckpoint } from "./product-v4-verification-core";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

function applicationService(execute?: ProductV4VerificationPorts["execute"]) {
  const getRow = async (importId: string) => {
    const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
    return row?.bundleType === "product" ? row : null;
  };
  return createProductV4VerificationService({
    async load(importId, runId) {
      const row = await getRow(importId);
      if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
      if (row.validationReport.valid !== true) throw new Error("PRODUCT_BUNDLE_ADMISSION_REQUIRED");
      if (!row.courseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
      if (!storage.download) throw new Error("PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE");
      const bundle = parseAdmittedProductBundle(await storage.download(row.sourceUriOrKey), row);
      const binding = await buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId });
      const previous = row.validationReport.productV4Verification as { attemptId?: unknown; planHash?: unknown } | undefined;
      return { importId, checksum: row.checksum, sourceUriOrKey: row.sourceUriOrKey, binding,
        verificationAttemptId: typeof previous?.attemptId === "string" ? previous.attemptId : null,
        verificationPlanHash: typeof previous?.planHash === "string" ? previous.planHash : null,
        bundle: { manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies } };
    },
    read: key => readProductVerificationObject(storage, key),
    async write(key, bytes, mediaType) { await storage.upload(bytes, key.split("/").pop()!, mediaType, { key }); },
    async enqueue(data) {
      if (process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") return;
      await inngest.send({ id: `product-verification-${data.planHash}-${data.attemptId}`, name: "product.verification.requested", data });
    },
    async attach(snapshot, planHash, attemptId, expectedAttemptId) {
      const row = await getRow(snapshot.importId);
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

export async function failProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string }) {
  return applicationService().fail(input);
}

export async function processProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId?: string }, checkpoint: ProductV4VerificationCheckpoint | undefined, execute: ProductV4VerificationPorts["execute"]) {
  const service = applicationService(execute);
  checkpoint ??= (_id, operation) => operation();
  const result = await service.process(input, checkpoint);
  if (result.evaluation.ready) {
    await checkpoint("persist-pdf-evidence", async () => {
      try {
        await persistProductV4PdfEvidence({ snapshot: (await service.current(input.importId, input.runId)).snapshot, plan: result.plan, attemptId: result.attemptId, receipt: result.receipt }, buildProductV4RuntimeBinding);
      } catch (error) {
        const fresh = await service.current(input.importId, input.runId);
        if (fresh.plan.planHash === result.plan.planHash && fresh.snapshot.verificationAttemptId === result.attemptId) {
          const key = buildProductVerificationKey(result.plan.planHash, `state-${result.attemptId}.json`);
          await storage.upload(encode({ attemptId: result.attemptId, status: "failed", receiptKey: `receipt-${result.attemptId}.json`, failureCode: "PRODUCT_V4_PDF_EVIDENCE_PERSIST_FAILED" }), key.split("/").pop()!, "application/json", { key });
        }
        throw error;
      }
    });
  }
  return result;
}
