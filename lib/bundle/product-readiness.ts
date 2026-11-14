import { eq } from "drizzle-orm";
import { db } from "@/db";
import { buktiPdfBundle, imporBundle } from "@/db/schema";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import { getProductBundleImport, listProductItemReviews } from "./product-staging";
import { evaluateProductBundleQualityPolicy, productSectionReviewState } from "./product-review-gate";
import { listProcessingLegacyPdfRequests } from "./product-diktat-queue";
import type { getProductV4VerificationReadiness } from "./product-v4-verification-service";
import type { validateProductBundle } from "./product-validator";
import { latestProductV4StagingAudit } from "./product-v4-staging-identity";
import { deterministicProductSerialization } from "./product-validator";

export async function publisherProductReviewReadiness(row: NonNullable<Awaited<ReturnType<typeof getProductBundleImport>>>, bundle: Extract<ReturnType<typeof validateProductBundle>, { success: true }>["data"], publisherId: string) {
  const reviewApproved = row.reviews.some(review => review.reviewerId === publisherId && review.status === "approved");
  const requiredSections = bundle.products.flatMap(product => product.productType === "article" ? product.sections.map(section => ({ productId: product.id, sectionId: section.id })) : []);
  const decisions = requiredSections.length ? await listProductItemReviews(row.id, publisherId) : [];
  const state = productSectionReviewState({ requiredSections, reviewerId: publisherId, reviews: decisions });
  const missingSectionTargets = [...new Map([...state.missing, ...state.changesRequested].map(section => [JSON.stringify([section.productId, section.sectionId]), section])).values()];
  const missingSections = missingSectionTargets.map(section => requiredSections.filter(target => target.sectionId === section.sectionId).length === 1 ? section.sectionId : `${section.productId}/${section.sectionId}`);
  return { reviewApproved, missingSections, missingSectionTargets };
}

export async function currentPublisherProductReadiness(importId: string, publisherId: string, options: { v4Verification?: Awaited<ReturnType<typeof getProductV4VerificationReadiness>> | null } = {}) {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const { parseStagedProductBundle } = await import("@/lib/bundle/product-staging");
  const bundle = await parseStagedProductBundle(importId);
  if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  let verification = options.v4Verification;
  if (row.version === 4 && verification === undefined) {
    const ref = row.validationReport.productV4Verification as { runId?: string } | undefined;
    verification = ref?.runId ? await (await import("./product-v4-verification-service")).getProductV4VerificationReadiness(importId, ref.runId).catch(() => null) : null;
  }
  if (row.version === 4 && verification) {
    const ref = row.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown; attemptId?: unknown; stagingAuditId?: unknown } | undefined;
    if (ref?.runId !== verification.plan.binding.runId || ref.planHash !== verification.plan.planHash || ref.stagingAuditId !== verification.stagingAuditId || !("attemptId" in verification) || ref.attemptId !== verification.attemptId) verification = null;
  }
  const legacyPdf = row.version === 2 || row.version === 3 ? await db.transaction(async tx => {
    const [locked] = await tx.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    if (!locked || locked.checksum !== row.checksum || locked.sourceUriOrKey !== row.sourceUriOrKey || locked.version !== row.version || locked.status !== row.status || JSON.stringify(locked.validationReport) !== JSON.stringify(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const pdfEvidence = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, importId));
    const pendingPdfRequests = await listProcessingLegacyPdfRequests({ importId, expectedRevision: row.checksum, connection: tx });
    return { pdfEvidence: pdfEvidence as unknown as PdfArtifactEvidence[], pendingPdfRequests };
  }) : {};
  const quality = await evaluateProductBundleQualityPolicy({ bundle }, { imporBundleId: importId, publisherId, v4Verification: verification ?? null, ...legacyPdf });
  const publisher = await publisherProductReviewReadiness(row, bundle, publisherId);
  const issues = [...quality.issues];
  if (row.version === 4) {
    try {
      const ref = row.validationReport.productV4Verification as { runId?: string; planHash?: string } | undefined;
      if (!ref?.runId) throw new Error("PRODUCT_V4_VERIFICATION_REQUIRED");
      if (!verification || ref.planHash !== verification.plan.planHash) throw new Error("PRODUCT_V4_VERIFICATION_REQUIRED");
      await (await import("@/lib/bundle/product-publication")).assertCurrentProductV4Review({ importId, publisherId, checksum: row.checksum, fingerprint: quality.contentFingerprint, products: bundle.products, verification });
    } catch { issues.push({ code: "PRODUCT_V4_REVIEW_VERIFICATION_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: importId }, reason: "The current review is not bound to the current verification receipt.", remediation: "Review the exact revision again using the current plan and receipt." }); }
  }
  if (row.version !== 5) {
    if (!publisher.reviewApproved) issues.push({ code: "PRODUCT_BUNDLE_REVIEW_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: importId }, reason: "The current publisher must approve this bundle revision.", remediation: "Review the exact current revision before publication." });
    if (publisher.missingSections.length) issues.push({ code: "PRODUCT_BUNDLE_SECTION_REVIEW_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: importId }, reason: "The current publisher has outstanding section decisions.", remediation: "Review all current article sections." });
    try { await (await import("@/lib/bundle/product-publication")).assertLiveProductBundleDependencies({ courseId: bundle.manifest.courseId, products: bundle.products, dependencies: bundle.dependencies }); }
    catch { issues.push({ code: "PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW", severity: "blocking", target: { targetType: "document", targetId: importId }, reason: "Current source or Idea dependencies require review.", remediation: "Refresh dependency context before publication." }); }
  }
  if (row.version === 4) await db.transaction(async tx => {
    const [locked] = await tx.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    if (!locked || locked.checksum !== row.checksum || locked.sourceUriOrKey !== row.sourceUriOrKey || locked.version !== row.version || locked.status !== row.status || deterministicProductSerialization(locked.validationReport) !== deterministicProductSerialization(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    if (verification) {
      const staging = await latestProductV4StagingAudit(tx, importId);
      if (staging?.id !== verification.stagingAuditId || staging.correlationId !== verification.plan.binding.runId || staging.afterSnapshot?.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    }
  });
  return { ...quality, ...publisher, ...(!bundle.products.some(product => product.productType === "article") && row.version !== 5 ? { reviewStatus: publisher.reviewApproved ? "approved" : "missing" } : {}), ...(issues.some(issue => issue.code === "PDF_REQUEST_PROCESSING" || issue.code === "PDF_EVIDENCE_PENDING") ? { pdfEvidenceStatus: "pending" as const } : {}), evaluatedAt: new Date().toISOString(), issues, blockingIssueCodes: issues.filter(issue => issue.severity === "blocking").map(issue => issue.code), publicationReady: quality.publicationReady && !issues.some(issue => issue.severity === "blocking") };
}

