import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  asalIde,
  auditMutasi,
  bab,
  bagianPembelajaran,
  bagianPembelajaranIde,
  concepts,
  courses,
  ide,
  imporBundle,
  itemImporBundle,
  mataKuliah,
  potonganSumber,
  publikasiBundle,
  relasiIde,
  reviewBundle,
  reviewItemBundle,
  sumberMateri,
  user,
  pengguna,
  vectorSyncQueue,
} from "@/db/schema";
import { downloadIdeaBundleArtifact, getIdeaBundleImport } from "@/lib/bundle/staging";
import { parseIdeaBundle, serializeDeterministically, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { sha256Text } from "@/lib/bundle/validator";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import { resolveBundleIdentity } from "@/lib/bundle/attribution";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { ideaReviewAuditId, ideaReviewTargets, normalizeIdeaReviewItems, type IdeaReviewItem } from "@/lib/authoring/idea-review";
import { lockCanonicalIdentities } from "@/lib/vectorize/canonical-locks";

export { ideaReviewTargets, normalizeIdeaReviewItems } from "@/lib/authoring/idea-review";

export type IdeaBundlePublicationResult = {
  publicationId: string;
  importId: string;
  bundleId: string;
  published: boolean;
  entityCounts: {
    sourceMaterials: number;
    sourceChunks: number;
    ideas: number;
    provenance: number;
    relations: number;
    learningSections: number;
  };
  vectorJobCount: number;
};

export type IdeaBundleWithdrawalResult = {
  importId: string;
  withdrawn: boolean;
  entityCount: number;
  vectorJobCount: number;
};

type FailureInjection = "source_materials" | "source_chunks" | "ideas" | "provenance" | "relations" | "learning_sections" | "outbox";

function ensureFeatureEnabled(): void {}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32)}`;
}

function publicationHash(importId: string, bundle: ValidatedIdeaBundle): string {
  return sha256Text(serializeDeterministically({
    importId,
    bundleChecksum: bundle.manifest.bundleChecksum,
    entityFiles: bundle.manifest.entityFiles.map((file) => ({ path: file.path, checksum: file.checksum })),
  }));
}

function maybeInjectFailure(stage: FailureInjection | undefined, expected: FailureInjection): void {
  if (stage !== expected) return;
  if (process.env.NODE_ENV !== "test" && process.env.STAGING_BUNDLE_FAILURE_TEST !== "1") return;
  throw new Error(`IDEA_BUNDLE_TEST_FAILURE:${expected}`);
}

function sourceUri(bundleKey: string, contentPath: string): string {
  return `${bundleKey}#${encodeURIComponent(contentPath)}`;
}

type CanonicalItem = { entityType: string; entityId: string; entityVersion: number; entityHash: string };

function canonicalItems(bundle: ValidatedIdeaBundle): CanonicalItem[] {
  const item = (entityType: string, entity: { id: string }, entityVersion: number) => ({
    entityType, entityId: entity.id, entityVersion, entityHash: sha256Text(serializeDeterministically(entity)),
  });
  return [
    ...bundle.entities.sourceMaterials.map((entity) => item("source_material", entity, entity.version)),
    ...bundle.entities.sourceChunks.map((entity) => item("source_chunk", entity, entity.sourceVersion)),
    ...bundle.entities.ideas.map((entity) => item("idea", entity, entity.version)),
    ...bundle.entities.provenance.map((entity) => item("provenance", entity, 1)),
    ...bundle.entities.relations.map((entity) => item("relation", entity, entity.version)),
    ...bundle.entities.learningSections.map((entity) => item("learning_section", entity, 1)),
  ];
}

function canonicalKey(entityType: string, entityId: string): string {
  return JSON.stringify([entityType, entityId]);
}

/** Lock all canonical identities in the same order, including records not yet inserted. */
async function lockCanonicalItems(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], items: CanonicalItem[]) {
  await lockCanonicalIdentities(tx, items.map((item) => ({ domain: "idea", entityType: item.entityType, entityId: item.entityId })));
}

function rejectRetiredEntity(entityType: string, id: string, status: string | undefined) {
  if (status && ["withdrawn", "superseded", "archived"].includes(status)) {
    throw new Error(`IDEA_BUNDLE_ENTITY_RETIRED:${entityType}:${id}`);
  }
}

/**
 * Compares fields between an existing database record and the expected payload,
 * optionally skipping non-semantic or dynamic fields (such as storage URIs or creator attribution).
 */
function assertEqualFields(
  existing: Record<string, unknown> | undefined,
  expected: Record<string, unknown>,
  code: string,
  ignoredKeys: string[] = [],
): boolean {
  if (!existing) return false;
  const ignored = new Set(ignoredKeys);
  for (const [key, value] of Object.entries(expected)) {
    if (ignored.has(key)) continue;
    if (serializeDeterministically(existing[key]) !== serializeDeterministically(value)) throw new Error(code);
  }
  return true;
}

async function requireIdentity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
  code: string,
  cache?: Set<string>,
): Promise<void> {
  if (cache?.has(id)) return;
  const [row] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, id)).limit(1);
  if (!row) throw new Error(code);
  cache?.add(id);
}

async function resolveCourse(tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db, courseId: string): Promise<{ legacyId: string; targetId: string }> {
  const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  const [target] = await tx
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);
  if (legacy && target) return { legacyId: legacy.id, targetId: target.id };
  if (legacy) {
    const [sameId] = await tx.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.id, courseId)).limit(1);
    if (sameId) return { legacyId: legacy.id, targetId: sameId.id };
  }
  if (target?.legacyCourseId) return { legacyId: target.legacyCourseId, targetId: target.id };
  throw new Error(`IDEA_BUNDLE_COURSE_NOT_FOUND:${courseId}`);
}

async function resolveChapter(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  chapterId: string | undefined,
  courseTargetId: string,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  if (!chapterId) return null;
  const key = `${chapterId}:${courseTargetId}`;
  if (cache?.has(key)) return cache.get(key)!;
  const [row] = await tx
    .select({ id: bab.id, mataKuliahId: bab.mataKuliahId })
    .from(bab)
    .where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId)))
    .limit(1);
  if (!row || row.mataKuliahId !== courseTargetId) throw new Error(`IDEA_BUNDLE_CHAPTER_NOT_FOUND:${chapterId}`);
  cache?.set(key, row.id);
  return row.id;
}

async function loadAndValidate(importId: string, expectedBundleId: string, expectedChecksum: string): Promise<ValidatedIdeaBundle> {
  const bytes = await downloadIdeaBundleArtifact(importId);
  const archive = readSecureZip(bytes);
  if (archive.checksum.length !== 64) throw new Error("IDEA_BUNDLE_ARCHIVE_CHECKSUM_INVALID");
  const bundle = parseIdeaBundle(archive);
  if (bundle.manifest.bundleId !== expectedBundleId) throw new Error("IDEA_BUNDLE_ID_MISMATCH");
  if (bundle.manifest.bundleChecksum !== expectedChecksum) throw new Error("IDEA_BUNDLE_CHECKSUM_MISMATCH");
  return bundle;
}

type IdeaSnapshot = NonNullable<Awaited<ReturnType<typeof getIdeaBundleImport>>>;
function assertIdeaSnapshot(row: typeof imporBundle.$inferSelect, snapshot: IdeaSnapshot) {
  if (row.bundleType !== "idea" || row.bundleId !== snapshot.bundleId || row.checksum !== snapshot.checksum ||
      row.sourceUriOrKey !== snapshot.sourceUriOrKey || row.courseId !== snapshot.courseId || row.version !== snapshot.version ||
      row.requestedBy !== snapshot.requestedBy || serializeDeterministically(row.validationReport) !== serializeDeterministically(snapshot.validationReport)) {
    throw new Error("IDEA_BUNDLE_PUBLICATION_CONFLICT");
  }
}

/** Claim the exact staged snapshot before reading reviews or writing canonical records. */
async function claimIdeaSnapshot(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], snapshot: IdeaSnapshot, status: "validated" | "approved" | "rejected") {
  const claimed = await tx.update(imporBundle).set({ updatedAt: new Date() }).where(and(
    eq(imporBundle.id, snapshot.id), eq(imporBundle.bundleType, "idea"), eq(imporBundle.status, status),
    eq(imporBundle.bundleId, snapshot.bundleId), eq(imporBundle.checksum, snapshot.checksum),
    eq(imporBundle.sourceUriOrKey, snapshot.sourceUriOrKey), eq(imporBundle.version, snapshot.version),
    eq(imporBundle.requestedBy, snapshot.requestedBy), eq(imporBundle.validationReport, snapshot.validationReport),
    snapshot.courseId === null ? isNull(imporBundle.courseId) : eq(imporBundle.courseId, snapshot.courseId),
  )).returning({ id: imporBundle.id });
  if (claimed.length !== 1) throw new Error("IDEA_BUNDLE_PUBLICATION_CONFLICT");
}

async function requireIdeaAdmin(actorId: string) {
  await assertAuthoringActor(db, actorId, { roles: ["admin"], error: "IDEA_BUNDLE_PUBLISH_FORBIDDEN", requireLegacyAdmin: true });
}

/** Read the reviewable content and hashes without returning storage locations or actor IDs. */
export async function getIdeaRevisionReviewContext(input: { importId: string; reviewerId: string; expectedRevision: string }) {
  await requireIdeaAdmin(input.reviewerId);
  const snapshot = await getIdeaBundleImport(input.importId);
  if (!snapshot) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (snapshot.checksum !== input.expectedRevision) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (!["validated", "approved", "rejected"].includes(snapshot.status)) throw new Error("IDEA_BUNDLE_REVIEW_DRAFT_REQUIRED");
  const bundle = await loadAndValidate(input.importId, snapshot.bundleId, snapshot.checksum);
  const targets = new Map(ideaReviewTargets(bundle).map((target) => [target.ideaId, target.ideaHash]));
  const preview = previewIdeaBundle(bundle);
  const priorReview = snapshot.reviews.find((review) => review.reviewerId === input.reviewerId);
  return {
    revision: snapshot.checksum,
    bundleId: snapshot.bundleId,
    priorDecision: priorReview ? { decision: priorReview.status, notes: priorReview.notes } : null,
    preview,
    ideas: bundle.entities.ideas.map(({ creatorId: _creatorId, curatorId: _curatorId, ...idea }) => ({ ...idea, ideaHash: targets.get(idea.id) })),
  };
}

/** Record actual item decisions and bundle decision atomically on one exact revision. */
export async function reviewIdeaBundleRevision(input: {
  importId: string; reviewerId: string; expectedRevision: string; decision: "approved" | "rejected";
  items: IdeaReviewItem[]; notes?: string;
}) {
  await requireIdeaAdmin(input.reviewerId);
  const snapshot = await getIdeaBundleImport(input.importId);
  if (!snapshot) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== snapshot.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  const bundle = await loadAndValidate(input.importId, snapshot.bundleId, snapshot.checksum);
  const items = normalizeIdeaReviewItems(ideaReviewTargets(bundle), input.items, input.decision);
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 4000) throw new Error("IDEA_BUNDLE_REVIEW_NOTES_LIMIT");
  const reviewId = deterministicId("review-idea", `${input.importId}:${input.reviewerId}`);
  const evidence = { revision: snapshot.checksum, decision: input.decision, notes, items };
  const auditId = ideaReviewAuditId(input.importId, input.reviewerId, evidence);
  return db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.reviewerId, { roles: ["admin"], error: "IDEA_BUNDLE_PUBLISH_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!row) throw new Error("IDEA_BUNDLE_NOT_FOUND");
    assertIdeaSnapshot(row, snapshot);
    if (row.status !== "validated" && row.status !== "approved" && row.status !== "rejected") throw new Error("IDEA_BUNDLE_REVIEW_DRAFT_REQUIRED");
    const [prior] = await tx.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.reviewerId))).limit(1);
    if (prior) {
      if (prior.status !== input.decision || (prior.notes ?? null) !== notes) throw new Error("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      const audits = await tx.select({ afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
        eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, input.importId),
        eq(auditMutasi.actorId, input.reviewerId), eq(auditMutasi.action, "revision_reviewed"),
      ));
      const current = audits.filter((audit) => audit.afterSnapshot?.revision === snapshot.checksum);
      if (current.length) {
        if (!current.some((audit) => serializeDeterministically(audit.afterSnapshot) === serializeDeterministically(evidence))) throw new Error("IDEA_BUNDLE_REVIEW_IMMUTABLE");
        return { reviewId: prior.id, status: row.status, revision: snapshot.checksum, recorded: false };
      }
      // A legacy bundle-only decision is not item evidence. The reviewer must
      // explicitly reaffirm it and supply every item decision on this revision.
      if (!["validated", "approved", "rejected"].includes(row.status)) throw new Error("IDEA_BUNDLE_REVIEW_DRAFT_REQUIRED");
    } else if (!["validated", "approved", "rejected"].includes(row.status)) {
      throw new Error("IDEA_BUNDLE_REVIEW_DRAFT_REQUIRED");
    }
    await claimIdeaSnapshot(tx, snapshot, row.status);
    const now = new Date();
    await tx.delete(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId, input.importId), eq(reviewItemBundle.reviewerId, input.reviewerId), eq(reviewItemBundle.targetType, "idea")));
    for (const item of items) {
      await tx.insert(reviewItemBundle).values({
        id: deterministicId("review-idea-item", `${input.importId}:${input.reviewerId}:${item.ideaId}`),
        imporBundleId: input.importId, reviewerId: input.reviewerId, productId: null, blockId: null,
        targetType: "idea", targetId: item.ideaId, status: item.status, notes: item.notes, createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({ target: [reviewItemBundle.imporBundleId, reviewItemBundle.reviewerId, reviewItemBundle.targetType, reviewItemBundle.targetId], set: { status: item.status, notes: item.notes, updatedAt: now } });
    }
    if (!prior) await tx.insert(reviewBundle).values({ id: reviewId, imporBundleId: input.importId, reviewerId: input.reviewerId, status: input.decision, notes, reviewedAt: now });
    const status = input.decision === "approved" ? "approved" as const : "rejected" as const;
    await tx.update(imporBundle).set({ status, updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: auditId, actorId: input.reviewerId, entityType: "idea_bundle", entityId: input.importId, action: "revision_reviewed", beforeSnapshot: { status: row.status }, afterSnapshot: evidence, correlationId: input.importId }).onConflictDoNothing();
    return { reviewId: prior?.id ?? reviewId, status, revision: snapshot.checksum, recorded: true };
  });
}

/**
 * Publishes an approved Idea Bundle, verifying manifest signatures,
 * deduplicating shared entities, and persisting canonical learning atoms.
 */
export async function publishIdeaBundle(input: {
  importId: string;
  publishedBy: string;
  expectedRevision: string;
  testFailureAfter?: FailureInjection;
}): Promise<IdeaBundlePublicationResult> {
  ensureFeatureEnabled();
  await requireIdeaAdmin(input.publishedBy);
  const importSnapshot = await getIdeaBundleImport(input.importId);
  if (!importSnapshot) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== importSnapshot.checksum) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (importSnapshot.status === "published") {
    const [existingPublication] = await db
      .select({ id: publikasiBundle.id, status: publikasiBundle.status, publicationHash: publikasiBundle.publicationHash })
      .from(publikasiBundle)
      .where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published")))
      .limit(1);
    if (!existingPublication) throw new Error("IDEA_BUNDLE_PUBLISHED_RECORD_MISSING");
    const publishedBundle = await loadAndValidate(input.importId, importSnapshot.bundleId, importSnapshot.checksum);
    if (existingPublication.publicationHash !== publicationHash(input.importId, publishedBundle)) throw new Error("IDEA_BUNDLE_PUBLICATION_CONFLICT");
    return db.transaction(async (tx) => {
      await assertAuthoringActor(tx, input.publishedBy, { roles: ["admin"], error: "IDEA_BUNDLE_PUBLISH_FORBIDDEN", lock: true, requireLegacyAdmin: true });
      return {
        publicationId: existingPublication.id,
        importId: input.importId,
        bundleId: importSnapshot.bundleId,
        published: false,
        entityCounts: {
          sourceMaterials: 0,
          sourceChunks: 0,
          ideas: 0,
          provenance: 0,
          relations: 0,
          learningSections: 0,
        },
        vectorJobCount: 0,
      };
    });
  }
  if (!["validated", "approved", "rejected"].includes(importSnapshot.status)) throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");

  const bundle = await loadAndValidate(input.importId, importSnapshot.bundleId, importSnapshot.checksum);
  if (bundle.manifest.courseId !== importSnapshot.courseId && importSnapshot.courseId !== null) {
    const course = await db
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, importSnapshot.courseId))
      .limit(1);
    if (course.length === 0 || course[0].id !== bundle.manifest.courseId) throw new Error("IDEA_BUNDLE_COURSE_MISMATCH");
  }

  let courseLegacyId: string | undefined;
  const canonical = canonicalItems(bundle);
  const result = await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.publishedBy, { roles: ["admin"], error: "IDEA_BUNDLE_PUBLISH_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!row || row.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    assertIdeaSnapshot(row, importSnapshot);
    if (row.status === "published") {
      const [existingPublication] = await tx
        .select({ id: publikasiBundle.id, status: publikasiBundle.status, publicationHash: publikasiBundle.publicationHash })
        .from(publikasiBundle)
        .where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published")))
        .limit(1);
      if (!existingPublication) throw new Error("IDEA_BUNDLE_PUBLISHED_RECORD_MISSING");
      if (existingPublication.publicationHash !== publicationHash(input.importId, bundle)) throw new Error("IDEA_BUNDLE_PUBLICATION_CONFLICT");
      return {
        publicationId: existingPublication.id,
        importId: input.importId,
        bundleId: row.bundleId,
        published: false,
        entityCounts: {
          sourceMaterials: 0,
          sourceChunks: 0,
          ideas: 0,
          provenance: 0,
          relations: 0,
          learningSections: 0,
        },
        vectorJobCount: 0,
      };
    }
    if (row.status !== "validated" && row.status !== "approved" && row.status !== "rejected") throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    await claimIdeaSnapshot(tx, importSnapshot, row.status);
    await lockCanonicalItems(tx, canonical);

    await requireIdentity(tx, input.publishedBy, "IDEA_BUNDLE_PUBLISHER_NOT_FOUND");

    const [approvedReview] = await tx
      .select({ id: reviewBundle.id, reviewerId: reviewBundle.reviewerId })
      .from(reviewBundle)
      .innerJoin(user, eq(user.id, reviewBundle.reviewerId))
      .where(and(
        eq(reviewBundle.imporBundleId, input.importId),
        eq(reviewBundle.status, "approved"),
        eq(user.role, "admin"),
        eq(reviewBundle.reviewerId, input.publishedBy),
      ))
      .limit(1);
    if (!approvedReview) throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");

    {
      const [review] = await tx.select({ notes: reviewBundle.notes }).from(reviewBundle).where(eq(reviewBundle.id, approvedReview.id)).limit(1);
      const savedItems = await tx.select({ ideaId: reviewItemBundle.targetId, status: reviewItemBundle.status, notes: reviewItemBundle.notes })
        .from(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId, input.importId), eq(reviewItemBundle.reviewerId, approvedReview.reviewerId), eq(reviewItemBundle.targetType, "idea"))).for("update");
      const hashes = new Map(ideaReviewTargets(bundle).map((target) => [target.ideaId, target.ideaHash]));
      const items = normalizeIdeaReviewItems(ideaReviewTargets(bundle), savedItems.map((item) => ({ ideaId: item.ideaId ?? "", ideaHash: hashes.get(item.ideaId ?? "") ?? "", status: item.status as IdeaReviewItem["status"], notes: item.notes })), "approved");
      const evidence = { revision: row.checksum, decision: "approved", notes: review?.notes ?? null, items };
      const [audit] = await tx.select({ afterSnapshot: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(
        eq(auditMutasi.id, ideaReviewAuditId(input.importId, approvedReview.reviewerId, evidence)),
        eq(auditMutasi.actorId, approvedReview.reviewerId), eq(auditMutasi.entityId, input.importId), eq(auditMutasi.action, "revision_reviewed"),
      )).limit(1);
      if (!audit || serializeDeterministically(audit.afterSnapshot) !== serializeDeterministically(evidence)) throw new Error("IDEA_BUNDLE_REVISION_REVIEW_REQUIRED");
    }

    const course = await resolveCourse(tx, bundle.manifest.courseId);
    courseLegacyId = course.legacyId;
    const now = new Date();
    const attribution = { uploaderId: row.requestedBy, approvingReviewerId: approvedReview.reviewerId };
    const publicationId = deterministicId("publikasi-idea", input.importId);
    const sourceContentPathById = new Map(bundle.manifest.sourceVersions.map((source) => [source.sourceMaterialId, source.contentPath]));
    const chapterBySourceId = new Map<string, string | null>();
    const identityCache = new Set<string>();
    const chapterCache = new Map<string, string | null>();

    const sourceIds = bundle.entities.sourceMaterials.map((s) => s.id);
    const existingSources = sourceIds.length > 0
      ? await tx.select().from(sumberMateri).where(inArray(sumberMateri.id, sourceIds))
      : [];
    const existingSourceById = new Map(existingSources.map((s) => [s.id, s]));

    const sourcesToInsert: Array<typeof sumberMateri.$inferInsert> = [];
    for (const source of bundle.entities.sourceMaterials) {
      if (source.courseId !== bundle.manifest.courseId) throw new Error(`IDEA_BUNDLE_SOURCE_COURSE_MISMATCH:${source.id}`);
      const targetChapterId = await resolveChapter(tx, source.chapterId, course.targetId, chapterCache);
      chapterBySourceId.set(source.id, targetChapterId);
      if (source.status !== "active") throw new Error(`IDEA_BUNDLE_SOURCE_NOT_ACTIVE:${source.id}`);
      const creatorId = resolveBundleIdentity(source.creatorId, attribution);
      await requireIdentity(tx, creatorId, `IDEA_BUNDLE_CREATOR_NOT_FOUND:${creatorId}`, identityCache);
      const sourcePayload = {
        id: source.id,
        mataKuliahId: course.targetId,
        babId: targetChapterId,
        sourceType: source.sourceType,
        title: source.title,
        canonicalUriOrR2Key: sourceUri(row.sourceUriOrKey, sourceContentPathById.get(source.id) ?? ""),
        version: source.version,
        checksum: source.checksum,
        status: source.status,
        creatorId,
      };
      const existing = existingSourceById.get(source.id);
      rejectRetiredEntity("source_material", source.id, existing?.status);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, sourcePayload, "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT", ["canonicalUriOrR2Key", "creatorId"])) {
        sourcesToInsert.push(sourcePayload);
      }
    }
    if (sourcesToInsert.length > 0) {
      await tx.insert(sumberMateri).values(sourcesToInsert);
    }
    maybeInjectFailure(input.testFailureAfter, "source_materials");

    const chunkIds = bundle.entities.sourceChunks.map((c) => c.id);
    const existingChunks = chunkIds.length > 0
      ? await tx.select().from(potonganSumber).where(inArray(potonganSumber.id, chunkIds))
      : [];
    const existingChunkById = new Map(existingChunks.map((c) => [c.id, c]));

    const chunksToInsert: Array<typeof potonganSumber.$inferInsert> = [];
    for (const chunk of bundle.entities.sourceChunks) {
      const chunkPayload = {
        id: chunk.id,
        sumberMateriId: chunk.sourceMaterialId,
        sourceVersion: chunk.sourceVersion,
        content: chunk.content,
        pageNumber: chunk.pageNumber ?? null,
        sectionLocator: chunk.sectionLocator ?? null,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        checksum: chunk.checksum,
        embeddingEligible: chunk.embeddingEligible,
      };
      const existing = existingChunkById.get(chunk.id);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, chunkPayload, "IDEA_BUNDLE_SOURCE_CHUNK_CONFLICT")) {
        chunksToInsert.push(chunkPayload);
      }
    }
    if (chunksToInsert.length > 0) {
      await tx.insert(potonganSumber).values(chunksToInsert);
    }
    maybeInjectFailure(input.testFailureAfter, "source_chunks");

    const conceptIds = Array.from(new Set(bundle.entities.ideas.map((i) => i.conceptId).filter(Boolean) as string[]));
    if (conceptIds.length > 0) {
      const existingConcepts = await tx.select({ id: concepts.id }).from(concepts).where(inArray(concepts.id, conceptIds));
      const validConceptIds = new Set(existingConcepts.map((c) => c.id));
      for (const conceptId of conceptIds) {
        if (!validConceptIds.has(conceptId)) {
          throw new Error(`IDEA_BUNDLE_CONCEPT_NOT_FOUND:${conceptId}`);
        }
      }
    }

    const ideaIds = bundle.entities.ideas.map((i) => i.id);
    const existingIdeas = ideaIds.length > 0
      ? await tx.select().from(ide).where(inArray(ide.id, ideaIds))
      : [];
    const existingIdeaById = new Map(existingIdeas.map((i) => [i.id, i]));

    const ideasToInsert: Array<typeof ide.$inferInsert> = [];
    for (const idea of bundle.entities.ideas) {
      if (idea.courseId !== bundle.manifest.courseId) throw new Error(`IDEA_BUNDLE_IDEA_COURSE_MISMATCH:${idea.id}`);
      if (idea.status !== "published") throw new Error(`IDEA_BUNDLE_IDEA_NOT_PUBLISHABLE:${idea.id}`);
      const targetChapterId = await resolveChapter(tx, idea.chapterId, course.targetId, chapterCache);
      const creatorId = resolveBundleIdentity(idea.creatorId, attribution);
      const curatorId = idea.curatorId ? resolveBundleIdentity(idea.curatorId, attribution) : null;
      await requireIdentity(tx, creatorId, `IDEA_BUNDLE_CREATOR_NOT_FOUND:${creatorId}`, identityCache);
      if (curatorId) {
        await requireIdentity(tx, curatorId, `IDEA_BUNDLE_CURATOR_NOT_FOUND:${curatorId}`, identityCache);
      }
      const ideaPayload = {
        id: idea.id,
        mataKuliahId: course.targetId,
        babId: targetChapterId as string,
        conceptId: idea.conceptId ?? null,
        stableKey: idea.stableKey,
        code: idea.code,
        canonicalStatement: idea.canonicalStatement,
        conciseExplanation: idea.conciseExplanation,
        latex: idea.latex ?? null,
        knowledgeKind: idea.knowledgeKind,
        instructionalRole: idea.instructionalRole,
        difficultyMetadata: idea.difficultyMetadata ?? {},
        version: idea.version,
        status: idea.status,
        sourcePolicy: idea.sourcePolicy,
        schemaVersion: idea.schemaVersion,
        semanticHash: idea.semanticHash,
        generationHash: idea.generationHash,
        creatorId,
        curatorId,
      };
      const existing = existingIdeaById.get(idea.id);
      rejectRetiredEntity("idea", idea.id, existing?.status);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, ideaPayload, "IDEA_BUNDLE_IDEA_VERSION_CONFLICT", ["creatorId", "curatorId"])) {
        ideasToInsert.push(ideaPayload);
      }
    }
    if (ideasToInsert.length > 0) {
      await tx.insert(ide).values(ideasToInsert);
    }
    maybeInjectFailure(input.testFailureAfter, "ideas");

    const provIds = bundle.entities.provenance.map((p) => p.id);
    const existingProvs = provIds.length > 0
      ? await tx.select().from(asalIde).where(inArray(asalIde.id, provIds))
      : [];
    const existingProvById = new Map(existingProvs.map((p) => [p.id, p]));

    const provsToInsert: Array<typeof asalIde.$inferInsert> = [];
    for (const provenance of bundle.entities.provenance) {
      const provenancePayload = {
        id: provenance.id,
        ideId: provenance.ideaId,
        sourceChunkId: provenance.sourceChunkId,
        provenanceRole: provenance.provenanceRole === "primary" ? "core" as const : provenance.provenanceRole === "context" ? "reference" as const : provenance.provenanceRole,
        startOffset: provenance.startOffset,
        endOffset: provenance.endOffset,
        sourceChecksum: provenance.sourceChecksum,
        note: provenance.note ?? null,
      };
      const existing = existingProvById.get(provenance.id);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, provenancePayload, "IDEA_BUNDLE_PROVENANCE_CONFLICT")) {
        provsToInsert.push(provenancePayload);
      }
    }
    if (provsToInsert.length > 0) {
      await tx.insert(asalIde).values(provsToInsert);
    }
    maybeInjectFailure(input.testFailureAfter, "provenance");

    const relIds = bundle.entities.relations.map((r) => r.id);
    const existingRels = relIds.length > 0
      ? await tx.select().from(relasiIde).where(inArray(relasiIde.id, relIds))
      : [];
    const existingRelById = new Map(existingRels.map((r) => [r.id, r]));

    const relsToInsert: Array<typeof relasiIde.$inferInsert> = [];
    for (const relation of bundle.entities.relations) {
      const relationPayload = {
        id: relation.id,
        sourceIdeaId: relation.sourceIdeaId,
        targetIdeaId: relation.targetIdeaId,
        relationType: relation.relationType,
        explanation: relation.explanation ?? null,
        version: relation.version,
        status: relation.status,
      };
      const existing = existingRelById.get(relation.id);
      rejectRetiredEntity("relation", relation.id, existing?.status);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, relationPayload, "IDEA_BUNDLE_RELATION_CONFLICT")) {
        relsToInsert.push(relationPayload);
      }
    }
    if (relsToInsert.length > 0) {
      await tx.insert(relasiIde).values(relsToInsert);
    }
    maybeInjectFailure(input.testFailureAfter, "relations");

    const sectionIds = bundle.entities.learningSections.map((s) => s.id);
    const existingSections = sectionIds.length > 0
      ? await tx.select().from(bagianPembelajaran).where(inArray(bagianPembelajaran.id, sectionIds))
      : [];
    const existingSectionById = new Map(existingSections.map((s) => [s.id, s]));

    const existingSectionIdeas = sectionIds.length > 0
      ? await tx.select().from(bagianPembelajaranIde).where(inArray(bagianPembelajaranIde.bagianPembelajaranId, sectionIds))
      : [];
    const existingIdeasBySectionId = new Map<string, Map<string, "primary" | "supporting">>();
    for (const row of existingSectionIdeas) {
      let map = existingIdeasBySectionId.get(row.bagianPembelajaranId);
      if (!map) {
        map = new Map();
        existingIdeasBySectionId.set(row.bagianPembelajaranId, map);
      }
      map.set(row.ideId, row.role);
    }

    const pendingSections = new Map(bundle.entities.learningSections.map((section) => [section.id, section]));
    const insertedSectionIds = new Set<string>();
    const sectionIdeaRows: Array<{ id: string; bagianPembelajaranId: string; ideId: string; role: "primary" | "supporting" }> = [];

    while (pendingSections.size > 0) {
      let insertedInPass = 0;
      const passSectionsToInsert: Array<typeof bagianPembelajaran.$inferInsert> = [];
      for (const section of pendingSections.values()) {
        if (section.parentSectionId && !insertedSectionIds.has(section.parentSectionId)) continue;
        const targetChapterId = await resolveChapter(tx, section.chapterId, course.targetId, chapterCache);
        if (!targetChapterId) throw new Error(`IDEA_BUNDLE_LEARNING_SECTION_CHAPTER_REQUIRED:${section.id}`);
        const sectionPayload = {
          id: section.id,
          mataKuliahId: course.targetId,
          babId: targetChapterId,
          stableKey: section.stableKey,
          parentSectionId: section.parentSectionId ?? null,
          title: section.title,
          slug: section.slug,
          orderIndex: section.orderIndex,
          learningObjective: section.learningObjective,
          sourceChunkIds: section.sourceChunkIds,
          version: 1,
          status: "published" as const,
        };
        const existing = existingSectionById.get(section.id);
        rejectRetiredEntity("learning_section", section.id, existing?.status);
        if (!assertEqualFields(existing as Record<string, unknown> | undefined, sectionPayload, "IDEA_BUNDLE_LEARNING_SECTION_CONFLICT")) {
          passSectionsToInsert.push(sectionPayload);
        }

        const expectedIdeas = new Map<string, "primary" | "supporting">();
        for (const ideaId of section.primaryIdeaIds) {
          expectedIdeas.set(ideaId, "primary");
        }
        for (const ideaId of section.supportingIdeaIds) {
          expectedIdeas.set(ideaId, "supporting");
        }

        if (existing) {
          const currentIdeas = existingIdeasBySectionId.get(section.id) ?? new Map<string, "primary" | "supporting">();
          let matchesIdeas = currentIdeas.size === expectedIdeas.size;
          if (matchesIdeas) {
            for (const [ideaId, role] of expectedIdeas) {
              if (currentIdeas.get(ideaId) !== role) {
                matchesIdeas = false;
                break;
              }
            }
          }
          if (!matchesIdeas) {
            throw new Error("IDEA_BUNDLE_LEARNING_SECTION_CONFLICT");
          }
        } else {
          for (const [ideaId, role] of expectedIdeas) {
            sectionIdeaRows.push({
              id: deterministicId("bagian-ide", `${section.id}:${ideaId}`),
              bagianPembelajaranId: section.id,
              ideId: ideaId,
              role,
            });
          }
        }
        pendingSections.delete(section.id);
        insertedSectionIds.add(section.id);
        insertedInPass++;
      }
      if (insertedInPass === 0) throw new Error("IDEA_BUNDLE_LEARNING_SECTION_PARENT_UNRESOLVED");
      if (passSectionsToInsert.length > 0) {
        await tx.insert(bagianPembelajaran).values(passSectionsToInsert);
      }
    }
    if (sectionIdeaRows.length > 0) {
      await tx.insert(bagianPembelajaranIde).values(sectionIdeaRows);
    }
    maybeInjectFailure(input.testFailureAfter, "learning_sections");

    const sourceMaterialById = new Map(bundle.entities.sourceMaterials.map((source) => [source.id, source]));
    const vectorJobs = [
      ...bundle.entities.sourceChunks
        .filter((chunk) => chunk.embeddingEligible)
        .map((chunk) => {
          const source = sourceMaterialById.get(chunk.sourceMaterialId);
          return {
            id: deterministicId("vector-idea-source", `${input.importId}:${chunk.id}:${chunk.sourceVersion}`),
            courseId: course.legacyId,
            koId: null,
            action: "upsert" as const,
            namespace: "source_materials",
            payload: {
              canonicalCourseId: course.targetId,
              entityType: "source_material",
              entityId: chunk.id,
              version: chunk.sourceVersion,
              text: chunk.content,
              title: source?.title ?? chunk.id,
              metadata: {
                entityId: chunk.id,
                version: chunk.sourceVersion,
                status: "active",
                ...(source?.chapterId && chapterCache.get(`${source.chapterId}:${course.targetId}`) ? { chapterId: chapterCache.get(`${source.chapterId}:${course.targetId}`)! } : {}),
              },
            },
          };
        }),
      ...bundle.entities.ideas.map((idea) => ({
        id: deterministicId("vector-idea", `${input.importId}:${idea.id}:${idea.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "upsert" as const,
        namespace: "canonical_ideas",
        payload: {
          canonicalCourseId: course.targetId,
          entityType: "idea",
          entityId: idea.id,
          version: idea.version,
          text: [idea.canonicalStatement, idea.conciseExplanation, idea.latex ? `Formula: ${idea.latex}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          title: idea.code,
          metadata: {
            entityId: idea.id,
            version: idea.version,
            status: "published",
            chapterId: chapterCache.get(`${idea.chapterId}:${course.targetId}`)!,
          },
        },
      })),
    ];
    const insertedVectorJobs = vectorJobs.length
      ? await tx.insert(vectorSyncQueue).values(vectorJobs).onConflictDoNothing().returning({ id: vectorSyncQueue.id })
      : [];
    maybeInjectFailure(input.testFailureAfter, "outbox");

    const hash = publicationHash(input.importId, bundle);
    await tx.insert(publikasiBundle).values({
      id: publicationId,
      imporBundleId: input.importId,
      approvedReviewId: approvedReview.id,
      version: 1,
      publicationHash: hash,
      status: "published",
      publishedBy: input.publishedBy,
      publishedAt: now,
    }).onConflictDoNothing();
    // Ensure the published inventory covers the validated artifact even for a
    // legacy or incomplete staged inventory. Existing rows and hashes are kept.
    if (canonical.length > 0) {
      await tx.insert(itemImporBundle).values(canonical.map((item) => ({
        id: deterministicId("impor-item", `${input.importId}:${item.entityType}:${item.entityId}:${item.entityVersion}`),
        imporBundleId: input.importId,
        ...item,
        status: "published" as const,
      }))).onConflictDoNothing();
    }
    await tx.update(itemImporBundle).set({ status: "published" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    const published = await tx.update(imporBundle).set({ status: "published", updatedAt: now }).where(and(eq(imporBundle.id, input.importId), eq(imporBundle.status, row.status), eq(imporBundle.checksum, importSnapshot.checksum), eq(imporBundle.sourceUriOrKey, importSnapshot.sourceUriOrKey))).returning({ id: imporBundle.id });
    if (published.length !== 1) throw new Error("IDEA_BUNDLE_PUBLICATION_CONFLICT");
    await tx.insert(auditMutasi).values({
      id: deterministicId("audit", `${input.importId}:published`),
      actorId: input.publishedBy,
      entityType: "idea_bundle",
      entityId: input.importId,
      action: "published",
      beforeSnapshot: { status: row.status },
      afterSnapshot: { status: "published", publicationId, publicationHash: hash, vectorJobCount: insertedVectorJobs.length },
      correlationId: input.importId,
    }).onConflictDoNothing();

    return {
      publicationId,
      importId: input.importId,
      bundleId: row.bundleId,
      published: true,
      entityCounts: {
        sourceMaterials: bundle.entities.sourceMaterials.length,
        sourceChunks: bundle.entities.sourceChunks.length,
        ideas: bundle.entities.ideas.length,
        provenance: bundle.entities.provenance.length,
        relations: bundle.entities.relations.length,
        learningSections: bundle.entities.learningSections.length,
      },
      vectorJobCount: insertedVectorJobs.length,
    };
  });
  if (courseLegacyId) {
    dispatchVectorSync(courseLegacyId);
  }
  return result;
}

export async function withdrawIdeaBundle(input: { importId: string; withdrawnBy: string; expectedRevision?: string; expectedCourseId?: string }): Promise<IdeaBundleWithdrawalResult> {
  ensureFeatureEnabled();
  await assertAuthoringActor(db, input.withdrawnBy, { roles: ["admin"], error: "IDEA_BUNDLE_WITHDRAW_FORBIDDEN" });
  const snapshot = await getIdeaBundleImport(input.importId);
  if (!snapshot) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (input.expectedRevision !== undefined && snapshot.checksum !== input.expectedRevision) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (input.expectedCourseId !== undefined && snapshot.courseId !== input.expectedCourseId) throw new Error("IDEA_BUNDLE_STALE_CONTEXT");
  if (snapshot.status === "withdrawn") {
    await db.transaction(async tx => { await assertAuthoringActor(tx, input.withdrawnBy, { roles: ["admin"], error: "IDEA_BUNDLE_WITHDRAW_FORBIDDEN", lock: true }); });
    const bundle = await loadAndValidate(input.importId, snapshot.bundleId, snapshot.checksum);
    const course = await resolveCourse(db, bundle.manifest.courseId);
    if (course.legacyId) {
      await dispatchVectorSync(course.legacyId);
    }
    return { importId: input.importId, withdrawn: false, entityCount: 0, vectorJobCount: 0 };
  }
  if (snapshot.status !== "published") throw new Error("IDEA_BUNDLE_PUBLISHED_REQUIRED");
  const bundle = await loadAndValidate(input.importId, snapshot.bundleId, snapshot.checksum);
  const canonical = canonicalItems(bundle);

  let courseLegacyId: string | undefined;
  const result = await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, input.withdrawnBy, { roles: ["admin"], error: "IDEA_BUNDLE_WITHDRAW_FORBIDDEN", lock: true });
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!row || row.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    assertIdeaSnapshot(row, snapshot);
    if (row.status === "withdrawn") return { importId: input.importId, withdrawn: false, entityCount: 0, vectorJobCount: 0 };
    if (row.status !== "published") throw new Error("IDEA_BUNDLE_PUBLISHED_REQUIRED");
    await requireIdentity(tx, input.withdrawnBy, "IDEA_BUNDLE_WITHDRAWER_NOT_FOUND");
    await lockCanonicalItems(tx, canonical);

    // The import status is authoritative. Counting all its matching inventory
    // rows is conservative even if an old item's own status is inconsistent.
    const shared = canonical.length === 0 ? [] : await tx.select({
      entityType: itemImporBundle.entityType,
      entityId: itemImporBundle.entityId,
    }).from(itemImporBundle).innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id)).where(and(
      ne(imporBundle.id, input.importId),
      eq(imporBundle.status, "published"),
      inArray(itemImporBundle.entityType, [...new Set(canonical.map((item) => item.entityType))]),
      inArray(itemImporBundle.entityId, [...new Set(canonical.map((item) => item.entityId))]),
    ));
    const sharedKeys = new Set(shared.map((item) => canonicalKey(item.entityType, item.entityId)));
    const unshared = (type: string, id: string) => !sharedKeys.has(canonicalKey(type, id));

    const course = await resolveCourse(tx, bundle.manifest.courseId);
    courseLegacyId = course.legacyId;
    const now = new Date();
    const sourceIds = bundle.entities.sourceMaterials.filter((source) => unshared("source_material", source.id)).map((source) => source.id);
    const ideaIds = bundle.entities.ideas.filter((idea) => unshared("idea", idea.id)).map((idea) => idea.id);
    const relationIds = bundle.entities.relations.filter((relation) => unshared("relation", relation.id)).map((relation) => relation.id);
    const sectionIds = bundle.entities.learningSections.filter((section) => unshared("learning_section", section.id)).map((section) => section.id);

    if (sourceIds.length > 0) await tx.update(sumberMateri).set({ status: "withdrawn", updatedAt: now }).where(inArray(sumberMateri.id, sourceIds));
    if (ideaIds.length > 0) await tx.update(ide).set({ status: "withdrawn", updatedAt: now }).where(inArray(ide.id, ideaIds));
    if (relationIds.length > 0) await tx.update(relasiIde).set({ status: "withdrawn", updatedAt: now }).where(inArray(relasiIde.id, relationIds));
    if (sectionIds.length > 0) await tx.update(bagianPembelajaran).set({ status: "withdrawn", updatedAt: now }).where(inArray(bagianPembelajaran.id, sectionIds));

    const vectorJobs = [
      ...bundle.entities.sourceChunks.filter((chunk) => chunk.embeddingEligible && unshared("source_chunk", chunk.id)).map((chunk) => ({
        id: deterministicId("vector-idea-source-withdraw", `${input.importId}:${chunk.id}:${chunk.sourceVersion}`),
        courseId: course.legacyId,
        koId: null,
        action: "delete" as const,
        namespace: "source_materials",
        payload: { entityType: "source_material", entityId: chunk.id, version: chunk.sourceVersion, metadata: { entityId: chunk.id, version: chunk.sourceVersion } },
      })),
      ...bundle.entities.ideas.filter((idea) => unshared("idea", idea.id)).map((idea) => ({
        id: deterministicId("vector-idea-withdraw", `${input.importId}:${idea.id}:${idea.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "delete" as const,
        namespace: "canonical_ideas",
        payload: { entityType: "idea", entityId: idea.id, version: idea.version, metadata: { entityId: idea.id, version: idea.version } },
      })),
    ];
    for (const job of vectorJobs) await tx.insert(vectorSyncQueue).values(job).onConflictDoNothing();
    await tx.update(publikasiBundle).set({ status: "withdrawn" }).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published")));
    await tx.update(itemImporBundle).set({ status: "withdrawn" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    await tx.update(imporBundle).set({ status: "withdrawn", updatedAt: now }).where(eq(imporBundle.id, input.importId));
    const entityCount = canonical.length;
    await tx.insert(auditMutasi).values({
      id: deterministicId("audit", `${input.importId}:withdrawn`),
      actorId: input.withdrawnBy,
      entityType: "idea_bundle",
      entityId: input.importId,
      action: "withdrawn",
      beforeSnapshot: { status: "published" },
      afterSnapshot: { status: "withdrawn", entityCount, vectorJobCount: vectorJobs.length },
      correlationId: input.importId,
    }).onConflictDoNothing();
    return { importId: input.importId, withdrawn: true, entityCount, vectorJobCount: vectorJobs.length };
  });
  if (courseLegacyId) await dispatchVectorSync(courseLegacyId);
  return result;
}

export async function reconcilePublishedIdeaBundle(importId: string) {
  const [publication] = await db.select().from(publikasiBundle).where(eq(publikasiBundle.imporBundleId, importId)).limit(1);
  const items = await db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId));
  const audits = await db.select({ id: auditMutasi.id }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, importId)));
  const vectorJobs = await db
    .select({ id: vectorSyncQueue.id })
    .from(vectorSyncQueue)
    .where(or(eq(vectorSyncQueue.namespace, "source_materials"), eq(vectorSyncQueue.namespace, "canonical_ideas")));
  return {
    importId,
    publicationStatus: publication?.status ?? null,
    publicationId: publication?.id ?? null,
    publishedItems: items.filter((item) => item.status === "published").length,
    itemCount: items.length,
    auditCount: audits.length,
    vectorJobCount: vectorJobs.length,
  };
}
