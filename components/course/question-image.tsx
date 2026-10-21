"use client";

import { useState } from "react";
import { AlertCircle, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type QuestionImageProps = {
  src: string;
  alt?: string;
  className?: string;
  showCaption?: boolean;
};

/**
 * Defensive image renderer for question prompts, options, and explanations.
 * Supports both R2/proxy URLs and base64 data URIs.
 * Includes defensive fallback on load failure and click-to-zoom dialog.
 */
export function QuestionImage({ src, alt, className, showCaption = true }: QuestionImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // Clean data URIs that might contain accidental whitespace/newlines
  const cleanSrc = src.startsWith("data:image/") ? src.replace(/\s+/g, "") : src;

  if (failedSrc === cleanSrc) {
    return (
      <div
        role="alert"
        className={cn(
          "my-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-body-xs text-muted-foreground",
          className,
        )}
      >
        <AlertCircle className="size-4 shrink-0 text-status-warning" />
        <span>Gambar tidak dapat dimuat{alt ? `: ${alt}` : ""}</span>
      </div>
    );
  }

  return (
    <>
      <figure className={cn("my-3 block text-center not-prose", className)}>
        <div className="group relative inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cleanSrc}
            alt={alt || "Diagram soal"}
            ref={(image) => { if (image?.complete && image.naturalWidth === 0) setFailedSrc(cleanSrc); }}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(cleanSrc)}
            onClick={() => setIsZoomOpen(true)}
            className="mx-auto block max-h-[420px] w-auto max-w-full cursor-zoom-in rounded-xl border border-border bg-card object-contain shadow-2xs transition-all hover:border-brand-primary/40"
          />
          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            aria-label="Perbesar gambar diagram"
            className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg bg-background/80 text-foreground shadow-xs opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>
        {showCaption && alt && alt.trim() && (
          <figcaption className="mt-1.5 text-center text-body-xs italic text-muted-foreground font-sans">
            {alt}
          </figcaption>
        )}
      </figure>

      <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <DialogContent className="max-w-4xl p-2 sm:p-4 bg-card border-border overflow-hidden">
          <DialogTitle className="sr-only">
            {alt && alt.trim() ? alt.trim() : "Diagram soal diperbesar"}
          </DialogTitle>
          <div className="flex flex-col items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cleanSrc}
              alt={alt || "Diagram soal diperbesar"}
              onError={() => setFailedSrc(cleanSrc)}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            {showCaption && alt && alt.trim() && (
              <p className="mt-3 text-center text-body-xs text-muted-foreground font-sans">
                {alt}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
