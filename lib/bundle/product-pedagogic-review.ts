import { assertRevisionReviewGuard } from "@/lib/authoring/revision-review-context";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewBundle, reviewItemBundle, reviewPedagogiBundle } from "@/db/schema";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import {
  getProductBundleImport,
  parseStagedProductBundle,
  productBundleLifecycleStatus,
} from "@/lib/bundle/product-staging";
import {
  QUALITY_POLICY_VERSION,
  validatePedagogicRubricDecision,
  pedagogicReviewDecisionSchema,
  type PedagogicReviewDecision,
  type PedagogicRubricItem,
  type PedagogicException,
} from "@/lib/materials/quality-policy";

import { claimProductReviewSnapshot } from "./product-review-snapshot";
import { getProductV4VerificationReadiness } from "./product-v4-verification-service";
import { getProductV4VerificationReceiptSignature } from "./product-v4-verification";
import { assertProductV4ReviewCardinality, validateProductV4ReviewContext, type ProductV4SectionDecision } from "./product-v4-review";
import { deterministicProductSerialization } from "./product-validator";
import { productPedagogyFingerprint } from "./product-review-gate";
import { normalizeProductSectionDecisions, productSectionReviewKey, type ScopedProductSectionDecision } from "./product-v4-review";

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
  verificationPlanHash?: string;
  verificationReceiptSignature?: string;
  sectionDecisions?: ProductV4SectionDecision[];
  notes?: string | null;
  reason?: string | null;
  /** Retained for older callers; all review paths now enforce the same strict checks. */
  strictRevision?: boolean;
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
 * - Requires the exact checksum, policy, complete content fingerprint and rubric.
 * - Requires explicit current decisions for every Article section.
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

  const role = await assertAuthoringActor(db, input.reviewerId, { roles: ["admin", "tutor"], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN" });
  if (role === "tutor") {
    if (!row.courseId) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
    const access = await checkTutorCourseAccess(input.reviewerId, row.courseId);
    if (!access.hasAccess) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  }

  if (typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision) || input.expectedRevision !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");

  if (input.policyVersion && input.policyVersion !== QUALITY_POLICY_VERSION) {
    throw new Error(
      `POLICY_VERSION_MISMATCH:Review policy version '${input.policyVersion}' does not match current '${QUALITY_POLICY_VERSION}'`,
    );
  }

  const stagedBundle = await parseStagedProductBundle(input.importId);
  if (stagedBundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (stagedBundle.manifest.schemaVersion === "product-bundle.v4") assertProductV4ReviewCardinality(stagedBundle.products);
  const articles = stagedBundle.products.filter((p): p is Extract<ProductEntity, { productType: "article" }> => p.productType === "article");
  const article = articles[0];
  if (!article) throw new Error("PRODUCT_BUNDLE_ARTICLE_MISSING");
  const freshFingerprint = productPedagogyFingerprint(stagedBundle.products);

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
  if (input.policyVersion !== QUALITY_POLICY_VERSION || input.contentFingerprint !== freshFingerprint || !Array.isArray(input.criteria) || !Array.isArray(input.sectionDecisions)) throw new Error("PRODUCT_BUNDLE_REVIEW_CONTEXT_REQUIRED");
  {
    const rubricDecision: PedagogicReviewDecision = pedagogicReviewDecisionSchema.parse({
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      policyVersion: QUALITY_POLICY_VERSION,
      contentFingerprint: freshFingerprint,
      status: input.decision,
      criteria,
      exceptions: input.exceptions ?? [],
      notes: reviewNotes ?? undefined,
    });
    const rubricValidation = validatePedagogicRubricDecision(rubricDecision);
    if (!rubricValidation.valid) {
      const firstIssue = rubricValidation.issues[0];
      const err = new Error(`${firstIssue.code}:${firstIssue.reason}`);
      (err as unknown as { issues: unknown }).issues = rubricValidation.issues;
      throw err;
    }
  }

  const validDocIds = new Set(stagedBundle.products.map((p) => p.id));
  const validSectionIds = new Set(articles.flatMap(art => art.sections.map(s => s.id)));
  const validBlockIds = new Set(articles.flatMap(art => [...art.sections.flatMap(s => s.blocks.map(b => b.id)), ...art.blocks.map(b => b.id)]));
  const validVisualIds = new Set(articles.flatMap(art => (art.visuals ?? []).map(v => v.id)));

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

  const isV4 = stagedBundle.manifest.schemaVersion === "product-bundle.v4";
  let sectionDecisions: ScopedProductSectionDecision[] = [];
  if (isV4) {
    const registered = row.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown } | undefined;
    const evidence = input.decision === "approved" && typeof registered?.runId === "string"
      ? await getProductV4VerificationReadiness(input.importId, registered.runId) : null;
    sectionDecisions = validateProductV4ReviewContext({ article, importId: input.importId, checksum: row.checksum, fingerprint: freshFingerprint, review: input,
      verification: evidence ? { ready: evidence.evaluation.ready && registered?.planHash === evidence.plan.planHash, planHash: evidence.plan.planHash, importId: evidence.plan.binding.importId, receiptSignature: getProductV4VerificationReceiptSignature(evidence.receipt) } : undefined });
  } else {
    sectionDecisions = normalizeProductSectionDecisions(articles, input.sectionDecisions!);
    const seen = new Set(sectionDecisions.map(decision => productSectionReviewKey(decision.productId, decision.sectionId)));
    if (seen.size !== articles.reduce((n, art) => n + art.sections.length, 0) || (input.decision === "approved" && sectionDecisions.some(decision => decision.decision !== "approved"))) throw new Error("PRODUCT_REVIEW_ALL_SECTIONS_REQUIRED");
  }
  if (isV4 && sectionDecisions.length !== article.sections.length) throw new Error("PRODUCT_REVIEW_ALL_SECTIONS_REQUIRED");
  const rubric = { criteria, ...(isV4 ? { verificationPlanHash: input.verificationPlanHash ?? null, verificationReceiptSignature: input.verificationReceiptSignature ?? null } : {}), sectionDecisions };
  const reviewPedId = stableId(
    "rev-ped",
    `${input.importId}:${input.reviewerId}:${freshFingerprint}:${QUALITY_POLICY_VERSION}`,
  );
  const now = new Date();

  const recordedAt = await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true });
    await assertRevisionReviewGuard(tx);
    if (role === "tutor" && (!row.courseId || !(await checkTutorCourseAccess(input.reviewerId, row.courseId, undefined, tx)).hasAccess)) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
    await claimProductReviewSnapshot(tx, row, now);
    {
      const [existing] = await tx.select().from(reviewPedagogiBundle).where(and(eq(reviewPedagogiBundle.imporBundleId, input.importId), eq(reviewPedagogiBundle.reviewerId, input.reviewerId), eq(reviewPedagogiBundle.contentFingerprint, freshFingerprint), eq(reviewPedagogiBundle.policyVersion, QUALITY_POLICY_VERSION))).limit(1);
      const [bundleReview] = await tx.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId))).limit(1);
      if (existing && bundleReview && existing.status === input.decision && bundleReview.status === (input.decision === "approved" ? "approved" : "rejected") && existing.notes === reviewNotes && deterministicProductSerialization(existing.rubric) === deterministicProductSerialization(rubric) && deterministicProductSerialization(existing.exceptions) === deterministicProductSerialization(input.exceptions ?? [])) return existing.createdAt;
    }
    await tx
      .insert(reviewPedagogiBundle)
      .values({
        id: reviewPedId,
        imporBundleId: input.importId,
        reviewerId: input.reviewerId,
        contentFingerprint: freshFingerprint,
        policyVersion: QUALITY_POLICY_VERSION,
        status: input.decision,
        rubric,
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
          rubric,
          exceptions: input.exceptions ?? [],
          notes: reviewNotes,
          createdAt: now,
        },
      });

    const reviewId = stableId("review-product", `${input.importId}:${input.reviewerId}`);
    await tx
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

    {
      for (const decision of sectionDecisions) {
        const owner = articles.find(art => art.id === decision.productId)!;
        await tx.insert(reviewItemBundle).values({ id: stableId("review-product-item", JSON.stringify([input.importId, input.reviewerId, "article_section", owner.id, decision.sectionId])), imporBundleId: input.importId, reviewerId: input.reviewerId, productId: owner.id, blockId: decision.sectionId, targetType: "article_section", targetId: decision.sectionId, status: decision.decision, notes: decision.notes ?? null, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.targetType, reviewItemBundle.targetId, reviewItemBundle.productId], set: { status: decision.decision, notes: decision.notes ?? null, updatedAt: now } });
      }
    }

    return now;
  });

  return {
    ok: true,
    reviewId: reviewPedId,
    importId: input.importId,
    decision: input.decision,
    policyVersion: QUALITY_POLICY_VERSION,
    contentFingerprint: freshFingerprint,
    criteriaCount: criteria.length,
    exceptionsCount: (input.exceptions ?? []).length,
    createdAt: new Date(recordedAt).toISOString(),
  };
}
