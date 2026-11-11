import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey, extractStorageKey } from "@/lib/storage/keys";
import { inngest } from "@/lib/inngest";
import { buildThumbnailEventId, buildVersionedThumbnailKey, canUseLegacyThumbnail, thumbnailRecoveryAttemptId, type PdfThumbnailRequest } from "@/lib/thumbnail";

function legacyThumbnailKeys(courseIds: readonly string[], materialId: string): string[] {
  return [...new Set(courseIds)].flatMap((courseSlug) => (["png", "webp"] as const).map((extension) =>
    buildCourseThumbnailKey({ courseSlug, materialId, extension })));
}

function thumbnailKeys(courseIds: readonly string[], request: PdfThumbnailRequest): string[] {
  const ids = [...new Set(courseIds)];
  return [
    ...ids.flatMap((courseSlug) => (["png", "webp"] as const).map((extension) =>
      buildVersionedThumbnailKey({ ...request, courseSlug, extension }))),
    ...(canUseLegacyThumbnail(request) ? legacyThumbnailKeys(ids, request.materialId) : []),
  ];
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
    const lookupIds = [...new Set([courseId, ...courseIds])];

    // Query all aliases for each source, and reject ambiguous results.
    const [manualAliases, compiledAliases] = await Promise.all([db
      .select({
        id: courseMaterials.id,
        courseId: courseMaterials.courseId,
        fileUrl: courseMaterials.fileUrl,
        thumbnailUrl: courseMaterials.thumbnailUrl,
        checksum: courseMaterials.checksum,
      })
      .from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, lookupIds)))
      .limit(2), db
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
        inArray(diktats.courseId, lookupIds),
        eq(diktats.status, "ready"),
        eq(diktats.isStale, false),
      ))
      .limit(2)]);
    if (manualAliases.length > 1 || compiledAliases.length > 1) return new Response("Material not found", { status: 404 });
    const resolvedManual = manualAliases[0] ?? null;
    const resolvedCompiled = compiledAliases[0] ?? null;

    // The same material ID must not resolve to both legacy source tables.
    // Otherwise the thumbnail key could be selected from the wrong product.
    if (resolvedManual && resolvedCompiled) return new Response("Material not found", { status: 404 });

    const target = resolvedManual ?? resolvedCompiled;
    if (!target) return new Response("Material not found", { status: 404 });

    const fileKey = extractStorageKey(target.fileUrl);
    const sourceType = resolvedManual ? "course_material" as const : "diktat" as const;
    const sourceRevision = resolvedManual?.checksum ?? resolvedCompiled?.generationHash ?? undefined;
    const thumbnailRequest = fileKey ? { materialId: target.id, sourceType, sourceVersion: fileKey, sourceRevision } : null;
    const keys = thumbnailRequest ? thumbnailKeys(courseIds, thumbnailRequest) : legacyThumbnailKeys(courseIds, target.id);
    const expectedThumbnailKeys = new Set(keys);
    const storedThumbnailKey = extractStorageKey(target.thumbnailUrl);
    if (storedThumbnailKey && expectedThumbnailKeys.has(storedThumbnailKey)) {
      return Response.redirect(storage.getUrl(storedThumbnailKey), 307);
    }

    // A public thumbnail GET may discover an already-generated object, but it
    // must not repair the database record. Persisting a discovered key from an
    // unauthenticated request would turn this read endpoint into a mutation.
    const existence = await Promise.all(keys.map((key) => storage.exists(key)));
    const existingKey = keys.find((_, index) => existence[index]);
    if (existingKey) return Response.redirect(storage.getUrl(existingKey), 307);
    if (!thumbnailRequest) return new Response("Source file not found", { status: 404 });

    await inngest.send({
      id: buildThumbnailEventId({
        ...thumbnailRequest,
        attemptId: thumbnailRecoveryAttemptId(),
      }),
      name: "pdf/thumbnail.requested",
      data: thumbnailRequest,
    });

    return new Response("Thumbnail still processing", {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`[ThumbnailAPI] Error serving thumbnail for ${materialId}:`, error);
    return new Response("Internal error", { status: 500 });
  }
}
