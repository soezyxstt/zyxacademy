import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stageProductBundle, listProductBundleImports, productBundleLifecycleStatus } from "@/lib/bundle/product-staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { previewProducts } from "@/lib/bundle/product-preview";
import { createProductBundleDraft, finalizeProductBundleDraft, type ProductBundleDraft } from "@/lib/bundle/product-draft";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

function errorResponse(error: unknown, fallback = "PRODUCT_BUNDLE_REQUEST_FAILED") {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : fallback;
  const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
  return NextResponse.json({ error: code }, { status });
}

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  if (process.env.FEATURE_PRODUCT_BUNDLE_V2 !== "1") return NextResponse.json({ error: "PRODUCT_BUNDLE_V2_DISABLED" }, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { id: session.user.id };
}

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  try {
    const rows = await listProductBundleImports();
    return NextResponse.json({
      imports: rows.map((row) => ({
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        bundleType: row.bundleType,
        courseId: row.courseId,
        version: row.version,
        status: productBundleLifecycleStatus(row.status),
        validationReport: row.validationReport,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    return errorResponse(error, "PRODUCT_BUNDLE_LIST_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "PRODUCT_BUNDLE_FILE_REQUIRED" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "PRODUCT_BUNDLE_FILE_LIMIT" }, { status: 413 });
    const uploadedBytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateProductBundle(uploadedBytes);
    if (!validation.success) return NextResponse.json({ error: "PRODUCT_BUNDLE_VALIDATION_FAILED", reasonCodes: validation.issues.map((issue) => issue.code), issues: validation.issues }, { status: 422 });
    const intent = form.get("intent");
    if (intent !== "stage") {
      const counts = Object.fromEntries(validation.data.products.reduce((entries, product) => entries.set(product.productType, (entries.get(product.productType) ?? 0) + 1), new Map<string, number>()));
      return NextResponse.json({
        persisted: false,
        filename: file.name,
        manifest: validation.data.manifest,
        summary: { total: validation.data.products.length, counts, dependencyCount: validation.data.dependencies.length },
        previews: previewProducts(validation.data.products),
        dependencies: validation.data.dependencies,
        draft: createProductBundleDraft(validation.data),
      });
    }
    const draftValue = form.get("draft");
    if (typeof draftValue !== "string" || draftValue.length > 12 * 1024 * 1024) return NextResponse.json({ error: "PRODUCT_BUNDLE_DRAFT_REQUIRED" }, { status: 400 });
    const finalized = finalizeProductBundleDraft(validation.data, JSON.parse(draftValue) as ProductBundleDraft);
    const bundle = finalized.bundle;
    const result = await stageProductBundle({
      runId: request.headers.get("x-correlation-id") ?? `api-${Date.now()}`,
      bundleId: bundle.manifest.bundleId,
      courseId: bundle.manifest.courseId,
      checksum: bundle.manifest.bundleChecksum,
      bytes: finalized.bytes,
      requestedBy: actor.id,
      bundle,
      filename: file.name || "product-bundle-v2.zip",
    });
    return NextResponse.json({ result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
