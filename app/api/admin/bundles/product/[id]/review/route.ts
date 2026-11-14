import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

import { executePedagogicReview } from "@/lib/bundle/product-pedagogic-review";
import { computeProductV4SectionSemanticHash, productV4ReviewContextShape, sectionDecisionsSchema } from "@/lib/bundle/product-v4-review";
import { getProductBundleImport, parseStagedProductBundle, reviewProductBundle } from "@/lib/bundle/product-staging";
import { productPedagogyFingerprint } from "@/lib/bundle/product-review-gate";
import { QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import {
  pedagogicRubricItemSchema,
  pedagogicExceptionSchema,
} from "@/lib/materials/quality-policy";

export const runtime = "nodejs";

const pedagogicReviewRequestSchema = z
  .object({
    ...productV4ReviewContextShape,
    sectionDecisions: z.array(sectionDecisionsSchema.element).optional(),
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    policyVersion: z.string().trim().min(1).optional(),
    contentFingerprint: z.string().trim().min(1).optional(),
    criteria: z.array(pedagogicRubricItemSchema).optional(),
    exceptions: z.array(pedagogicExceptionSchema).default([]),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    notes: z.string().trim().max(4000).optional(),
    reason: z.string().trim().max(4000).optional(),
  })
  .strict();

/** Return hashes for the exact displayed draft; decisions remain reviewer supplied. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const row = await getProductBundleImport(id);
    if (!row) return NextResponse.json({ error: "PRODUCT_BUNDLE_NOT_FOUND" }, { status: 404 });
    const bundle = await parseStagedProductBundle(id);
    if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    return NextResponse.json({ expectedRevision: row.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: productPedagogyFingerprint(bundle.products), sections: bundle.products.flatMap(product => product.productType === "article" ? product.sections.map(section => ({ articleId: product.id, productId: product.id, sectionId: section.id, title: section.title, semanticHash: computeProductV4SectionSemanticHash(product, section.id) })) : []) });
  } catch {
    return NextResponse.json({ error: "PRODUCT_BUNDLE_REVIEW_CONTEXT_FAILED" }, { status: 422 });
  }
}

/** Validates and records an authorized review decision for a draft Product Bundle. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin", "tutor"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    const bundle = await parseStagedProductBundle(id);
    if (!bundle.products.some(product => product.productType === "article")) {
      if (parsed.data.decision === "changes_requested") throw new Error("PRODUCT_BUNDLE_REVIEW_DECISION_UNSUPPORTED");
      const result = await reviewProductBundle({ importId: id, reviewerId: session.user.id, decision: parsed.data.decision, expectedRevision: parsed.data.expectedRevision, notes: parsed.data.reason || parsed.data.notes });
      return NextResponse.json({ result });
    }
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
