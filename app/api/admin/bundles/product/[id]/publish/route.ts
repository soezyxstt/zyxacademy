import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { publishProductBundle } from "@/lib/bundle/product-publication";

export const runtime = "nodejs";

/**
 * Admin endpoint to trigger publication of an approved Product Bundle draft.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null) as { expectedRevision?: unknown } | null;
    const expectedRevision = typeof body?.expectedRevision === "string" ? body.expectedRevision : "";
    const result = await publishProductBundle({ importId: id, publishedBy: session.user.id, expectedRevision });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_PUBLISH_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : code.includes("STALE") || code.includes("CONFLICT") ? 409 : 422;
    return NextResponse.json({ error: explainBundleError(code), code }, { status });
  }
}
