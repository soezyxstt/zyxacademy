// @ts-ignore -- Deno worker dependency is resolved through deno.json; web builds never load this module.
import * as canvas from "@napi-rs/canvas";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { storage } from "@/lib/storage";
import { setupPdfWorker } from "./pdf-worker";

function installPdfCanvasGlobals() {
  const globals = globalThis as unknown as Record<string, unknown>;
  const canvasExports = canvas as unknown as Record<string, unknown>;
  for (const name of ["DOMMatrix", "ImageData", "Path2D"] as const) {
    if (!globals[name] && canvasExports[name]) globals[name] = canvasExports[name];
  }
}

async function readPdfBytes(params: { pdfBuffer?: Buffer | Uint8Array | null; fileKey?: string | null }): Promise<Uint8Array | null> {
  if (params.pdfBuffer) return new Uint8Array(params.pdfBuffer);
  if (!params.fileKey) return null;
  if (typeof storage.download === "function") return storage.download(params.fileKey);
  const response = await fetch(storage.getUrl(params.fileKey));
  if (!response.ok) throw new Error(`PDF_DOWNLOAD_FAILED_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Compute-only PDF page rasterizer. The screenshot bytes returned by pdf-parse are PNG. */
export async function renderPdfFirstPagePng(bytes: Uint8Array): Promise<Buffer> {
  let parser: { destroy(): Promise<void> } | null = null;
  try {
    if (!bytes.byteLength) throw new Error("PDF_BYTES_EMPTY");
    installPdfCanvasGlobals();
    const { PDFParse } = await import("pdf-parse");
    await setupPdfWorker(PDFParse);
    const pdfParser = new PDFParse({ data: bytes });
    parser = pdfParser;
    const result = await pdfParser.getScreenshot({
      first: 1,
      desiredWidth: 720,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const page = result.pages[0];
    if (!page?.data?.byteLength) throw new Error("PDF_PAGE_RENDER_EMPTY");
    return Buffer.from(page.data);
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

export async function generateAndSavePdfThumbnailCompute(params: {
  courseSlug: string;
  materialId: string;
  pdfBuffer?: Buffer | Uint8Array | null;
  fileKey?: string | null;
}): Promise<string | null> {
  if (!params.courseSlug || !params.materialId) return null;
  try {
    const bytes = await readPdfBytes(params);
    if (!bytes?.byteLength) return null;
    const png = await renderPdfFirstPagePng(bytes);
    const thumbnailKey = buildCourseThumbnailKey({
      courseSlug: params.courseSlug,
      materialId: params.materialId,
      extension: "png",
    });
    await storage.upload(png, `${params.materialId}.png`, "image/png", { key: thumbnailKey });
    return thumbnailKey;
  } catch (error) {
    console.error(`[ThumbnailCompute] Failed for ${params.courseSlug}/${params.materialId}:`, error);
    throw error;
  }
}
