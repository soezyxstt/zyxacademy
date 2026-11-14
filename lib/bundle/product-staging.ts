import { revisionPublicationConnection } from "@/lib/authoring/revision-publication-context";
import { validateProductBundleAdmission } from "@/lib/bundle/product-admission";
import { claimProductReviewSnapshot } from "./product-review-snapshot";
import { createHash, randomUUID } from "node:crypto";
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
  pengguna,
} from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildProductBundleKey } from "@/lib/storage/keys";
import { isBundleIdentitySentinelOrPlaceholder } from "./attribution";
import { productEntityHash } from "./product-bundle-v2";
import { deterministicProductSerialization, productInteractiveDocuments, type ProductDependency } from "./product-validator";
import { stageInteractiveDocumentAssets, validateInteractiveDocumentArchive, verifyAdmittedInteractiveDocumentArchive } from "@/lib/materials/interactive-document-assets";
import { parseAdmittedProductBundle } from "./product-staged-worker";
import { type ProductBundleValidation } from "./product-validator";
import {
  canPreservePedagogicReview,
  findStalePdfEvidenceProductIds,
  unchangedArticleSectionIds,
} from "./product-review-preservation";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { nextMonotonicTimestamp, normalizeDate } from "@/lib/date-utils";
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
  /** The caller's observed checksum when replacing a draft. Required for every replacement. */
  expectedPreviousChecksum?: string;
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
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_STAGE_FORBIDDEN" });
  const parsed = await validateProductBundleAdmission(input.bytes);
  if (!parsed.success || parsed.data.checksum !== input.checksum || input.bundle.checksum !== input.checksum || parsed.data.manifest.bundleId !== input.bundleId || parsed.data.manifest.courseId !== input.courseId || deterministicProductSerialization(parsed.data.manifest) !== deterministicProductSerialization(input.bundle.manifest) || deterministicProductSerialization(parsed.data.products) !== deterministicProductSerialization(input.bundle.products) || deterministicProductSerialization(parsed.data.dependencies) !== deterministicProductSerialization(input.bundle.dependencies)) throw new Error("PRODUCT_BUNDLE_STAGING_MISMATCH");
  const specs = productInteractiveDocuments(parsed.data.products);
  const pairs = await validateInteractiveDocumentArchive(specs, parsed.data.manifest.visualAssets ?? [], parsed.data.files);
  input = { ...input, bundle: parsed.data };
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

  const schemaVersion = input.bundle.manifest.schemaVersion === "product-bundle.v5" ? 5 : input.bundle.manifest.schemaVersion === "product-bundle.v4" ? 4 : input.bundle.manifest.schemaVersion === "product-bundle.v3" ? 3 : 2;
  const legacyCourseId = await storedCourseId(input.courseId);
  const retryResult = (observed: typeof imporBundle.$inferSelect) => db.transaction(async tx => {
    await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_STAGE_FORBIDDEN", lock: true });
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, observed.id)).limit(1).for("update");
    if (!current || current.bundleType !== "product" || current.bundleId !== input.bundleId || current.checksum !== input.checksum || current.status !== observed.status || current.sourceUriOrKey !== observed.sourceUriOrKey || current.courseId !== legacyCourseId || current.version !== schemaVersion) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const currentItems = await tx.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, current.id));
    return { importId: current.id, bundleId: current.bundleId, checksum: current.checksum, sourceKey: current.sourceUriOrKey, created: false, replaced: false, status: productBundleLifecycleStatus(current.status), itemCount: currentItems.length };
  });
  const [same] = await db.select().from(imporBundle).where(and(eq(imporBundle.bundleId, input.bundleId), eq(imporBundle.checksum, input.checksum))).limit(1);
  if (same) { if (pairs.length) await stageInteractiveDocumentAssets(pairs); return retryResult(same); }
  const [conflict] = await db.select().from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId)).limit(1);
  if (!conflict && input.expectedPreviousChecksum !== undefined) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (conflict && productBundleLifecycleStatus(conflict.status) !== "draft") throw new Error(`PRODUCT_BUNDLE_CONFLICT:${input.bundleId}`);
  if (conflict && (conflict.version === 5) !== (schemaVersion === 5)) throw new Error("PRODUCT_V5_PROFILE_MISMATCH");
  if (conflict && input.expectedPreviousChecksum !== conflict.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (conflict && input.expectedPreviousChecksum !== undefined && input.expectedPreviousChecksum !== conflict.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  let unchangedSectionIds = new Set<string>();
  const unchangedSectionsByProduct = new Map<string, Set<string>>();
  const sectionOwners = new Map<string, string[]>();
  const previousSectionOwners = new Map<string, string[]>();
  let stalePdfProductIds = new Set<string>();
  let canPreservePedagogy = false;
  let previousBundleParsed: Extract<ProductBundleValidation, { success: true }>["data"] | null = null;

  if (conflict) {
    if (!storage.download) throw new Error("PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE");
    const previousBytes = await storage.download(conflict.sourceUriOrKey);
    const previous = await validateProductBundleAdmission(previousBytes);
    if (!previous.success) throw new Error(`PRODUCT_BUNDLE_PREVIOUS_VALIDATION_FAILED:${previous.issues.map(item => item.code).join(",")}`);
    if (previous.data.checksum !== conflict.checksum || previous.data.manifest.bundleId !== conflict.bundleId) throw new Error("PRODUCT_BUNDLE_PREVIOUS_CHECKSUM_MISMATCH");
    previousBundleParsed = previous.data;
    canPreservePedagogy = canPreservePedagogicReview(previous.data, input.bundle);
    stalePdfProductIds = findStalePdfEvidenceProductIds(previous.data, input.bundle);
    if (input.preserveUnchangedItemReviews) {
      unchangedSectionIds = unchangedArticleSectionIds(previous.data, input.bundle);
      for (const product of previous.data.products) {
        if (product.productType !== "article") continue;
        for (const section of product.sections) previousSectionOwners.set(section.id, [...(previousSectionOwners.get(section.id) ?? []), product.id]);
      }
      for (const product of input.bundle.products) {
        if (product.productType !== "article") continue;
        unchangedSectionsByProduct.set(product.id, unchangedArticleSectionIds(previous.data, input.bundle, product.id));
        for (const section of product.sections) sectionOwners.set(section.id, [...(sectionOwners.get(section.id) ?? []), product.id]);
      }
    }
  }

  const importId = stableId("impor-product", `${input.bundleId}:${input.checksum}`);
  const sourceKey = buildProductBundleKey(input);
  if (pairs.length) await stageInteractiveDocumentAssets(pairs);
  await storage.upload(input.bytes, input.filename ?? `${input.bundleId}.zip`, "application/zip", { key: sourceKey, metadata: { bundleId: input.bundleId, runId: input.runId, checksum: input.checksum } });
  const items = [
    ...input.bundle.products.map((product) => ({ entityType: product.productType, entityId: product.id, entityVersion: product.version, entityHash: productEntityHash(product) })),
    ...input.bundle.dependencies.map((dependency) => ({ entityType: "dependency", entityId: dependency.id, entityVersion: dependency.downstreamVersion, entityHash: hashDependency(dependency) })),
  ];
  try {
    await db.transaction(async (tx) => {
      await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_STAGE_FORBIDDEN", lock: true });
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.bundleId}))`);
      const current = await tx.select({ id: imporBundle.id, checksum: imporBundle.checksum, status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId));
      if (conflict ? current.length !== 1 || current[0].id !== conflict.id || current[0].checksum !== input.expectedPreviousChecksum || current[0].status !== "draft" : current.length !== 0) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
      const targetImportId = conflict?.id ?? importId;
      let preservedItemReviews: Array<typeof reviewItemBundle.$inferSelect> = [];
      const mutationAt = new Date();
      if (conflict) {
        await claimProductReviewSnapshot(tx, conflict, mutationAt);
        // Review writers take the same import lock. Read their latest decisions only after claiming it.
        if (unchangedSectionIds.size) {
          const existingReviews = await tx.select().from(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, conflict.id));
          preservedItemReviews = existingReviews.filter(review => {
            if (review.targetType !== "article_section" || !review.targetId) return false;
            const previousOwners = previousSectionOwners.get(review.targetId);
            const nextOwners = sectionOwners.get(review.targetId);
            const inferredOwner = previousOwners?.length === 1 && nextOwners?.length === 1 && previousOwners[0] === nextOwners[0] ? previousOwners[0] : undefined;
            const owner = review.productId ?? inferredOwner;
            return owner !== undefined && Boolean(unchangedSectionsByProduct.get(owner)?.has(review.targetId));
          });
        }
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
      const [previousStage] = await tx.select({ createdAt: auditMutasi.createdAt }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, targetImportId), inArray(auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id)).limit(1);
      await tx.insert(auditMutasi).values({ id: `audit-product-stage-${randomUUID()}`, actorId: input.requestedBy, entityType: "product_bundle", entityId: targetImportId, action: conflict ? "draft_replaced" : "draft_created", beforeSnapshot: conflict ? { checksum: conflict.checksum, status: productBundleLifecycleStatus(conflict.status) } : null, afterSnapshot: { status: "draft", bundleId: input.bundleId, checksum: input.checksum, productCount: input.bundle.products.length, dependencyCount: input.bundle.dependencies.length }, correlationId: input.runId, createdAt: nextMonotonicTimestamp(previousStage?.createdAt) });
    });
  } catch (error) {
    // A concurrent retry may already reference the same content-addressed key.
    if (error instanceof Error && error.message === "PRODUCT_BUNDLE_STALE_CONTEXT") {
      const [completed] = await db.select().from(imporBundle).where(and(eq(imporBundle.bundleId, input.bundleId), eq(imporBundle.checksum, input.checksum))).limit(1);
      if (completed) return retryResult(completed);
    }
    throw error;
  }
  return { importId: conflict?.id ?? importId, bundleId: input.bundleId, checksum: input.checksum, sourceKey, created: !conflict, replaced: Boolean(conflict), status: "draft" as const, itemCount: items.length };
}


export async function getProductBundleImport(importId: string) {
  const [row] = await revisionPublicationConnection().select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "product") return null;
  const [items, reviews] = await Promise.all([
    revisionPublicationConnection().select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId)),
    revisionPublicationConnection().select().from(reviewBundle).where(eq(reviewBundle.imporBundleId, importId)).orderBy(desc(reviewBundle.createdAt)),
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

/** Rebind an unchanged, scoped draft to an authorized run without replacing its artifact. */
export async function adoptProductDraftRun(input: { importId: string; actorId: string; expectedRevision: string; expectedStagingRunId: string; runId: string; expectedCourseId: string | null; expectedSourceUriOrKey: string; expectedVersion: number }) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedRevision) || !/^mcp-run-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.runId) || !input.expectedStagingRunId) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const row = await getProductBundleImport(input.importId);
  if (!row || row.status !== "draft" || row.checksum !== input.expectedRevision || row.courseId !== input.expectedCourseId || row.sourceUriOrKey !== input.expectedSourceUriOrKey || row.version !== input.expectedVersion || ![2, 3, 4].includes(row.version)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (await reviewerRole(row, input.actorId) !== "admin") throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.actorId, { roles: ["admin"], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, row.id)).limit(1).for("update");
    if (!current || current.status !== "draft" || current.bundleType !== row.bundleType || current.bundleId !== row.bundleId || current.checksum !== input.expectedRevision || current.courseId !== input.expectedCourseId || current.sourceUriOrKey !== input.expectedSourceUriOrKey || current.version !== input.expectedVersion || deterministicProductSerialization(current.validationReport) !== deterministicProductSerialization(row.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const [staging] = await tx.select().from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, row.id), inArray(auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id)).limit(1);
    if (!staging || staging.afterSnapshot?.checksum !== input.expectedRevision) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    if (staging.correlationId === input.runId && staging.afterSnapshot?.adoptedFrom === input.expectedStagingRunId) return { importId: row.id, checksum: row.checksum, runId: input.runId, adopted: false };
    if (staging.correlationId !== input.expectedStagingRunId || staging.correlationId === input.runId) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    const { productV4Verification: _verification, ...validationReport } = current.validationReport;
    await tx.update(imporBundle).set({ validationReport: { ...validationReport, productRunAdoption: { runId: input.runId, previousStagingAuditId: staging.id } }, updatedAt: new Date() }).where(eq(imporBundle.id, row.id));
    await tx.update(buktiPdfBundle).set({ status: "stale", updatedAt: new Date() }).where(eq(buktiPdfBundle.imporBundleId, row.id));
    await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, row.id));
    await tx.delete(reviewPedagogiBundle).where(eq(reviewPedagogiBundle.imporBundleId, row.id));
    await tx.insert(auditMutasi).values({ id: `audit-product-adopt-${randomUUID()}`, actorId: input.actorId, entityType: "product_bundle", entityId: row.id, action: "draft_replaced", beforeSnapshot: { checksum: row.checksum, stagingAuditId: staging.id, stagingRunId: staging.correlationId }, afterSnapshot: { checksum: row.checksum, status: "draft", operation: "run_adoption", adoptedFrom: staging.correlationId }, correlationId: input.runId, createdAt: nextMonotonicTimestamp(staging.createdAt) });
    return { importId: row.id, checksum: row.checksum, runId: input.runId, adopted: true };
  });
}

async function reviewerRole(importRow: NonNullable<Awaited<ReturnType<typeof getProductBundleImport>>>, reviewerId: string): Promise<"admin" | "tutor"> {
  const role = await assertAuthoringActor(db, reviewerId, { roles: ["admin", "tutor"], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN" });
  if (role === "admin") return role;
  if (!importRow.courseId) throw new Error("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
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
  expectedRevision?: string;
}) {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision) || input.expectedRevision !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const role = await reviewerRole(row, input.reviewerId);
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BLOCK_REVIEW_DRAFT_REQUIRED");
  if (row.reviews.some((review) => review.reviewerId === input.reviewerId)) throw new Error("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new Error("PRODUCT_BLOCK_REVIEW_NOTES_LIMIT");
  const bundle = await parseStagedProductBundle(input.importId);
  if (bundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const product = bundle.products.find((candidate) => candidate.id === input.productId);
  if (!product) throw new Error("PRODUCT_BLOCK_REVIEW_PRODUCT_NOT_FOUND");
  if (product.productType !== "article") throw new Error("PRODUCT_BLOCK_REVIEW_ARTICLE_REQUIRED");
  if (input.targetType === "article_section" && !product.sections.some((section) => section.id === input.targetId)) throw new Error("PRODUCT_SECTION_REVIEW_SECTION_NOT_FOUND");
  if (input.targetType === "article_block") {
    const blockExists = product.blocks.some((block) => block.id === input.targetId) || product.sections.some((section) => section.blocks.some((block) => block.id === input.targetId));
    if (!blockExists) throw new Error("PRODUCT_BLOCK_REVIEW_BLOCK_NOT_FOUND");
  }
  const now = new Date();
  const id = stableId("review-product-item", JSON.stringify([input.importId, input.reviewerId, input.targetType, input.productId, input.targetId]));
  await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true });
    if (role === "tutor" && (!row.courseId || !(await checkTutorCourseAccess(input.reviewerId, row.courseId, undefined, tx)).hasAccess)) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, row.id)).limit(1).for("update");
    if (!current || current.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (productBundleLifecycleStatus(current.status) !== "draft") throw new Error("PRODUCT_BLOCK_REVIEW_DRAFT_REQUIRED");
    await claimProductReviewSnapshot(tx, row, now);
    const [finalReview] = await tx.select({ id: reviewBundle.id }).from(reviewBundle).where(and(
      eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId),
    )).limit(1);
    if (finalReview) throw new Error("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
    await tx
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
        target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.targetType, reviewItemBundle.targetId, reviewItemBundle.productId],
        set: { status: input.status, notes, updatedAt: now },
      });
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
  expectedRevision?: string;
}) {
  const result = await upsertProductItemReview({ ...input, targetType: "article_block", targetId: input.blockId });
  return { ...result, blockId: result.targetId };
}

export async function reviewProductBundle(input: { importId: string; reviewerId: string; decision: "approved" | "rejected"; notes?: string; expectedRevision?: string }) {
  enabled();
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision) || input.expectedRevision !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const reviewedBundle = await parseStagedProductBundle(input.importId);
  if (reviewedBundle.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (reviewedBundle.products.some(product => product.productType === "article")) throw new Error("PRODUCT_BUNDLE_PEDAGOGIC_REVIEW_REQUIRED");
  if (reviewedBundle.manifest.schemaVersion === "product-bundle.v5") throw new Error("PRODUCT_V5_EXPLICIT_REVIEW_REQUIRED");
  const role = await reviewerRole(row, input.reviewerId);
  const [existing] = row.reviews.filter((review) => review.reviewerId === input.reviewerId);
  if (existing && (existing.status !== input.decision || (existing.notes ?? null) !== (input.notes ?? null))) throw new Error("PRODUCT_BUNDLE_REVIEW_IMMUTABLE");
  if (existing) {
    if (input.expectedRevision !== undefined) {
      await db.transaction(async (tx) => {
        await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true });
        if (role === "tutor" && (!row.courseId || !(await checkTutorCourseAccess(input.reviewerId, row.courseId, undefined, tx)).hasAccess)) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
        if (row.status === "draft") await claimProductReviewSnapshot(tx, row, new Date());
        else {
          const [current] = await tx.select({ checksum: imporBundle.checksum, status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, row.id)).limit(1);
          if (!current || current.checksum !== row.checksum || current.status !== row.status) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
        }
        const [currentReview] = await tx.select({ status: reviewBundle.status, notes: reviewBundle.notes }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId))).limit(1);
        if (!currentReview || currentReview.status !== existing.status || currentReview.notes !== existing.notes) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
      });
    }
    return { reviewId: existing.id, status: productBundleLifecycleStatus(row.status), reviewerRole: role };
  }
  const reviewId = stableId("review-product", `${input.importId}:${input.reviewerId}`);
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BUNDLE_REVIEW_DRAFT_REQUIRED");
  const status = "draft" as const;
  const now = new Date();
  await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "PRODUCT_BUNDLE_REVIEW_FORBIDDEN", lock: true });
    if (role === "tutor" && (!row.courseId || !(await checkTutorCourseAccess(input.reviewerId, row.courseId, undefined, tx)).hasAccess)) throw new Error("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
    await claimProductReviewSnapshot(tx, row, now);
    await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes: input.notes ?? null, reviewedAt: now });
    await tx.insert(auditMutasi).values({ id: `audit-product-review-${randomUUID()}`, actorId: input.reviewerId, entityType: "product_bundle", entityId: input.importId, action: input.decision === "approved" ? "reviewed" : "rejected", beforeSnapshot: null, afterSnapshot: { decision: input.decision, reviewerRole: role, ...(input.expectedRevision ? { revision: row.checksum } : {}) }, correlationId: input.importId });

  });
  return { reviewId, status, reviewerRole: role };
}

export async function discardProductBundleDraft(input: { importId: string; actorId: string; expectedRevision?: string }): Promise<{ importId: string; discarded: boolean }> {
  enabled();
  await assertAuthoringActor(db, input.actorId, { roles: ["admin"], error: "PRODUCT_BUNDLE_DISCARD_FORBIDDEN" });
  const row = await getProductBundleImport(input.importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== undefined && input.expectedRevision !== row.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (productBundleLifecycleStatus(row.status) !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
  await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.actorId, { roles: ["admin"], error: "PRODUCT_BUNDLE_DISCARD_FORBIDDEN", lock: true });
    await claimProductReviewSnapshot(tx, row, new Date());
    await tx.delete(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, row.id));
    await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, row.id));
    await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, row.id));
    await tx.delete(imporBundle).where(eq(imporBundle.id, row.id));
    await tx.insert(auditMutasi).values({ id: `audit-product-discard-${randomUUID()}`, actorId: input.actorId, entityType: "product_bundle", entityId: row.id, action: "draft_discarded", beforeSnapshot: { status: "draft", bundleId: row.bundleId, checksum: row.checksum }, afterSnapshot: null, correlationId: row.id });
  });
  return { importId: row.id, discarded: true };
}

export async function parseStagedProductBundle(importId: string): Promise<Extract<ProductBundleValidation, { success: true }>["data"]> {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (row.validationReport.valid !== true) throw new Error("PRODUCT_BUNDLE_ADMISSION_REQUIRED");
  const bundle = parseAdmittedProductBundle(await downloadProductBundleArtifact(importId), row);
  const specs = productInteractiveDocuments(bundle.products);
  if (specs.length && bundle.manifest.schemaVersion !== "product-bundle.v4") throw new Error("PRODUCT_VISUAL_REQUIRES_V4");
  await verifyAdmittedInteractiveDocumentArchive(specs, bundle.manifest.visualAssets ?? [], bundle.files);
  return bundle;
}
