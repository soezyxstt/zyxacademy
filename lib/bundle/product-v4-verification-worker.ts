import { attachProductV4VerificationSnapshot, latestProductV4StagingAudit, currentProductV4VerificationRef, matchesProductV4StagingSnapshot } from "./product-v4-staging-identity";
import { buktiPdfBundle } from "@/db/schema";
import { resolveProductV4PdfBinding, selectProductPdfEvidence } from "./product-pdf-selection";
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
      const staging = await latestProductV4StagingAudit(db, importId);
      if (row.version !== 4 || !staging || staging.correlationId !== runId || staging.afterSnapshot?.checksum !== row.checksum) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      const bundle = parseAdmittedProductBundle(await storage.download(row.sourceUriOrKey), row);
      const binding = await buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId });
      const previous = currentProductV4VerificationRef(row.validationReport, staging.id, runId);
      return { importId, checksum: row.checksum, sourceUriOrKey: row.sourceUriOrKey, binding, stagingAuditId: staging.id, stagingRunId: runId, importState: { bundleType: row.bundleType, bundleId: row.bundleId, courseId: row.courseId, version: row.version, status: row.status, validationReport: row.validationReport }, pdfEvidenceAttachment: row.validationReport.productV4PdfEvidence,
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
      return attachProductV4VerificationSnapshot(db, snapshot, planHash, attemptId, expectedAttemptId);
    },
    async persistPdfEvidence(input) { await persistProductV4PdfEvidence(input, buildProductV4RuntimeBinding); },
    async hasPdfEvidence({ snapshot, plan, attemptId, receipt }) {
      return db.transaction(async tx => {
        const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
        const staging = await latestProductV4StagingAudit(tx, snapshot.importId);
        if (!row || !matchesProductV4StagingSnapshot(row, staging, snapshot)) return false;
        const ref = currentProductV4VerificationRef(row.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId);
        if (ref?.attemptId !== attemptId || ref.planHash !== plan.planHash) return false;
        const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, snapshot.importId));
        const targets = snapshot.bundle.products.filter(product => product.productType === "diktat");
        return targets.length > 0 && targets.every(diktat => {
          if (diktat.productType !== "diktat") return false;
          const article = snapshot.bundle.products.find(product => product.productType === "article" && product.id === diktat.sourceArticleId);
          if (!article || article.productType !== "article") return false;
          const v4Binding = resolveProductV4PdfBinding({ importId: snapshot.importId, diktatId: diktat.id, validationReport: row.validationReport, verification: { plan, attemptId, receipt, stagingAuditId: snapshot.stagingAuditId, evaluation: { ready: true } } });
          const selected = selectProductPdfEvidence({ rows, imporBundleId: snapshot.importId, articleId: article.id, diktatId: diktat.id, articleVersion: article.version, articleHash: article.generationHash, diktatHash: diktat.generationHash, v4Binding });
          return !!selected && selected.status === "ready" && !!v4Binding && selected.storageKey === v4Binding.storageKey && selected.pageCount === v4Binding.pageCount;
        });
      });
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
  return service.process(input, checkpoint);
}
