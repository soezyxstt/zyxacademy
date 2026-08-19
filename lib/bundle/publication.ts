import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  asalIde,
  auditMutasi,
  bab,
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
  };
  vectorJobCount: number;
};

type FailureInjection = "source_materials" | "source_chunks" | "ideas" | "provenance" | "relations" | "outbox";

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

function assertEqualFields(
  existing: Record<string, unknown> | undefined,
  expected: Record<string, unknown>,
  code: string,
): boolean {
  if (!existing) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (serializeDeterministically(existing[key]) !== serializeDeterministically(value)) throw new Error(code);
  }
  return true;
}

async function requireIdentity(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string, code: string): Promise<void> {
  const [row] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, id)).limit(1);
  if (!row) throw new Error(code);
}

async function resolveCourse(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], courseId: string): Promise<{ legacyId: string; targetId: string }> {
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
): Promise<string | null> {
  if (!chapterId) return null;
  const [row] = await tx
    .select({ id: bab.id, mataKuliahId: bab.mataKuliahId })
    .from(bab)
    .where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId)))
    .limit(1);
  if (!row || row.mataKuliahId !== courseTargetId) throw new Error(`IDEA_BUNDLE_CHAPTER_NOT_FOUND:${chapterId}`);
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

export async function publishIdeaBundle(input: {
  importId: string;
  publishedBy: string;
  testFailureAfter?: FailureInjection;
}): Promise<IdeaBundlePublicationResult> {
  ensureFeatureEnabled();
  const importSnapshot = await getIdeaBundleImport(input.importId);
  if (!importSnapshot) throw new Error("IDEA_BUNDLE_NOT_FOUND");
  if (importSnapshot.status === "published") {
    const [existingPublication] = await db
      .select({ id: publikasiBundle.id, status: publikasiBundle.status, publicationHash: publikasiBundle.publicationHash })
      .from(publikasiBundle)
      .where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published")))
      .limit(1);
    if (!existingPublication) throw new Error("IDEA_BUNDLE_PUBLISHED_RECORD_MISSING");
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
      },
      vectorJobCount: 0,
    };
  }
  if (importSnapshot.status !== "approved") throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");

  const bundle = await loadAndValidate(input.importId, importSnapshot.bundleId, importSnapshot.checksum);
  if (bundle.manifest.courseId !== importSnapshot.courseId && importSnapshot.courseId !== null) {
    const course = await db
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, importSnapshot.courseId))
      .limit(1);
    if (course.length === 0 || course[0].legacyCourseId !== bundle.manifest.courseId) throw new Error("IDEA_BUNDLE_COURSE_MISMATCH");
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
    if (!row || row.bundleType !== "idea") throw new Error("IDEA_BUNDLE_NOT_FOUND");
    if (row.status === "published") throw new Error("IDEA_BUNDLE_ALREADY_PUBLISHED");
    if (row.status !== "approved") throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");

    await requireIdentity(tx, input.publishedBy, "IDEA_BUNDLE_PUBLISHER_NOT_FOUND");
    const [publisher] = await tx.select({ role: user.role }).from(user).where(eq(user.id, input.publishedBy)).limit(1);
    if (!publisher || publisher.role !== "admin") throw new Error("IDEA_BUNDLE_PUBLISH_FORBIDDEN");

    const [approvedReview] = await tx
      .select({ id: reviewBundle.id, reviewerId: reviewBundle.reviewerId })
      .from(reviewBundle)
      .innerJoin(user, eq(user.id, reviewBundle.reviewerId))
      .where(and(
        eq(reviewBundle.imporBundleId, input.importId),
        eq(reviewBundle.status, "approved"),
        eq(user.role, "admin"),
      ))
      .limit(1);
    if (!approvedReview) throw new Error("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");

    const course = await resolveCourse(tx, bundle.manifest.courseId);
    const now = new Date();
    const attribution = { uploaderId: row.requestedBy, approvingReviewerId: approvedReview.reviewerId };
    const publicationId = deterministicId("publikasi-idea", input.importId);
    const sourceContentPathById = new Map(bundle.manifest.sourceVersions.map((source) => [source.sourceMaterialId, source.contentPath]));
    const chapterBySourceId = new Map<string, string | null>();
    for (const source of bundle.entities.sourceMaterials) {
      if (source.courseId !== bundle.manifest.courseId) throw new Error(`IDEA_BUNDLE_SOURCE_COURSE_MISMATCH:${source.id}`);
      const targetChapterId = await resolveChapter(tx, source.chapterId, course.targetId);
      chapterBySourceId.set(source.id, targetChapterId);
      if (source.status !== "active") throw new Error(`IDEA_BUNDLE_SOURCE_NOT_ACTIVE:${source.id}`);
      const creatorId = resolveBundleIdentity(source.creatorId, attribution);
      await requireIdentity(tx, creatorId, `IDEA_BUNDLE_CREATOR_NOT_FOUND:${creatorId}`);
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
      const [existing] = await tx.select().from(sumberMateri).where(eq(sumberMateri.id, source.id)).limit(1);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, sourcePayload, "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT")) {
        await tx.insert(sumberMateri).values(sourcePayload);
      }
    }
    maybeInjectFailure(input.testFailureAfter, "source_materials");

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
      const [existing] = await tx.select().from(potonganSumber).where(eq(potonganSumber.id, chunk.id)).limit(1);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, chunkPayload, "IDEA_BUNDLE_SOURCE_CHUNK_CONFLICT")) {
        await tx.insert(potonganSumber).values(chunkPayload);
      }
    }
    maybeInjectFailure(input.testFailureAfter, "source_chunks");

    for (const idea of bundle.entities.ideas) {
      if (idea.courseId !== bundle.manifest.courseId) throw new Error(`IDEA_BUNDLE_IDEA_COURSE_MISMATCH:${idea.id}`);
      if (idea.status !== "published") throw new Error(`IDEA_BUNDLE_IDEA_NOT_PUBLISHABLE:${idea.id}`);
      const targetChapterId = await resolveChapter(tx, idea.chapterId, course.targetId);
      if (idea.conceptId) {
        const [concept] = await tx.select({ id: concepts.id }).from(concepts).where(eq(concepts.id, idea.conceptId)).limit(1);
        if (!concept) throw new Error(`IDEA_BUNDLE_CONCEPT_NOT_FOUND:${idea.conceptId}`);
      }
      const creatorId = resolveBundleIdentity(idea.creatorId, attribution);
      const curatorId = idea.curatorId ? resolveBundleIdentity(idea.curatorId, attribution) : null;
      await requireIdentity(tx, creatorId, `IDEA_BUNDLE_CREATOR_NOT_FOUND:${creatorId}`);
      if (curatorId) {
        await requireIdentity(tx, curatorId, `IDEA_BUNDLE_CURATOR_NOT_FOUND:${curatorId}`);
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
      const [existing] = await tx.select().from(ide).where(eq(ide.id, idea.id)).limit(1);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, ideaPayload, "IDEA_BUNDLE_IDEA_VERSION_CONFLICT")) {
        await tx.insert(ide).values(ideaPayload);
      }
    }
    maybeInjectFailure(input.testFailureAfter, "ideas");

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
      const [existing] = await tx.select().from(asalIde).where(eq(asalIde.id, provenance.id)).limit(1);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, provenancePayload, "IDEA_BUNDLE_PROVENANCE_CONFLICT")) {
        await tx.insert(asalIde).values(provenancePayload);
      }
    }
    maybeInjectFailure(input.testFailureAfter, "provenance");

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
      const [existing] = await tx.select().from(relasiIde).where(eq(relasiIde.id, relation.id)).limit(1);
      if (!assertEqualFields(existing as Record<string, unknown> | undefined, relationPayload, "IDEA_BUNDLE_RELATION_CONFLICT")) {
        await tx.insert(relasiIde).values(relationPayload);
      }
    }
    maybeInjectFailure(input.testFailureAfter, "relations");

    const sourceMaterialById = new Map(bundle.entities.sourceMaterials.map((source) => [source.id, source]));
    const vectorJobs = [
      ...bundle.entities.sourceChunks
        .filter((chunk) => chunk.embeddingEligible)
        .map((chunk) => {
          const source = sourceMaterialById.get(chunk.sourceMaterialId);
          return {
            id: deterministicId("vector-idea-source", `${chunk.id}:${chunk.sourceVersion}`),
            courseId: course.legacyId,
            koId: null,
            action: "upsert" as const,
            namespace: "source_materials",
            payload: {
              entityType: "source_material",
              entityId: chunk.id,
              version: chunk.sourceVersion,
              text: chunk.content,
              title: source?.title ?? chunk.id,
              metadata: {
                entityId: chunk.id,
                version: chunk.sourceVersion,
                status: "active",
                ...(source?.chapterId ? { chapterId: source.chapterId } : {}),
              },
            },
          };
        }),
      ...bundle.entities.ideas.map((idea) => ({
        id: deterministicId("vector-idea", `${idea.id}:${idea.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "upsert" as const,
        namespace: "canonical_ideas",
        payload: {
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
            chapterId: idea.chapterId,
          },
        },
      })),
    ];
    for (const job of vectorJobs) {
      await tx.insert(vectorSyncQueue).values(job).onConflictDoNothing();
    }
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
    await tx.update(itemImporBundle).set({ status: "published" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    await tx.update(imporBundle).set({ status: "published", updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({
      id: deterministicId("audit", `${input.importId}:published`),
      actorId: input.publishedBy,
      entityType: "idea_bundle",
      entityId: input.importId,
      action: "published",
      beforeSnapshot: { status: "approved" },
      afterSnapshot: { status: "published", publicationId, publicationHash: hash, vectorJobCount: vectorJobs.length },
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
      },
      vectorJobCount: vectorJobs.length,
    };
  });
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
