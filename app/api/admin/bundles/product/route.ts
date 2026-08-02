import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stageProductBundle, listProductBundleImports } from "@/lib/bundle/product-staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";

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
        status: row.status,
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateProductBundle(bytes);
    if (!validation.success) return NextResponse.json({ error: "PRODUCT_BUNDLE_VALIDATION_FAILED", reasonCodes: validation.issues.map((issue) => issue.code), issues: validation.issues }, { status: 422 });
    const bundle = validation.data;
    const result = await stageProductBundle({
      runId: request.headers.get("x-correlation-id") ?? `api-${Date.now()}`,
      bundleId: bundle.manifest.bundleId,
      courseId: bundle.manifest.courseId,
      checksum: bundle.manifest.bundleChecksum,
      bytes,
      requestedBy: actor.id,
      bundle,
      filename: file.name || "product-bundle-v2.zip",
    });
    return NextResponse.json({ result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
