import { inngest } from "./client";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey, extractStorageKey } from "@/lib/storage/keys";
import { generateAndSavePdfThumbnailCompute } from "@/lib/compute/pdf-thumbnail";
import { buildVersionedThumbnailKey } from "@/lib/thumbnail";

export const pdfThumbnailWorker = inngest.createFunction(
  {
    id: "pdf-thumbnail-worker",
    name: "PDF Thumbnail Worker",
    triggers: [{ event: "pdf/thumbnail.requested" }],
    retries: 3,
    concurrency: [{ limit: 2 }, { limit: 1, key: "event.data.materialId" }],
  },
  async ({ event, step }) => {
    const { materialId, sourceType, sourceVersion, sourceRevision } = event.data as {
      materialId: string;
      sourceType: "course_material" | "diktat";
      sourceVersion?: string;
      sourceRevision?: string;
    };

    return step.run("generate-thumbnail", async () => {
      const isManual = sourceType === "course_material";
      let courseSlug = "";
      let fileUrl = "";
      let existingThumb: string | null = null;
      let currentRevision: string | null = null;

      if (isManual) {
        const [row] = await db
          .select({
            id: courseMaterials.id,
            courseId: courseMaterials.courseId,
            fileUrl: courseMaterials.fileUrl,
            thumbnailUrl: courseMaterials.thumbnailUrl,
            checksum: courseMaterials.checksum,
          })
          .from(courseMaterials)
          .where(eq(courseMaterials.id, materialId))
          .limit(1);

        if (!row) throw new Error(`MATERIAL_NOT_READY_${materialId}`);
        courseSlug = row.courseId;
        fileUrl = row.fileUrl;
        existingThumb = row.thumbnailUrl;
        currentRevision = row.checksum;
      } else {
        const [row] = await db
          .select({
            id: diktats.id,
            courseId: diktats.courseId,
            fileUrl: diktats.fileUrl,
            thumbnailUrl: diktats.thumbnailUrl,
            generationHash: diktats.generationHash,
          })
          .from(diktats)
          .where(eq(diktats.id, materialId))
          .limit(1);

        if (!row || !row.fileUrl) throw new Error(`DIKTAT_NOT_READY_${materialId}`);
        courseSlug = row.courseId;
        fileUrl = row.fileUrl;
        existingThumb = row.thumbnailUrl;
        currentRevision = row.generationHash;
      }

      const fileKey = extractStorageKey(fileUrl);
      if (!fileKey) return { skipped: true, reason: "SOURCE_FILE_KEY_NOT_FOUND" };
      if (sourceVersion && sourceVersion !== fileKey) {
        return { skipped: true, reason: "STALE_SOURCE_VERSION" };
      }
      if (sourceRevision && sourceRevision !== currentRevision) {
        return { skipped: true, reason: "STALE_SOURCE_REVISION" };
      }
      if (existingThumb) {
        return { success: true, thumbnailUrl: existingThumb, skipped: true };
      }

      const versionedKey = buildVersionedThumbnailKey({
        courseSlug,
        materialId,
        sourceType,
        sourceVersion: fileKey,
        sourceRevision: currentRevision ?? undefined,
        extension: "png",
      });

      const expectedPngKey = buildCourseThumbnailKey({
        courseSlug,
        materialId,
        extension: "png",
      });

      const [hasVersioned, hasLegacy] = await Promise.all([
        storage.exists(versionedKey),
        storage.exists(expectedPngKey),
      ]);
      const storedKey = hasVersioned ? versionedKey : hasLegacy ? expectedPngKey : null;
      if (storedKey) {
        if (isManual) {
          await db.update(courseMaterials).set({ thumbnailUrl: storedKey }).where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.fileUrl, fileUrl), currentRevision === null ? isNull(courseMaterials.checksum) : eq(courseMaterials.checksum, currentRevision), isNull(courseMaterials.thumbnailUrl)));
        } else {
          await db.update(diktats).set({ thumbnailUrl: storedKey, updatedAt: new Date() }).where(and(eq(diktats.id, materialId), eq(diktats.fileUrl, fileUrl), currentRevision === null ? isNull(diktats.generationHash) : eq(diktats.generationHash, currentRevision), isNull(diktats.thumbnailUrl)));
        }
        return { success: true, thumbnailUrl: storedKey, existedInStorage: true };
      }

      const generatedKey = await generateAndSavePdfThumbnailCompute({
        courseSlug,
        materialId,
        fileKey,
        thumbnailKey: versionedKey,
      });

      if (!generatedKey) throw new Error(`THUMBNAIL_GENERATION_FAILED_${materialId}`);

      if (isManual) {
        await db.update(courseMaterials).set({ thumbnailUrl: generatedKey }).where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.fileUrl, fileUrl), currentRevision === null ? isNull(courseMaterials.checksum) : eq(courseMaterials.checksum, currentRevision), isNull(courseMaterials.thumbnailUrl)));
      } else {
        await db.update(diktats).set({ thumbnailUrl: generatedKey, updatedAt: new Date() }).where(and(eq(diktats.id, materialId), eq(diktats.fileUrl, fileUrl), currentRevision === null ? isNull(diktats.generationHash) : eq(diktats.generationHash, currentRevision), isNull(diktats.thumbnailUrl)));
      }

      return { success: true, thumbnailUrl: generatedKey };
    });
  },
);
