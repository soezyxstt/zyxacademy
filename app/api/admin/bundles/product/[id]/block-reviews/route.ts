import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { upsertProductBlockReview } from "@/lib/bundle/product-staging";

export const runtime = "nodejs";

const blockReviewSchema = z.object({
  productId: z.string().min(1),
  blockId: z.string().min(1),
  status: z.enum(["pending", "approved", "changes_requested"]),
  notes: z.string().max(2000).optional(),
}).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
      session.user.role === "admin" ||
      session.user.role === "teacher");
  if (!isAuthorized) return NextResponse.json({ error: "Anda tidak memiliki akses untuk mereview bundle ini.", code: "UNAUTHORIZED" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const code = "PRODUCT_BLOCK_REVIEW_INVALID";
    return NextResponse.json({ error: explainBundleError(code), code }, { status: 400 });
  }
  const parsed = blockReviewSchema.safeParse(body);
  if (!parsed.success) {
    const code = "PRODUCT_BLOCK_REVIEW_INVALID";
    return NextResponse.json({ error: explainBundleError(code), code }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const result = await upsertProductBlockReview({ importId: id, reviewerId: session.user.id, ...parsed.data });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BLOCK_REVIEW_UPDATE_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" || code.endsWith("NOT_FOUND") ? 404 : code.endsWith("IMMUTABLE") ? 409 : 422;
    return NextResponse.json({ error: explainBundleError(code), code }, { status });
  }
}
