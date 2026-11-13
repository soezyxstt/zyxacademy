import { createHash } from "node:crypto";
import { afterEach, expect, it, mock } from "bun:test";
import { inngest } from "@/jobs/client";
import { processSourceReadPage } from "@/jobs/source-read";
import { storage } from "@/lib/storage";
import { readSourceFileMetadata } from "@/lib/authoring/source-file-metadata";
import { buildSourceReadJobKey } from "@/lib/storage/keys";
import { sourceReadJob } from "@/lib/authoring/source-read-jobs";
import { issueMcpSourceFileKey, readMcpSourceFileKey } from "@/lib/authoring/mcp-workflows";
mock.module("server-only", () => ({}));
const { formatSourceFileReadResult } = await import("@/lib/authoring/mcp-server");
import { pdfReadOptionsSchema, timePdfStage } from "@/lib/compute/pdf-read-options";
import { readPdfFromStorage } from "@/lib/compute/pdf-reader";
import { requestPdfPagesFromCompute } from "@/lib/compute-client/pdf";

process.env.BETTER_AUTH_SECRET = "source-read-job-test-secret";

function pdf() {
  const stream = "BT /F1 12 Tf 20 40 Td (Hello PDF) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(source.length); source += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(source);
}

const original = { exists: storage.exists, download: storage.download, upload: storage.upload, delete: storage.delete, send: inngest.send };
afterEach(() => { Object.assign(storage, { exists: original.exists, download: original.download, upload: original.upload, delete: original.delete }); inngest.send = original.send; });

function fixture() {
  const bytes = pdf();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const row = { id: "material", courseId: "course", title: "Test PDF", fileUrl: "courses/course/materials/test.pdf",
    type: "materi" as const, subcategory: null, year: null, checksum, chapterIds: ["chapter"], updatedAt: new Date(0) };
  const fileKey = issueMcpSourceFileKey({ materialId: row.id, storageKey: row.fileUrl, courseId: "canonical-course",
    chapterId: "canonical-chapter", legacyCourseId: row.courseId, legacyChapterId: "chapter", updatedAtMs: 0, checksum });
  const objects = new Map<string, Uint8Array>([[row.fileUrl, bytes]]);
  const events: any[] = [];
  storage.exists = async (key) => objects.has(key);
  storage.download = async (key) => { const value = objects.get(key); if (!value) throw new Error("missing"); return value.slice(); };
  storage.upload = async (value, _name, _mime, options) => {
    const data = value instanceof Uint8Array ? value : new Uint8Array(await (value as File).arrayBuffer());
    objects.set(options.key, data);
    return { key: options.key, url: options.key, size: data.byteLength };
  };
  storage.delete = async (key) => { objects.delete(key); };
  inngest.send = (async (input: any) => { events.push(...(Array.isArray(input) ? input : [input])); return { ids: ["event"] }; }) as typeof inngest.send;
  const resolve = async () => ({ row, token: readMcpSourceFileKey(fileKey) });
  const input = { fileKey, pages: [1], requestId: crypto.randomUUID(), actorId: "admin", sessionId: "session", representation: "text" as const };
  return { bytes, row, objects, events, resolve, input };
}

it("queues immediately, processes real PDF text without PNG, then polls without downloading the original", async () => {
  const { row, objects, events, resolve, input } = fixture();
  const pending = await sourceReadJob(input, resolve);
  expect(pending.status).toBe("pending");
  expect(events).toHaveLength(1);
  expect([...objects.keys()].filter((key) => key.endsWith(".png"))).toHaveLength(0);
  await processSourceReadPage(events[0].data);
  expect(await readSourceFileMetadata({ storageKey: row.fileUrl, updatedAtMs: 0, checksum: row.checksum })).toEqual({
    checksum: row.checksum, size: pdf().byteLength,
  });
  objects.delete(row.fileUrl);
  const complete = await sourceReadJob({ ...input, jobId: pending.jobId }, resolve);
  expect(complete.status).toBe("complete");
  if (complete.status !== "complete") throw new Error("expected complete");
  expect(complete.result.pages[0].text).toContain("Hello PDF");
  expect(complete.result.size).toBe(pdf().byteLength);
  const result = await timePdfStage(input.requestId, "send.format", () => formatSourceFileReadResult(complete.result, {
    upload: async () => { throw new Error("must not upload text as image"); }, getUrl: () => { throw new Error("no image"); },
  }));
  expect(result.content).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("imageUrl");
  expect([...objects.keys()].filter((key) => key.endsWith(".png"))).toHaveLength(0);
  await expect(sourceReadJob({ ...input, jobId: pending.jobId, sessionId: "other" }, resolve)).rejects.toThrow("JOB_NOT_IN_SCOPE");
}, 60_000);

it("retries only failed pages, retains completed pages, and deduplicates queued retries", async () => {
  const { objects, events, resolve, input } = fixture();
  const pending = await sourceReadJob({ ...input, pages: [1, 2] }, resolve);
  const first = buildSourceReadJobKey(pending.jobId, 1);
  objects.set(first, new TextEncoder().encode(JSON.stringify({ status: "complete", checksum: "a".repeat(64) })));
  objects.set(buildSourceReadJobKey(pending.jobId, 2), new TextEncoder().encode(JSON.stringify({ status: "failed", error: "SOURCE_READ_TIMEOUT" })));
  const failed = await sourceReadJob({ ...input, jobId: pending.jobId }, resolve);
  expect(failed.status).toBe("failed");
  const saved = objects.get(first);
  await sourceReadJob({ ...input, jobId: pending.jobId, retryFailed: true }, resolve);
  expect(events.map((event) => event.data.pageNumber)).toEqual([1, 2, 2]);
  expect(objects.get(first)).toBe(saved);
  await sourceReadJob({ ...input, jobId: pending.jobId, retryFailed: true }, resolve);
  expect(events).toHaveLength(3);
});

it("clears a failed enqueue so the next call can recover", async () => {
  const { objects, resolve, input } = fixture();
  inngest.send = (async () => { throw new Error("offline"); }) as typeof inngest.send;
  await expect(sourceReadJob(input, resolve)).rejects.toThrow("JOB_ENQUEUE_FAILED");
  expect([...objects.keys()].some((key) => key.includes("source-read-jobs"))).toBe(false);
});

it("measures real text and image paths, reuses cached pages, and honors image resolution", async () => {
  const { row, objects, input } = fixture();
  const text = await readPdfFromStorage({ storageKey: row.fileUrl, pages: [1], requestId: input.requestId, representation: "text" });
  expect(text.pages[0].png.byteLength).toBe(0);
  const image = await readPdfFromStorage({ storageKey: row.fileUrl, pages: [1], requestId: input.requestId, representation: "image", imageWidth: 640 });
  expect(image.pages[0].width).toBe(640);
  expect(image.pages[0].text).toBe("");
  expect(image.pages[0].png.byteLength).toBeGreaterThan(0);
  const count = objects.size;
  const cached = await readPdfFromStorage({ storageKey: row.fileUrl, pages: [1], requestId: input.requestId, representation: "image", imageWidth: 640 });
  expect(cached).toEqual(image);
  expect(objects.size).toBe(count);
  const both = await readPdfFromStorage({ storageKey: row.fileUrl, pages: [1], requestId: input.requestId, representation: "both", imageWidth: 320 });
  expect(both.pages[0].text).toContain("Hello PDF");
  expect(both.pages[0].width).toBe(320);
  console.info(JSON.stringify({ requestId: input.requestId, textBytes: text.pages[0].text.length, imageBytes: image.pages[0].png.byteLength }));
}, 60_000);

it("classifies timeout separately and validates the resolution boundary", async () => {
  await expect(timePdfStage(crypto.randomUUID(), "fetch", async () => { throw new DOMException("expired", "TimeoutError"); })).rejects.toThrow("SOURCE_READ_TIMEOUT");
  expect(pdfReadOptionsSchema.safeParse({ imageWidth: 2049 }).success).toBe(false);
  expect(pdfReadOptionsSchema.safeParse({ imageWidth: 319 }).success).toBe(false);
});

it("maps both client deadline and compute HTTP 504 to SOURCE_READ_TIMEOUT", async () => {
  const previousUrl = process.env.COMPUTE_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  process.env.COMPUTE_SERVICE_URL = "http://compute.invalid";
  const input = { storageKey: "courses/course/materials/test.pdf", pages: [1], requestId: crypto.randomUUID() };
  try {
    globalThis.fetch = (async () => { throw new DOMException("expired", "TimeoutError"); }) as unknown as typeof fetch;
    await expect(requestPdfPagesFromCompute(input)).rejects.toThrow("SOURCE_READ_TIMEOUT");
    globalThis.fetch = (async () => new Response("deadline", { status: 504 })) as unknown as typeof fetch;
    await expect(requestPdfPagesFromCompute(input)).rejects.toThrow("SOURCE_READ_TIMEOUT");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.COMPUTE_SERVICE_URL;
    else process.env.COMPUTE_SERVICE_URL = previousUrl;
  }
});
