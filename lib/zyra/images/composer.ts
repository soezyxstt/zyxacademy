import {
  ZYRA_IMAGE_MAX_COUNT,
  ZYRA_IMAGE_MAX_SOURCE_BYTES,
  ZyraImageMimeSchema,
  type ZyraImageMime,
} from "./contracts";

export interface PendingZyraImage {
  key: string;
  file: File;
  name: string;
  mimeType: ZyraImageMime;
  status: "uploading" | "ready" | "failed";
  attachmentId?: string;
  width?: number;
  height?: number;
  errorCode?: string;
}

export function selectZyraImageFiles(
  current: readonly PendingZyraImage[],
  files: readonly File[],
): { accepted: PendingZyraImage[]; rejected: string[] } {
  const accepted = [...current];
  const rejected: string[] = [];
  for (const file of files) {
    const mime = ZyraImageMimeSchema.safeParse(file.type);
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!mime.success) {
      rejected.push("UNSUPPORTED_MIME");
      continue;
    }
    if (file.size > ZYRA_IMAGE_MAX_SOURCE_BYTES) {
      rejected.push("SOURCE_TOO_LARGE");
      continue;
    }
    if (accepted.some((item) => item.key === key)) {
      rejected.push("DUPLICATE_IMAGE");
      continue;
    }
    if (accepted.length >= ZYRA_IMAGE_MAX_COUNT) {
      rejected.push("IMAGE_COUNT_LIMIT");
      continue;
    }
    accepted.push({ key, file, name: file.name, mimeType: mime.data, status: "uploading" });
  }
  return { accepted, rejected };
}

export function readyZyraAttachmentIds(items: readonly PendingZyraImage[]): string[] {
  return items
    .filter((item) => item.status === "ready" && item.attachmentId)
    .map((item) => item.attachmentId!);
}
