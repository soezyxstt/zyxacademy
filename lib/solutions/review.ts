import { assertRevisionReviewGuard } from "@/lib/authoring/revision-review-context";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, imporBundle, reviewBundle } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { claimProductReviewSnapshot } from "@/lib/bundle/product-review-snapshot";
import { deterministicProductSerialization } from "@/lib/bundle/product-validator";
import { assertSolutionImportScope, lockSolutionImportScope, type SolutionImportScope } from "./import-scope";
import { solutionItemHash, validateSolutionReview, type SolutionItemDecision } from "./review-contract";

async function assertAdmin(actorId: string) {
  await assertAuthoringActor(db, actorId, { roles: ["admin"], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", requireLegacyAdmin: true });
}

/** Opaque compare-and-swap token for this reviewer's current saved decision. */
export function solutionReviewVersion(stored: { status: string; notes: string | null } | undefined): string {
  return createHash("sha256").update(deterministicProductSerialization(stored ? { status: stored.status, notes: stored.notes } : null)).digest("hex");
}

/** Admin-only review context. The checksum must be returned unchanged on submission. */
export async function getSolutionCollectionReviewContext(input: { importId: string; reviewerId: string; expectedRevision?: string; scope?: SolutionImportScope }) {
  await assertAdmin(input.reviewerId);
  const row = await getProductBundleImport(input.importId);
  if (!row || row.status !== "draft") throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
  if (input.expectedRevision && row.checksum !== input.expectedRevision) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const bundle = await parseStagedProductBundle(input.importId);
  const product = bundle.products[0];
  if (bundle.manifest.schemaVersion !== "product-bundle.v5" || product?.productType !== "solution_collection") throw new Error("PRODUCT_V5_PROFILE_REQUIRED");
  if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (input.scope) assertSolutionImportScope(row, bundle, input.scope);
  const [stored] = await db.transaction(async tx => {
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!current || current.status !== row.status || current.checksum !== row.checksum || current.sourceUriOrKey !== row.sourceUriOrKey || current.version !== row.version || current.courseId !== row.courseId || current.bundleId !== row.bundleId || JSON.stringify(current.validationReport) !== JSON.stringify(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    if (input.scope) assertSolutionImportScope(current, bundle, input.scope);
    return tx.select({ notes: reviewBundle.notes, status: reviewBundle.status }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId))).limit(1);
  });
  let savedReview: { decision: string; items: SolutionItemDecision[] } | null = null;
  if (stored) {
    try {
      const validated = validateSolutionReview({ product, revision: row.checksum, review: JSON.parse(stored.notes ?? ""), requireApproval: false });
      savedReview = { decision: stored.status, items: validated.items };
    } catch { /* A stale review never populates current decisions. */ }
  }
  return { reviewerId: input.reviewerId, savedReview, reviewVersion: solutionReviewVersion(stored), revision: row.checksum, productId: product.id, collection: product.collection, itemHashes: product.collection.items.map(item => ({ itemId: item.id, itemHash: solutionItemHash(item) })) };
}

/** Save a complete decision for the exact checksum; publication repeats validation. */
export async function reviewSolutionCollection(input: { importId: string; reviewerId: string; expectedRevision: string; expectedReviewVersion: string; decision: "approved" | "rejected"; items: SolutionItemDecision[]; scope?: SolutionImportScope }) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedReviewVersion ?? "")) throw new Error("PRODUCT_V5_REVIEW_STALE");
  await assertAdmin(input.reviewerId);
  const row = await getProductBundleImport(input.importId);
  if (!row || !["draft", "published"].includes(row.status)) throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
  if (row.checksum !== input.expectedRevision) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const bundle = await parseStagedProductBundle(input.importId);
  const product = bundle.products[0];
  if (bundle.manifest.schemaVersion !== "product-bundle.v5" || product?.productType !== "solution_collection" || bundle.checksum !== row.checksum) throw new Error("PRODUCT_V5_PROFILE_REQUIRED");
  if (input.scope) assertSolutionImportScope(row, bundle, input.scope);
  const review = validateSolutionReview({ product, revision: row.checksum, review: { policy: "solution-collection-review.v1", revision: row.checksum, productId: product.id, items: [...input.items].sort((a, b) => a.itemId.localeCompare(b.itemId)) }, requireApproval: input.decision === "approved" });
  const reviewId = `review-product-${createHash("sha256").update(`review-product:${input.importId}:${input.reviewerId}`).digest("hex").slice(0, 32)}`;
  const now = new Date();
  const saved = await db.transaction(async tx => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: ["admin"], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    await assertRevisionReviewGuard(tx);
    if (input.scope) {
      const locked = await lockSolutionImportScope(tx, input.importId, input.scope);
      if (locked.status !== row.status || JSON.stringify(locked.validationReport) !== JSON.stringify(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    }
    if (row.status === "draft") await claimProductReviewSnapshot(tx, row, now);
    const [existing] = await tx.select({ id: reviewBundle.id, status: reviewBundle.status, notes: reviewBundle.notes }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId))).limit(1);
    if (existing?.status === input.decision) {
      try {
        const { reviewVersion: _version, ...content } = JSON.parse(existing.notes ?? "");
        if (deterministicProductSerialization(content) === deterministicProductSerialization(review)) return { reviewId: existing.id, created: false, reviewVersion: solutionReviewVersion(existing) };
      } catch { /* Invalid historical decisions cannot grant approval. */ }
    }
    if (input.expectedReviewVersion !== solutionReviewVersion(existing)) throw new Error("PRODUCT_V5_REVIEW_STALE");
    if (row.status !== "draft") throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
    const savedReview = { ...review, reviewVersion: createHash("sha256").update(randomUUID()).digest("hex") };
    const reviewNotes = deterministicProductSerialization(savedReview);
    const [record] = await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes: reviewNotes, reviewedAt: now }).onConflictDoUpdate({ target: [reviewBundle.imporBundleId, reviewBundle.reviewerId], set: { status: input.decision, notes: reviewNotes, reviewedAt: now } }).returning({ id: reviewBundle.id });
    await tx.insert(auditMutasi).values({ id: `audit-solution-review-${randomUUID()}`, actorId: input.reviewerId, entityType: "product_bundle", entityId: input.importId, action: input.decision === "approved" ? "reviewed" : "rejected", beforeSnapshot: { reviewVersion: solutionReviewVersion(existing) }, afterSnapshot: { decision: input.decision, revision: row.checksum, itemCount: review.items.length, policy: review.policy, review: savedReview }, correlationId: input.importId });
    return { reviewId: record.id, created: true, reviewVersion: solutionReviewVersion({ status: input.decision, notes: reviewNotes }) };
  });
  return { ...saved, revision: row.checksum, decision: input.decision };
}

/** Publication uses this for the current publisher's stored review only. */
export function assertStoredSolutionReview(input: { product: Parameters<typeof validateSolutionReview>[0]["product"]; revision: string; notes: string | null }): void {
  let parsed: unknown;
  try { parsed = JSON.parse(input.notes ?? ""); } catch { throw new Error("PRODUCT_V5_REVIEW_REQUIRED"); }
  validateSolutionReview({ product: input.product, revision: input.revision, review: parsed, requireApproval: true });
}
