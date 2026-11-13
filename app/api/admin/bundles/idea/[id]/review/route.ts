import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

import { reviewIdeaBundle } from "@/lib/bundle/staging";

export const runtime = "nodejs";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(4000).optional(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin", "tutor"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "IDEA_BUNDLE_REVIEW_INVALID", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await reviewIdeaBundle({ importId: id, reviewerId: session.user.id, ...parsed.data });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "IDEA_BUNDLE_REVIEW_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
