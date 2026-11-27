export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-m4v",
] as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024;

export function matchesCourseVideoUploadHeader(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  switch (mime) {
    case "video/mp4":
    case "video/x-m4v":
      return ascii(4, 8) === "ftyp";
    case "video/quicktime":
      return ascii(4, 8) === "ftyp" || ascii(4, 8) === "moov";
    case "video/webm":
    case "video/x-matroska":
      return [0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => bytes[i] === byte);
    case "image/jpeg":
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    default:
      return false;
  }
}
