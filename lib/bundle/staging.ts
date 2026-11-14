import { revisionPublicationConnection } from "@/lib/authoring/revision-publication-context";
import { normalizeDate } from "@/lib/date-utils";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditMutasi,
  imporBundle,
  itemImporBundle,
  courses,
  mataKuliah,
  reviewBundle,
  reviewItemBundle,
  pengguna,
} from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildIdeaBundleKey } from "@/lib/storage/keys";
import { parseIdeaBundle, serializeDeterministically, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import { isBundleIdentitySentinelOrPlaceholder } from "@/lib/bundle/attribution";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import { ideaItemReviewAuditId, ideaReviewAuditId, ideaReviewTargets, normalizeIdeaReviewItems, type IdeaReviewItem } from "@/lib/authoring/idea-review";

export type IdeaBundleStageItem = {
  entityType: string;
  entityId: string;
  entityVersion: number;
  entityHash: string;
};

export type IdeaBundleValidationReport = {
  valid: boolean;
  reasonCodes: string[];
  fileCount: number;
  entityCount: number;
  sourceCount: number;
  relationCount: number;
  warnings: string[];
  quality?: Record<string, unknown>;
  chapterId?: string | null;
  chapterTitle?: string | null;
  bundleTitle?: string | null;
};

export type IdeaBundleStageInput = {
  runId: string;
  bundleId: string;
  courseId: string;
  schemaVersion: number;
  checksum: string;
  bytes: Uint8Array;
  requestedBy: string;
  items: IdeaBundleStageItem[];
  validationReport: IdeaBundleValidationReport;
  filename?: string;
  replaceImportId?: string;
  expectedPreviousChecksum?: string;
  reviewResetFingerprint?: string;
};

export type IdeaBundleStageResult = {
  importId: string;
  bundleId: string;
  checksum: string;
  sourceKey: string;
  created: boolean;
  status: "validated" | "existing";
  itemCount: number;
};

type ConflictingIdeaBundle = {
  id: string;
  sourceUriOrKey: string;
};

export function previousIdeaBundleSourceKey(
  conflictingBundle: ConflictingIdeaBundle | undefined,
  replaceImportId: string | undefined,
): string | null {
  if (!conflictingBundle || !replaceImportId || conflictingBundle.id !== replaceImportId) return null;
  return conflictingBundle.sourceUriOrKey;
}

function ensureFeatureEnabled(): void {}

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`INVALID_CHECKSUM:${field}`);
}

/** A keyed digest binds all saved decisions without exposing reviewer identities or notes. */
async function ideaReviewResetState(connection: Pick<typeof db, "select">, importId: string, revision: string) {
  const [items, bundles] = await Promise.all([
    connection.select({ id: reviewItemBundle.id, status: reviewItemBundle.status, notes: reviewItemBundle.notes, updatedAt: reviewItemBundle.updatedAt }).from(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, importId)),
    connection.select({ id: reviewBundle.id, status: reviewBundle.status, notes: reviewBundle.notes, reviewedAt: reviewBundle.reviewedAt }).from(reviewBundle).where(eq(reviewBundle.imporBundleId, importId)),
  ]);
  const order = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHmac("sha256", resolveAuthSecret()).update("idea-review-reset.v1:").update(serializeDeterministically({ importId, revision, items: order(items).map(item => ({ ...item, updatedAt: item.updatedAt.toISOString() })), bundles: order(bundles).map(review => ({ ...review, reviewedAt: review.reviewedAt?.toISOString() ?? null })) })).digest("hex");
  return { revision, itemReviewCount: items.length, bundleReviewCount: bundles.length, fingerprint };
}

/** Read the aggregate while holding the same import lock used by reviewers and replacement. */
export async function getIdeaReviewResetState(importId: string, expectedRevision: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ checksum: imporBundle.checksum, bundleType: imporBundle.bundleType }).from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    if (!row || row.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    if (row.checksum !== expectedRevision) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
    return ideaReviewResetState(tx, importId, row.checksum);
  });
}

async function uploadArtifact(input: IdeaBundleStageInput, key: string): Promise<void> {
  await storage.upload(input.bytes, input.filename ?? `${input.bundleId}.zip`, "application/zip", {
    key,
    metadata: {
      bundleId: input.bundleId,
      runId: input.runId,
      checksum: input.checksum,
    },
  });
}


/**
 * Stages an Idea Bundle by validating identity requirements, checking course mapping,
 * uploading the artifact ZIP to storage, and persisting item records.
 */
export async function stageIdeaBundle(input: IdeaBundleStageInput): Promise<IdeaBundleStageResult> {
  ensureFeatureEnabled();
  await assertAuthoringActor(db, input.requestedBy, { roles: ["admin"], error: "IDEA_BUNDLE_STAGE_FORBIDDEN" });
  assertSha256(input.checksum, "bundle");
  if (!input.validationReport.valid) throw new Error("IDEA_BUNDLE_VALIDATION_FAILED");
  if (input.items.length === 0) throw new Error("IDEA_BUNDLE_EMPTY");

  const [uploader] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.requestedBy)).limit(1);
  if (!uploader) throw new Error("IDEA_BUNDLE_UPLOADER_NOT_FOUND");

  const bundle = parseIdeaBundle(readSecureZip(input.bytes));
  const creatorIdsToCheck = new Set<string>();
  const curatorIdsToCheck = new Set<string>();

  if (!isBundleIdentitySentinelOrPlaceholder(bundle.manifest.creatorId)) {
    creatorIdsToCheck.add(bundle.manifest.creatorId);
  }
  if (bundle.manifest.curatorId && !isBundleIdentitySentinelOrPlaceholder(bundle.manifest.curatorId)) {
    curatorIdsToCheck.add(bundle.manifest.curatorId);
  }
  for (const source of bundle.entities.sourceMaterials) {
    if (!isBundleIdentitySentinelOrPlaceholder(source.creatorId)) {
      creatorIdsToCheck.add(source.creatorId);
    }
  }
  for (const idea of bundle.entities.ideas) {
    if (!isBundleIdentitySentinelOrPlaceholder(idea.creatorId)) {
      creatorIdsToCheck.add(idea.creatorId);
    }
    if (idea.curatorId && !isBundleIdentitySentinelOrPlaceholder(idea.curatorId)) {
      curatorIdsToCheck.add(idea.curatorId);
    }
  }

  for (const creatorId of creatorIdsToCheck) {
    const [row] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, creatorId)).limit(1);
    if (!row) throw new Error(`IDEA_BUNDLE_CREATOR_UNKNOWN:${creatorId}`);
  }
  for (const curatorId of curatorIdsToCheck) {
    const [row] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, curatorId)).limit(1);
    if (!row) throw new Error(`IDEA_BUNDLE_CURATOR_UNKNOWN:${curatorId}`);
  }

  const [legacyCourse] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).limit(1);
  const [targetCourse] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, input.courseId), eq(mataKuliah.legacyCourseId, input.courseId)))
    .limit(1);
  const storedCourseId = legacyCourse?.id ?? targetCourse?.legacyCourseId;
  if (!storedCourseId) throw new Error(`IDEA_BUNDLE_COURSE_NOT_FOUND:${input.courseId}`);

  const [sameBundle] = await db
    .select()
    .from(imporBundle)
    .where(and(eq(imporBundle.bundleId, input.bundleId), eq(imporBundle.checksum, input.checksum)))
    .limit(1);
  if (sameBundle) {
    if (input.replaceImportId) {
      if (sameBundle.id !== input.replaceImportId || input.expectedPreviousChecksum !== sameBundle.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
      return db.transaction(async tx => {
        await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "IDEA_BUNDLE_STAGE_FORBIDDEN", lock: true });
        const [locked] = await tx.select().from(imporBundle).where(eq(imporBundle.id, sameBundle.id)).limit(1).for("update");
        if (!locked || locked.bundleId !== input.bundleId || locked.checksum !== input.expectedPreviousChecksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
        const existingItems = await tx.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, locked.id));
        return { importId: locked.id, bundleId: locked.bundleId, checksum: locked.checksum, sourceKey: locked.sourceUriOrKey, created: false, status: "existing" as const, itemCount: existingItems.length };
      });
    }
    return db.transaction(async tx => {
      await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "IDEA_BUNDLE_STAGE_FORBIDDEN", lock: true });
      const existingItems = await tx.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, sameBundle.id));
      return { importId: sameBundle.id, bundleId: sameBundle.bundleId, checksum: sameBundle.checksum, sourceKey: sameBundle.sourceUriOrKey, created: false, status: "existing" as const, itemCount: existingItems.length };
    });
  }

  const [conflictingBundle] = await db
    .select({ id: imporBundle.id, checksum: imporBundle.checksum, status: imporBundle.status, sourceUriOrKey: imporBundle.sourceUriOrKey })
    .from(imporBundle)
    .where(eq(imporBundle.bundleId, input.bundleId))
    .limit(1);
  if (conflictingBundle && conflictingBundle.id !== input.replaceImportId) throw new Error(`IDEA_BUNDLE_CONFLICT:${input.bundleId}`);

  const importId = input.replaceImportId ?? stableId("impor-idea", `${input.bundleId}:${input.checksum}`);
  const previousSourceKey = previousIdeaBundleSourceKey(conflictingBundle, input.replaceImportId);
  if (input.replaceImportId && (!conflictingBundle || ["published", "withdrawn", "discarding"].includes(conflictingBundle.status))) throw new Error("IDEA_BUNDLE_REPLACE_FORBIDDEN");
  if (input.replaceImportId && input.expectedPreviousChecksum !== conflictingBundle?.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  const sourceKey = buildIdeaBundleKey(input);
  await uploadArtifact(input, sourceKey);

  try {
    const firstChapterId = (input.validationReport as any).chapterId ?? bundle.entities.ideas[0]?.chapterId ?? bundle.entities.learningSections[0]?.chapterId ?? bundle.entities.sourceMaterials[0]?.chapterId ?? null;
    const firstTitle = (input.validationReport as any).bundleTitle ?? bundle.entities.learningSections[0]?.title ?? null;
    const mergedValidationReport = {
      ...input.validationReport,
      chapterId: firstChapterId,
      bundleTitle: firstTitle,
    };

    await db.transaction(async (tx) => {
      await assertAuthoringActor(tx, input.requestedBy, { roles: ["admin"], error: "IDEA_BUNDLE_STAGE_FORBIDDEN", lock: true });
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.bundleId}))`);
      const mutationAt = new Date();
      const [locked] = await tx.select({ id: imporBundle.id, checksum: imporBundle.checksum, status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.bundleId, input.bundleId)).limit(1).for("update");
      if (input.replaceImportId ? !locked || locked.id !== input.replaceImportId || locked.checksum !== input.expectedPreviousChecksum || ["published", "withdrawn", "discarding"].includes(locked.status) : Boolean(locked)) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
      if (input.replaceImportId) {
        const [current] = await tx.select({ status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
        if (!current || ["published", "withdrawn", "discarding"].includes(current.status)) throw new Error("IDEA_BUNDLE_REPLACE_FORBIDDEN");
        const resetState = await ideaReviewResetState(tx, importId, locked!.checksum);
        if (input.reviewResetFingerprint && input.reviewResetFingerprint !== resetState.fingerprint) throw new Error("IDEA_BUNDLE_REVIEW_RESET_STALE");
        if ((resetState.itemReviewCount > 0 || resetState.bundleReviewCount > 0) && !input.reviewResetFingerprint) throw new Error("IDEA_BUNDLE_REVIEW_RESET_REQUIRED");
        await tx.delete(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, importId));
        await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, importId));
        await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId));
        await tx.update(imporBundle).set({
          bundleId: input.bundleId,
          checksum: input.checksum,
          courseId: storedCourseId,
          sourceUriOrKey: sourceKey,
          version: input.schemaVersion,
          status: "validated",
          requestedBy: input.requestedBy,
          validationReport: mergedValidationReport,
          updatedAt: mutationAt,
        }).where(eq(imporBundle.id, importId));
      } else {
        await tx.insert(imporBundle).values({
          id: importId,
          bundleId: input.bundleId,
          checksum: input.checksum,
          bundleType: "idea",
          courseId: storedCourseId,
          sourceUriOrKey: sourceKey,
          version: input.schemaVersion,
          status: "validated",
          requestedBy: input.requestedBy,
          validationReport: mergedValidationReport,
        });
      }
      await tx.insert(itemImporBundle).values(input.items.map((item) => ({
        id: stableId("impor-item", `${importId}:${item.entityType}:${item.entityId}:${item.entityVersion}`),
        imporBundleId: importId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityVersion: item.entityVersion,
        entityHash: item.entityHash,
        status: "validated" as const,
      })));
      await tx.insert(auditMutasi).values({
        id: `audit-idea-stage-${randomUUID()}`,
        actorId: input.requestedBy,
        entityType: "idea_bundle",
        entityId: importId,
        action: input.replaceImportId ? "draft_replaced" : "imported",
        beforeSnapshot: input.replaceImportId ? { checksum: conflictingBundle?.checksum ?? null, sourceUriOrKey: previousSourceKey } : null,
        afterSnapshot: {
          bundleId: input.bundleId,
          checksum: input.checksum,
          itemCount: input.items.length,
          validation: input.validationReport,
        },
        correlationId: input.runId,
      });
    });
  } catch (error) {
    // Shared content-addressed objects can already belong to a concurrent winner.
    throw error;
  }
  // Retain previous content-addressed objects until reference-aware garbage collection.

  return {
    importId,
    bundleId: input.bundleId,
    checksum: input.checksum,
    sourceKey,
    created: !input.replaceImportId,
    status: "validated",
    itemCount: input.items.length,
  };
}

export async function getIdeaBundleImport(importId: string) {
  const [row] = await revisionPublicationConnection().select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "idea") return null;
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
      reviewedAt: review.reviewedAt === null ? null : normalizeDate(review.reviewedAt),
      createdAt: normalizeDate(review.createdAt),
    })),
  };
}

export async function listIdeaBundleImports(options?: number | { limit?: number; courseIds?: string[] }) {
  const limit = typeof options === "number" ? options : options?.limit ?? 50;
  const courseIds = typeof options === "object" ? options?.courseIds?.filter(Boolean) : undefined;
  const conditions = [eq(imporBundle.bundleType, "idea")];
  if (courseIds && courseIds.length > 0) {
    conditions.push(inArray(imporBundle.courseId, courseIds));
  }
  return db
    .select()
    .from(imporBundle)
    .where(and(...conditions))
    .orderBy(desc(imporBundle.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function downloadIdeaBundleArtifact(importId: string): Promise<Uint8Array> {
  const row = await getIdeaBundleImport(importId);
  if (!row) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (!storage.download) throw new Error("IDEA_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE");
  return storage.download(row.sourceUriOrKey);
}

export async function parseStagedIdeaBundle(importId: string): Promise<ValidatedIdeaBundle> {
  const row = await getIdeaBundleImport(importId);
  if (!row) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  const bundle = parseIdeaBundle(readSecureZip(await downloadIdeaBundleArtifact(importId)));
  if (bundle.manifest.bundleId !== row.bundleId || bundle.manifest.bundleChecksum !== row.checksum) {
    throw new Error("IDEA_BUNDLE_CHECKSUM_MISMATCH");
  }
  return bundle;
}

async function assertReviewAccess(importRow: NonNullable<Awaited<ReturnType<typeof getIdeaBundleImport>>>, reviewerId: string): Promise<"admin" | "tutor"> {
  const role = await assertAuthoringActor(db, reviewerId, { roles: ["admin", "tutor"], error: "IDEA_BUNDLE_REVIEW_FORBIDDEN" });
  if (role === "admin") return role;
  if (!importRow.courseId) throw new Error("IDEA_BUNDLE_COURSE_MISSING");
  const access = await checkTutorCourseAccess(reviewerId, importRow.courseId);
  if (!access.hasAccess) throw new Error("IDEA_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  return "tutor";
}

export async function listIdeaItemReviews(importId: string, reviewerId: string) {
  try {
    return await db.select().from(reviewItemBundle).where(and(
      eq(reviewItemBundle.imporBundleId, importId),
      eq(reviewItemBundle.reviewerId, reviewerId),
      eq(reviewItemBundle.targetType, "idea"),
    )).orderBy(reviewItemBundle.targetId);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const missingTargetColumns = message.includes("no such column") && (message.includes("target_type") || message.includes("target_id"));
    if (!missingTargetColumns) throw error;
    return [];
  }
}

/** Matches the revision evidence that makes this reviewer's item decisions immutable. */
export async function hasIdeaRevisionReviewEvidence(input: { importId: string; reviewerId: string; expectedRevision: string }) {
  const audits = await db.select({ afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
    eq(auditMutasi.actorId, input.reviewerId), eq(auditMutasi.entityType, "idea_bundle"),
    eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "revision_reviewed"),
  ));
  return audits.some(audit => audit.afterSnapshot?.revision === input.expectedRevision);
}

export async function upsertIdeaItemReview(input: {
  importId: string;
  reviewerId: string;
  ideaId: string;
  status: "pending" | "approved" | "changes_requested";
  notes?: string;
  expectedRevision: string;
}) {
  const importRow = await getIdeaBundleImport(input.importId);
  if (!importRow) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== importRow.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  const role = await assertReviewAccess(importRow, input.reviewerId);
  if (["published", "withdrawn", "discarding"].includes(importRow.status)) throw new Error("IDEA_ITEM_REVIEW_DRAFT_REQUIRED");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new Error("IDEA_ITEM_REVIEW_NOTES_LIMIT");
  const bundle = await parseStagedIdeaBundle(input.importId);
  if (bundle.manifest.bundleId !== importRow.bundleId || bundle.manifest.bundleChecksum !== importRow.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (!bundle.entities.ideas.some((idea) => idea.id === input.ideaId)) throw new Error("IDEA_ITEM_REVIEW_IDEA_NOT_FOUND");
  const id = stableId("review-idea-item", `${input.importId}:${input.reviewerId}:${input.ideaId}`);
  return db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "IDEA_BUNDLE_REVIEW_FORBIDDEN", lock: true });
    if (role === "tutor" && (!importRow.courseId || !(await checkTutorCourseAccess(input.reviewerId, importRow.courseId, undefined, tx)).hasAccess)) throw new Error("IDEA_BUNDLE_REVIEW_COURSE_FORBIDDEN");
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!current || current.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    if (["published", "withdrawn", "discarding"].includes(current.status)) throw new Error("IDEA_ITEM_REVIEW_DRAFT_REQUIRED");
    if (current.status !== importRow.status || current.checksum !== importRow.checksum || current.sourceUriOrKey !== importRow.sourceUriOrKey || current.version !== importRow.version || current.bundleId !== importRow.bundleId || current.courseId !== importRow.courseId || current.requestedBy !== importRow.requestedBy || JSON.stringify(current.validationReport) !== JSON.stringify(importRow.validationReport)) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
    const [finalReview] = await tx.select({ id: reviewBundle.id }).from(reviewBundle).where(and(
      eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId),
    )).limit(1);
    if (finalReview) {
      const reviews = await tx.select({ afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
        eq(auditMutasi.actorId, input.reviewerId), eq(auditMutasi.entityType, "idea_bundle"),
        eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "revision_reviewed"),
      ));
      // A legacy bundle-only decision may be reaffirmed with explicit item
      // decisions. Once revision evidence exists, those decisions are locked.
      if (reviews.some((review) => review.afterSnapshot?.revision === current.checksum)) throw new Error("IDEA_ITEM_REVIEW_IMMUTABLE");
    }

    const now = new Date();
    const claimed = await tx.update(imporBundle).set({ updatedAt: now }).where(and(
      eq(imporBundle.id, input.importId), eq(imporBundle.bundleType, "idea"),
      eq(imporBundle.status, importRow.status), eq(imporBundle.checksum, importRow.checksum),
      eq(imporBundle.sourceUriOrKey, importRow.sourceUriOrKey), eq(imporBundle.bundleId, importRow.bundleId),
    )).returning({ id: imporBundle.id });
    if (claimed.length !== 1) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
    await tx.insert(reviewItemBundle).values({
      id,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      productId: null,
      blockId: null,
      targetType: "idea",
      targetId: input.ideaId,
      status: input.status,
      notes,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.targetType, reviewItemBundle.targetId, reviewItemBundle.productId],
      set: { status: input.status, notes, updatedAt: now },
    });
    const item = { ideaId: input.ideaId, status: input.status, notes };
    await tx.insert(auditMutasi).values({
      id: ideaItemReviewAuditId(input.importId, input.reviewerId, importRow.checksum, item),
      actorId: input.reviewerId, entityType: "idea_bundle", entityId: input.importId,
      action: "item_reviewed", beforeSnapshot: null,
      afterSnapshot: { revision: importRow.checksum, ...item }, correlationId: input.importId,
    }).onConflictDoNothing();
    return { id, targetType: "idea" as const, targetId: input.ideaId, status: input.status, notes, updatedAt: now };
  });
}

export async function reviewIdeaBundle(input: {
  importId: string;
  reviewerId: string;
  decision: "approved" | "rejected";
  notes?: string;
  expectedRevision: string;
}) {
  ensureFeatureEnabled();
  const importRow = await getIdeaBundleImport(input.importId);
  if (!importRow) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== importRow.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (importRow.status === "published") throw new Error("IDEA_BUNDLE_ALREADY_PUBLISHED");
  const role = await assertReviewAccess(importRow, input.reviewerId);
  const bundle = await parseStagedIdeaBundle(input.importId);
  if (bundle.manifest.bundleId !== importRow.bundleId || bundle.manifest.bundleChecksum !== importRow.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  const targets = ideaReviewTargets(bundle);
  const hashes = new Map(targets.map((target) => [target.ideaId, target.ideaHash]));
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 4000) throw new Error("IDEA_BUNDLE_REVIEW_NOTES_LIMIT");
  const reviewId = stableId("review-idea", `${input.importId}:${input.reviewerId}`);
  const nextImportStatus = input.decision === "rejected" ? "rejected" as const : role === "admin" ? "approved" as const : "validated" as const;
  const reviewedAt = new Date();

  const result = await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: [role], error: "IDEA_BUNDLE_REVIEW_FORBIDDEN", lock: true });
    if (role === "tutor" && (!importRow.courseId || !(await checkTutorCourseAccess(input.reviewerId, importRow.courseId, undefined, tx)).hasAccess)) throw new Error("IDEA_BUNDLE_REVIEW_COURSE_FORBIDDEN");
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!current || current.bundleType !== "idea" || !["validated", "approved", "rejected"].includes(current.status) || current.status !== importRow.status || current.checksum !== importRow.checksum || current.sourceUriOrKey !== importRow.sourceUriOrKey || current.version !== importRow.version || current.bundleId !== importRow.bundleId || current.courseId !== importRow.courseId || current.requestedBy !== importRow.requestedBy || JSON.stringify(current.validationReport) !== JSON.stringify(importRow.validationReport)) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
    const [existingReview] = await tx
      .select()
      .from(reviewBundle)
      .where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId)))
      .limit(1);
    if (existingReview && (existingReview.status !== input.decision || (existingReview.notes ?? null) !== notes)) throw new Error("IDEA_BUNDLE_REVIEW_IMMUTABLE");
    const savedItems = await tx.select().from(reviewItemBundle).where(and(
      eq(reviewItemBundle.imporBundleId, input.importId), eq(reviewItemBundle.reviewerId, input.reviewerId), eq(reviewItemBundle.targetType, "idea"),
    )).for("update");
    const items = normalizeIdeaReviewItems(targets, savedItems.map((item) => ({
      ideaId: item.targetId ?? "", ideaHash: hashes.get(item.targetId ?? "") ?? "",
      status: item.status as IdeaReviewItem["status"], notes: item.notes,
    })), input.decision);
    const evidence = { revision: current.checksum, decision: input.decision, notes, items };
    const revisionAuditId = ideaReviewAuditId(input.importId, input.reviewerId, evidence);
    const [revisionAudit] = await tx.select({ id: auditMutasi.id, afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
      eq(auditMutasi.id, revisionAuditId), eq(auditMutasi.actorId, input.reviewerId),
      eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "revision_reviewed"),
    )).limit(1);
    if (existingReview && revisionAudit && serializeDeterministically(revisionAudit.afterSnapshot) === serializeDeterministically(evidence)) {
      return { reviewId: existingReview.id, status: current.status };
    }
    if (existingReview) {
      const previous = await tx.select({ afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
        eq(auditMutasi.actorId, input.reviewerId), eq(auditMutasi.entityType, "idea_bundle"),
        eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "revision_reviewed"),
      ));
      if (previous.some((audit) => audit.afterSnapshot?.revision === current.checksum)) throw new Error("IDEA_BUNDLE_REVIEW_IMMUTABLE");
    }
    const itemAuditIds = items.map(({ ideaId, status, notes: itemNotes }) => ideaItemReviewAuditId(input.importId, input.reviewerId, current.checksum, { ideaId, status, notes: itemNotes }));
    const itemAudits = await tx.select({ id: auditMutasi.id }).from(auditMutasi).where(and(
      inArray(auditMutasi.id, itemAuditIds), eq(auditMutasi.actorId, input.reviewerId),
      eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "item_reviewed"),
    ));
    if (itemAudits.length !== itemAuditIds.length) throw new Error("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
    if (!existingReview) await tx.insert(reviewBundle).values({
      id: reviewId,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      status: input.decision,
      notes,
      reviewedAt,
    });
    await tx.update(imporBundle).set({ status: nextImportStatus, updatedAt: reviewedAt }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({
      id: revisionAuditId,
      actorId: input.reviewerId,
      entityType: "idea_bundle",
      entityId: input.importId,
      action: "revision_reviewed",
      beforeSnapshot: { status: current.status },
      afterSnapshot: evidence,
      correlationId: input.importId,
    }).onConflictDoNothing();
    return { reviewId: existingReview?.id ?? reviewId, status: nextImportStatus };
  });

  return { ...result, reviewerRole: role };
}

export async function discardIdeaBundleDraft(input: { importId: string; actorId: string; expectedRevision?: string }): Promise<{ importId: string; discarded: boolean }> {
  await assertAuthoringActor(db, input.actorId, { roles: ["admin"], error: "IDEA_BUNDLE_DISCARD_FORBIDDEN" });

  return db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.actorId, { roles: ["admin"], error: "IDEA_BUNDLE_DISCARD_FORBIDDEN", lock: true });
    const [current] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!current) return { importId: input.importId, discarded: false };
    if (current.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    if (input.expectedRevision !== undefined && current.checksum !== input.expectedRevision) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
    if (["published", "withdrawn"].includes(current.status)) throw new Error("IDEA_BUNDLE_DRAFT_REQUIRED");
    await tx.delete(reviewItemBundle).where(eq(reviewItemBundle.imporBundleId, current.id));
    await tx.delete(reviewBundle).where(eq(reviewBundle.imporBundleId, current.id));
    await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, current.id));
    await tx.delete(imporBundle).where(eq(imporBundle.id, current.id));
    await tx.insert(auditMutasi).values({
      id: `audit-idea-discard-${randomUUID()}`, actorId: input.actorId,
      entityType: "idea_bundle", entityId: current.id, action: "draft_discarded",
      beforeSnapshot: { status: current.status, bundleId: current.bundleId, checksum: current.checksum },
      afterSnapshot: null, correlationId: current.id,
    });
    // Keys are shared by content identity. Only reference-aware garbage collection may delete them.
    return { importId: current.id, discarded: true };
  });
}

export async function reconcileIdeaBundle(importId: string) {
  const row = await getIdeaBundleImport(importId);
  if (!row) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  return {
    importId,
    status: row.status,
    itemCount: row.items.length,
    validatedItems: row.items.filter((item) => item.status === "validated").length,
    publishedItems: row.items.filter((item) => item.status === "published").length,
    reviewCount: row.reviews.length,
    auditCount: await db.select({ id: auditMutasi.id }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, importId))).then((rows) => rows.length),
  };
}
