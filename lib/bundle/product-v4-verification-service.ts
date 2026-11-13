import { assertProductV4VerificationCurrent } from "./product-v4-verification";
import { createProductV4VerificationService, readProductVerificationObject, type ProductV4VerificationPorts, type ProductV4VerificationCheckpoint } from "./product-v4-verification-core";
import { attachProductV4VerificationSnapshot, currentProductV4VerificationRef, latestProductV4StagingAudit, matchesProductV4StagingSnapshot } from "./product-v4-staging-identity";
export * from "./product-v4-verification-core";
type LocalScope = { importId: string; runId: string; expectedChecksum: string };

export async function createProductV4ApplicationService(execute?: ProductV4VerificationPorts["execute"], enqueue?: ProductV4VerificationPorts["enqueue"], localScope?: LocalScope) {
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
      const binding = await runtimeBinding.buildProductV4RuntimeBinding({ row: { ...row, courseId: row.courseId }, bundle, runId });
      const previous = currentProductV4VerificationRef(row.validationReport, staging.id, runId);
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
      if (process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER === "local_playwright") return;
      await inngest.send({ id: `product-verification-${data.planHash}-${data.attemptId}`, name: "product.verification.requested", data });
    }),
    async attach(snapshot, planHash, attemptId, expectedAttemptId) {
      if (snapshot.binding.runId !== snapshot.stagingRunId) return false;
      return attachProductV4VerificationSnapshot(db, snapshot, planHash, attemptId, expectedAttemptId);
    },
    async persistPdfEvidence(input) {
      const { persistProductV4PdfEvidence } = await import("@/lib/compute/product-v4-pdf-evidence");
      await persistProductV4PdfEvidence(input);
    },
    async hasPdfEvidence({ snapshot, plan, attemptId, receipt }) {
      const checked = await db.transaction(async tx => {
        const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
        const staging = await latestProductV4StagingAudit(tx, snapshot.importId);
        if (!matchesProductV4StagingSnapshot(row, staging, snapshot) || !row || !["draft", "published"].includes(row.status)) return null;
        const ref = currentProductV4VerificationRef(row.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId);
        if (ref?.attemptId !== attemptId || ref.planHash !== plan.planHash || plan.binding.runId !== snapshot.stagingRunId) return null;
        const rows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, snapshot.importId));
        return { row, rows };
      });
      if (!checked) return false;
      const { row, rows } = checked;
      const { resolveProductV4PdfBinding } = await import("./product-pdf-selection");
      const { evaluateProductBundleReviewAndPdfGate } = await import("./product-review-gate");
      const diktats = snapshot.bundle.products.filter(product => product.productType === "diktat");
      if (!diktats.length) return false;
      return diktats.every(diktat => {
        if (diktat.productType !== "diktat") return false;
        const article = snapshot.bundle.products.find(product => product.productType === "article" && product.id === diktat.sourceArticleId);
        if (!article || article.productType !== "article") return false;
        const v4PdfBinding = resolveProductV4PdfBinding({ importId: snapshot.importId, diktatId: diktat.id, validationReport: row.validationReport, verification: { plan, attemptId, stagingAuditId: snapshot.stagingAuditId, receipt, evaluation: { ready: true } } });
        return Boolean(evaluateProductBundleReviewAndPdfGate({
          imporBundleId: snapshot.importId, hasArticle: true, articleId: article.id, diktatId: diktat.id,
          contentFingerprint: "", articleVersion: article.version, articleGenerationHash: article.generationHash,
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

export async function requestProductV4Verification(input: { importId: string; runId: string; expectedPlanHash?: string; retry?: boolean }) {
  return (await createProductV4ApplicationService()).request(input);
}
export async function requestProductV4LocalAttempt(service: Pick<ReturnType<typeof createProductV4VerificationService>, "current" | "readiness" | "request">, input: LocalScope & { retry?: boolean }) {
  const selected = await service.current(input.importId, input.runId);
  if (selected.snapshot.checksum !== input.expectedChecksum) throw new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED");
  const current = await service.readiness(input.importId, input.runId);
  assertProductV4VerificationCurrent(selected.plan, current.plan);
  if (current.plan.binding.browserProvider !== "local_playwright") throw new Error("PRODUCT_V4_LOCAL_BROWSER_REQUIRED");
  if (current.state.status === "running") throw new Error("PRODUCT_V4_LOCAL_ATTEMPT_RUNNING");
  const retry = input.retry === true && !current.evaluation.ready && current.jobId !== null && !["pending", "running"].includes(current.state.status);
  return service.request({ importId: input.importId, runId: input.runId, expectedPlanHash: current.plan.planHash, retry });
}
/** Private local operator path; publication and review remain separate operations. */
export async function requestProductV4VerificationLocally(input: LocalScope & { retry?: boolean }) {
  const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
  assertProductV4LocalTarget(process.env);
  z.object({ importId: z.string().min(1), runId: z.string().min(1), expectedChecksum: hash, retry: z.boolean().optional() }).strict().parse(input);
  const scope = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
  const service = await createProductV4ApplicationService(undefined, async () => {}, scope);
  return requestProductV4LocalAttempt(service, input);
}
export async function getProductV4Verification(input: { importId: string; runId: string; planHash: string }) {
  return (await createProductV4ApplicationService()).get(input);
}
export async function failProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId: string }) {
  return (await createProductV4ApplicationService()).fail(input);
}
export async function processProductV4VerificationJob(input: { importId: string; runId: string; planHash: string; attemptId?: string }, checkpoint: ProductV4VerificationCheckpoint | undefined, execute: ProductV4VerificationPorts["execute"], localScope?: LocalScope) {
  if (localScope) {
    const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
    assertProductV4LocalTarget(process.env);
  }
  const service = await createProductV4ApplicationService(execute, localScope ? async () => {} : undefined, localScope);
  checkpoint ??= (_id, operation) => operation();
  return service.process(input, checkpoint);
}
export async function getProductV4VerificationLocally(input: LocalScope & { planHash: string }) {
  const { assertProductV4LocalTarget } = await import("@/lib/compute/product-v4-local-operator");
  assertProductV4LocalTarget(process.env);
  const scope = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
  return (await createProductV4ApplicationService(undefined, async () => {}, scope)).get({ importId: input.importId, runId: input.runId, planHash: input.planHash });
}
export async function getProductV4VerificationReadiness(importId: string, runId: string) {
  const service = await createProductV4ApplicationService();
  return service.readiness(importId, runId);
}
