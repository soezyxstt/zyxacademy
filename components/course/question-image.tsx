"use client";

import { useState } from "react";
import { AlertCircle, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type QuestionImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Defensive image renderer for question prompts, options, and explanations.
 * Supports both R2/proxy URLs and base64 data URIs.
 * Includes defensive fallback on load failure and click-to-zoom dialog.
 */
export function QuestionImage({ src, alt, className }: QuestionImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // Clean data URIs that might contain accidental whitespace/newlines
  const cleanSrc = src.startsWith("data:image/") ? src.replace(/\s+/g, "") : src;

  if (hasError) {
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
            loading="lazy"
            decoding="async"
            onError={() => setHasError(true)}
            onClick={() => setIsZoomOpen(true)}
            className="mx-auto block max-h-[420px] w-auto max-w-full cursor-zoom-in rounded-xl border border-border bg-card object-contain shadow-2xs transition-all hover:border-brand-primary/40"
          />
          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            aria-label="Perbesar gambar diagram"
            className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg bg-background/80 text-foreground shadow-xs opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 hover:bg-background"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>
        {alt && alt.trim() && (
          <figcaption className="mt-1.5 text-center text-body-xs italic text-muted-foreground font-sans">
            {alt}
          </figcaption>
        )}
      </figure>

      <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <DialogContent className="max-w-4xl p-2 sm:p-4 bg-card border-border overflow-hidden">
          <div className="flex flex-col items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cleanSrc}
              alt={alt || "Diagram soal diperbesar"}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            {alt && alt.trim() && (
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
