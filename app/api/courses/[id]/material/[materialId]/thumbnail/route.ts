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
  context: { params: Promise<{ id: string; materialId: string }> }
) {
  const { id: courseId, materialId } = await context.params;
  if (!courseId || !materialId) {
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    // 1. Check in courseMaterials
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

    // 2. Check in diktats if not in courseMaterials
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
    if (!target) {
      return new Response("Material not found", { status: 404 });
    }

    // 3. If thumbnail already exists in DB
    if (target.thumbnailUrl) {
      const url = storage.getUrl(target.thumbnailUrl);
      return Response.redirect(url, 307);
    }

    const expectedKey = buildCourseThumbnailKey({
      courseSlug: target.courseId,
      materialId: target.id,
      extension: "webp",
    });

    // 4. Check if thumbnail key already exists in storage
    if (await storage.exists(expectedKey)) {
      if (manual) {
        await db.update(courseMaterials).set({ thumbnailUrl: expectedKey }).where(eq(courseMaterials.id, target.id));
      } else {
        await db.update(diktats).set({ thumbnailUrl: expectedKey, updatedAt: new Date() }).where(eq(diktats.id, target.id));
      }
      return Response.redirect(storage.getUrl(expectedKey), 307);
    }

    // 5. If not generated yet, enqueue thumbnail generation in background
    const fileKey = extractStorageKey(target.fileUrl);
    if (!fileKey) {
      return new Response("Source file not found", { status: 404 });
    }

    const sourceVersion = manual
      ? (manual.checksum || "v1")
      : (compiled?.generationHash || "v1");

    await inngest.send({
      id: `thumbnail-${target.id}-${sourceVersion}`,
      name: "pdf/thumbnail.requested",
      data: {
        materialId: target.id,
        sourceType: manual ? "course_material" : "diktat",
      },
    }).catch((err) => {
      console.warn(`[ThumbnailAPI] Failed to enqueue thumbnail for ${materialId}:`, err);
    });

    // Return a lightweight SVG placeholder while thumbnail generates in background
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#18181b"/>
  <rect x="20" y="20" width="260" height="160" rx="8" fill="#27272a" stroke="#3f3f46" stroke-width="1.5"/>
  <path d="M120 75v50l45-25z" fill="#71717a"/>
  <text x="150" y="150" fill="#a1a1aa" font-size="12" font-family="sans-serif" text-anchor="middle">Memuat pratinjau...</text>
</svg>`;

    return new Response(placeholderSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error(`[ThumbnailAPI] Error serving thumbnail for ${materialId}:`, error);
    return new Response("Internal error", { status: 500 });
  }
}
