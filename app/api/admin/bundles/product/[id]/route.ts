import { computeProductV4SectionSemanticHash } from "@/lib/bundle/product-v4-review";
import { getProductV4VerificationReadiness } from "@/lib/bundle/product-v4-verification-service";
import { getProductV4VerificationReceiptSignature } from "@/lib/bundle/product-v4-verification";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { reviewPedagogiBundle, buktiPdfBundle } from "@/db/schema";
import { auth } from "@/lib/auth";
import { previewProducts } from "@/lib/bundle/product-preview";
import { discardProductBundleDraft, getProductBundleImport, listProductBlockReviews, parseStagedProductBundle, productBundleLifecycleStatus, stageProductBundle } from "@/lib/bundle/product-staging";
import { createProductBundleDraft, finalizeProductBundleDraft, type ProductBundleDraft } from "@/lib/bundle/product-draft";
import { isStructuredArticleReaderEnabled } from "@/lib/articles/feature";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import { QUALITY_POLICY_VERSION, computePedagogyContentFingerprint } from "@/lib/materials/quality-policy";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const row = await getProductBundleImport(id);
    if (!row) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
    const bundle = await parseStagedProductBundle(id);
    const blockReviews = await listProductBlockReviews(id, session.user.id);
    const articleBlockCount = bundle.products.reduce((total, product) => total + (product.productType === "article" ? (product.sections.length || product.blocks.length) : 0), 0);
    const approved = blockReviews.filter((review) => review.status === "approved").length;
    const changesRequested = blockReviews.filter((review) => review.status === "changes_requested").length;
    const currentReview = row.reviews.find((review) => review.reviewerId === session.user.id) ?? null;

    const qualityEvaluation = await evaluateProductBundleQualityPolicy({
      products: bundle.products,
      dependencies: bundle.dependencies,
    }, {
      imporBundleId: id,
    });

    let pedagogicReview = null;
    try {
      const [pedagogicReviewRow] = await db
        .select()
        .from(reviewPedagogiBundle)
        .where(eq(reviewPedagogiBundle.imporBundleId, id))
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

    let pdfStatus: { id?: string; status: string; productId?: string; pageCount?: number | null; failureCode?: string | null; createdAt?: Date | null; message?: string } = {
      status: "pending",
      message: "Belum ada bukti PDF",
    };
    try {
      const [pdfEvidenceRow] = await db
        .select()
        .from(buktiPdfBundle)
        .where(eq(buktiPdfBundle.imporBundleId, id))
        .orderBy(desc(buktiPdfBundle.createdAt))
        .limit(1);

      if (pdfEvidenceRow) {
        pdfStatus = {
          id: pdfEvidenceRow.id,
          status: pdfEvidenceRow.status,
          productId: pdfEvidenceRow.productId,
          pageCount: pdfEvidenceRow.pageCount,
          failureCode: pdfEvidenceRow.failureCode,
          createdAt: pdfEvidenceRow.createdAt,
        };
      }
    } catch {
      // Table may not exist yet in unmigrated environment
    }

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
      const verification = typeof ref?.runId === "string" ? await getProductV4VerificationReadiness(id, ref.runId).catch(() => null) : null;
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
      publicationBlocked: bundle.publicationBlocked,
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
      blockingIssues,
      revisionFreshness,
      v4ReviewContext,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_DETAIL_FAILED";
    const status = code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      filename: bundle.manifest.schemaVersion === "product-bundle.v3" ? "product-bundle-v3.zip" : "product-bundle-v2.zip",
      preserveUnchangedItemReviews: bundle.manifest.schemaVersion === "product-bundle.v3",
    });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_UPDATE_FAILED";
    const status = code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    return NextResponse.json({ result: await discardProductBundleDraft({ importId: id, actorId: session.user.id }) });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_DISCARD_FAILED";
    const status = code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
