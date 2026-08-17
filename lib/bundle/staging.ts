import { createHash } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  auditMutasi,
  imporBundle,
  itemImporBundle,
  courses,
  mataKuliah,
  reviewBundle,
  tutorCourses,
  user,
} from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildIdeaBundleKey } from "@/lib/storage/keys";
import { parseIdeaBundle, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { readSecureZip } from "@/lib/bundle/zip-reader";

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

function ensureFeatureEnabled(): void {
  if (process.env.FEATURE_IDEA_BUNDLE_V2 !== "1") {
    throw new Error("IDEA_BUNDLE_V2_DISABLED");
  }
}

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`INVALID_CHECKSUM:${field}`);
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

async function deleteArtifact(key: string): Promise<void> {
  await storage.delete(key).catch((error) => {
    console.error("[idea-bundle] failed to delete staged artifact", { key, error });
  });
}

export async function stageIdeaBundle(input: IdeaBundleStageInput): Promise<IdeaBundleStageResult> {
  ensureFeatureEnabled();
  assertSha256(input.checksum, "bundle");
  if (!input.validationReport.valid) throw new Error("IDEA_BUNDLE_VALIDATION_FAILED");
  if (input.items.length === 0) throw new Error("IDEA_BUNDLE_EMPTY");

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
    if (input.replaceImportId && sameBundle.id === input.replaceImportId) {
      const existingItems = await db
        .select({ id: itemImporBundle.id })
        .from(itemImporBundle)
        .where(eq(itemImporBundle.imporBundleId, sameBundle.id));
      return {
        importId: sameBundle.id,
        bundleId: sameBundle.bundleId,
        checksum: sameBundle.checksum,
        sourceKey: sameBundle.sourceUriOrKey,
        created: false,
        status: "existing",
        itemCount: existingItems.length,
      };
    }
    const existingItems = await db
      .select({ id: itemImporBundle.id })
      .from(itemImporBundle)
      .where(eq(itemImporBundle.imporBundleId, sameBundle.id));
    return {
      importId: sameBundle.id,
      bundleId: sameBundle.bundleId,
      checksum: sameBundle.checksum,
      sourceKey: sameBundle.sourceUriOrKey,
      created: false,
      status: "existing",
      itemCount: existingItems.length,
    };
  }

  const [conflictingBundle] = await db
    .select({ id: imporBundle.id, checksum: imporBundle.checksum, status: imporBundle.status, sourceUriOrKey: imporBundle.sourceUriOrKey })
    .from(imporBundle)
    .where(eq(imporBundle.bundleId, input.bundleId))
    .limit(1);
  if (conflictingBundle && conflictingBundle.id !== input.replaceImportId) throw new Error(`IDEA_BUNDLE_CONFLICT:${input.bundleId}`);

  const importId = input.replaceImportId ?? stableId("impor-idea", `${input.bundleId}:${input.checksum}`);
  const previousSourceKey = conflictingBundle?.id === input.replaceImportId ? conflictingBundle.sourceUriOrKey : null;
  if (input.replaceImportId && (!conflictingBundle || conflictingBundle.status === "published")) throw new Error("IDEA_BUNDLE_REPLACE_FORBIDDEN");
  const sourceKey = buildIdeaBundleKey(input);
  await uploadArtifact(input, sourceKey);

  try {
    await db.transaction(async (tx) => {
      const mutationAt = new Date();
      if (input.replaceImportId) {
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
          validationReport: input.validationReport,
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
          validationReport: input.validationReport,
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
        id: stableId("audit", `${importId}:${input.replaceImportId ? "replaced" : "imported"}:${input.checksum}`),
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
    await deleteArtifact(sourceKey);
    throw error;
  }
  if (previousSourceKey && previousSourceKey !== sourceKey) await deleteArtifact(previousSourceKey);

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
  const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "idea") return null;
  const [items, reviews] = await Promise.all([
    db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId)),
    db.select().from(reviewBundle).where(eq(reviewBundle.imporBundleId, importId)).orderBy(desc(reviewBundle.createdAt)),
  ]);
  return { ...row, items, reviews };
}

export async function listIdeaBundleImports(limit = 50) {
  return db
    .select()
    .from(imporBundle)
    .where(eq(imporBundle.bundleType, "idea"))
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
  const [actor] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, reviewerId)).limit(1);
  if (!actor) throw new Error("IDEA_BUNDLE_REVIEWER_NOT_FOUND");
  if (actor.role === "admin") return "admin";
  if (actor.role !== "teacher") throw new Error("IDEA_BUNDLE_REVIEW_FORBIDDEN");
  if (!importRow.courseId) throw new Error("IDEA_BUNDLE_COURSE_MISSING");
  const [assignment] = await db
    .select({ id: tutorCourses.id })
    .from(tutorCourses)
    .where(and(eq(tutorCourses.tutorId, reviewerId), eq(tutorCourses.courseId, importRow.courseId)))
    .limit(1);
  if (!assignment) throw new Error("IDEA_BUNDLE_REVIEW_COURSE_FORBIDDEN");
  return "tutor";
}

export async function reviewIdeaBundle(input: {
  importId: string;
  reviewerId: string;
  decision: "approved" | "rejected";
  notes?: string;
}) {
  ensureFeatureEnabled();
  const importRow = await getIdeaBundleImport(input.importId);
  if (!importRow) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (importRow.status === "published") throw new Error("IDEA_BUNDLE_ALREADY_PUBLISHED");
  const role = await assertReviewAccess(importRow, input.reviewerId);
  const reviewId = stableId("review-idea", `${input.importId}:${input.reviewerId}`);
  const nextImportStatus = input.decision === "rejected" ? "rejected" as const : role === "admin" ? "approved" as const : "validated" as const;
  const reviewedAt = new Date();

  await db.transaction(async (tx) => {
    const [existingReview] = await tx
      .select()
      .from(reviewBundle)
      .where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId)))
      .limit(1);
    if (existingReview) {
      if (existingReview.status !== input.decision || (existingReview.notes ?? null) !== (input.notes ?? null)) {
        throw new Error("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      }
      return;
    }
    await tx.insert(reviewBundle).values({
      id: reviewId,
      imporBundleId: input.importId,
      reviewerId: input.reviewerId,
      status: input.decision,
      notes: input.notes ?? null,
      reviewedAt,
    });
    await tx.update(imporBundle).set({ status: nextImportStatus, updatedAt: reviewedAt }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({
      id: stableId("audit", `${input.importId}:review:${input.reviewerId}`),
      actorId: input.reviewerId,
      entityType: "idea_bundle",
      entityId: input.importId,
      action: input.decision === "approved" ? "reviewed" : "rejected",
      beforeSnapshot: null,
      afterSnapshot: { decision: input.decision, notes: input.notes ?? null, reviewerRole: role },
      correlationId: input.importId,
    }).onConflictDoNothing();
  });

  return { reviewId, status: nextImportStatus, reviewerRole: role };
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
