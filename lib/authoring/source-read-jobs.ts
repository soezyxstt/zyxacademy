import { createHash } from "node:crypto";
import { z } from "zod";
import { inngest } from "@/jobs/client";
import { storage } from "@/lib/storage";
import { buildSourceReadJobKey, isSafeKey } from "@/lib/storage/keys";
import { PDF_PAGE_RENDERER_VERSION } from "@/lib/compute/pdf-page-cache";
import { pdfReadOptionsSchema } from "@/lib/compute/pdf-read-options";
import { normalizeSha256Checksum, resolveStoredSourceFile, type SourceFilePage } from "./mcp-source-files";

export const sourceReadJobSchema = pdfReadOptionsSchema.extend({
  jobId: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
  enqueued: z.boolean().default(false),
  storageKey: z.string().refine((key) => isSafeKey(key) && key.toLowerCase().endsWith(".pdf")),
  materialId: z.string(),
  courseId: z.string(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  pages: z.array(z.number().int().positive()).min(1).max(4).refine((pages) => new Set(pages).size === pages.length),
});
export type SourceReadJob = z.infer<typeof sourceReadJobSchema>;
export type SourceReadPageState = {
  status: "running" | "retrying" | "failed" | "complete";
  error?: string;
  totalPages?: number;
  checksum?: string;
  size?: number;
  page?: Omit<SourceFilePage, "png">;
};

export async function writeSourceReadJson(key: string, data: unknown) {
  await storage.upload(new TextEncoder().encode(JSON.stringify(data)), key.split("/").pop()!, "application/json", { key });
}

async function readJson(key: string) {
  if (!storage.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  if (!await storage.exists(key)) return null;
  return JSON.parse(new TextDecoder().decode(await storage.download(key)));
}

export async function sourceReadJob(input: {
  fileKey: string; pages?: number[]; representation?: "text" | "image" | "both"; imageWidth?: number;
  requestId: string; actorId: string; sessionId: string; jobId?: string; retryFailed?: boolean;
}, resolveFile = resolveStoredSourceFile) {
  const { row, token } = await resolveFile(input.fileKey);
  const polled = input.jobId ? await readJson(buildSourceReadJobKey(input.jobId)) : null;
  const options = pdfReadOptionsSchema.parse(polled ?? { ...input, representation: input.representation ?? "text" });
  const pages: number[] = polled?.pages ?? input.pages ?? [1];
  const jobId = createHash("sha256").update(JSON.stringify({ actor: input.actorId, session: input.sessionId,
    material: row.id, key: row.fileUrl, version: token.updatedAtMs, checksum: row.checksum,
    renderer: PDF_PAGE_RENDERER_VERSION, pages, ...options })).digest("hex");
  if (input.jobId && input.jobId !== jobId) throw new Error("AUTHORING_MCP_SOURCE_JOB_NOT_IN_SCOPE");
  const key = buildSourceReadJobKey(jobId);
  const existing = polled ?? await readJson(key);
  if (input.jobId && !existing) throw new Error("AUTHORING_MCP_SOURCE_JOB_NOT_FOUND");
  const job = sourceReadJobSchema.parse(existing ?? { jobId, requestId: input.requestId,
    storageKey: row.fileUrl, materialId: row.id, courseId: row.courseId,
    checksum: normalizeSha256Checksum(row.checksum), pages, ...options });
  if (job.jobId !== jobId || job.storageKey !== row.fileUrl || job.materialId !== row.id || job.courseId !== row.courseId) {
    throw new Error("AUTHORING_MCP_SOURCE_JOB_NOT_IN_SCOPE");
  }
  const states: Array<SourceReadPageState | null> = await Promise.all(pages.map((page) => readJson(buildSourceReadJobKey(jobId, page))));
  const enqueue = pages.filter((_, index) => (!job.enqueued && !states[index]) || (input.retryFailed && states[index]?.status === "failed"));
  if (enqueue.length) {
    await writeSourceReadJson(key, job);
    if (existing) for (const page of enqueue) await writeSourceReadJson(buildSourceReadJobKey(jobId, page), { status: "retrying" });
    try {
      await inngest.send(enqueue.map((pageNumber) => ({
        id: `source-read-${jobId}-${pageNumber}-${input.retryFailed ? input.requestId : "initial"}`,
        name: "source.pdf.page.requested",
        data: { ...job, pageNumber },
      })));
      await writeSourceReadJson(key, { ...job, enqueued: true });
    } catch {
      // A failed enqueue is retryable without leaving a permanently pending manifest.
      if (!existing) await storage.delete(key);
      else for (const page of enqueue) await writeSourceReadJson(buildSourceReadJobKey(jobId, page), { status: "failed", error: "SOURCE_JOB_ENQUEUE_FAILED" });
      throw new Error("AUTHORING_MCP_SOURCE_JOB_ENQUEUE_FAILED");
    }
  }
  const complete = states.every((state) => state?.status === "complete") && !enqueue.length;
  if (complete) {
    const first = states[0]!;
    if (states.some((state) => state!.checksum !== first.checksum || state!.totalPages !== first.totalPages || state!.size !== first.size)) {
      throw new Error("AUTHORING_MCP_SOURCE_FILE_STALE");
    }
    return { status: "complete" as const, jobId, result: { mode: "pages" as const, title: row.title,
      checksum: first.checksum!, size: first.size!, totalPages: first.totalPages!, representation: job.representation,
      imageSource: { courseId: row.courseId, materialId: row.id },
      pages: states.map((state) => ({ ...state!.page!, png: new Uint8Array() })) } };
  }
  return { status: states.some((state) => state?.status === "failed") && !enqueue.length ? "failed" as const : "pending" as const,
    jobId, processingRequestId: job.requestId, pages: pages.map((pageNumber, index) => ({ pageNumber,
      status: enqueue.includes(pageNumber) ? "queued" : states[index]?.status ?? "queued",
      ...(states[index]?.error ? { error: states[index]!.error } : {}) })), pollAfterMs: 2000 };
}
