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

export function classifyStoredPdfError(error: unknown): "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED" | "AUTHORING_MCP_SOURCE_PDF_INVALID" {
  const message = error instanceof Error ? `${error.name}:${error.message}`.toLowerCase() : "";
  return message.includes("password")
    ? "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED"
    : "AUTHORING_MCP_SOURCE_PDF_INVALID";
}

export async function parseStoredPdfPages(bytes: Uint8Array, pages: number[], options?: Partial<PdfReadOptions>, requestId: string = crypto.randomUUID()): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
  const { representation, imageWidth } = pdfReadOptionsSchema.parse(options ?? {});
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
        return {
          pageNumber,
          text: textByPage.get(pageNumber) ?? "",
          png: image?.data ?? new Uint8Array(),
          width: image?.width ?? 1,
          height: image?.height ?? 1,
        };
      }),
    };
  } catch (error) {
    if (isSourceReadTimeout(error)) throw new Error("SOURCE_READ_TIMEOUT");
    if (error instanceof Error && error.message.startsWith("AUTHORING_MCP_")) throw error;
    throw new Error(classifyStoredPdfError(error));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
