import { inngest } from "./client";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { generateAndSavePdfThumbnail } from "@/lib/thumbnail";

function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
  if (value.includes("/api/storage/file/")) return value.split("/api/storage/file/").pop() || null;
  if (value.includes("/f/")) return value.split("/f/").pop() || null;
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && value.startsWith(`${publicBase}/`)) return value.slice(publicBase.length + 1);
  return null;
}

export const pdfThumbnailWorker = inngest.createFunction(
  {
    id: "pdf-thumbnail-worker",
    name: "PDF Thumbnail Worker",
    triggers: [{ event: "pdf/thumbnail.requested" }],
    retries: 2,
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const { materialId, sourceType } = event.data as {
      materialId: string;
      sourceType: "course_material" | "diktat";
    };

    return step.run("generate-thumbnail", async () => {
      // 1. Fetch record from DB
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

        if (!row) return { skipped: true, reason: "MATERIAL_NOT_FOUND" };
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

        if (!row || !row.fileUrl) return { skipped: true, reason: "DIKTAT_NOT_FOUND" };
        courseSlug = row.courseId;
        fileUrl = row.fileUrl;
        existingThumb = row.thumbnailUrl;

      }

      // 2. Early return if thumbnailUrl already in DB
      if (existingThumb) {
        return { success: true, thumbnailUrl: existingThumb, skipped: true };
      }

      const fileKey = extractStorageKey(fileUrl);
      if (!fileKey) {
        return { skipped: true, reason: "SOURCE_FILE_KEY_NOT_FOUND" };
      }

      const expectedKey = buildCourseThumbnailKey({
        courseSlug,
        materialId,
        extension: "webp",
      });

      // 3. Check storage existence
      if (await storage.exists(expectedKey)) {
        if (isManual) {
          await db.update(courseMaterials).set({ thumbnailUrl: expectedKey }).where(eq(courseMaterials.id, materialId));
        } else {
          await db.update(diktats).set({ thumbnailUrl: expectedKey, updatedAt: new Date() }).where(eq(diktats.id, materialId));
        }
        return { success: true, thumbnailUrl: expectedKey, existedInStorage: true };
      }

      // 4. Generate thumbnail from fileKey
      const generatedKey = await generateAndSavePdfThumbnail({
        courseSlug,
        materialId,
        fileKey,
      });

      if (!generatedKey) {
        throw new Error(`THUMBNAIL_GENERATION_FAILED_${materialId}`);
      }

      // 5. Update DB
      if (isManual) {
        await db.update(courseMaterials).set({ thumbnailUrl: generatedKey }).where(eq(courseMaterials.id, materialId));
      } else {
        await db.update(diktats).set({ thumbnailUrl: generatedKey, updatedAt: new Date() }).where(eq(diktats.id, materialId));
      }

      return { success: true, thumbnailUrl: generatedKey };
    });
  }
);
