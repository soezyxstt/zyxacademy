import { createHash } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, courses, imporBundle, itemImporBundle, mataKuliah, reviewBundle, reviewItemBundle, user } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildProductBundleKey } from "@/lib/storage/keys";
import { productEntityHash, parseProductBundleZip } from "./product-bundle-v2";
import { deterministicProductSerialization, type ProductDependency } from "./product-validator";
import { type ProductBundleValidation } from "./product-validator";
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
};

export type ProductBundleLifecycleStatus = "draft" | "published" | "withdrawn";
export type ProductBlockReviewStatus = "pending" | "approved" | "changes_requested";

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

async function storedCourseId(courseId: string): Promise<string> {
  const [legacy] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (legacy) return legacy.id;
  const [target] = await db.select({ legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId))).limit(1);
  if (target?.legacyCourseId) return target.legacyCourseId;
  throw new Error(`PRODUCT_BUNDLE_COURSE_NOT_FOUND:${courseId}`);
}

export async function stageProductBundle(input: ProductStageInput) {
  enabled();
  const legacyCourseId = await storedCourseId(input.courseId);
  const [same] = await db.select().from(imporBundle).where(and(eq(imporBundle.bundleId, input.bundleId), eq(imporBundle.checksum, input.checksum))).limit(1);
  if (same) {
    const items = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, same.id));
    return { importId: same.id, bundleId: same.bundleId, checksum: same.checksum, sourceKey: same.sourceUriOrKey, created: false, replaced: false, status: productBundleLifecycleStatus(same.status), itemCount: items.length };
  }
  const [conflict] = await db.select().from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId)).limit(1);
  if (conflict && productBundleLifecycleStatus(conflict.status) !== "draft") throw new Error(`PRODUCT_BUNDLE_CONFLICT:${input.bundleId}`);
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
        await tx.update(imporBundle).set({ checksum: input.checksum, courseId: legacyCourseId, sourceUriOrKey: sourceKey, version: 2, status: "draft", requestedBy: input.requestedBy, validationReport: { valid: true, publicationBlocked: input.bundle.publicationBlocked, issues: input.bundle.issues, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length, quality: input.qualityReport ?? null }, updatedAt: new Date() }).where(eq(imporBundle.id, conflict.id));
      } else {
        await tx.insert(imporBundle).values({ id: targetImportId, bundleId: input.bundleId, checksum: input.checksum, bundleType: "product", courseId: legacyCourseId, sourceUriOrKey: sourceKey, version: 2, status: "draft", requestedBy: input.requestedBy, validationReport: { valid: true, publicationBlocked: input.bundle.publicationBlocked, issues: input.bundle.issues, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length, quality: input.qualityReport ?? null } });
      }
      await tx.insert(itemImporBundle).values(items.map((item) => ({ id: stableId("impor-product-item", `${targetImportId}:${item.entityType}:${item.entityId}:${item.entityVersion}`), imporBundleId: targetImportId, entityType: item.entityType, entityId: item.entityId, entityVersion: item.entityVersion, entityHash: item.entityHash, status: "draft" as const })));
      await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${targetImportId}:draft:${input.checksum}:${mutationAt.getTime()}`), actorId: input.requestedBy, entityType: "product_bundle", entityId: targetImportId, action: conflict ? "draft_replaced" : "draft_created", beforeSnapshot: conflict ? { checksum: conflict.checksum, status: productBundleLifecycleStatus(conflict.status) } : null, afterSnapshot: { status: "draft", bundleId: input.bundleId, checksum: input.checksum, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length }, correlationId: input.runId, createdAt: mutationAt });
    });
  } catch (error) {
    await storage.delete(sourceKey).catch(() => undefined);
    throw error;
  }
  if (conflict && conflict.sourceUriOrKey !== sourceKey) await storage.delete(conflict.sourceUriOrKey).catch(() => undefined);
  return { importId: conflict?.id ?? importId, bundleId: input.bundleId, checksum: input.checksum, sourceKey, created: !conflict, replaced: Boolean(conflict), status: "draft" as const, itemCount: items.length };
}

export async function getProductBundleImport(importId: string) {
  const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "product") return null;
  const [items, reviews] = await Promise.all([
    db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId)),
    db.select().from(reviewBundle).where(eq(reviewBundle.imporBundleId, importId)).orderBy(desc(reviewBundle.createdAt)),
  ]);
  return { ...row, items, reviews };
}

export async function listProductBundleImports(limit = 50) {
  return db.select().from(imporBundle).where(eq(imporBundle.bundleType, "product")).orderBy(desc(imporBundle.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
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

export async function listProductBlockReviews(importId: string, reviewerId: string) {
  return db
    .select()
    .from(reviewItemBundle)
    .where(and(eq(reviewItemBundle.imporBundleId, importId), eq(reviewItemBundle.reviewerId, reviewerId)))
    .orderBy(reviewItemBundle.productId, reviewItemBundle.blockId);
}

export async function upsertProductBlockReview(input: {
  importId: string;
  reviewerId: string;
  productId: string;
  blockId: string;
  status: ProductBlockReviewStatus;
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
  if (!product.blocks.some((block) => block.id === input.blockId)) throw new Error("PRODUCT_BLOCK_REVIEW_BLOCK_NOT_FOUND");
  const now = new Date();
  const id = stableId("review-product-block", `${input.importId}:${input.reviewerId}:${input.productId}:${input.blockId}`);
  await db
    .insert(reviewItemBundle)
    .values({
      id,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      productId: input.productId,
      blockId: input.blockId,
      status: input.status,
      notes,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.productId, reviewItemBundle.blockId],
      set: { status: input.status, notes, updatedAt: now },
    });
  return { id, productId: input.productId, blockId: input.blockId, status: input.status, notes, updatedAt: now };
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
  await db.transaction(async (tx) => {
    await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes: input.notes ?? null, reviewedAt: now });
    await tx.update(imporBundle).set({ status, updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${input.importId}:review:${input.reviewerId}`), actorId: input.reviewerId, entityType: "product_bundle", entityId: input.importId, action: input.decision === "approved" ? "reviewed" : "rejected", beforeSnapshot: null, afterSnapshot: { decision: input.decision, reviewerRole: role }, correlationId: input.importId });
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
