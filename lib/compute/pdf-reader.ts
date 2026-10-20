import { createHash } from "node:crypto";
import { storage, type StorageProvider } from "@/lib/storage";
import { parseStoredPdfPages } from "./pdf-pages";
import { pdfReadOptionsSchema, timePdfStage, type PdfReadOptions } from "./pdf-read-options";
import { cachedPdfPages, PDF_PAGE_RENDERER_VERSION } from "./pdf-page-cache";

export async function readPdfFromStorage(input: Partial<PdfReadOptions> & { storageKey: string; pages: number[]; requestId: string },
  store: Pick<StorageProvider, "download" | "exists" | "upload"> = storage) {
  if (!store.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  const options = pdfReadOptionsSchema.parse(input);
  const { representation, imageWidth } = options;
  const traceId = input.requestId;
  const bytes = await timePdfStage(traceId, "fetch", () => store.download!(input.storageKey));
  const size = bytes.byteLength;
  if (size === 0) throw new Error("PDF_EMPTY");
  if (size > 50 * 1024 * 1024) throw new Error("PDF_EXCEEDS_SIZE_LIMIT");

  const documentChecksum = createHash("sha256").update(bytes).digest("hex");
  const textOnly = representation === "text";
  const result = await timePdfStage(traceId, "cache", () => cachedPdfPages({
    checksum: documentChecksum, pages: input.pages,
    rendererVersion: PDF_PAGE_RENDERER_VERSION + (representation === "both" ? "" : `-${representation}`),
    width: textOnly ? 1 : imageWidth, textOnly,
  }, store, (missingPages) => parseStoredPdfPages(bytes, missingPages, options, traceId)));
  // PDF.js transfers the input buffer to its worker, detaching it during parsing.
  return { ...result, checksum: documentChecksum, size };
}
