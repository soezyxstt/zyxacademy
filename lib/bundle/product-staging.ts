import { createHash } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, courses, imporBundle, itemImporBundle, mataKuliah, reviewBundle, tutorCourses, user } from "@/db/schema";
import { storage } from "@/lib/storage";
import { productEntityHash, parseProductBundleZip } from "./product-bundle-v2";
import { deterministicProductSerialization, type ProductDependency } from "./product-validator";
import { type ProductBundleValidation } from "./product-validator";

export type ProductStageInput = {
  runId: string;
  bundleId: string;
  courseId: string;
  checksum: string;
  bytes: Uint8Array;
  requestedBy: string;
  bundle: Extract<ProductBundleValidation, { success: true }>["data"];
  filename?: string;
};

function enabled(): void {
  if (process.env.FEATURE_PRODUCT_BUNDLE_V2 !== "1") throw new Error("PRODUCT_BUNDLE_V2_DISABLED");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`, "utf8").digest("hex").slice(0, 32)}`;
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
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
    return { importId: same.id, bundleId: same.bundleId, checksum: same.checksum, sourceKey: same.sourceUriOrKey, created: false, status: "existing" as const, itemCount: items.length };
  }
  const [conflict] = await db.select({ id: imporBundle.id }).from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId)).limit(1);
  if (conflict) throw new Error(`PRODUCT_BUNDLE_CONFLICT:${input.bundleId}`);
  const importId = stableId("impor-product", `${input.bundleId}:${input.checksum}`);
  const sourceKey = `overhaul/product-bundles/${safe(input.runId)}/${safe(input.bundleId)}-${input.checksum.slice(0, 16)}.zip`;
  await storage.upload(input.bytes, input.filename ?? `${safe(input.bundleId)}.zip`, "application/zip", { key: sourceKey, metadata: { bundleId: input.bundleId, runId: input.runId, checksum: input.checksum } });
  const items = [
    ...input.bundle.products.map((product) => ({ entityType: product.productType, entityId: product.id, entityVersion: product.version, entityHash: productEntityHash(product) })),
    ...input.bundle.dependencies.map((dependency) => ({ entityType: "dependency", entityId: dependency.id, entityVersion: dependency.downstreamVersion, entityHash: hashDependency(dependency) })),
  ];
  try {
    await db.transaction(async (tx) => {
      await tx.insert(imporBundle).values({ id: importId, bundleId: input.bundleId, checksum: input.checksum, bundleType: "product", courseId: legacyCourseId, sourceUriOrKey: sourceKey, version: 2, status: "validated", requestedBy: input.requestedBy, validationReport: { valid: true, publicationBlocked: input.bundle.publicationBlocked, issues: input.bundle.issues, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length } });
      await tx.insert(itemImporBundle).values(items.map((item) => ({ id: stableId("impor-product-item", `${importId}:${item.entityType}:${item.entityId}:${item.entityVersion}`), imporBundleId: importId, entityType: item.entityType, entityId: item.entityId, entityVersion: item.entityVersion, entityHash: item.entityHash, status: "validated" as const })));
      await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${importId}:imported`), actorId: input.requestedBy, entityType: "product_bundle", entityId: importId, action: "imported", beforeSnapshot: null, afterSnapshot: { bundleId: input.bundleId, checksum: input.checksum, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length }, correlationId: input.runId });
    });
  } catch (error) {
    await storage.delete(sourceKey).catch(() => undefined);
    throw error;
  }
  return { importId, bundleId: input.bundleId, checksum: input.checksum, sourceKey, created: true, status: "validated" as const, itemCount: items.length };
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
  if (actor.role === "admin") return "admin";
  if (actor.role !== "teacher" || !importRow.courseId) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  const [assignment] = await db.select({ id: tutorCourses.id }).from(tutorCourses).where(and(eq(tutorCourses.tutorId, reviewerId), eq(tutorCourses.courseId, importRow.courseId))).limit(1);
  if (!assignment) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  return "tutor";
}

export async function reviewProductBundle(input: { importId: string; reviewerId: string; decision: "approved" | "rejected"; notes?: string }) {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const role = await reviewerRole(row, input.reviewerId);
  const [existing] = row.reviews.filter((review) => review.reviewerId === input.reviewerId);
  if (existing && (existing.status !== input.decision || (existing.notes ?? null) !== (input.notes ?? null))) throw new Error("PRODUCT_BUNDLE_REVIEW_IMMUTABLE");
  if (existing) return { reviewId: existing.id, status: row.status, reviewerRole: role };
  const reviewId = stableId("review-product", `${input.importId}:${input.reviewerId}`);
  const status = input.decision === "rejected" ? "rejected" as const : role === "admin" ? "approved" as const : "validated" as const;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes: input.notes ?? null, reviewedAt: now });
    await tx.update(imporBundle).set({ status, updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: stableId("audit-product", `${input.importId}:review:${input.reviewerId}`), actorId: input.reviewerId, entityType: "product_bundle", entityId: input.importId, action: input.decision === "approved" ? "reviewed" : "rejected", beforeSnapshot: null, afterSnapshot: { decision: input.decision, reviewerRole: role }, correlationId: input.importId });
  });
  return { reviewId, status, reviewerRole: role };
}

export async function parseStagedProductBundle(importId: string): Promise<Extract<ProductBundleValidation, { success: true }>["data"]> {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const result = parseProductBundleZip(await downloadProductBundleArtifact(importId));
  if (!result.success) throw new Error(`PRODUCT_BUNDLE_VALIDATION_FAILED:${result.issues.map((item) => item.code).join(",")}`);
  if (result.data.manifest.bundleId !== row.bundleId || result.data.manifest.bundleChecksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  return result.data;
}
