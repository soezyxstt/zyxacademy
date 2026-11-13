import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeSolutionReviewRequest, solutionReviewRequestSchema } from "@/lib/authoring/solution-review-request";
import { getSolutionCollectionReviewContext, reviewSolutionCollection } from "@/lib/solutions/review";

export const runtime = "nodejs";

function failure(error: unknown) {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_V5_REVIEW_FAILED";
  const status = code.endsWith("FORBIDDEN") ? 403 : code.includes("STALE") ? 409 : 422;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const expectedRevision = new URL(request.url).searchParams.get("expectedRevision");
    if (!expectedRevision || !/^[a-f0-9]{64}$/.test(expectedRevision)) return NextResponse.json({ error: "PRODUCT_V5_REVIEW_INVALID" }, { status: 400 });
    const { id } = await context.params;
    return NextResponse.json({ result: await getSolutionCollectionReviewContext({ importId: id, reviewerId: session.user.id, expectedRevision }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = solutionReviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "PRODUCT_V5_REVIEW_INVALID" }, { status: 400 });
  try {
    const { id } = await context.params;
    const items = normalizeSolutionReviewRequest(parsed.data);
    return NextResponse.json({ result: await reviewSolutionCollection({ importId: id, reviewerId: session.user.id, expectedRevision: parsed.data.expectedRevision, expectedReviewVersion: parsed.data.expectedReviewVersion, decision: parsed.data.decision, items }) });
  } catch (error) { return failure(error); }
}
