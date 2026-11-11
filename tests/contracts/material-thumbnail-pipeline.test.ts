import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createMaterialCoverSvg, wrapCoverTitle } from "@/lib/material-cover";

const source = (path: string) => readFileSync(path, "utf8");

describe("student sidebar course context", () => {
  test("route context switches the sidebar before course metadata resolves", () => {
    const sidebar = source("components/student-sidebar.tsx");
    expect(sidebar).toContain("if (activeCourseId)");
    expect(sidebar).toContain("activeCourse?.id === activeCourseId");
    expect(sidebar).toContain("const base = `/courses/${activeCourseId}`");
    expect(sidebar).not.toContain("if (activeCourse) {");
  });
});

describe("PDF thumbnail compute boundary", () => {
  test("web tier dispatches instead of rendering PDFs", () => {
    const route = source("app/api/courses/[id]/material/[materialId]/thumbnail/route.ts");
    const compatibility = source("lib/thumbnail.ts");
    expect(route).toContain('name: "pdf/thumbnail.requested"');
    expect(route).not.toContain("generateAndSavePdfThumbnail(");
    expect(compatibility).not.toContain('from "sharp"');
    expect(compatibility).not.toContain('import("pdf-parse")');
  });

  test("upload flows relay through the shared enqueue helper with retries", () => {
    const single = source("app/(admin)/admin/(academic)/courses/actions.ts");
    const batch = source("app/api/admin/course-materials/batch/commit/route.ts");
    const diktat = source("lib/compute/diktat-pdf.ts");
    const helper = source("lib/thumbnail.ts");
    expect(single).toContain("generateAndSavePdfThumbnail({");
    expect(batch).toContain("enqueuePdfThumbnail({");
    expect(batch).not.toContain("inngest.send(");
    expect(diktat).toContain("enqueuePdfThumbnail({");
    expect(diktat).not.toContain("inngest.send(");
    expect(helper).toContain("buildThumbnailEventId");
    expect(helper).toContain("attempts");
  });

  test("compute registry contains the PDF thumbnail worker", () => {
    const compute = source("jobs/compute.ts");
    expect(compute).toContain('import { pdfThumbnailWorker } from "./pdf-thumbnail"');
    expect(compute).toMatch(/computeFunctions\s*=\s*\[[\s\S]*pdfThumbnailWorker[\s\S]*\]/);
  });

  test("queued thumbnails retry a bounded number of times without server polling", () => {
    const list = source("app/(student)/courses/[id]/material/document-list-client.tsx");
    const route = source("app/api/courses/[id]/material/[materialId]/thumbnail/route.ts");
    expect(list).toContain('baseUrl.includes("/thumbnail")');
    expect(list).toContain("unoptimized={thumbnail.isEndpoint}");
    expect(list).toContain("MAX_THUMBNAIL_RETRIES = 4");
    expect(list).toContain("retry=${current.attempt}");
    expect(list).toContain("onError={thumbnail.onError}");
    expect(route).toContain("status: 202");
    expect(route).not.toContain("setTimeout");
  });

  test("pdf thumbnail compute does not hardcode cwd node_modules worker path", () => {
    const compute = source("lib/compute/pdf-thumbnail.ts");
    expect(compute).not.toContain("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    expect(compute).toContain("setupPdfWorker");
  });

  test("getPdfWorkerSrc resolves a valid worker source across environments", async () => {
    const { getPdfWorkerSrc } = await import("@/lib/compute/pdf-worker");
    const workerSrc = await getPdfWorkerSrc();
    expect(typeof workerSrc).toBe("string");
    expect(workerSrc?.length).toBeGreaterThan(0);
    expect(workerSrc?.startsWith("file:") || workerSrc?.startsWith("data:")).toBe(true);
  });
});

describe("canonical material covers", () => {
  test("published Product Bundle Article and Diktat cards use deterministic SVG covers", () => {
    const page = source("app/(student)/courses/[id]/material/page.tsx");
    expect(page.match(/\/cover\.svg/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("cover title stays within three readable lines and XML is escaped", () => {
    const lines = wrapCoverTitle("Persamaan Diferensial Linear Orde Dua dengan Koefisien Konstan dan Kondisi Awal yang Sangat Panjang");
    expect(lines.length).toBeLessThanOrEqual(3);
    const svg = createMaterialCoverSvg({ kind: "article", title: "Energi & Momentum <Dasar>", courseCode: "FI1101", chapterTitle: "Dinamika" });
    expect(svg).toContain("Energi &amp; Momentum &lt;Dasar&gt;");
    expect(svg).toContain("ARTIKEL");
    expect(svg).toContain("Bacaan Utama");
  });
});
