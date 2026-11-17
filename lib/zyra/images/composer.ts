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

function normalizeImageMimeType(raw?: string | null): string {
  const base = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

function defaultImageExtension(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function normalizeImageFilename(name: string, mime: string): string {
  const trimmed = name.trim();
  if (trimmed.length > 0) return trimmed;
  return `gambar.${defaultImageExtension(mime)}`;
}

function inferImageMimeType(file: Pick<File, "type" | "name">): string {
  const normalizedType = normalizeImageMimeType(file.type);
  if (normalizedType && normalizedType !== "application/octet-stream") return normalizedType;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return normalizedType;
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
    const resolvedName = normalizeImageFilename(file.name, mime.success ? mime.data : resolvedMime);
    const key = `${resolvedName}:${file.size}:${file.lastModified}`;
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
    accepted.push({ key, file, name: resolvedName, mimeType: mime.data, status: "uploading" });
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
  let hasClipboardItemFiles = false;

  const pushIfImage = (file: File | null | undefined, declaredType?: string) => {
    if (!file) return;
    const normalizedDeclared = normalizeImageMimeType(declaredType);
    const mime = (normalizedDeclared && normalizedDeclared !== "application/octet-stream")
      ? normalizedDeclared
      : inferImageMimeType(file);
    if (!mime.startsWith("image/")) return;
    const resolvedName = normalizeImageFilename(file.name, mime);
    const key = `${resolvedName}:${file.size}:${mime}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    if (file.type !== mime || file.name !== resolvedName) {
      results.push(new File([file], resolvedName, { type: mime, lastModified: file.lastModified }));
    } else {
      results.push(file);
    }
  };

  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) {
        hasClipboardItemFiles = true;
        pushIfImage(file, item.type);
      }
    }
  }

  if (!hasClipboardItemFiles && fallbackFiles) {
    for (const file of Array.from(fallbackFiles)) {
      pushIfImage(file, file.type);
    }
  }

  return results;
}

export interface ZyraClipboardPasteEventLike {
  defaultPrevented: boolean;
  clipboardData?: {
    items?: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">> | null;
    files?: ArrayLike<File> | null;
  } | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function handleZyraImagePasteEvent(
  event: ZyraClipboardPasteEventLike,
  options: { disabled?: boolean; onFiles: (files: File[]) => void },
): boolean {
  if (event.defaultPrevented || options.disabled) return false;
  const files = zyraImageFilesFromClipboard(
    event.clipboardData?.items ?? null,
    event.clipboardData?.files ?? null,
  );
  if (files.length === 0) return false;
  event.preventDefault();
  event.stopPropagation();
  options.onFiles(files);
  return true;
}
