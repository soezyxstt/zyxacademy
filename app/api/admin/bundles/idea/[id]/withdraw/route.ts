import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { withdrawIdeaBundle } from "@/lib/bundle/publication";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await assertAdmin();
    if (!(await hasAuthoringActor(user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    const raw = await request.text();
    let payload: unknown;
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { return NextResponse.json({ error: "IDEA_BUNDLE_REVISION_REQUIRED" }, { status: 400 }); }
    }
    const parsed = raw ? z.object({
      expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
      expectedCourseId: z.string().min(1).max(256).optional(),
    }).strict().safeParse(payload) : undefined;
    if (parsed && !parsed.success) return NextResponse.json({ error: "IDEA_BUNDLE_REVISION_REQUIRED" }, { status: 400 });
    return NextResponse.json({ result: await withdrawIdeaBundle({ importId: id, withdrawnBy: user.id, ...parsed?.data }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IDEA_BUNDLE_WITHDRAW_FAILED";
    const code = message === "Unauthorized" ? "Unauthorized" : message.startsWith("Forbidden") ? "Forbidden" : message.split(":", 1)[0];
    const status = code === "Unauthorized" ? 401 : code === "Forbidden" || code.endsWith("FORBIDDEN") ? 403 : code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : code === "IDEA_BUNDLE_STALE_CONTEXT" ? 409 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
