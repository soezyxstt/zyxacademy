import { expect, test } from "bun:test";
import type { AcademicTransport } from "../../apps/mobile-native/features/academic/client";
import { createTextDocumentClient } from "../../apps/mobile-native/features/academic/courses/text-document-client";
import { diktatReadingSections, findReadingSections, readingNavigationItems } from "../../apps/mobile-native/features/student/courses/reading-search";
import { buildReadingContentHtml } from "../../apps/mobile-native/offline/reading-document";
import { safeInlineCourseImage } from "../../apps/mobile-native/features/student/course-markdown-model";

const revision = "c".repeat(64);
const signal = new AbortController().signal;
const draft = { action: "status", source: "canonical-article", expectedRevision: revision, status: "published" } as const;

test("the text reader validates its exact course and document and keeps read-only material previewable", async () => {
  const paths: string[] = [];
  const transport: AcademicTransport = {
    accountId: "admin",
    origin: "https://example.test",
    locale: "id",
    async get(path) {
      paths.push(path);
      return Response.json({ kind: "article", edit: null, data: {
        id: "article-a", courseId: "course-a", title: "Pertidaksamaan", chapterId: null, version: 4, sections: [],
      } });
    },
  };
  const client = createTextDocumentClient(transport);
  expect(await client.read("alias-a", "course-a", "article-a", signal)).toMatchObject({ edit: null, kind: "article" });
  expect(client.edit("alias-a", "article-a")).toBeUndefined();
  await expect(client.read("alias-a", "course-b", "article-a", signal)).rejects.toThrow();
  await expect(client.read("alias-a", "course-a", "article-b", signal)).rejects.toThrow();
  expect(paths).toEqual([
    "/api/native/academic-document/alias-a/article-a", "/api/native/academic-document/alias-a/article-a",
    "/api/native/academic-document/alias-a/article-b",
  ]);
});

test("an interrupted text document save keeps the same revision and request ID within the active transport", async () => {
  const calls: Array<{ path: string; method: string; body: unknown; requestId: string }> = [];
  const transport: AcademicTransport = {
    accountId: "admin",
    origin: "https://example.test",
    locale: "id",
    async get() { return new Response(null, { status: 404 }); },
    async command(path, { method, body, requestId }) {
      calls.push({ path, method, body, requestId });
      if (calls.length === 1) throw new Error("Connection interrupted");
      return Response.json({ status: "saved", requestId });
    },
  };
  const id = "native-doc-save-first";
  const first = createTextDocumentClient(transport).edit("course-a", "article-a")!;
  expect(await first.submit(draft, id, signal)).toEqual({ status: "retry" });
  const resumed = createTextDocumentClient(transport).edit("course-a", "article-a")!;
  expect(resumed.pending()).toMatchObject({ requestId: id, draft });
  expect(createTextDocumentClient({ ...transport }).edit("course-a", "article-a")?.pending()).toBeNull();
  expect(await resumed.submit({ ...draft, status: "draft" }, "native-doc-save-other", signal)).toEqual({ status: "retry" });
  expect(await resumed.submit(draft, id, signal)).toEqual({ status: "saved" });
  expect(calls).toEqual(Array(2).fill({ path: "/api/native/academic-document/course-a/article-a", method: "PATCH", body: draft, requestId: id }));
  resumed.acknowledge(id);
  expect(resumed.pending()).toBeNull();
});

test("Admin text preview reuses section navigation, search targets and widget inspection for Articles and Diktats", () => {
  const article = {
    kind: "article" as const,
    title: "Kinematika",
    data: {
      id: "article-k",
      courseId: "course-k",
      title: "Kinematika",
      chapterId: null,
      version: 2,
      visuals: [{
        id: "vis-1",
        kind: "function_plot" as const,
        label: "Grafik kecepatan",
        altText: "Grafik v terhadap t",
        domain: { min: 0, max: 10 },
        variables: [],
        controls: [],
        series: [{ id: "v", label: "v(t)", expression: "2 * x" }],
        fallback: { summary: "Linear", columns: [{ label: "t" }, { label: "v" }], rows: [["0", "0"], ["5", "10"]] },
      }],
      sections: [
        { id: "sec-1", slug: "posisi", title: "Posisi", blocks: [{ id: "blk-1", blockType: "explanation", content: "Perpindahan vektor." }] },
        {
          id: "sec-2",
          slug: "kecepatan",
          title: "Kecepatan",
          blocks: [{
            id: "blk-2",
            blockType: "explanation",
            content: "Turunan posisi terhadap waktu.",
            parts: [
              { id: "part-text", kind: "markdown", markdown: "Turunan posisi terhadap waktu." },
              { id: "part-vis", kind: "visual_ref", visualId: "vis-1" },
            ],
          }],
        },
      ],
    },
  };
  const items = readingNavigationItems(article);
  expect(items.map(item => item.slug)).toEqual(["posisi", "kecepatan"]);
  const matches = findReadingSections(items, "turunan");
  expect(matches).toHaveLength(1);
  expect(matches[0]?.target).toEqual({ sectionId: "sec-2", blockId: "blk-2", partId: "part-text" });

  const widgetIds: string[] = [];
  const html = buildReadingContentHtml(
    { ...article, locale: "id", section: "kecepatan", resolveImage: safeInlineCourseImage },
    "",
    "light",
    undefined,
    undefined,
    undefined,
    matches[0]?.target,
    widget => { widgetIds.push(widget.id); return `<a class="reader-coding-action" href="https://reading-visual.invalid/widget/0">Jelajahi visual</a>`; },
  );
  expect(html).toContain("reading-search-result");
  expect(html).toContain("Jelajahi visual");
  expect(widgetIds).toEqual(["vis-1"]);

  const diktat = {
    kind: "diktat" as const,
    title: "Diktat Gelombang",
    data: {
      id: "diktat-g",
      courseId: "course-k",
      title: "Diktat Gelombang",
      kind: "article" as const,
      docCategory: "diktat" as const,
      contentVersion: 1,
      body: "## 1. Dasar Gelombang\n\nGelombang merambat membawa energi.\n\n## 2. Interferensi\n\nSuperposisi dua gelombang koheren.",
    },
  };
  expect(diktatReadingSections(diktat)).toHaveLength(2);
  expect(findReadingSections(readingNavigationItems(diktat), "superposisi")[0]?.slug).toBe("1");
});
