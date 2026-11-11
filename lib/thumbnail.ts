import { createHash, randomUUID } from "node:crypto";
import { inngest } from "@/lib/inngest";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";

export type PdfThumbnailSourceType = "course_material" | "diktat";

export interface PdfThumbnailRequest {
  materialId: string;
  sourceType: PdfThumbnailSourceType;
  /** Storage key of the source PDF the thumbnail must render. */
  sourceVersion: string;
  /** Content revision where available, including when a PDF key is reused. */
  sourceRevision?: string;
}

type ThumbnailEventSender = (event: {
  id: string;
  name: "pdf/thumbnail.requested";
  data: PdfThumbnailRequest;
}) => Promise<unknown>;

/**
 * Builds the idempotency id for a thumbnail request.
 * The complete sourceType, materialId, and sourceVersion are hashed so two
 * different long keys with the same suffix cannot collapse onto one event.
 * Pass a fresh attemptId for each explicit recovery requeue; omit it for the
 * initial dispatch so retries of one sender operation share one id.
 */
export function buildThumbnailEventId(params: PdfThumbnailRequest & { attemptId?: string }): string {
  const identity = [params.sourceType, params.materialId, params.sourceVersion, params.attemptId ?? "initial"];
  if (params.sourceRevision) identity.push(params.sourceRevision);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `thumbnail-${fingerprint}`;
}

/** Returns a fresh token for one explicit thumbnail recovery requeue. */
export function newThumbnailAttemptId(): string {
  return randomUUID();
}

/** Bound automatic recovery to one event per source version and time window. */
export function thumbnailRecoveryAttemptId(now = Date.now()): string {
  return `recovery-${Math.floor(now / (30 * 60 * 1000))}`;
}

/** New thumbnails have source-specific keys so old workers cannot overwrite a replacement PDF's cover. */
export function buildVersionedThumbnailKey(params: PdfThumbnailRequest & {
  courseSlug: string;
  extension?: "png" | "webp";
}): string {
  const version = createHash("sha256")
    .update(JSON.stringify([params.sourceType, params.sourceVersion, params.sourceRevision ?? null]))
    .digest("hex");
  return buildCourseThumbnailKey({
    courseSlug: params.courseSlug,
    materialId: `${params.materialId}-${version}`,
    extension: params.extension,
  });
}

/**
 * Enqueues a `pdf/thumbnail.requested` event with bounded retries.
 *
 * Dispatch stays fire-and-forget from the caller's perspective: after the
 * attempts are exhausted the failure is logged and the material row is left
 * untouched. A lost request self-heals through the on-demand thumbnail GET
 * (which requeues) and the thumbnail backfill script.
 */
export async function enqueuePdfThumbnail(
  params: PdfThumbnailRequest,
  options?: {
    attempts?: number;
    retryDelayMs?: number;
    sender?: ThumbnailEventSender;
    attemptId?: string;
  },
): Promise<void> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const retryDelayMs = options?.retryDelayMs ?? 150;
  const sender = options?.sender ?? ((event) => inngest.send(event));
  const attemptId = options?.attemptId;
  const event = {
    id: buildThumbnailEventId(attemptId ? { ...params, attemptId } : params),
    name: "pdf/thumbnail.requested" as const,
    data: params,
  };

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await sender(event);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
  console.warn(`[ThumbnailDispatch] Failed to enqueue ${params.materialId} after ${attempts} attempts:`, lastError);
}

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

  await enqueuePdfThumbnail({
    materialId: params.materialId,
    sourceType: "course_material",
    sourceVersion: params.fileKey,
  });

  return null;
}
