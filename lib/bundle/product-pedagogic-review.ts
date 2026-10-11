import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewBundle, reviewItemBundle, reviewPedagogiBundle, user } from "@/db/schema";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { hasPeran } from "@/lib/auth/authorization";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import {
  getProductBundleImport,
  parseStagedProductBundle,
  productBundleLifecycleStatus,
} from "@/lib/bundle/product-staging";
import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  validatePedagogicRubricDecision,
  type PedagogicReviewDecision,
  type PedagogicRubricItem,
  type PedagogicException,
} from "@/lib/materials/quality-policy";

function stableId(prefix: string, value: string): string {
  return `${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

export interface ExecutePedagogicReviewInput {
  importId: string;
  reviewerId: string;
  decision: "approved" | "rejected" | "changes_requested";
  policyVersion?: string;
  contentFingerprint?: string;
  criteria?: PedagogicRubricItem[];
  exceptions?: PedagogicException[];
  expectedRevision?: string | number | null;
  notes?: string | null;
  reason?: string | null;
}

export interface ExecutePedagogicReviewResult {
  ok: true;
  reviewId: string;
  importId: string;
  decision: "approved" | "rejected" | "changes_requested";
  policyVersion: string;
  contentFingerprint: string;
  criteriaCount: number;
  exceptionsCount: number;
  createdAt: string;
}

/**
 * Execute and persist a bundle decision for a draft Product Bundle.
 * Shared between the MCP tool and Admin API route to guarantee semantic parity.
 *
 * Invariants:
 * - Enforces tutor/admin authorization.
 * - Requires staged bundle to be in draft state (draft review NEVER publishes).
 * - Verifies policy version and content fingerprint when supplied.
 * - Verifies expectedRevision if supplied.
 * - Validates supplied legacy rubric criteria and content anchors when present.
 * - Persists immutable review into reviewPedagogiBundle.
 */
export async function executePedagogicReview(
  input: ExecutePedagogicReviewInput,
): Promise<ExecutePedagogicReviewResult> {
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (productBundleLifecycleStatus(row.status) !== "draft") {
    throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
  }

  const [actor] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, input.reviewerId))
    .limit(1);

  if (!actor) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  const isAdmin = actor.role === "admin" || (await hasPeran(input.reviewerId, "admin"));
  if (!isAdmin) {
    const isTutor = (await hasPeran(input.reviewerId, "tutor")) || actor.role === "teacher";
    if (!isTutor || !row.courseId) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
    const access = await checkTutorCourseAccess(input.reviewerId, row.courseId);
    if (!access.hasAccess) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  }

  if (input.expectedRevision !== undefined && input.expectedRevision !== null) {
    const revStr = String(input.expectedRevision);
    const matches = revStr === String(row.version) || revStr === String(row.checksum);
    if (!matches) {
      throw new Error(
        `PRODUCT_BUNDLE_STALE_CONTEXT:Expected revision ${input.expectedRevision} but current staged revision is ${row.version}`,
      );
    }
  }

  if (input.policyVersion && input.policyVersion !== QUALITY_POLICY_VERSION) {
    throw new Error(
      `POLICY_VERSION_MISMATCH:Review policy version '${input.policyVersion}' does not match current '${QUALITY_POLICY_VERSION}'`,
    );
  }

  const stagedBundle = await parseStagedProductBundle(input.importId);
  const article = stagedBundle.products.find((p) => p.productType === "article");
  if (!article) throw new Error("PRODUCT_BUNDLE_ARTICLE_MISSING");
  const diktat = stagedBundle.products.find((p) => p.productType === "diktat");

  const freshFingerprint = computePedagogyContentFingerprint({
    article: article as unknown as Record<string, unknown>,
    diktat: diktat ? (diktat as unknown as Record<string, unknown>) : undefined,
  });

  if (input.contentFingerprint && input.contentFingerprint !== freshFingerprint) {
    throw new Error(
      `FINGERPRINT_MISMATCH:Supplied content fingerprint '${input.contentFingerprint}' does not match staged content '${freshFingerprint}'`,
    );
  }

  const reviewNotes = input.reason?.trim() || input.notes?.trim() || null;
  if (input.decision !== "approved" && !reviewNotes) {
    throw new Error("PRODUCT_BUNDLE_REVIEW_REASON_REQUIRED");
  }
  const criteria = input.criteria ?? [];
  if (criteria.length > 0) {
    const rubricDecision: PedagogicReviewDecision = {
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      policyVersion: QUALITY_POLICY_VERSION,
      contentFingerprint: freshFingerprint,
      status: input.decision,
      criteria,
      exceptions: input.exceptions ?? [],
      notes: reviewNotes ?? undefined,
    };
    const rubricValidation = validatePedagogicRubricDecision(rubricDecision);
    if (!rubricValidation.valid) {
      const firstIssue = rubricValidation.issues[0];
      const err = new Error(`${firstIssue.code}:${firstIssue.reason}`);
      (err as unknown as { issues: unknown }).issues = rubricValidation.issues;
      throw err;
    }
  }

  const validDocIds = new Set(stagedBundle.products.map((p) => p.id));
  const validSectionIds = new Set((article.sections ?? []).map((s) => s.id));
  const validBlockIds = new Set([
    ...(article.sections ?? []).flatMap((s) => s.blocks.map((b) => b.id)),
    ...(article.blocks ?? []).map((b) => b.id),
  ]);
  const validVisualIds = new Set((article.visuals ?? []).map((v) => v.id));

  for (const crit of criteria) {
    for (const anchor of crit.contentAnchors) {
      let anchorFound = false;
      if (anchor.targetType === "document") anchorFound = validDocIds.has(anchor.targetId);
      else if (anchor.targetType === "section") anchorFound = validSectionIds.has(anchor.targetId);
      else if (anchor.targetType === "block") anchorFound = validBlockIds.has(anchor.targetId);
      else if (anchor.targetType === "visual") anchorFound = validVisualIds.has(anchor.targetId);
      if (!anchorFound) {
        throw new Error(
          `RUBRIC_ANCHOR_NOT_FOUND:Anchor '${anchor.targetType}:${anchor.targetId}' in criterion '${crit.criterionId}' does not exist in staged content`,
        );
      }
    }
  }

  const reviewPedId = stableId(
    "rev-ped",
    `${input.importId}:${input.reviewerId}:${freshFingerprint}:${QUALITY_POLICY_VERSION}`,
  );
  const now = new Date();

  await db
    .insert(reviewPedagogiBundle)
    .values({
      id: reviewPedId,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      contentFingerprint: freshFingerprint,
      policyVersion: QUALITY_POLICY_VERSION,
      status: input.decision,
      rubric: { criteria },
      exceptions: input.exceptions ?? [],
      notes: reviewNotes,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        reviewPedagogiBundle.imporBundleId,
        reviewPedagogiBundle.reviewerId,
        reviewPedagogiBundle.contentFingerprint,
        reviewPedagogiBundle.policyVersion,
      ],
      set: {
        status: input.decision,
        rubric: { criteria },
        exceptions: input.exceptions ?? [],
        notes: reviewNotes,
        createdAt: now,
      },
    });

  const reviewId = stableId("review-product", `${input.importId}:${input.reviewerId}`);
  await db
    .insert(reviewBundle)
    .values({
      id: reviewId,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      status: input.decision === "approved" ? "approved" : "rejected",
      notes: reviewNotes,
      reviewedAt: now,
    })
    .onConflictDoUpdate({
      target: [reviewBundle.imporBundleId, reviewBundle.reviewerId],
      set: {
        status: input.decision === "approved" ? "approved" : "rejected",
        notes: reviewNotes,
        reviewedAt: now,
      },
    });

  if (input.decision === "approved") {
    const articles = stagedBundle.products.filter(
      (p): p is Extract<ProductEntity, { productType: "article" }> => p.productType === "article",
    );
    for (const art of articles) {
      const sections = art.sections ?? [];
      for (const section of sections) {
        const itemReviewId = stableId(
          "review-product-item",
          `${input.importId}:${input.reviewerId}:article_section:${section.id}`,
        );
        const [existing] = await db
          .select({ status: reviewItemBundle.status })
          .from(reviewItemBundle)
          .where(
            and(
              eq(reviewItemBundle.imporBundleId, input.importId),
              eq(reviewItemBundle.reviewerId, input.reviewerId),
              eq(reviewItemBundle.targetType, "article_section"),
              eq(reviewItemBundle.targetId, section.id),
            ),
          )
          .limit(1);

        if (!existing || existing.status !== "changes_requested") {
          await db
            .insert(reviewItemBundle)
            .values({
              id: itemReviewId,
              imporBundleId: input.importId,
              reviewerId: input.reviewerId,
              productId: art.id,
              blockId: section.id,
              targetType: "article_section",
              targetId: section.id,
              status: "approved",
              notes: null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                reviewItemBundle.imporBundleId,
                reviewItemBundle.reviewerId,
                reviewItemBundle.targetType,
                reviewItemBundle.targetId,
              ],
              set: {
                status: "approved",
                updatedAt: now,
              },
            });
        }
      }
    }
  }

  return {
    ok: true,
    reviewId: reviewPedId,
    importId: input.importId,
    decision: input.decision,
    policyVersion: QUALITY_POLICY_VERSION,
    contentFingerprint: freshFingerprint,
    criteriaCount: criteria.length,
    exceptionsCount: (input.exceptions ?? []).length,
    createdAt: now.toISOString(),
  };
}
