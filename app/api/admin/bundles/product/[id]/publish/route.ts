import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { publishProductBundle } from "@/lib/bundle/product-publication";

export const runtime = "nodejs";

/**
 * Admin endpoint to trigger publication of an approved Product Bundle draft.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const result = await publishProductBundle({ importId: id, publishedBy: session.user.id });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_PUBLISH_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: explainBundleError(code), code }, { status });
  }
}
