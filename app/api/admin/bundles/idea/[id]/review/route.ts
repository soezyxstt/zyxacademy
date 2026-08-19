import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { reviewIdeaBundle } from "@/lib/bundle/staging";

export const runtime = "nodejs";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(4000).optional(),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "teacher")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = reviewSchema.safeParse(await request.json());
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
