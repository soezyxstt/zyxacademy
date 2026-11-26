import { attachProductV4VerificationSnapshot, latestProductV4StagingAudit, currentProductV4VerificationRef, matchesProductV4StagingSnapshot } from "./product-v4-staging-identity";
import { buktiPdfBundle } from "@/db/schema";
import { diktatPdfLineage, resolveProductV4PdfBinding, selectProductPdfEvidence } from "./product-pdf-selection";
import { db } from "@/db";
import { imporBundle } from "@/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { inngest } from "@/jobs/client";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { buildProductV4RuntimeBinding } from "@/lib/compute/product-v4-runtime-binding";
import { persistProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence-shared";
import { parseAdmittedProductBundle } from "./product-staged-worker";
import { createProductV4VerificationService, readProductVerificationObject, type ProductV4VerificationPorts, type ProductV4VerificationCheckpoint } from "./product-v4-verification-core";
import type { ProductV4VerificationPurpose } from "./product-v4-verification";


function applicationService(execute?: ProductV4VerificationPorts["execute"], purpose: ProductV4VerificationPurpose = "logic") {
  if (!["logic", "pdf"].includes(purpose)) throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
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
      const binding = await buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId, purpose });
      const previous = currentProductV4VerificationRef(row.validationReport, staging.id, runId, purpose);
      return { importId, checksum: row.checksum, sourceUriOrKey: row.sourceUriOrKey, binding, stagingAuditId: staging.id, stagingRunId: runId, importState: { bundleType: row.bundleType, bundleId: row.bundleId, courseId: row.courseId, version: row.version, status: row.status, validationReport: row.validationReport }, pdfEvidenceAttachment: row.validationReport.productV4PdfEvidence,
        verificationAttemptId: typeof previous?.attemptId === "string" ? previous.attemptId : null,
        verificationPlanHash: typeof previous?.planHash === "string" ? previous.planHash : null,
        bundle: { manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies } };
    },
    read: key => readProductVerificationObject(storage, key),
    async write(key, bytes, mediaType) { await storage.upload(bytes, key.split("/").pop()!, mediaType, { key }); },
    async enqueue(data) {
      if ((data.purpose ?? "logic") !== purpose) throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
      if (purpose === "pdf" && process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") return;
      await inngest.send({ id: `product-verification-${data.planHash}-${data.attemptId}`, name: "product.verification.requested", data: { ...data, purpose } });
    },
    async attach(snapshot, planHash, attemptId, expectedAttemptId) {
      return attachProductV4VerificationSnapshot(db, snapshot, planHash, attemptId, expectedAttemptId, purpose);
    },
    async persistPdfEvidence(input) { await persistProductV4PdfEvidence(input, buildProductV4RuntimeBinding); },
    async hasPdfEvidence({ snapshot, plan, attemptId, receipt }) {
      if (purpose !== "pdf" || plan.binding.purpose !== "pdf") return false;
      return db.transaction(async tx => {
        const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
        const staging = await latestProductV4StagingAudit(tx, snapshot.importId);
        if (!row || !matchesProductV4StagingSnapshot(row, staging, snapshot, "pdf")) return false;
        const ref = currentProductV4VerificationRef(row.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId, "pdf");
        if (ref?.attemptId !== attemptId || ref.planHash !== plan.planHash) return false;
        const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, snapshot.importId));
        const targets = snapshot.bundle.products.filter(product => product.productType === "diktat");
        return targets.every(diktat => {
          if (diktat.productType !== "diktat") return false;
          const v4Binding = resolveProductV4PdfBinding({ importId: snapshot.importId, diktatId: diktat.id, validationReport: row.validationReport, verification: { plan, attemptId, receipt, stagingAuditId: snapshot.stagingAuditId, evaluation: { ready: true } } });
          const lineage = diktatPdfLineage(diktat);
          const selected = selectProductPdfEvidence({ rows: rows.map(({ failureCode: _failureCode, ...row }) => ({ ...row, storageKey: row.storageKey ?? undefined, pageCount: row.pageCount ?? undefined })), imporBundleId: snapshot.importId, ...lineage, diktatId: diktat.id, diktatHash: diktat.generationHash, v4Binding });
          return !!selected && selected.status === "ready" && !!v4Binding && selected.storageKey === v4Binding.storageKey && selected.pageCount === v4Binding.pageCount && selected.articleVersion === lineage.articleVersion && selected.articleHash === lineage.articleHash && selected.diktatHash === diktat.generationHash;
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

export async function failProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string; purpose?: ProductV4VerificationPurpose }) {
  return applicationService(undefined, input.purpose ?? "logic").fail(input);
}

export async function processProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId?: string; purpose?: ProductV4VerificationPurpose }, checkpoint: ProductV4VerificationCheckpoint | undefined, execute: ProductV4VerificationPorts["execute"]) {
  const service = applicationService(execute, input.purpose ?? "logic");
  checkpoint ??= (_id, operation) => operation();
  return service.process({ ...input, purpose: input.purpose ?? "logic" }, checkpoint);
}
