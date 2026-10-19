import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditMutasi,
  buktiPdfBundle,
  courses,
  imporBundle,
  itemImporBundle,
  mataKuliah,
  reviewBundle,
  reviewItemBundle,
  reviewPedagogiBundle,
  user,
  pengguna,
} from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildProductBundleKey } from "@/lib/storage/keys";
import { isBundleIdentitySentinelOrPlaceholder } from "./attribution";
import { productEntityHash, parseProductBundleZip } from "./product-bundle-v2";
import { deterministicProductSerialization, type ProductDependency, type ProductEntity } from "./product-validator";
import { type ProductBundleValidation } from "./product-validator";
import {
  canPreservePedagogicReview,
  findStalePdfEvidenceProductIds,
  unchangedArticleSectionIds,
} from "./product-review-preservation";
import { hasPeran } from "@/lib/auth/authorization";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";

export type ProductStageInput = {
  runId: string;
  bundleId: string;
  courseId: string;
  checksum: string;
  bytes: Uint8Array;
  requestedBy: string;
  bundle: Extract<ProductBundleValidation, { success: true }>["data"];
  qualityReport?: Record<string, unknown>;
  filename?: string;
  preserveUnchangedItemReviews?: boolean;
};

export type ProductBundleLifecycleStatus = "draft" | "published" | "withdrawn";
export type ProductItemReviewStatus = "pending" | "approved" | "changes_requested";
export type ProductBlockReviewStatus = ProductItemReviewStatus;
export type ProductReviewTargetType = "article_section" | "article_block";

export function productBundleLifecycleStatus(status: string): ProductBundleLifecycleStatus {
  if (status === "published") return "published";
  if (status === "withdrawn") return "withdrawn";
  return "draft";
}

function enabled(): void {}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`, "utf8").digest("hex").slice(0, 32)}`;
}

function hashDependency(dependency: ProductDependency): string {
  return createHash("sha256").update(deterministicProductSerialization(dependency), "utf8").digest("hex");
}

function extractBundleMeta(products: Array<Record<string, unknown>>): { chapterId: string | null; bundleTitle: string | null } {
  let chapterId: string | null = null;
  let bundleTitle: string | null = null;

  for (const product of products) {
    if (!chapterId) {
      if (typeof product.chapterId === "string") {
        chapterId = product.chapterId;
      } else if (Array.isArray(product.chapterIds) && typeof product.chapterIds[0] === "string") {
        chapterId = product.chapterIds[0];
      }
    }
    if (!bundleTitle && typeof product.title === "string") {
      bundleTitle = product.title;
    }
    if (chapterId && bundleTitle) break;
  }

  return { chapterId, bundleTitle };
}

async function storedCourseId(courseId: string): Promise<string> {
  const [legacy] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (legacy) return legacy.id;
  const [target] = await db.select({ legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId))).limit(1);
  if (target?.legacyCourseId) return target.legacyCourseId;
  throw new Error(`PRODUCT_BUNDLE_COURSE_NOT_FOUND:${courseId}`);
}

/**
 * Stages a validated Product Bundle, enforcing early identity validation,
 * course association, artifact upload, and draft item recording.
 */
export async function stageProductBundle(input: ProductStageInput) {
  enabled();
  const [uploader] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.requestedBy)).limit(1);
  if (!uploader) throw new Error("PRODUCT_BUNDLE_UPLOADER_NOT_FOUND");

  const creatorIdsToCheck = new Set<string>();
  const curatorIdsToCheck = new Set<string>();

  if (!isBundleIdentitySentinelOrPlaceholder(input.bundle.manifest.creatorId)) {
    creatorIdsToCheck.add(input.bundle.manifest.creatorId);
  }
  if (input.bundle.manifest.curatorId && !isBundleIdentitySentinelOrPlaceholder(input.bundle.manifest.curatorId)) {
    curatorIdsToCheck.add(input.bundle.manifest.curatorId);
  }
  for (const product of input.bundle.products) {
    if (!isBundleIdentitySentinelOrPlaceholder(product.creatorId)) {
      creatorIdsToCheck.add(product.creatorId);
    }
    if (product.curatorId && !isBundleIdentitySentinelOrPlaceholder(product.curatorId)) {
      curatorIdsToCheck.add(product.curatorId);
    }
  }

  for (const creatorId of creatorIdsToCheck) {
    const [row] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, creatorId)).limit(1);
    if (!row) throw new Error(`PRODUCT_BUNDLE_CREATOR_UNKNOWN:${creatorId}`);
  }
  for (const curatorId of curatorIdsToCheck) {
    const [row] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, curatorId)).limit(1);
    if (!row) throw new Error(`PRODUCT_BUNDLE_CURATOR_UNKNOWN:${curatorId}`);
  }

  const schemaVersion = input.bundle.manifest.schemaVersion === "product-bundle.v3" ? 3 : 2;
  const legacyCourseId = await storedCourseId(input.courseId);
  const [same] = await db.select().from(imporBundle).where(and(eq(imporBundle.bundleId, input.bundleId), eq(imporBundle.checksum, input.checksum))).limit(1);
  if (same) {
    const items = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, same.id));
    return { importId: same.id, bundleId: same.bundleId, checksum: same.checksum, sourceKey: same.sourceUriOrKey, created: false, replaced: false, status: productBundleLifecycleStatus(same.status), itemCount: items.length };
  }
  const [conflict] = await db.select().from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId)).limit(1);
  if (conflict && productBundleLifecycleStatus(conflict.status) !== "draft") throw new Error(`PRODUCT_BUNDLE_CONFLICT:${input.bundleId}`);
  let preservedItemReviews: Array<typeof reviewItemBundle.$inferSelect> = [];
  let stalePdfProductIds = new Set<string>();
  let canPreservePedagogy = false;
  let previousBundleParsed: Extract<ProductBundleValidation, { success: true }>["data"] | null = null;

  if (conflict && storage.download) {
    try {
      const previousBytes = await storage.download(conflict.sourceUriOrKey);
      const previous = parseProductBundleZip(previousBytes);
      if (previous.success) {
        previousBundleParsed = previous.data;
        canPreservePedagogy = canPreservePedagogicReview(previous.data, input.bundle);
        stalePdfProductIds = findStalePdfEvidenceProductIds(previous.data, input.bundle);
        if (input.preserveUnchangedItemReviews) {
          const unchangedSectionIds = unchangedArticleSectionIds(previous.data, input.bundle);
          const existingItemReviews = await db.select().from(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, conflict.id));
          preservedItemReviews = existingItemReviews.filter((review) => review.targetType === "article_section" && review.targetId && unchangedSectionIds.has(review.targetId));
        }
      }
    } catch {
      // If previous artifact download or parsing fails, cannot verify identity
    }
  }

  const importId = stableId("impor-product", `${input.bundleId}:${input.checksum}`);
  const sourceKey = buildProductBundleKey(input);
  await storage.upload(input.bytes, input.filename ?? `${input.bundleId}.zip`, "application/zip", { key: sourceKey, metadata: { bundleId: input.bundleId, runId: input.runId, checksum: input.checksum } });
  const items = [
    ...input.bundle.products.map((product) => ({ entityType: product.productType, entityId: product.id, entityVersion: product.version, entityHash: productEntityHash(product) })),
    ...input.bundle.dependencies.map((dependency) => ({ entityType: "dependency", entityId: dependency.id, entityVersion: dependency.downstreamVersion, entityHash: hashDependency(dependency) })),
  ];
  try {
    await db.transaction(async (tx) => {
      const targetImportId = conflict?.id ?? importId;
      const mutationAt = new Date();
      if (conflict) {
        await tx.delete(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, conflict.id));
        await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, conflict.id));
        await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, conflict.id));

        if (!canPreservePedagogy) {
          await tx.delete(reviewPedagogiBundle).where(eq(reviewPedagogiBundle.imporBundleId, conflict.id));
        }

        if (stalePdfProductIds.size > 0) {
          await tx
            .update(buktiPdfBundle)
            .set({ status: "stale", updatedAt: new Date() })
            .where(
              and(
                eq(buktiPdfBundle.imporBundleId, conflict.id),
                inArray(buktiPdfBundle.productId, [...stalePdfProductIds]),
              ),
            );
        } else if (!previousBundleParsed) {
          await tx
            .update(buktiPdfBundle)
            .set({ status: "stale", updatedAt: new Date() })
            .where(eq(buktiPdfBundle.imporBundleId, conflict.id));
        }

        const { chapterId: firstChapterId, bundleTitle: firstTitle } = extractBundleMeta(input.bundle.products as unknown as Array<Record<string, unknown>>);
        const articleProduct = input.bundle.products.find((p) => p.productType === "article");
        const diktatProduct = input.bundle.products.find((p) => p.productType === "diktat");
        const validationReportData = {
          valid: true,
          publicationBlocked: input.bundle.publicationBlocked,
          issues: input.bundle.issues,
          productCount: input.bundle.products.length,
          dependencyCount: input.bundle.dependencies.length,
          chapterId: firstChapterId,
          bundleTitle: firstTitle,
          articleId: articleProduct?.id ?? null,
          diktatId: diktatProduct?.id ?? null,
          articleGenerationHash: articleProduct?.generationHash ?? null,
          diktatGenerationHash: diktatProduct?.generationHash ?? null,
          contentFingerprint: typeof input.qualityReport?.contentFingerprint === "string" ? input.qualityReport.contentFingerprint : null,
          quality: input.qualityReport ?? null,
        };

        await tx.update(imporBundle).set({ checksum: input.checksum, courseId: legacyCourseId, sourceUriOrKey: sourceKey, version: schemaVersion, status: "draft", requestedBy: input.requestedBy, validationReport: validationReportData, updatedAt: new Date() }).where(eq(imporBundle.id, conflict.id));
      } else {
        const { chapterId: firstChapterId, bundleTitle: firstTitle } = extractBundleMeta(input.bundle.products as unknown as Array<Record<string, unknown>>);
        const articleProduct = input.bundle.products.find((p) => p.productType === "article");
        const diktatProduct = input.bundle.products.find((p) => p.productType === "diktat");
        const validationReportData = {
          valid: true,
          publicationBlocked: input.bundle.publicationBlocked,
          issues: input.bundle.issues,
          productCount: input.bundle.products.length,
          dependencyCount: input.bundle.dependencies.length,
          chapterId: firstChapterId,
          bundleTitle: firstTitle,
          articleId: articleProduct?.id ?? null,
          diktatId: diktatProduct?.id ?? null,
          articleGenerationHash: articleProduct?.generationHash ?? null,
          diktatGenerationHash: diktatProduct?.generationHash ?? null,
          contentFingerprint: typeof input.qualityReport?.contentFingerprint === "string" ? input.qualityReport.contentFingerprint : null,
          quality: input.qualityReport ?? null,
        };

        await tx.insert(imporBundle).values({ id: targetImportId, bundleId: input.bundleId, checksum: input.checksum, bundleType: "product", courseId: legacyCourseId, sourceUriOrKey: sourceKey, version: schemaVersion, status: "draft", requestedBy: input.requestedBy, validationReport: validationReportData });
      }
      await tx.insert(itemImporBundle).values(items.map((item) => ({ id: stableId("impor-product-item", `${targetImportId}:${item.entityType}:${item.entityId}:${item.entityVersion}`), imporBundleId: targetImportId, entityType: item.entityType, entityId: item.entityId, entityVersion: item.entityVersion, entityHash: item.entityHash, status: "draft" as const })));
      if (preservedItemReviews.length > 0) await tx.insert(reviewItemBundle).values(preservedItemReviews);
      await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${targetImportId}:draft:${input.checksum}:${mutationAt.getTime()}`), actorId: input.requestedBy, entityType: "product_bundle", entityId: targetImportId, action: conflict ? "draft_replaced" : "draft_created", beforeSnapshot: conflict ? { checksum: conflict.checksum, status: productBundleLifecycleStatus(conflict.status) } : null, afterSnapshot: { status: "draft", bundleId: input.bundleId, checksum: input.checksum, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length }, correlationId: input.runId, createdAt: mutationAt });
    });
  } catch (error) {
    await storage.delete(sourceKey).catch(() => undefined);
    throw error;
  }
  if (conflict && conflict.sourceUriOrKey !== sourceKey) await storage.delete(conflict.sourceUriOrKey).catch(() => undefined);
  return { importId: conflict?.id ?? importId, bundleId: input.bundleId, checksum: input.checksum, sourceKey, created: !conflict, replaced: Boolean(conflict), status: "draft" as const, itemCount: items.length };
}

import { normalizeDate } from "@/lib/date-utils";

export async function getProductBundleImport(importId: string) {
  const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "product") return null;
  const [items, reviews] = await Promise.all([
    db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId)),
    db.select().from(reviewBundle).where(eq(reviewBundle.imporBundleId, importId)).orderBy(desc(reviewBundle.createdAt)),
  ]);
  return {
    ...row,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
    items: items.map((item) => ({
      ...item,
      createdAt: normalizeDate(item.createdAt),
    })),
    reviews: reviews.map((review) => ({
      ...review,
      reviewedAt: review.reviewedAt ? normalizeDate(review.reviewedAt) : null,
      createdAt: normalizeDate(review.createdAt),
    })),
  };
}

export async function listProductBundleImports(options?: number | { limit?: number; courseIds?: string[] }) {
  const limit = typeof options === "number" ? options : options?.limit ?? 50;
  const courseIds = typeof options === "object" ? options?.courseIds?.filter(Boolean) : undefined;
  const conditions = [eq(imporBundle.bundleType, "product")];
  if (courseIds && courseIds.length > 0) {
    conditions.push(inArray(imporBundle.courseId, courseIds));
  }
  const rows = await db
    .select()
    .from(imporBundle)
    .where(and(...conditions))
    .orderBy(desc(imporBundle.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((row) => ({
    ...row,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
  }));
}

export async function downloadProductBundleArtifact(importId: string): Promise<Uint8Array> {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (!storage.download) throw new Error("PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE");
  return storage.download(row.sourceUriOrKey);
}

async function reviewerRole(importRow: NonNullable<Awaited<ReturnType<typeof getProductBundleImport>>>, reviewerId: string): Promise<"admin" | "tutor"> {
  const [actor] = await db.select({ role: user.role }).from(user).where(eq(user.id, reviewerId)).limit(1);
  if (!actor) throw new Error("PRODUCT_BUNDLE_REVIEWER_NOT_FOUND");
  if (actor.role === "admin" || (await hasPeran(reviewerId, "admin"))) return "admin";
  const isTutor = (await hasPeran(reviewerId, "tutor")) || actor.role === "teacher";
  if (!isTutor || !importRow.courseId) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  const access = await checkTutorCourseAccess(reviewerId, importRow.courseId);
  if (!access.hasAccess) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  return "tutor";
}

export async function listProductItemReviews(importId: string, reviewerId: string) {
  try {
    return await db
      .select()
      .from(reviewItemBundle)
      .where(and(eq(reviewItemBundle.imporBundleId, importId), eq(reviewItemBundle.reviewerId, reviewerId)))
      .orderBy(reviewItemBundle.targetType, reviewItemBundle.targetId);
  } catch (error) {
    if (!isMissingReviewTargetColumns(error)) throw error;
    const legacyReviews = await db
      .select({
        id: reviewItemBundle.id,
        imporBundleId: reviewItemBundle.imporBundleId,
        reviewerId: reviewItemBundle.reviewerId,
        productId: reviewItemBundle.productId,
        blockId: reviewItemBundle.blockId,
        status: reviewItemBundle.status,
        notes: reviewItemBundle.notes,
        createdAt: reviewItemBundle.createdAt,
        updatedAt: reviewItemBundle.updatedAt,
      })
      .from(reviewItemBundle)
      .where(and(eq(reviewItemBundle.imporBundleId, importId), eq(reviewItemBundle.reviewerId, reviewerId)))
      .orderBy(reviewItemBundle.blockId);
    return legacyReviews.map((review) => ({
      ...review,
      targetType: "article_block" as const,
      targetId: review.blockId,
    }));
  }
}

export const listProductBlockReviews = listProductItemReviews;

function isMissingReviewTargetColumns(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("no such column") && (message.includes("target_type") || message.includes("target_id"));
}

export async function upsertProductItemReview(input: {
  importId: string;
  reviewerId: string;
  productId: string;
  targetType: ProductReviewTargetType;
  targetId: string;
  status: ProductItemReviewStatus;
  notes?: string;
}) {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  await reviewerRole(row, input.reviewerId);
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BLOCK_REVIEW_DRAFT_REQUIRED");
  if (row.reviews.some((review) => review.reviewerId === input.reviewerId)) throw new Error("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new Error("PRODUCT_BLOCK_REVIEW_NOTES_LIMIT");
  const bundle = await parseStagedProductBundle(input.importId);
  const product = bundle.products.find((candidate) => candidate.id === input.productId);
  if (!product) throw new Error("PRODUCT_BLOCK_REVIEW_PRODUCT_NOT_FOUND");
  if (product.productType !== "article") throw new Error("PRODUCT_BLOCK_REVIEW_ARTICLE_REQUIRED");
  if (input.targetType === "article_section" && !product.sections.some((section) => section.id === input.targetId)) throw new Error("PRODUCT_SECTION_REVIEW_SECTION_NOT_FOUND");
  if (input.targetType === "article_block") {
    const blockExists = product.blocks.some((block) => block.id === input.targetId) || product.sections.some((section) => section.blocks.some((block) => block.id === input.targetId));
    if (!blockExists) throw new Error("PRODUCT_BLOCK_REVIEW_BLOCK_NOT_FOUND");
  }
  const now = new Date();
  const id = stableId("review-product-item", `${input.importId}:${input.reviewerId}:${input.targetType}:${input.targetId}`);
  await db
    .insert(reviewItemBundle)
    .values({
      id,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      productId: input.productId,
      blockId: input.targetId,
      targetType: input.targetType,
      targetId: input.targetId,
      status: input.status,
      notes,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.targetType, reviewItemBundle.targetId],
      set: { status: input.status, notes, updatedAt: now },
    });
  return { id, productId: input.productId, targetType: input.targetType, targetId: input.targetId, status: input.status, notes, updatedAt: now };
}

export async function upsertProductBlockReview(input: {
  importId: string;
  reviewerId: string;
  productId: string;
  blockId: string;
  status: ProductBlockReviewStatus;
  notes?: string;
}) {
  try {
    const result = await upsertProductItemReview({ ...input, targetType: "article_block", targetId: input.blockId });
    return { ...result, blockId: result.targetId };
  } catch (error) {
    if (!isMissingReviewTargetColumns(error)) throw error;
    const notes = input.notes?.trim() || null;
    const id = stableId("review-product-block", `${input.importId}:${input.reviewerId}:${input.productId}:${input.blockId}`);
    await db.run(sql`
      INSERT INTO review_item_bundle (
        id, impor_bundle_id, reviewer_id, product_id, block_id, status, notes, created_at, updated_at
      ) VALUES (
        ${id}, ${input.importId}, ${input.reviewerId}, ${input.productId}, ${input.blockId}, ${input.status}, ${notes},
        cast((julianday('now') - 2440587.5) * 86400000 as integer),
        cast((julianday('now') - 2440587.5) * 86400000 as integer)
      )
      ON CONFLICT (impor_bundle_id, reviewer_id, product_id, block_id)
      DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `);
    return { id, productId: input.productId, blockId: input.blockId, status: input.status, notes, updatedAt: new Date() };
  }
}

export async function reviewProductBundle(input: { importId: string; reviewerId: string; decision: "approved" | "rejected"; notes?: string }) {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const role = await reviewerRole(row, input.reviewerId);
  const [existing] = row.reviews.filter((review) => review.reviewerId === input.reviewerId);
  if (existing && (existing.status !== input.decision || (existing.notes ?? null) !== (input.notes ?? null))) throw new Error("PRODUCT_BUNDLE_REVIEW_IMMUTABLE");
  if (existing) return { reviewId: existing.id, status: productBundleLifecycleStatus(row.status), reviewerRole: role };
  const reviewId = stableId("review-product", `${input.importId}:${input.reviewerId}`);
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
  const status = "draft" as const;
  const now = new Date();
  const bundle = input.decision === "approved" ? await parseStagedProductBundle(input.importId) : null;
  await db.transaction(async (tx) => {
    await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes: input.notes ?? null, reviewedAt: now });
    await tx.update(imporBundle).set({ status, updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${input.importId}:review:${input.reviewerId}`), actorId: input.reviewerId, entityType: "product_bundle", entityId: input.importId, action: input.decision === "approved" ? "reviewed" : "rejected", beforeSnapshot: null, afterSnapshot: { decision: input.decision, reviewerRole: role }, correlationId: input.importId });

    if (bundle) {
      const articles = bundle.products.filter(
        (p): p is Extract<ProductEntity, { productType: "article" }> => p.productType === "article",
      );
      for (const art of articles) {
        const sections = art.sections ?? [];
        for (const section of sections) {
          const itemReviewId = stableId(
            "review-product-item",
            `${input.importId}:${input.reviewerId}:article_section:${section.id}`,
          );
          const [existing] = await tx
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
            await tx
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
  });
  return { reviewId, status, reviewerRole: role };
}

export async function discardProductBundleDraft(input: { importId: string; actorId: string }): Promise<{ importId: string; discarded: boolean }> {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
  await db.transaction(async (tx) => {
    await tx.delete(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, row.id));
    await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, row.id));
    await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, row.id));
    await tx.delete(imporBundle).where(eq(imporBundle.id, row.id));
    await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${row.id}:discarded`), actorId: input.actorId, entityType: "product_bundle", entityId: row.id, action: "draft_discarded", beforeSnapshot: { status: "draft", bundleId: row.bundleId, checksum: row.checksum }, afterSnapshot: null, correlationId: row.id });
  });
  await storage.delete(row.sourceUriOrKey).catch(() => undefined);
  return { importId: row.id, discarded: true };
}

export async function parseStagedProductBundle(importId: string): Promise<Extract<ProductBundleValidation, { success: true }>["data"]> {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const result = parseProductBundleZip(await downloadProductBundleArtifact(importId));
  if (!result.success) throw new Error(`PRODUCT_BUNDLE_VALIDATION_FAILED:${result.issues.map((item) => item.code).join(",")}`);
  if (result.data.manifest.bundleId !== row.bundleId || result.data.manifest.bundleChecksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  return result.data;
}
