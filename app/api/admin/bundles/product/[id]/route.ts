import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewProducts } from "@/lib/bundle/product-preview";
import { discardProductBundleDraft, getProductBundleImport, parseStagedProductBundle, productBundleLifecycleStatus, stageProductBundle } from "@/lib/bundle/product-staging";
import { createProductBundleDraft, finalizeProductBundleDraft, type ProductBundleDraft } from "@/lib/bundle/product-draft";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const row = await getProductBundleImport(id);
    if (!row) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
    const bundle = await parseStagedProductBundle(id);
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
        reviews: row.reviews.map((review) => ({ id: review.id, reviewerId: review.reviewerId, status: review.status, notes: review.notes, reviewedAt: review.reviewedAt })),
      },
      manifest: bundle.manifest,
      publicationBlocked: bundle.publicationBlocked,
      issues: bundle.issues,
      dependencies: bundle.dependencies,
      previews: previewProducts(bundle.products),
      draft: createProductBundleDraft(bundle),
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
    const body = await request.json() as { draft?: ProductBundleDraft };
    if (!body.draft) return NextResponse.json({ error: "PRODUCT_BUNDLE_DRAFT_REQUIRED" }, { status: 400 });
    const stored = await getProductBundleImport(id);
    if (!stored) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
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
      filename: "product-bundle-v2.zip",
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
