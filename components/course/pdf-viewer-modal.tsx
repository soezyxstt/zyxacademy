"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import { Dialog as DialogNs } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { getViewablePdfUrl } from "@/lib/pdf-utils";

export function PdfViewerModal({
  material,
  onClose,
  allowDownload = false,
}: {
  material: CourseMaterial | null;
  onClose: () => void;
  allowDownload?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!material) return null;

  const pdfUrl = getViewablePdfUrl(material.url);
  const downloadUrl = material.url;

  return (
    <DialogNs.Root open={Boolean(material)} onOpenChange={(open) => !open && onClose()}>
      <DialogNs.Portal>
        {/* Backdrop overlay */}
        <DialogNs.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        {/* Ultra-thin bezel modal container: 0 padding on mobile, 4-6px on desktop */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-1 md:p-1.5 pointer-events-none">
          <DialogNs.Content
            className="pointer-events-auto relative flex size-full flex-col overflow-hidden rounded-none sm:rounded-lg border-0 sm:border border-border/80 bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-150"
            aria-label={`Pratinjau dokumen ${material.title}`}
          >
            <DialogNs.Title className="sr-only">{material.title}</DialogNs.Title>
            <DialogNs.Description className="sr-only">
              Pratinjau PDF {material.title}
            </DialogNs.Description>

            {/* Ultra-slim header: 34px height (h-8.5), edge-to-edge */}
            <div className="flex h-8.5 shrink-0 items-center justify-between border-b border-border/80 bg-card px-2.5 sm:px-3">
              {/* Left: Icon, Title, Year */}
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-[#ea4335]" aria-hidden />
                <span
                  className="truncate text-body-xs font-semibold text-foreground max-w-[240px] sm:max-w-md md:max-w-xl"
                  title={material.title}
                >
                  {material.title}
                </span>
                {material.year ? (
                  <span className="hidden text-body-2xs text-muted-foreground sm:inline">
                    · {material.year}
                  </span>
                ) : null}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {pdfUrl ? (
                  <>
                    {allowDownload && downloadUrl ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                        asChild
                      >
                        <a
                          href={downloadUrl}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Unduh PDF"
                          aria-label="Unduh PDF"
                        >
                          <Download className="size-3.5" />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                      asChild
                    >
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Buka di tab baru"
                        aria-label="Buka di tab baru"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  title="Tutup (Esc)"
                  aria-label="Tutup pratinjau"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Viewer body: 100% remaining space, 0 padding */}
            <div className="relative flex-1 w-full min-h-0 bg-muted/30">
              {pdfUrl ? (
                <>
                  {!loaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground pointer-events-none">
                      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-body-xs">Memuat PDF...</span>
                    </div>
                  )}
                  <iframe
                    key={material.id}
                    src={pdfUrl}
                    title={material.title}
                    className="size-full border-0"
                    onLoad={() => setLoaded(true)}
                  />
                </>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                  <FileText className="size-8 opacity-50" />
                  <p className="text-body-sm font-medium">Tautan berkas PDF belum tersedia.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 rounded-md text-body-xs"
                    onClick={onClose}
                  >
                    Tutup
                  </Button>
                </div>
              )}
            </div>
          </DialogNs.Content>
        </div>
      </DialogNs.Portal>
    </DialogNs.Root>
  );
}
