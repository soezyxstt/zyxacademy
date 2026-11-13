import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withdrawProductBundle } from "@/lib/bundle/product-publication";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) return NextResponse.json({ error: "PRODUCT_BUNDLE_STALE_CONTEXT" }, { status: 409 });
    return NextResponse.json({ result: await withdrawProductBundle({ importId: id, withdrawnBy: session.user.id, expectedRevision: body.expectedRevision }) });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_WITHDRAW_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : code.includes("STALE") ? 409 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
