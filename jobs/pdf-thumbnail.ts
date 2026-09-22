import { inngest } from "./client";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey, extractStorageKey } from "@/lib/storage/keys";
import { generateAndSavePdfThumbnailCompute } from "@/lib/compute/pdf-thumbnail";

export const pdfThumbnailWorker = inngest.createFunction(
  {
    id: "pdf-thumbnail-worker",
    name: "PDF Thumbnail Worker",
    triggers: [{ event: "pdf/thumbnail.requested" }],
    retries: 3,
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const { materialId, sourceType, sourceVersion } = event.data as {
      materialId: string;
      sourceType: "course_material" | "diktat";
      sourceVersion?: string;
    };

    return step.run("generate-thumbnail", async () => {
      const isManual = sourceType === "course_material";
      let courseSlug = "";
      let fileUrl = "";
      let existingThumb: string | null = null;

      if (isManual) {
        const [row] = await db
          .select({
            id: courseMaterials.id,
            courseId: courseMaterials.courseId,
            fileUrl: courseMaterials.fileUrl,
            thumbnailUrl: courseMaterials.thumbnailUrl,
          })
          .from(courseMaterials)
          .where(eq(courseMaterials.id, materialId))
          .limit(1);

        if (!row) throw new Error(`MATERIAL_NOT_READY_${materialId}`);
        courseSlug = row.courseId;
        fileUrl = row.fileUrl;
        existingThumb = row.thumbnailUrl;
      } else {
        const [row] = await db
          .select({
            id: diktats.id,
            courseId: diktats.courseId,
            fileUrl: diktats.fileUrl,
            thumbnailUrl: diktats.thumbnailUrl,
          })
          .from(diktats)
          .where(eq(diktats.id, materialId))
          .limit(1);

        if (!row || !row.fileUrl) throw new Error(`DIKTAT_NOT_READY_${materialId}`);
        courseSlug = row.courseId;
        fileUrl = row.fileUrl;
        existingThumb = row.thumbnailUrl;
      }

      if (existingThumb) {
        return { success: true, thumbnailUrl: existingThumb, skipped: true };
      }

      const fileKey = extractStorageKey(fileUrl);
      if (!fileKey) return { skipped: true, reason: "SOURCE_FILE_KEY_NOT_FOUND" };
      if (sourceVersion && sourceVersion !== fileKey) {
        return { skipped: true, reason: "STALE_SOURCE_VERSION" };
      }

      const expectedPngKey = buildCourseThumbnailKey({
        courseSlug,
        materialId,
        extension: "png",
      });

      if (await storage.exists(expectedPngKey)) {
        if (isManual) {
          await db.update(courseMaterials).set({ thumbnailUrl: expectedPngKey }).where(eq(courseMaterials.id, materialId));
        } else {
          await db.update(diktats).set({ thumbnailUrl: expectedPngKey, updatedAt: new Date() }).where(eq(diktats.id, materialId));
        }
        return { success: true, thumbnailUrl: expectedPngKey, existedInStorage: true };
      }

      const generatedKey = await generateAndSavePdfThumbnailCompute({
        courseSlug,
        materialId,
        fileKey,
      });

      if (!generatedKey) throw new Error(`THUMBNAIL_GENERATION_FAILED_${materialId}`);

      if (isManual) {
        await db.update(courseMaterials).set({ thumbnailUrl: generatedKey }).where(eq(courseMaterials.id, materialId));
      } else {
        await db.update(diktats).set({ thumbnailUrl: generatedKey, updatedAt: new Date() }).where(eq(diktats.id, materialId));
      }

      return { success: true, thumbnailUrl: generatedKey };
    });
  },
);
