import { FORM_IMAGE_MIMES } from "../../forms/file-types";
import { MEDIA_DOCUMENT_MIME_TYPES, MEDIA_MAX_UPLOAD_BYTES, kindFromKey } from "../../../lib/media";

export function adminMediaFilePath(key: string, download = false): string | null {
  if (!key || key.length > 1024 || /[\\%?#\u0000-\u001f\u007f]/.test(key) || key.trim() !== key) return null;
  const parts = key.split("/");
  if (parts.some(part => !part || part === "." || part.includes(".."))) return null;
  return `/api/storage/file/${parts.map(encodeURIComponent).join("/")}${download ? "?download=1" : ""}`;
}

export const adminMediaDownloadPolicy = {
  mimeTypes: [...MEDIA_DOCUMENT_MIME_TYPES, "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  maxBytes: MEDIA_MAX_UPLOAD_BYTES,
};

const audioTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/flac", "audio/aac", "audio/ogg"];
const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];

export function adminMediaPreviewPolicy(key: string) {
  const kind = kindFromKey(key);
  const mimeTypes: readonly string[] = kind === "image" ? FORM_IMAGE_MIMES
    : kind === "pdf" ? ["application/pdf"]
      : kind === "audio" ? audioTypes
        : kind === "video" ? videoTypes
          : kind === "markdown" || kind === "text" ? MEDIA_DOCUMENT_MIME_TYPES.filter(mime => mime.startsWith("text/") || mime === "application/json").concat("application/octet-stream")
            : [];
  const maxBytes = kind === "markdown" || kind === "text" ? 1024 * 1024 : MEDIA_MAX_UPLOAD_BYTES;
  return { kind, mimeTypes, maxBytes };
}
