import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewProducts } from "@/lib/bundle/product-preview";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_PRODUCT_BUNDLE_V2 !== "1") return NextResponse.json({ error: "PRODUCT_BUNDLE_V2_DISABLED" }, { status: 404 });
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
        status: row.status,
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
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_DETAIL_FAILED";
    const status = code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
