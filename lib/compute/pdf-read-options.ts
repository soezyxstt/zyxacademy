import { z } from "zod";

export const pdfReadOptionsSchema = z.object({
  representation: z.enum(["text", "image", "both"]).default("both"),
  imageWidth: z.number().int().min(320).max(2048).default(1280),
});
export type PdfReadOptions = z.infer<typeof pdfReadOptionsSchema>;

export function isSourceReadTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" ||
    error.message === "SOURCE_READ_TIMEOUT" || /\b(?:timed out|timeout)\b/i.test(error.message));
}

export function sourcePageErrorCode(error: unknown): string {
  if (isSourceReadTimeout(error)) return "SOURCE_READ_TIMEOUT";
  if (!(error instanceof Error)) return "SOURCE_PAGE_READ_FAILED";
  if (error.name === "ZodError") return "SOURCE_PAGE_METADATA_INVALID";
  if (/^(?:SOURCE_PAGE_[A-Z_]+|AUTHORING_MCP_SOURCE_[A-Z_]+|PDF_PAGE_[A-Z_]+)$/.test(error.message)) return error.message;
  return "SOURCE_PAGE_READ_FAILED";
}

export async function timePdfStage<T>(requestId: string, stage: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.info(JSON.stringify({ event: "source.read_file", requestId, stage, status: "started" }));
  let status = "ok";
  let errorCode: string | undefined;
  try {
    return await run();
  } catch (error) {
    status = isSourceReadTimeout(error) ? "timeout" : "error";
    errorCode = sourcePageErrorCode(error);
    if (status === "timeout") throw new Error("SOURCE_READ_TIMEOUT");
    throw error;
  } finally {
    console.info(JSON.stringify({ event: "source.read_file", requestId, stage,
      durationMs: Math.round(performance.now() - start), status, ...(errorCode ? { errorCode } : {}) }));
  }
}
