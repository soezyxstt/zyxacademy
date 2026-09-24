import { setupPdfWorker } from "./pdf-worker";

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

export async function parseStoredPdfPages(bytes: Uint8Array, pages: number[]): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
  const { PDFParse } = await import("pdf-parse");
  await setupPdfWorker(PDFParse);
  const parser = new PDFParse({ data: bytes });
  try {
    const info = await parser.getInfo();
    const totalPages = info.total;
    if (pages.some((page) => page > totalPages)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    const text = await parser.getText({ partial: pages });
    const screenshots = await parser.getScreenshot({
      partial: pages,
      desiredWidth: AUTHORING_MCP_PDF_PAGE_WIDTH,
      imageBuffer: true,
    });
    const textByPage = new Map(text.pages.map((page) => [page.num, page.text]));
    const imageByPage = new Map(screenshots.pages.map((page) => [page.pageNumber, page]));
    return {
      totalPages,
      pages: pages.map((pageNumber) => {
        const image = imageByPage.get(pageNumber);
        if (!image || image.data.byteLength === 0) throw new Error("AUTHORING_MCP_SOURCE_PAGE_RENDER_FAILED");
        return {
          pageNumber,
          text: textByPage.get(pageNumber) ?? "",
          png: image.data,
          width: image.width,
          height: image.height,
        };
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AUTHORING_MCP_")) throw error;
    throw new Error(classifyStoredPdfError(error));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
