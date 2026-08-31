import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { upsertIdeaItemReview } from "@/lib/bundle/staging";
import { upsertProductItemReview } from "@/lib/bundle/product-staging";

export const runtime = "nodejs";

const itemReviewSchema = z.object({
  targetType: z.enum(["idea", "article_section", "article_block"]),
  targetId: z.string().min(1),
  productId: z.string().min(1).optional(),
  status: z.enum(["pending", "approved", "changes_requested"]),
  notes: z.string().max(2000).optional(),
}).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized = session?.user && (
    (await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
    session.user.role === "admin" ||
    session.user.role === "teacher"
  );
  if (!isAuthorized) return NextResponse.json({ error: "Anda tidak memiliki akses untuk mereview bundle ini.", code: "UNAUTHORIZED" }, { status: 401 });

  const parsed = itemReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data review item tidak valid.", code: "BUNDLE_ITEM_REVIEW_INVALID" }, { status: 400 });
  const { kind, id } = await context.params;

  try {
    if (kind === "idea" && parsed.data.targetType === "idea") {
      return NextResponse.json({ result: await upsertIdeaItemReview({
        importId: id,
        reviewerId: session.user.id,
        ideaId: parsed.data.targetId,
        status: parsed.data.status,
        notes: parsed.data.notes,
      }) });
    }
    if (kind === "product" && parsed.data.targetType !== "idea" && parsed.data.productId) {
      return NextResponse.json({ result: await upsertProductItemReview({
        importId: id,
        reviewerId: session.user.id,
        productId: parsed.data.productId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        status: parsed.data.status,
        notes: parsed.data.notes,
      }) });
    }
    return NextResponse.json({ error: "Target review tidak sesuai dengan jenis bundle.", code: "BUNDLE_ITEM_REVIEW_TARGET_INVALID" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "BUNDLE_ITEM_REVIEW_UPDATE_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code.endsWith("NOT_FOUND") ? 404 : code.endsWith("IMMUTABLE") ? 409 : 422;
    return NextResponse.json({ error: explainBundleError(code), code }, { status });
  }
}
