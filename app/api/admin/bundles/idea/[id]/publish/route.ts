import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { publishIdeaBundle } from "@/lib/bundle/publication";

export const runtime = "nodejs";

/**
 * Admin endpoint to trigger publication of an approved Idea Bundle.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: explainBundleError("IDEA_BUNDLE_REVISION_REQUIRED"), code: "IDEA_BUNDLE_REVISION_REQUIRED" }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await publishIdeaBundle({ importId: id, publishedBy: session.user.id, expectedRevision: parsed.data.expectedRevision });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "IDEA_BUNDLE_PUBLISH_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: explainBundleError(code), code }, { status });
  }
}
