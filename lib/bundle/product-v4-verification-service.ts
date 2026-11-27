import { z } from "zod";
import { assertProductV4VerificationCurrent, type ProductV4VerificationPurpose } from "./product-v4-verification";
import { createProductV4VerificationService, readProductVerificationObject, type ProductV4VerificationPorts, type ProductV4VerificationCheckpoint } from "./product-v4-verification-core";
import { attachProductV4VerificationSnapshot, currentProductV4VerificationRef, latestProductV4StagingAudit, matchesProductV4StagingSnapshot } from "./product-v4-staging-identity";
export * from "./product-v4-verification-core";
type LocalScope = { importId: string; runId: string; expectedChecksum: string };

export async function createProductV4ApplicationService(execute?: ProductV4VerificationPorts["execute"], enqueue?: ProductV4VerificationPorts["enqueue"], localScope?: LocalScope, purpose: ProductV4VerificationPurpose = "logic") {
  if (!["logic", "pdf"].includes(purpose) || (localScope && purpose !== "pdf")) throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
  const [{ db }, { imporBundle, buktiPdfBundle }, { eq }, { storage }, { inngest }, staged, runtimeBinding, { resolveAuthSecret }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/storage"), import("@/jobs/client"),
    import("./product-staging"), import("@/lib/compute/product-v4-runtime-binding"), import("@/lib/auth-secret"),
  ]);
  return createProductV4VerificationService({
    async load(importId, runId) {
      const row = await staged.getProductBundleImport(importId);
      if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
      const staging = await latestProductV4StagingAudit(db, importId);
      if (row.version !== 4 || !["draft", "published"].includes(row.status) || !staging || staging.correlationId !== runId || staging.afterSnapshot?.checksum !== row.checksum) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      if (localScope) {
        const { assertProductV4LocalDraft } = await import("@/lib/compute/product-v4-local-operator");
        if (importId !== localScope.importId || runId !== localScope.runId) throw new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED");
        assertProductV4LocalDraft(row, localScope, staging);
      }
      const bundle = await staged.parseStagedProductBundle(importId);
      if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
      if (!row.courseId) throw new Error("PRODUCT_V4_COURSE_MISMATCH");
      const binding = await runtimeBinding.buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId, purpose });
      const previous = currentProductV4VerificationRef(row.validationReport, staging.id, runId, purpose);
      return { importId, checksum: row.checksum, sourceUriOrKey: row.sourceUriOrKey, stagingAuditId: staging.id, stagingRunId: runId,
        importState: { bundleType: row.bundleType, bundleId: row.bundleId, courseId: row.courseId, version: row.version, status: row.status, validationReport: row.validationReport }, binding,
        verificationAttemptId: typeof previous?.attemptId === "string" ? previous.attemptId : null,
        verificationPlanHash: typeof previous?.planHash === "string" ? previous.planHash : null,
        pdfEvidenceAttachment: row.validationReport.productV4PdfEvidence,
        bundle: { manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies } };
    },
    read: key => readProductVerificationObject(storage, key),
    async write(key, bytes, mediaType) { await storage.upload(bytes, key.split("/").pop()!, mediaType, { key }); },
    enqueue: enqueue ?? (async data => {
      if ((data.purpose ?? "logic") !== purpose) throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
      if (purpose === "pdf" && process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") return;
      await inngest.send({ id: `product-verification-${data.planHash}-${data.attemptId}`, name: "product.verification.requested", data: { ...data, purpose } });
    }),
    async attach(snapshot, planHash, attemptId, expectedAttemptId) {
      if (snapshot.binding.runId !== snapshot.stagingRunId) return false;
      return attachProductV4VerificationSnapshot(db, snapshot, planHash, attemptId, expectedAttemptId, purpose);
    },
    async persistPdfEvidence(input) {
      const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
      await persistProductV4PdfEvidence(input);
    },
    async hasPdfEvidence({ snapshot, plan, attemptId, receipt }) {
      if (purpose !== "pdf" || plan.binding.purpose !== "pdf") return false;
      const checked = await db.transaction(async tx => {
        const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
        const staging = await latestProductV4StagingAudit(tx, snapshot.importId);
        if (!matchesProductV4StagingSnapshot(row, staging, snapshot, "pdf") || !row || !["draft", "published"].includes(row.status)) return null;
        const ref = currentProductV4VerificationRef(row.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId, "pdf");
        if (ref?.attemptId !== attemptId || ref.planHash !== plan.planHash || plan.binding.runId !== snapshot.stagingRunId) return null;
        const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, snapshot.importId));
        return { row, rows };
      });
      if (!checked) return false;
      const { row, rows } = checked;
      const { diktatPdfLineage, resolveProductV4PdfBinding } = await import("./product-pdf-selection");
      const { evaluateProductBundleReviewAndPdfGate } = await import("./product-review-gate");
      const diktats = snapshot.bundle.products.filter(product => product.productType === "diktat");
      return diktats.every(diktat => {
        if (diktat.productType !== "diktat") return false;
        const v4PdfBinding = resolveProductV4PdfBinding({ importId: snapshot.importId, diktatId: diktat.id, validationReport: row.validationReport, verification: { plan, attemptId, stagingAuditId: snapshot.stagingAuditId, receipt, evaluation: { ready: true } } });
        const lineage = diktatPdfLineage(diktat);
        return Boolean(evaluateProductBundleReviewAndPdfGate({
          imporBundleId: snapshot.importId, hasArticle: Boolean(diktat.sourceArticleId),
          requiresPedagogicReview: true, requiresPdf: true,
          articleId: lineage.articleId, diktatId: diktat.id, contentFingerprint: "",
          articleVersion: lineage.articleVersion, articleGenerationHash: lineage.articleHash,
          diktatGenerationHash: diktat.generationHash, v4PdfBinding,
          pdfEvidenceRows: rows as unknown as import("@/lib/materials/pdf-artifact-contract").PdfArtifactEvidence[],
        }).selectedPdfEvidence);
      });
    },
    execute: execute ?? (async () => { throw new Error("PRODUCT_V4_COMPUTE_EXECUTOR_REQUIRED"); }),
    authority() {
      if (!process.env.BETTER_AUTH_SECRET) throw new Error("PRODUCT_V4_VERIFICATION_KEY_REQUIRED");
      return { signingKey: resolveAuthSecret(), executorId: "zyx-product-v4-server-runner.v1" };
    },
  });
}

export async function requestProductV4Verification(input: { importId: string; runId: string; expectedPlanHash?: string; retry?: boolean; purpose?: ProductV4VerificationPurpose }) {
  const { assertProductV4ExecutionTarget } = await import("@/lib/compute/product-v4-execution");
  const purpose = input.purpose ?? "logic";
  assertProductV4ExecutionTarget(purpose);
  return (await createProductV4ApplicationService(undefined, undefined, undefined, purpose)).request(input);
}
export async function requestProductV4LocalAttempt(service: Pick<ReturnType<typeof createProductV4VerificationService>, "current" | "readiness" | "request">, input: LocalScope & { retry?: boolean }) {
  const selected = await service.current(input.importId, input.runId);
  if (selected.snapshot.checksum !== input.expectedChecksum) throw new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED");
  const current = await service.readiness(input.importId, input.runId);
  assertProductV4VerificationCurrent(selected.plan, current.plan);
  if (current.plan.binding.purpose !== "pdf" || current.plan.binding.browserProvider !== "local_playwright") throw new Error("PRODUCT_V4_LOCAL_BROWSER_REQUIRED");
  if (current.state.status === "running") throw new Error("PRODUCT_V4_LOCAL_ATTEMPT_RUNNING");
  const retry = input.retry === true && !current.evaluation.ready && current.jobId !== null && !["pending", "running"].includes(current.state.status);
  return service.request({ importId: input.importId, runId: input.runId, expectedPlanHash: current.plan.planHash, retry, purpose: "pdf" });
}
/** Private local operator path; publication and review remain separate operations. */
export async function requestProductV4VerificationLocally(input: LocalScope & { retry?: boolean }) {
  const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
  assertProductV4LocalTarget(process.env);
  z.object({ importId: z.string().min(1), runId: z.string().min(1), expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/), retry: z.boolean().optional() }).strict().parse(input);
  const scope = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
  const service = await createProductV4ApplicationService(undefined, async () => {}, scope, "pdf");
  return requestProductV4LocalAttempt(service, input);
}
export async function getProductV4Verification(input: { importId: string; runId: string; planHash: string; purpose?: ProductV4VerificationPurpose }) {
  return (await createProductV4ApplicationService(undefined, undefined, undefined, input.purpose ?? "logic")).get(input);
}
export async function failProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string; purpose?: ProductV4VerificationPurpose }) {
  return (await createProductV4ApplicationService(undefined, undefined, undefined, input.purpose ?? "logic")).fail(input);
}
/** Private maintenance path, called only after exact queued-delivery cancellation. */
export async function cancelProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string; purpose?: ProductV4VerificationPurpose }) {
  return (await createProductV4ApplicationService(undefined, undefined, undefined, input.purpose ?? "logic")).cancel(input);
}
export async function processProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId?: string; purpose?: ProductV4VerificationPurpose }, checkpoint: ProductV4VerificationCheckpoint | undefined, execute: ProductV4VerificationPorts["execute"], localScope?: LocalScope) {
  if (localScope) {
    if (input.purpose && input.purpose !== "pdf") throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
    const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
    assertProductV4LocalTarget(process.env);
  }
  const service = await createProductV4ApplicationService(execute, localScope ? async () => {} : undefined, localScope, localScope ? "pdf" : input.purpose ?? "logic");
  checkpoint ??= (_id, operation) => operation();
  return service.process({ ...input, purpose: localScope ? "pdf" : input.purpose ?? "logic" }, checkpoint);
}
export async function getProductV4VerificationLocally(input: LocalScope & { planHash: string }) {
  const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
  assertProductV4LocalTarget(process.env);
  const scope = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
  return (await createProductV4ApplicationService(undefined, async () => {}, scope, "pdf")).get({ importId: input.importId, runId: input.runId, planHash: input.planHash, purpose: "pdf" });
}
export async function getProductV4VerificationReadiness(importId: string, runId: string, purpose: ProductV4VerificationPurpose = "logic") {
  const service = await createProductV4ApplicationService(undefined, undefined, undefined, purpose);
  return service.readiness(importId, runId);
}
