import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { inngest } from "@/lib/inngest";

function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
  if (value.includes("/api/storage/file/")) return value.split("/api/storage/file/").pop() || null;
  if (value.includes("/f/")) return value.split("/f/").pop() || null;
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && value.startsWith(`${publicBase}/`)) return value.slice(publicBase.length + 1);
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; materialId: string }> },
) {
  const { id: courseId, materialId } = await context.params;
  if (!courseId || !materialId) return new Response("Missing parameters", { status: 400 });

  try {
    const [manual] = await db
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

    const [compiled] = !manual
      ? await db
          .select({
            id: diktats.id,
            courseId: diktats.courseId,
            fileUrl: diktats.fileUrl,
            thumbnailUrl: diktats.thumbnailUrl,
            generationHash: diktats.generationHash,
          })
          .from(diktats)
          .where(eq(diktats.id, materialId))
          .limit(1)
      : [null];

    const target = manual ?? compiled;
    if (!target) return new Response("Material not found", { status: 404 });

    if (target.thumbnailUrl) {
      return Response.redirect(storage.getUrl(target.thumbnailUrl), 307);
    }

    for (const extension of ["png", "webp"] as const) {
      const expectedKey = buildCourseThumbnailKey({
        courseSlug: target.courseId,
        materialId: target.id,
        extension,
      });
      if (!(await storage.exists(expectedKey))) continue;

      if (manual) {
        await db.update(courseMaterials).set({ thumbnailUrl: expectedKey }).where(eq(courseMaterials.id, target.id));
      } else {
        await db.update(diktats).set({ thumbnailUrl: expectedKey, updatedAt: new Date() }).where(eq(diktats.id, target.id));
      }
      return Response.redirect(storage.getUrl(expectedKey), 307);
    }

    const fileKey = extractStorageKey(target.fileUrl);
    if (!fileKey) return new Response("Source file not found", { status: 404 });

    const sourceType = manual ? "course_material" as const : "diktat" as const;
    const sourceVersion = fileKey;
    await inngest.send({
      id: `thumbnail-${sourceType}-${target.id}-${encodeURIComponent(sourceVersion).slice(-96)}`,
      name: "pdf/thumbnail.requested",
      data: { materialId: target.id, sourceType, sourceVersion },
    });

    return new Response("Thumbnail queued", {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "2",
      },
    });
  } catch (error) {
    console.error(`[ThumbnailAPI] Error serving thumbnail for ${materialId}:`, error);
    return new Response("Internal error", { status: 500 });
  }
}
