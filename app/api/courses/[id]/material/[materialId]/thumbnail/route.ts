import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { inngest } from "@/lib/inngest";

const THUMBNAIL_POLL_ATTEMPTS = 4;
const THUMBNAIL_POLL_INTERVAL_MS = 500;

function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
  if (value.includes("/api/storage/file/")) return value.split("/api/storage/file/").pop() || null;
  if (value.includes("/f/")) return value.split("/f/").pop() || null;
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && value.startsWith(`${publicBase}/`)) return value.slice(publicBase.length + 1);
  return null;
}

async function findStoredThumbnail(courseId: string, materialId: string): Promise<string | null> {
  for (const extension of ["png", "webp"] as const) {
    const expectedKey = buildCourseThumbnailKey({
      courseSlug: courseId,
      materialId,
      extension,
    });
    if (await storage.exists(expectedKey)) return expectedKey;
  }
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

    const repairThumbnail = async (): Promise<Response | null> => {
      const expectedKey = await findStoredThumbnail(target.courseId, target.id);
      if (!expectedKey) return null;

      if (manual) {
        await db.update(courseMaterials).set({ thumbnailUrl: expectedKey }).where(eq(courseMaterials.id, target.id));
      } else {
        await db.update(diktats).set({ thumbnailUrl: expectedKey, updatedAt: new Date() }).where(eq(diktats.id, target.id));
      }
      return Response.redirect(storage.getUrl(expectedKey), 307);
    };

    const existing = await repairThumbnail();
    if (existing) return existing;

    const fileKey = extractStorageKey(target.fileUrl);
    if (!fileKey) return new Response("Source file not found", { status: 404 });

    const sourceType = manual ? "course_material" as const : "diktat" as const;
    const sourceVersion = fileKey;
    await inngest.send({
      id: `thumbnail-${sourceType}-${target.id}-${encodeURIComponent(sourceVersion).slice(-96)}`,
      name: "pdf/thumbnail.requested",
      data: { materialId: target.id, sourceType, sourceVersion },
    });

    // The client retries transient 202 responses with a cache-busted URL. Keep a
    // short server-side poll so fast jobs can complete within the first request,
    // while the web tier remains read/repair/queue only.
    for (let attempt = 0; attempt < THUMBNAIL_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, THUMBNAIL_POLL_INTERVAL_MS));
      const ready = await repairThumbnail();
      if (ready) return ready;
    }

    return new Response("Thumbnail still processing", {
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
