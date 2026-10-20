import { createHash } from "node:crypto";
import { inngest } from "./client";
import { storage } from "@/lib/storage";
import { buildSourcePageImageKey, buildSourceReadJobKey } from "@/lib/storage/keys";
import { readPdfFromStorage } from "@/lib/compute/pdf-reader";
import { isSourceReadTimeout, timePdfStage } from "@/lib/compute/pdf-read-options";
import { sourceReadJobSchema, writeSourceReadJson } from "@/lib/authoring/source-read-jobs";

export async function processSourceReadPage(data: unknown) {
  const job = sourceReadJobSchema.extend({ pageNumber: sourceReadJobSchema.shape.pages.element }).parse(data);
  if (!job.pages.includes(job.pageNumber)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
  const key = buildSourceReadJobKey(job.jobId, job.pageNumber);
  await writeSourceReadJson(key, { status: "running" });
  try {
    const result = await readPdfFromStorage({ ...job, pages: [job.pageNumber] });
    if (job.checksum && result.checksum !== job.checksum) throw new Error("AUTHORING_MCP_SOURCE_FILE_CHECKSUM_MISMATCH");
    const { png, ...page } = result.pages[0];
    let imageKey: string | undefined;
    if (job.representation !== "text") {
      imageKey = buildSourcePageImageKey({ courseId: job.courseId, materialId: job.materialId,
        documentChecksum: result.checksum, pageNumber: job.pageNumber,
        imageChecksum: createHash("sha256").update(png).digest("hex") });
      if (!await storage.exists(imageKey)) await storage.upload(png, `page-${job.pageNumber}.png`, "image/png", { key: imageKey });
    }
    await timePdfStage(job.requestId, "send.persist", () => writeSourceReadJson(key, { status: "complete",
      checksum: result.checksum, size: result.size, totalPages: result.totalPages, page: { ...page, imageKey } }));
    return { status: "complete", pageNumber: job.pageNumber };
  } catch (error) {
    await writeSourceReadJson(key, { status: "retrying", error: isSourceReadTimeout(error) ? "SOURCE_READ_TIMEOUT" : "SOURCE_PAGE_READ_FAILED" });
    throw error;
  }
}

export const sourceReadPageWorker = inngest.createFunction({
  id: "source-read-page", triggers: [{ event: "source.pdf.page.requested" }],
  retries: 2, concurrency: { limit: 2 },
  onFailure: async ({ event }) => {
    const job = sourceReadJobSchema.parse(event.data.event.data);
    const pageNumber = event.data.event.data.pageNumber as number;
    await writeSourceReadJson(buildSourceReadJobKey(job.jobId, pageNumber), {
      status: "failed", error: isSourceReadTimeout(new Error(event.data.error.message)) ? "SOURCE_READ_TIMEOUT" : "SOURCE_PAGE_READ_FAILED",
    });
  },
}, async ({ event, step }) => step.run("read-page", () => processSourceReadPage(event.data)));
