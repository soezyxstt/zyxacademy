"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ZyraMessageAttachment } from "@/lib/zyra/images/contracts";

interface ZyraMessageAttachmentsProps {
  attachments: readonly ZyraMessageAttachment[];
  courseId: string;
  sessionId: string;
}

function attachmentUrl(id: string, courseId: string, sessionId: string): string {
  const query = new URLSearchParams({ courseId, sessionId });
  return `/api/zyra/attachments/${encodeURIComponent(id)}?${query.toString()}`;
}

export function ZyraMessageAttachments({
  attachments,
  courseId,
  sessionId,
}: ZyraMessageAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="grid max-w-md grid-cols-2 gap-2 pt-1 sm:grid-cols-3" aria-label={`${attachments.length} gambar terlampir`}>
      {attachments.map((attachment, index) => {
        const src = attachmentUrl(attachment.id, courseId, sessionId);
        const alt = `Gambar pertanyaan ${index + 1}`;
        return (
          <Dialog key={attachment.id}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group relative aspect-square min-h-24 overflow-hidden rounded-lg border border-primary-foreground/30 bg-background/10 text-left transition-colors duration-150 hover:border-primary-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Lihat ${alt.toLowerCase()}`}
              >
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(max-width: 640px) 42vw, 180px"
                  unoptimized
                  className="object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                />
                <span className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-background/90 text-foreground shadow-sm">
                  <ImageIcon className="size-4" aria-hidden="true" />
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl p-4 sm:p-5">
              <DialogHeader>
                <DialogTitle>Gambar pertanyaan</DialogTitle>
                <DialogDescription>Gambar hanya dapat dibuka oleh pemilik percakapan ini.</DialogDescription>
              </DialogHeader>
              <div className="relative max-h-[75vh] min-h-64 overflow-hidden rounded-lg border border-border bg-muted/30">
                <Image
                  src={src}
                  alt={alt}
                  width={attachment.width}
                  height={attachment.height}
                  sizes="90vw"
                  unoptimized
                  className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        );
      })}
    </div>
  );
}
