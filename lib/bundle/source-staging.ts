import { createHash } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  auditMutasi,
  imporBundle,
  itemImporBundle,
  courses,
  mataKuliah,
} from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildSourcePackKey } from "@/lib/storage/keys";
import { validateSourcePack, type ValidatedSourcePack } from "@/lib/authoring/source-pack";
import type { SourcePackQualityReport } from "@/lib/authoring/quality/source-pack";
import { sourceSummary, type SourceSummary } from "@/lib/authoring/mcp-workflows";

export type SourcePackStageInput = {
  filename?: string;
  bytes: Uint8Array;
  sourcePack: ValidatedSourcePack;
  requestedBy: string;
  courseId?: string;
  chapterId?: string;
  scopeKey?: string;
  quality?: SourcePackQualityReport;
  summary?: SourceSummary;
  replaceImportId?: string;
};

export type SourcePackStageResult = {
  importId: string;
  packId: string;
  checksum: string;
  sourceKey: string;
  created: boolean;
  status: "validated" | "existing";
  documentCount: number;
};

export type StoredSourcePackRecord = {
  id: string;
  bundleId: string;
  checksum: string;
  courseId: string | null;
  sourceUriOrKey: string;
  status: string;
  version: number;
  validationReport: {
    valid: boolean;
    packId: string;
    name?: string;
    checksum: string;
    courseId?: string;
    chapterId?: string;
    scopeKey?: string;
    documentCount: number;
    summary?: SourceSummary;
    quality?: SourcePackQualityReport;
    documents?: Array<{
      id: string;
      title: string;
      role: string;
      unitKind: string;
      expectedUnits: number;
      originalFilename: string;
      markdownSha256: string;
    }>;
  };
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`INVALID_CHECKSUM:${field}`);
}

async function uploadSourcePackArtifact(
  bytes: Uint8Array,
  key: string,
  packId: string,
  checksum: string,
  filename?: string,
): Promise<void> {
  await storage.upload(bytes, filename ?? `${packId}.zip`, "application/zip", {
    key,
    metadata: {
      packId,
      checksum,
    },
  });
}

async function deleteSourcePackArtifact(key: string): Promise<void> {
  await storage.delete(key).catch((error) => {
    console.error("[source-pack] failed to delete staged artifact", { key, error });
  });
}

export async function stageSourcePack(input: SourcePackStageInput): Promise<SourcePackStageResult> {
  const { sourcePack, bytes, requestedBy } = input;
  const packId = sourcePack.manifest.packId;
  const checksum = sourcePack.archive.checksum;
  assertSha256(checksum, "sourcePack.archive.checksum");

  let storedCourseId: string | null = null;
  if (input.courseId) {
    const [legacyCourse] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).limit(1);
    const [targetCourse] = await db
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, input.courseId), eq(mataKuliah.legacyCourseId, input.courseId)))
      .limit(1);
    storedCourseId = legacyCourse?.id ?? targetCourse?.legacyCourseId ?? targetCourse?.id ?? input.courseId;
  }

  const [sameBundle] = await db
    .select()
    .from(imporBundle)
    .where(and(eq(imporBundle.bundleId, packId), eq(imporBundle.checksum, checksum)))
    .limit(1);

  if (sameBundle) {
    return {
      importId: sameBundle.id,
      packId: sameBundle.bundleId,
      checksum: sameBundle.checksum,
      sourceKey: sameBundle.sourceUriOrKey,
      created: false,
      status: "existing",
      documentCount: sourcePack.documents.length,
    };
  }

  const scopeKey = input.scopeKey || input.courseId || "shared";
  const sourceKey = buildSourcePackKey({ packId, checksum, scopeKey });
  await uploadSourcePackArtifact(bytes, sourceKey, packId, checksum, input.filename);

  const importId = input.replaceImportId ?? stableId("impor-source", `${packId}:${checksum}`);
  const summary = input.summary ?? (input.quality ? sourceSummary(sourcePack, input.quality) : undefined);

  const validationReport = {
    valid: true,
    packId,
    name: sourcePack.manifest.name,
    checksum,
    courseId: input.courseId,
    legacyCourseId: storedCourseId,
    chapterId: input.chapterId,
    scopeKey,
    documentCount: sourcePack.documents.length,
    summary: summary as unknown as Record<string, unknown>,
    quality: input.quality as unknown as Record<string, unknown>,
    documents: sourcePack.manifest.documents.map((d) => ({
      id: d.id,
      title: d.title,
      role: d.role,
      unitKind: d.unitKind,
      expectedUnits: d.expectedUnits,
      originalFilename: d.originalFilename,
      markdownSha256: d.markdownSha256,
    })),
  };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(imporBundle).values({
        id: importId,
        bundleId: packId,
        checksum,
        bundleType: "source",
        courseId: storedCourseId,
        sourceUriOrKey: sourceKey,
        version: 1,
        status: "validated",
        requestedBy,
        validationReport,
      }).onConflictDoUpdate({
        target: imporBundle.id,
        set: {
          checksum,
          sourceUriOrKey: sourceKey,
          status: "validated",
          validationReport,
          updatedAt: new Date(),
        },
      });

      await tx.delete(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId));

      await tx.insert(itemImporBundle).values(sourcePack.manifest.documents.map((doc) => ({
        id: stableId("impor-doc", `${importId}:${doc.id}`),
        imporBundleId: importId,
        entityType: "source_document",
        entityId: doc.id,
        entityVersion: 1,
        entityHash: doc.markdownSha256,
        status: "validated" as const,
      })));

      await tx.insert(auditMutasi).values({
        id: stableId("audit", `${importId}:ingested:${checksum}`),
        actorId: requestedBy,
        entityType: "source_pack",
        entityId: importId,
        action: "ingested",
        beforeSnapshot: null,
        afterSnapshot: {
          packId,
          checksum,
          documentCount: sourcePack.documents.length,
          courseId: storedCourseId,
          chapterId: input.chapterId,
        },
        correlationId: packId,
      });
    });
  } catch (error) {
    await deleteSourcePackArtifact(sourceKey);
    throw error;
  }

  return {
    importId,
    packId,
    checksum,
    sourceKey,
    created: true,
    status: "validated",
    documentCount: sourcePack.documents.length,
  };
}

export async function listSourcePackImports(options?: {
  courseId?: string;
  chapterId?: string;
  limit?: number;
}): Promise<StoredSourcePackRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(imporBundle)
    .where(eq(imporBundle.bundleType, "source"))
    .orderBy(desc(imporBundle.createdAt))
    .limit(limit);

  return rows
    .filter((row) => {
      const report = row.validationReport as StoredSourcePackRecord["validationReport"];
      if (options?.courseId) {
        const matchesCourse = row.courseId === options.courseId || report?.courseId === options.courseId;
        if (!matchesCourse) return false;
      }
      if (options?.chapterId) {
        const matchesChapter = report?.chapterId === options.chapterId;
        if (!matchesChapter) return false;
      }
      return true;
    })
    .map((row) => ({
      ...row,
      validationReport: row.validationReport as StoredSourcePackRecord["validationReport"],
    }));
}

export async function getSourcePackImport(importIdOrPackId: string): Promise<StoredSourcePackRecord | null> {
  const [row] = await db
    .select()
    .from(imporBundle)
    .where(
      and(
        eq(imporBundle.bundleType, "source"),
        or(eq(imporBundle.id, importIdOrPackId), eq(imporBundle.bundleId, importIdOrPackId)),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    validationReport: row.validationReport as StoredSourcePackRecord["validationReport"],
  };
}

export async function downloadSourcePackBytes(sourceKey: string): Promise<Uint8Array> {
  if (!storage.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  return storage.download(sourceKey);
}

export async function readStoredSourcePack(sourceKey: string): Promise<ValidatedSourcePack> {
  const bytes = await downloadSourcePackBytes(sourceKey);
  return validateSourcePack(bytes);
}

export async function readStoredSourcePackDocument(
  sourceKey: string,
  documentId: string,
): Promise<{
  document: ValidatedSourcePack["documents"][number] & { markdown: string };
  pack: ValidatedSourcePack;
}> {
  const pack = await readStoredSourcePack(sourceKey);
  const document = pack.documents.find((d) => d.id === documentId);
  const manifestDoc = pack.manifest.documents.find((d) => d.id === documentId);
  if (!document || !manifestDoc) throw new Error(`SOURCE_PACK_DOCUMENT_NOT_FOUND:${documentId}`);
  const markdownBytes = pack.archive.files.get(manifestDoc.markdownPath);
  const markdown = markdownBytes ? new TextDecoder().decode(markdownBytes) : "";
  return { document: { ...document, markdown }, pack };
}
