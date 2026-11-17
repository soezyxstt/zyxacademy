export const DISCUSSION_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DISCUSSION_IMAGE_MAX_PIXELS = 16_000_000;
export const DISCUSSION_IMAGE_MAX_EDGE = 4096;
export const DISCUSSION_IMAGE_MAX_COUNT = 4;
export const DISCUSSION_IMAGE_SMALL_BYTES = 1024 * 1024;
export const DISCUSSION_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024;
export const DISCUSSION_IMAGE_PREVIEW_MAX_EDGE = 480;

export type DiscussionImageMime = "image/jpeg" | "image/png" | "image/webp";
export type DiscussionImageExtension = "jpg" | "png" | "webp";

export type DiscussionImageDTO = {
  id: string;
  name: string;
  mime: DiscussionImageMime;
  size: number;
  width: number;
  height: number;
  url: string;
  downloadUrl: string;
  previewAvailable: boolean;
};

export type DiscussionImageRowShape = {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  previewStorageKey?: string | null;
  previewSize?: number | null;
};

export class DiscussionImageError extends Error {
  constructor(public readonly code: "format" | "size" | "pixels" | "animation" | "invalid") {
    super(code);
  }
}

export { requireDiscussionPrivateStorage } from "./image-storage-policy";

export function hasDiscussionImagePreview(row: Pick<DiscussionImageRowShape, "previewStorageKey" | "previewSize">): boolean {
  return Boolean(row.previewStorageKey && Number.isInteger(row.previewSize) && row.previewSize! > 0 && row.previewSize! <= DISCUSSION_IMAGE_PREVIEW_MAX_BYTES);
}

export function toDiscussionImageDto(row: DiscussionImageRowShape): DiscussionImageDTO {
  if (!row.mime || !["image/jpeg", "image/png", "image/webp"].includes(row.mime) || !row.size || !row.width || !row.height) {
    throw new Error("DISCUSSION_IMAGE_INVALID");
  }
  const url = `/api/discussions/attachments/${encodeURIComponent(row.id)}`;
  return {
    id: row.id,
    name: row.name,
    mime: row.mime as DiscussionImageMime,
    size: row.size,
    width: row.width,
    height: row.height,
    url,
    downloadUrl: `${url}?download=1`,
    previewAvailable: hasDiscussionImagePreview(row),
  };
}

export function sanitizeDiscussionImageFilename(name: string, extension: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "").replace(/[\u0000-\u001f\u007f"]/g, "_").trim().slice(0, 100);
  return `${base || "gambar"}.${extension}`;
}

export async function parseDiscussionImageUpload(request: Request): Promise<{ channelId: string; file: File }> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== new URL(request.url).origin || (fetchSite && fetchSite !== "same-origin")) {
    throw new DiscussionImageError("invalid");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new DiscussionImageError("invalid");
  const maxBody = DISCUSSION_IMAGE_MAX_BYTES + 64 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBody)) throw new DiscussionImageError("size");
  if (!request.body) throw new DiscussionImageError("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBody) {
      void reader.cancel();
      throw new DiscussionImageError("size");
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new DiscussionImageError("invalid");
  }
  const fields = [...form.keys()];
  const channelId = form.get("channelId");
  const file = form.get("file");
  if (fields.length !== 2 || typeof channelId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(channelId) || !(file instanceof File)) {
    throw new DiscussionImageError("invalid");
  }
  if (!file.size || file.size > DISCUSSION_IMAGE_MAX_BYTES) throw new DiscussionImageError("size");
  return { channelId, file };
}
