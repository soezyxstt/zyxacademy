import { inngest } from "@/lib/inngest";

/**
 * Compatibility entrypoint for manual course-material uploads.
 *
 * Thumbnail rendering is compute-only. The web tier only emits an idempotent
 * request and always stores `thumbnailUrl = null`; the Deno worker fills it in.
 * The historical function name is kept to avoid widening the upload refactor.
 */
export async function generateAndSavePdfThumbnail(params: {
  courseSlug: string;
  materialId: string;
  pdfBuffer?: Buffer | Uint8Array | null;
  fileKey?: string | null;
}): Promise<string | null> {
  if (!params.courseSlug || !params.materialId || !params.fileKey) return null;

  const sourceVersion = params.fileKey;
  await inngest
    .send({
      id: `thumbnail-course-material-${params.materialId}-${encodeURIComponent(sourceVersion).slice(-96)}`,
      name: "pdf/thumbnail.requested",
      data: {
        materialId: params.materialId,
        sourceType: "course_material" as const,
        sourceVersion,
      },
    })
    .catch((error) => {
      console.warn(`[ThumbnailDispatch] Failed to enqueue ${params.materialId}:`, error);
    });

  return null;
}
