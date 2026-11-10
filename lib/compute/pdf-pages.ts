import { setupPdfWorker } from "./pdf-worker";
import { isSourceReadTimeout, pdfReadOptionsSchema, timePdfStage, type PdfReadOptions } from "./pdf-read-options";

export const AUTHORING_MCP_PDF_PAGE_WIDTH = 1280;

export type SourceFilePage = {
  pageNumber: number;
  text: string;
  png: Uint8Array;
  width: number;
  height: number;
};

function pngDimensions(bytes: Uint8Array) {
  if (bytes.byteLength < 24) throw new Error("SOURCE_PAGE_PNG_INVALID");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw new Error("SOURCE_PAGE_PNG_INVALID");
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  if (!width || !height) throw new Error("SOURCE_PAGE_PNG_INVALID");
  return { width, height };
}

export function classifyStoredPdfError(error: unknown): "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED" | "AUTHORING_MCP_SOURCE_PDF_INVALID" {
  const message = error instanceof Error ? `${error.name}:${error.message}`.toLowerCase() : "";
  return message.includes("password")
    ? "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED"
    : "AUTHORING_MCP_SOURCE_PDF_INVALID";
}

export async function parseStoredPdfPages(bytes: Uint8Array, pages: number[], options?: Partial<PdfReadOptions>, requestId: string = crypto.randomUUID()): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
  const { representation, imageWidth } = pdfReadOptionsSchema.parse(options ?? {});
  if (process.env.ZYX_COMPUTE_RUNTIME === "neon") {
    const { parseBrowserPdfPages } = await import("./browser-pdf");
    try { return await parseBrowserPdfPages(bytes, pages, representation, imageWidth); }
    catch (error) {
      if (isSourceReadTimeout(error)) throw new Error("SOURCE_READ_TIMEOUT");
      if (error instanceof Error && /\b(?:VERIFICATION_|PRODUCT_V4_BROWSER_)/.test(error.message)) throw error;
      const code = error instanceof Error ? error.message.match(/\b(?:AUTHORING_MCP_|SOURCE_PAGE_)[A-Z_]+\b/)?.[0] : undefined;
      throw new Error(code ?? classifyStoredPdfError(error));
    }
  } else {
  const parser = await timePdfStage(requestId, "parse.setup", async () => {
    const { PDFParse } = await import("pdf-parse");
    await setupPdfWorker(PDFParse);
    return new PDFParse({ data: bytes });
  });
  try {
    const info = await timePdfStage(requestId, "parse.info", () => parser.getInfo());
    const totalPages = info.total;
    if (pages.some((page) => page > totalPages)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    const text = representation === "image" ? { pages: [] } : await timePdfStage(requestId, "parse.text", () => parser.getText({ partial: pages }));
    const screenshots = representation === "text" ? { pages: [] } : await timePdfStage(requestId, "render", () => parser.getScreenshot({
      partial: pages,
      desiredWidth: imageWidth,
      imageBuffer: true,
      imageDataUrl: false,
    }));
    const textByPage = new Map(text.pages.map((page) => [page.num, page.text] as const));
    const imageByPage = new Map(screenshots.pages.map((page) => [page.pageNumber, page] as const));
    return {
      totalPages,
      pages: pages.map((pageNumber) => {
        const image = imageByPage.get(pageNumber);
        if (representation !== "text" && (!image || image.data.byteLength === 0)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_RENDER_FAILED");
        // PDF viewport dimensions can be fractional; cache the actual raster pixels.
        const dimensions = image ? pngDimensions(image.data) : { width: 1, height: 1 };
        return {
          pageNumber,
          text: textByPage.get(pageNumber) ?? "",
          png: image?.data ?? new Uint8Array(),
          ...dimensions,
        };
      }),
    };
  } catch (error) {
    if (isSourceReadTimeout(error)) throw new Error("SOURCE_READ_TIMEOUT");
    if (error instanceof Error && /^(AUTHORING_MCP_|SOURCE_PAGE_)/.test(error.message)) throw error;
    throw new Error(classifyStoredPdfError(error));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
  }
}
