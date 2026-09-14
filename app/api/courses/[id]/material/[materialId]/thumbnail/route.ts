import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { inngest } from "@/lib/inngest";

const THUMBNAIL_POLL_ATTEMPTS = 4;
const THUMBNAIL_POLL_INTERVAL_MS = 500;

function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().split(/[?#]/, 1)[0];
  if (!raw) return null;
  let candidate = raw;
  const relativeMarker = ["/api/storage/file/", "/f/"].find((marker) => raw.startsWith(marker));
  if (relativeMarker) {
    candidate = raw.slice(relativeMarker.length);
  } else if (!/^https?:\/\//i.test(raw)) {
    candidate = raw.replace(/^\/+/, "");
  }
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const marker = ["/api/storage/file/", "/f/"].find((item) => url.pathname.includes(item));
      if (marker) candidate = url.pathname.split(marker).pop() || "";
      else {
        const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
        if (!publicBase || !raw.startsWith(`${publicBase}/`)) return null;
        candidate = url.pathname.slice(new URL(publicBase).pathname.replace(/\/$/, "").length + 1);
      }
    }
    return decodeURIComponent(candidate).replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

async function findStoredThumbnail(courseIds: readonly string[], materialId: string): Promise<string | null> {
  for (const courseId of [...new Set(courseIds)]) {
    for (const extension of ["png", "webp"] as const) {
      const expectedKey = buildCourseThumbnailKey({
        courseSlug: courseId,
        materialId,
        extension,
      });
      if (await storage.exists(expectedKey)) return expectedKey;
    }
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
    const identity = await resolveCourseIdentity(courseId);
    if (!identity || identity.status !== "active") return new Response("Course not found", { status: 404 });
    const courseIds = identity.allIds;

    // Keep the direct lookup for the common request shape, but always perform
    // the alias lookup as well so a duplicate material ID cannot be hidden by
    // selecting the first canonical/legacy row.
    const [manual] = await db
      .select({
        id: courseMaterials.id,
        courseId: courseMaterials.courseId,
        fileUrl: courseMaterials.fileUrl,
        thumbnailUrl: courseMaterials.thumbnailUrl,
        checksum: courseMaterials.checksum,
      })
      .from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, courseId)))
      .limit(1);

    const manualAliases = await db
      .select({
        id: courseMaterials.id,
        courseId: courseMaterials.courseId,
        fileUrl: courseMaterials.fileUrl,
        thumbnailUrl: courseMaterials.thumbnailUrl,
        checksum: courseMaterials.checksum,
      })
      .from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, courseIds)))
      .limit(2);
    if (manualAliases.length > 1) return new Response("Material not found", { status: 404 });
    const resolvedManual = manualAliases[0] ?? manual ?? null;

    const [compiled] = await db
      .select({
        id: diktats.id,
        courseId: diktats.courseId,
        fileUrl: diktats.fileUrl,
        thumbnailUrl: diktats.thumbnailUrl,
        generationHash: diktats.generationHash,
      })
      .from(diktats)
      .where(
        and(
          eq(diktats.id, materialId),
          eq(diktats.courseId, courseId),
          eq(diktats.status, "ready"),
          eq(diktats.isStale, false),
        ),
      )
      .limit(1);

    const compiledAliases = await db
      .select({
        id: diktats.id,
        courseId: diktats.courseId,
        fileUrl: diktats.fileUrl,
        thumbnailUrl: diktats.thumbnailUrl,
        generationHash: diktats.generationHash,
      })
      .from(diktats)
      .where(and(
        eq(diktats.id, materialId),
        inArray(diktats.courseId, courseIds),
        eq(diktats.status, "ready"),
        eq(diktats.isStale, false),
      ))
      .limit(2);
    if (compiledAliases.length > 1) return new Response("Material not found", { status: 404 });
    const resolvedCompiled = compiledAliases[0] ?? compiled ?? null;

    // The same material ID must not resolve to both legacy source tables.
    // Otherwise the thumbnail key could be selected from the wrong product.
    if (resolvedManual && resolvedCompiled) return new Response("Material not found", { status: 404 });

    const target = resolvedManual ?? resolvedCompiled;
    if (!target) return new Response("Material not found", { status: 404 });

    const expectedThumbnailKeys = new Set(courseIds.flatMap((candidateCourseId) =>
      (["png", "webp"] as const).map((extension) => buildCourseThumbnailKey({
        courseSlug: candidateCourseId,
        materialId: target.id,
        extension,
      })),
    ));
    const storedThumbnailKey = extractStorageKey(target.thumbnailUrl);
    if (storedThumbnailKey && expectedThumbnailKeys.has(storedThumbnailKey)) {
      return Response.redirect(storage.getUrl(storedThumbnailKey), 307);
    }

    // A public thumbnail GET may discover an already-generated object, but it
    // must not repair the database record. Persisting a discovered key from an
    // unauthenticated request would turn this read endpoint into a mutation.
    const findReadyThumbnailResponse = async (): Promise<Response | null> => {
      const expectedKey = await findStoredThumbnail(courseIds, target.id);
      if (!expectedKey) return null;
      return Response.redirect(storage.getUrl(expectedKey), 307);
    };

    const existing = await findReadyThumbnailResponse();
    if (existing) return existing;

    const fileKey = extractStorageKey(target.fileUrl);
    if (!fileKey) return new Response("Source file not found", { status: 404 });

    const sourceType = resolvedManual ? "course_material" as const : "diktat" as const;
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
      const ready = await findReadyThumbnailResponse();
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
