import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { withdrawIdeaBundle } from "@/lib/bundle/publication";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await assertAdmin();
    if (!(await hasAuthoringActor(user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    return NextResponse.json({ result: await withdrawIdeaBundle({ importId: id, withdrawnBy: user.id }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IDEA_BUNDLE_WITHDRAW_FAILED";
    const code = message === "Unauthorized" ? "Unauthorized" : message.startsWith("Forbidden") ? "Forbidden" : message.split(":", 1)[0];
    const status = code === "Unauthorized" ? 401 : code === "Forbidden" || code.endsWith("FORBIDDEN") ? 403 : code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
