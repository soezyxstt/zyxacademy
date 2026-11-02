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

function inferImageMimeType(file: Pick<File, "type" | "name">): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "";
}

export function selectZyraImageFiles(
  current: readonly PendingZyraImage[],
  files: readonly File[],
): { accepted: PendingZyraImage[]; rejected: string[] } {
  const accepted = [...current];
  const rejected: string[] = [];
  for (const file of files) {
    const resolvedMime = inferImageMimeType(file);
    const mime = ZyraImageMimeSchema.safeParse(resolvedMime);
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

export function zyraImageFilesFromClipboard(
  items: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">> | null | undefined,
  fallbackFiles?: ArrayLike<File> | null,
): File[] {
  const results: File[] = [];
  const seenKeys = new Set<string>();

  const pushIfImage = (file: File | null | undefined, declaredType?: string) => {
    if (!file) return;
    const mime = declaredType || inferImageMimeType(file);
    if (!mime.startsWith("image/")) return;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    if (!file.type && mime) {
      results.push(new File([file], file.name, { type: mime, lastModified: file.lastModified }));
    } else {
      results.push(file);
    }
  };

  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      pushIfImage(item.getAsFile(), item.type);
    }
  }

  if (fallbackFiles) {
    for (const file of Array.from(fallbackFiles)) {
      pushIfImage(file, file.type);
    }
  }

  return results;
}
