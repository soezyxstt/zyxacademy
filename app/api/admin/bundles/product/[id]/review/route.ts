import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { executePedagogicReview } from "@/lib/bundle/product-pedagogic-review";
import {
  pedagogicRubricItemSchema,
  pedagogicExceptionSchema,
} from "@/lib/materials/quality-policy";

export const runtime = "nodejs";

const pedagogicReviewRequestSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    policyVersion: z.string().trim().min(1),
    contentFingerprint: z.string().trim().min(1),
    criteria: z.array(pedagogicRubricItemSchema),
    exceptions: z.array(pedagogicExceptionSchema).default([]),
    expectedRevision: z.union([z.string(), z.number()]).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
      session.user.role === "admin" ||
      session.user.role === "teacher");
  if (!isAuthorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = pedagogicReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "PRODUCT_BUNDLE_REVIEW_INVALID", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const result = await executePedagogicReview({
      importId: id,
      reviewerId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_REVIEW_FAILED";
    const status = code.endsWith("FORBIDDEN")
      ? 403
      : code === "PRODUCT_BUNDLE_NOT_FOUND"
        ? 404
        : code.includes("STALE") || code.includes("MISMATCH")
          ? 409
          : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
