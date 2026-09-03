import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { storage } from "@/lib/storage";

async function readPdfBytes(params: { pdfBuffer?: Buffer | Uint8Array | null; fileKey?: string | null }): Promise<Uint8Array | null> {
  if (params.pdfBuffer) return new Uint8Array(params.pdfBuffer);
  if (!params.fileKey) return null;
  if (typeof storage.download === "function") return storage.download(params.fileKey);
  const response = await fetch(storage.getUrl(params.fileKey));
  if (!response.ok) throw new Error(`PDF_DOWNLOAD_FAILED_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Renders PDF page 1 itself, never the browser PDF viewer. */
export async function renderPdfFirstPageWebp(bytes: Uint8Array): Promise<Buffer> {
  let parser: { destroy(): Promise<void> } | null = null;
  try {
    if (!bytes.byteLength) throw new Error("PDF_BYTES_EMPTY");
    const { PDFParse } = await import("pdf-parse");
    const workerPath = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(pathToFileURL(workerPath).href);
    const pdfParser = new PDFParse({ data: bytes });
    parser = pdfParser;
    const result = await pdfParser.getScreenshot({ first: 1, desiredWidth: 720, imageBuffer: true, imageDataUrl: false });
    const page = result.pages[0];
    if (!page?.data?.byteLength) throw new Error("PDF_PAGE_RENDER_EMPTY");
    return sharp(Buffer.from(page.data)).webp({ quality: 82, effort: 4 }).toBuffer();
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

export async function generateAndSavePdfThumbnail(params: {
  courseSlug: string;
  materialId: string;
  pdfBuffer?: Buffer | Uint8Array | null;
  fileKey?: string | null;
}): Promise<string | null> {
  if (!params.courseSlug || !params.materialId) return null;
  try {
    const bytes = await readPdfBytes(params);
    if (!bytes?.byteLength) return null;
    const webp = await renderPdfFirstPageWebp(bytes);
    const thumbnailKey = buildCourseThumbnailKey({ courseSlug: params.courseSlug, materialId: params.materialId, extension: "webp" });
    await storage.upload(webp, `${params.materialId}.webp`, "image/webp", { key: thumbnailKey });
    return thumbnailKey;
  } catch (error) {
    console.error(`[ThumbnailGenerator] Failed for ${params.courseSlug}/${params.materialId}:`, error);
    return null;
  }
}
