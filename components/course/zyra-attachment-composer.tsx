"use client";

import * as React from "react";
import { AlertCircle, Image as ImageIcon, Paperclip, RotateCcw, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  readyZyraAttachmentIds,
  selectZyraImageFiles,
  type PendingZyraImage,
} from "@/lib/zyra/images/composer";
import type { ZyraMessageAttachment } from "@/lib/zyra/images/contracts";

interface ZyraAttachmentComposerProps {
  courseId: string;
  sessionId: string;
  disabled?: boolean;
  onAttachmentIdsChange: (ids: string[]) => void;
  onAttachmentsChange?: (attachments: ZyraMessageAttachment[]) => void;
  onAttachmentsReadyChange?: (ready: boolean) => void;
}

function setItemStatus(
  items: readonly PendingZyraImage[],
  key: string,
  update: Partial<PendingZyraImage>,
): PendingZyraImage[] {
  return items.map((item) => item.key === key ? { ...item, ...update } : item);
}

export function ZyraAttachmentComposer({
  courseId,
  sessionId,
  disabled = false,
  onAttachmentIdsChange,
  onAttachmentsChange,
  onAttachmentsReadyChange,
}: ZyraAttachmentComposerProps) {
  const [items, setItems] = React.useState<PendingZyraImage[]>([]);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [composerError, setComposerError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const next = Object.fromEntries(items.map((item) => [item.key, URL.createObjectURL(item.file)]));
    setPreviews(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [items]);

  React.useEffect(() => {
    onAttachmentIdsChange(readyZyraAttachmentIds(items));
    onAttachmentsChange?.(items.flatMap((item) => item.status === "ready" && item.attachmentId && item.width && item.height
      ? [{ id: item.attachmentId, mimeType: item.mimeType, width: item.width, height: item.height }]
      : []));
    onAttachmentsReadyChange?.(items.every((item) => item.status === "ready"));
  }, [items, onAttachmentIdsChange, onAttachmentsChange, onAttachmentsReadyChange]);

  const uploadItem = React.useCallback(async (item: PendingZyraImage) => {
    const form = new FormData();
    form.set("courseId", courseId);
    form.set("sessionId", sessionId);
    form.set("file", item.file, item.name);
    try {
      const response = await fetch("/api/zyra/attachments", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as { id?: string; width?: number; height?: number; error?: string } | null;
      if (!response.ok || !payload?.id || !payload.width || !payload.height) {
        setComposerError("Gambar gagal diunggah. Periksa format dan ukuran file, lalu coba lagi.");
        setItems((current) => setItemStatus(current, item.key, {
          status: "failed",
          errorCode: payload?.error ?? "ATTACHMENT_UPLOAD_FAILED",
        }));
        return;
      }
      setItems((current) => setItemStatus(current, item.key, {
        status: "ready",
        attachmentId: payload.id,
        width: payload.width,
        height: payload.height,
        errorCode: undefined,
      }));
      setComposerError(null);
    } catch {
      setComposerError("Koneksi terputus saat mengunggah gambar. Coba lagi.");
      setItems((current) => setItemStatus(current, item.key, {
        status: "failed",
        errorCode: "ATTACHMENT_UPLOAD_FAILED",
      }));
    }
  }, [courseId, sessionId]);

  const addFiles = React.useCallback((files: readonly File[]) => {
    const result = selectZyraImageFiles(items, files);
    if (result.rejected.length > 0) {
      const first = result.rejected[0];
      setComposerError(first === "SOURCE_TOO_LARGE"
        ? "Ukuran setiap gambar maksimal 8 MB."
        : first === "IMAGE_COUNT_LIMIT"
          ? "Maksimal 4 gambar untuk satu pertanyaan."
          : first === "DUPLICATE_IMAGE"
            ? "Gambar yang sama sudah dipilih."
            : "Gunakan gambar berformat PNG, JPG, atau WebP.");
    } else {
      setComposerError(null);
    }
    if (result.accepted.length === items.length) return;
    setItems(result.accepted);
    const newItems = result.accepted.filter((item) => !items.some((existing) => existing.key === item.key));
    newItems.forEach((item) => { void uploadItem(item); });
  }, [items, uploadItem]);

  const removeItem = async (item: PendingZyraImage) => {
    if (item.attachmentId) {
      const query = new URLSearchParams({ courseId, sessionId });
      await fetch(`/api/zyra/attachments/${encodeURIComponent(item.attachmentId)}?${query.toString()}`, { method: "DELETE" }).catch(() => undefined);
    }
    setItems((current) => current.filter((candidate) => candidate.key !== item.key));
  };

  const retryItem = (item: PendingZyraImage) => {
    setItems((current) => setItemStatus(current, item.key, { status: "uploading", errorCode: undefined }));
    void uploadItem({ ...item, status: "uploading", attachmentId: undefined });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) addFiles(files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      className="space-y-2"
      onPaste={handlePaste}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Lampiran gambar">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-1.5">
              {previews[item.key] ? (
                <Image
                  src={previews[item.key]}
                  alt={`Pratinjau ${item.name}`}
                  width={40}
                  height={40}
                  unoptimized
                  className="size-10 rounded-md object-cover"
                />
              ) : (
                <ImageIcon className="size-8 p-1 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="max-w-32 truncate text-body-2xs text-foreground">{item.name}</span>
              {item.status === "uploading" && <span className="size-4 animate-pulse rounded-md bg-muted-foreground/35" aria-label="Mengunggah" />}
              {item.status === "failed" && (
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => retryItem(item)} aria-label={`Coba lagi ${item.name}`}>
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
              {item.status === "failed" && <span className="inline-flex items-center gap-1 text-body-2xs text-status-error"><AlertCircle className="size-4" aria-hidden="true" />Gagal</span>}
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => void removeItem(item)} aria-label={`Hapus ${item.name}`}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || items.length >= 4}
          className={cn("text-muted-foreground", items.length >= 4 && "hidden")}
          aria-label="Tambahkan gambar"
        >
          <Paperclip className="size-4" />
          Gambar
        </Button>
        <span className="text-body-2xs text-muted-foreground">PNG, JPG, atau WebP, maksimal 4</span>
      </div>
      {composerError && <p className="flex items-center gap-1.5 text-body-xs text-status-error" role="alert"><AlertCircle className="size-4 shrink-0" aria-hidden="true" />{composerError}</p>}
    </div>
  );
}
