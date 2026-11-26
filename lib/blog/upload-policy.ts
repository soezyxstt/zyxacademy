export const blogThumbnailMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const blogBodyMimeTypes = [...blogThumbnailMimeTypes, "video/mp4", "video/webm"] as const;
export const blogUploadMaxBytes = 20 * 1024 * 1024;

export function isBlogUploadPath(value: string, body = false): boolean {
  return /^\/api\/storage\/file\/blog\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/.test(value) ||
    (body && /^\/api\/storage\/file\/blog\/[A-Za-z0-9_-]+\.(?:mp4|webm)$/.test(value));
}
