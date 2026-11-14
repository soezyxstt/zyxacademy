import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { computeProductV4SectionSemanticHash } from "@/lib/bundle/product-v4-review";
import { getProductV4VerificationReadiness } from "@/lib/bundle/product-v4-verification-service";
import { getProductV4VerificationReceiptSignature } from "@/lib/bundle/product-v4-verification";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { reviewPedagogiBundle, buktiPdfBundle, imporBundle } from "@/db/schema";
import { auth } from "@/lib/auth";
import { previewProducts } from "@/lib/bundle/product-preview";
import { discardProductBundleDraft, getProductBundleImport, listProductBlockReviews, parseStagedProductBundle, productBundleLifecycleStatus, stageProductBundle } from "@/lib/bundle/product-staging";
import { createProductBundleDraft, finalizeProductBundleDraft, type ProductBundleDraft } from "@/lib/bundle/product-draft";
import { isStructuredArticleReaderEnabled } from "@/lib/articles/feature";
import { currentPublisherProductReadiness } from "@/lib/bundle/product-readiness";
import { hasProductBundleDependencyBlock } from "@/lib/bundle/product-validator";
import { QUALITY_POLICY_VERSION, computePedagogyContentFingerprint } from "@/lib/materials/quality-policy";
import { publishedDiktatPreviewBindings, readPublishedDiktatReceipt, selectDiktatPdfStatus } from "@/lib/bundle/product-diktat-evidence";
import { listProcessingLegacyPdfRequests } from "@/lib/bundle/product-diktat-queue";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const row = await getProductBundleImport(id);
    if (!row) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
    const bundle = await parseStagedProductBundle(id);
    if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const blockReviews = await listProductBlockReviews(id, session.user.id);
    const articleBlockCount = bundle.products.reduce((total, product) => total + (product.productType === "article" ? (product.sections.length || product.blocks.length) : 0), 0);
    const approved = blockReviews.filter((review) => review.status === "approved").length;
    const changesRequested = blockReviews.filter((review) => review.status === "changes_requested").length;
    const currentReview = row.reviews.find((review) => review.reviewerId === session.user.id) ?? null;

    const verificationRef = row.validationReport.productV4Verification as { runId?: unknown } | undefined;
    const v4Verification = bundle.manifest.schemaVersion === "product-bundle.v4" && typeof verificationRef?.runId === "string"
      ? await getProductV4VerificationReadiness(id, verificationRef.runId).catch(() => null)
      : null;
    let qualityEvaluation = await currentPublisherProductReadiness(id, session.user.id, { v4Verification });

    let pedagogicReview = null;
    try {
      const [pedagogicReviewRow] = await db
        .select()
        .from(reviewPedagogiBundle)
        .where(and(eq(reviewPedagogiBundle.imporBundleId, id), eq(reviewPedagogiBundle.reviewerId, session.user.id)))
        .orderBy(desc(reviewPedagogiBundle.createdAt))
        .limit(1);

      if (pedagogicReviewRow) {
        pedagogicReview = {
          id: pedagogicReviewRow.id,
          status: pedagogicReviewRow.status,
          policyVersion: pedagogicReviewRow.policyVersion,
          contentFingerprint: pedagogicReviewRow.contentFingerprint,
          criteria: Array.isArray(pedagogicReviewRow.rubric)
            ? pedagogicReviewRow.rubric
            : Array.isArray((pedagogicReviewRow.rubric as any)?.criteria)
              ? (pedagogicReviewRow.rubric as any).criteria
              : [],
          exceptions: Array.isArray(pedagogicReviewRow.exceptions)
            ? pedagogicReviewRow.exceptions
            : Array.isArray((pedagogicReviewRow.exceptions as any)?.exceptions)
              ? (pedagogicReviewRow.exceptions as any).exceptions
              : [],
          notes: pedagogicReviewRow.notes,
          createdAt: pedagogicReviewRow.createdAt,
        };
      }
    } catch {
      // Table may not exist yet in unmigrated environment
    }

    const historicalReceipt = await readPublishedDiktatReceipt(row);
    const { pdfRows, processing, publishedBindings } = await db.transaction(async tx => {
      const [locked] = await tx.select().from(imporBundle).where(eq(imporBundle.id, id)).limit(1).for("update");
      if (!locked || locked.checksum !== row.checksum || locked.sourceUriOrKey !== row.sourceUriOrKey || locked.status !== row.status || locked.version !== row.version || JSON.stringify(locked.validationReport) !== JSON.stringify(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
      const pdfRows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, id));
      const processing = row.version === 2 || row.version === 3 ? await listProcessingLegacyPdfRequests({ importId: id, expectedRevision: row.checksum, connection: tx }) : [];
      const publishedBindings = await publishedDiktatPreviewBindings(tx, locked, bundle, pdfRows, historicalReceipt);
      return { pdfRows, processing, publishedBindings };
    });
    if (processing.length && !qualityEvaluation.issues.some(issue => issue.code === "PDF_REQUEST_PROCESSING")) {
      const issues = [...qualityEvaluation.issues, ...processing.map(request => ({ code: "PDF_REQUEST_PROCESSING", severity: "blocking" as const, target: { targetType: "pdf" as const, targetId: request.productId }, reason: "A PDF request for this revision is still being processed.", remediation: "Recover the request outcome or wait for its deadline before publication." }))];
      qualityEvaluation = { ...qualityEvaluation, pdfEvidenceStatus: "pending", issues, blockingIssueCodes: issues.filter(issue => issue.severity === "blocking").map(issue => issue.code), publicationReady: false };
    }
    const pdfStatuses = bundle.products.filter(product => product.productType === "diktat").map(product => {
      const selected = selectDiktatPdfStatus({ importId: id, revision: row.checksum, bundle, productId: product.id, rows: pdfRows, validationReport: row.validationReport, verification: v4Verification, publishedPreviewBinding: publishedBindings.get(product.id), requestProcessing: processing.some(request => request.productId === product.id) });
      return { productId: selected.productId, revision: selected.revision, status: selected.status, id: selected.evidence?.id, pageCount: selected.evidence?.pageCount ?? null, failureCode: selected.evidence?.failureCode ?? null, createdAt: selected.evidence?.createdAt ?? null };
    });
    if (qualityEvaluation.publicationReady && pdfStatuses.some(status => status.status === "pending")) {
      const issues = [...qualityEvaluation.issues, { code: "PDF_EVIDENCE_PENDING", severity: "blocking" as const, target: { targetType: "pdf" as const, targetId: pdfStatuses.find(status => status.status === "pending")!.productId }, reason: "PDF evidence is being generated.", remediation: "Wait for the attempt to finish before publication." }];
      qualityEvaluation = { ...qualityEvaluation, pdfEvidenceStatus: "pending", issues, blockingIssueCodes: issues.filter(issue => issue.severity === "blocking").map(issue => issue.code), publicationReady: false };
    }
    // The singular field remains available only when the target is unambiguous.
    const pdfStatus = pdfStatuses.length === 1 ? pdfStatuses[0] : { status: pdfStatuses.length ? "select_product" : bundle.products.some(product => product.productType === "article") ? "source_missing" : "not_required" };

    const article = bundle.products.find((p) => p.productType === "article");
    const diktat = bundle.products.find((p) => p.productType === "diktat");
    const currentFingerprint = article
      ? computePedagogyContentFingerprint({
          article: article as unknown as Record<string, unknown>,
          diktat: diktat ? (diktat as unknown as Record<string, unknown>) : undefined,
        })
      : "";

    const isFingerprintMatch = Boolean(
      pedagogicReview && pedagogicReview.contentFingerprint === currentFingerprint,
    );
    const isPolicyMatch = Boolean(
      pedagogicReview && pedagogicReview.policyVersion === QUALITY_POLICY_VERSION,
    );
    const revisionFreshness = {
      currentFingerprint,
      reviewFingerprint: pedagogicReview?.contentFingerprint ?? null,
      isFresh: Boolean(isFingerprintMatch && isPolicyMatch),
      isFingerprintMatch,
      isPolicyMatch,
      policyVersion: QUALITY_POLICY_VERSION,
      completenessState: !pedagogicReview
        ? ("incomplete" as const)
        : !isFingerprintMatch || !isPolicyMatch
          ? ("stale" as const)
          : ("complete" as const),
    };

    let v4ReviewContext = null;
    if (bundle.manifest.schemaVersion === "product-bundle.v4" && article?.productType === "article") {
      const ref = row.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown } | undefined;
      const verification = v4Verification;
      v4ReviewContext = {
        expectedRevision: row.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: currentFingerprint,
        verificationReady: Boolean(verification?.evaluation.ready && ref?.planHash === verification.plan.planHash),
        verificationPlanHash: verification?.plan.planHash ?? null,
        verificationReceiptSignature: getProductV4VerificationReceiptSignature(verification?.receipt),
        sections: article.sections.map((section) => ({ sectionId: section.id, title: section.title, semanticHash: computeProductV4SectionSemanticHash(article, section.id) })),
      };
    }
    const blockingIssues = qualityEvaluation.issues.filter((i) => i.severity === "blocking");

    return NextResponse.json({
      bundle: {
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        courseId: row.courseId,
        status: productBundleLifecycleStatus(row.status),
        validationReport: row.validationReport,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        currentReview: currentReview
          ? { id: currentReview.id, status: currentReview.status, notes: currentReview.notes, reviewedAt: currentReview.reviewedAt }
          : null,
        reviews: row.reviews.map((review) => ({ id: review.id, reviewerId: review.reviewerId, status: review.status, notes: review.notes, reviewedAt: review.reviewedAt })),
      },
      manifest: bundle.manifest,
      publicationBlocked: hasProductBundleDependencyBlock(bundle),
      issues: bundle.issues,
      dependencies: bundle.dependencies,
      blockReviews,
      blockReviewSummary: { total: articleBlockCount, pending: Math.max(0, articleBlockCount - approved - changesRequested), approved, changesRequested },
      previews: previewProducts(bundle.products),
      draft: createProductBundleDraft(bundle),
      structuredReaderEnabled: isStructuredArticleReaderEnabled(),
      qualityEvaluation,
      pedagogicReview,
      pdfStatus,
      pdfStatuses,
      blockingIssues,
      revisionFreshness,
      v4ReviewContext,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_DETAIL_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json() as { draft?: ProductBundleDraft; expectedRevision?: string };
    if (!body.draft) return NextResponse.json({ error: "PRODUCT_BUNDLE_DRAFT_REQUIRED" }, { status: 400 });
    const stored = await getProductBundleImport(id);
    if (!stored) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
    if (body.expectedRevision !== stored.checksum) return NextResponse.json({ error: "PRODUCT_BUNDLE_REVISION_CONFLICT" }, { status: 409 });
    const original = await parseStagedProductBundle(id);
    const finalized = finalizeProductBundleDraft(original, body.draft);
    const bundle = finalized.bundle;
    const result = await stageProductBundle({
      runId: request.headers.get("x-correlation-id") ?? `admin-edit-${Date.now()}`,
      bundleId: bundle.manifest.bundleId,
      courseId: bundle.manifest.courseId,
      checksum: bundle.manifest.bundleChecksum,
      bytes: finalized.bytes,
      requestedBy: session.user.id,
      bundle,
      filename: `${bundle.manifest.schemaVersion.replace(".", "-")}.zip`,
      preserveUnchangedItemReviews: bundle.manifest.schemaVersion !== "product-bundle.v2",
      expectedPreviousChecksum: body.expectedRevision,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_UPDATE_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null) as { expectedRevision?: unknown } | null;
    if (typeof body?.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) return NextResponse.json({ error: "PRODUCT_BUNDLE_REVISION_REQUIRED" }, { status: 400 });
    return NextResponse.json({ result: await discardProductBundleDraft({ importId: id, actorId: session.user.id, expectedRevision: body.expectedRevision }) });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_DISCARD_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
