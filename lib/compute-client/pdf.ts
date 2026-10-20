import { timePdfStage, type PdfReadOptions } from "@/lib/compute/pdf-read-options";
import { z } from "zod";
export type ComputePdfPage = {
  pageNumber: number;
  text: string;
  imageBase64?: string;
  width: number;
  height: number;
};

export type SourceFilePage = {
  imageKey?: string;
  pageNumber: number;
  text: string;
  png: Uint8Array;
  width: number;
  height: number;
};

export async function requestPdfPagesFromCompute(params: {
  storageKey: string;
  pages: number[];
  representation?: PdfReadOptions["representation"];
  imageWidth?: number;
  requestId?: string;
}): Promise<{ totalPages: number; pages: SourceFilePage[]; size?: number | null; checksum?: string | null }> {
  const computeUrl = process.env.COMPUTE_SERVICE_URL;
  const secret = process.env.COMPUTE_SERVICE_SECRET;

  if (!computeUrl) {
    throw new Error("COMPUTE_SERVICE_URL_UNCONFIGURED");
  }

  const requestId = params.requestId ?? crypto.randomUUID();
  return timePdfStage(requestId, "compute.roundtrip", async () => {
    const response = await fetch(`${computeUrl.replace(/\/$/, "")}/internal/pdf/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ ...params, requestId }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (response.status === 504 || /SOURCE_READ_TIMEOUT/.test(errorText)) throw new Error("SOURCE_READ_TIMEOUT");
      throw new Error(`COMPUTE_PDF_PAGES_FAILED_${response.status}:${errorText}`);
    }

    const data = z.object({
      totalPages: z.number().int().positive(),
      pages: z.array(z.object({ pageNumber: z.number().int().positive(), text: z.string(),
        imageBase64: z.string().optional(), width: z.number().int().positive(), height: z.number().int().positive() })).max(4),
      size: z.number().int().positive().max(50 * 1024 * 1024).nullable().optional(),
      byteLength: z.number().int().positive().max(50 * 1024 * 1024).nullable().optional(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    }).parse(await response.json());
    if (data.pages.length !== params.pages.length || data.pages.some((page, index) =>
      page.pageNumber !== params.pages[index] || page.pageNumber > data.totalPages ||
      (params.representation !== "text" && !page.imageBase64))) {
      throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    }

    return {
      totalPages: data.totalPages,
      size: typeof data.size === "number" && data.size > 0
        ? data.size
        : typeof data.byteLength === "number" && data.byteLength > 0
          ? data.byteLength
          : null,
      checksum: typeof data.checksum === "string" ? data.checksum : null,
      pages: data.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        png: new Uint8Array(Buffer.from(p.imageBase64 ?? "", "base64")),
        width: p.width,
        height: p.height,
      })),
    };
  });
}
