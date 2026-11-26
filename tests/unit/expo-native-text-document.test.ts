import { expect, test } from "bun:test";
import type { AcademicTransport } from "../../apps/mobile-native/features/academic/client";
import { createTextDocumentClient } from "../../apps/mobile-native/features/academic/courses/text-document-client";

const revision = "c".repeat(64);
const signal = new AbortController().signal;
const draft = { action: "status", source: "canonical-article", expectedRevision: revision, status: "published" } as const;

test("the text reader validates its exact course and document and keeps read-only material previewable", async () => {
  const paths: string[] = [];
  const transport: AcademicTransport = {
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
