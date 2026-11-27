import { readBoundedMultipart } from "../bounded-multipart";

import { DISCUSSION_IMAGE_MAX_BYTES, DISCUSSION_IMAGE_PREVIEW_MAX_BYTES } from "./image-limits";
export * from "./image-limits";

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
  constructor(public readonly code: "format" | "size" | "pixels" | "animation" | "invalid" | "origin") {
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

export async function parseDiscussionImageUpload(request: Request, configuredPublicUrl?: string): Promise<{ channelId: string; file: File }> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  // Cloud Run's standalone Next server may expose an internal URL. The
  // configured public origin is trusted; client-supplied proxy headers are not.
  const allowedOrigins = new Set([new URL(request.url).origin]);
  if (configuredPublicUrl) {
    const publicUrl = new URL(configuredPublicUrl);
    if (publicUrl.protocol === "https:" || publicUrl.protocol === "http:") {
      allowedOrigins.add(publicUrl.origin);
    }
  }
  if (!origin || !allowedOrigins.has(origin) || (fetchSite && fetchSite !== "same-origin")) {
    throw new DiscussionImageError("origin");
  }
  const parsed = await readBoundedMultipart(request, DISCUSSION_IMAGE_MAX_BYTES + 64 * 1024);
  if (parsed.status !== "parsed") throw new DiscussionImageError(parsed.status);
  const { form } = parsed;
  const fields = [...form.keys()];
  const channelId = form.get("channelId");
  const file = form.get("file");
  if (fields.length !== 2 || typeof channelId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(channelId) || !(file instanceof File)) {
    throw new DiscussionImageError("invalid");
  }
  if (!file.size || file.size > DISCUSSION_IMAGE_MAX_BYTES) throw new DiscussionImageError("size");
  return { channelId, file };
}
