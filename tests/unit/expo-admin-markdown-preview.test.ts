import { expect, test } from "bun:test";
import { previewExternalHref, previewMedia, previewStoragePath } from "../../packages/native-parity/operations/admin-markdown-media";
import { layoutMarkdownDiagram, splitMarkdownPreview } from "../../packages/native-parity/operations/admin-markdown-preview";

const origin = "https://staging.zyxacademy.com";

test("private authored previews only recognize safe product paths and explicit HTTPS sources", () => {
  expect(previewMedia("/api/storage/file/blog/draft.png", origin, "blog")).toEqual({
    kind: "storage-image", path: "/api/storage/file/blog/draft.png",
  });
  expect(previewMedia("blog/draft.webm", origin, "blog")).toEqual({
    kind: "video", url: "/api/storage/file/blog/draft.webm",
  });
  expect(previewMedia("https://youtu.be/dQw4w9WgXcQ?t=120", origin, "blog")).toEqual({
    kind: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  expect(previewMedia("https://youtube.com/unrelated", origin, "blog")).toBeNull();
  expect(previewMedia("https://cdn.example.invalid/lesson.mov", origin, "course", true)).toBeNull();
  expect(previewMedia("/api/storage/file/courses/lesson.png", origin, "blog")).toBeNull();
  expect(previewStoragePath("/api/storage/file/courses/lesson.png", origin, "course")).toBe("/api/storage/file/courses/lesson.png");
  expect(previewStoragePath("/api/storage/file/discussions/private.png", origin, "course")).toBeNull();
  for (const value of ["//external.invalid/image.png", "javascript:alert(0)", "https://author:secret@example.invalid/img.png",
    "/api/storage/file/blog/%2fsecret.png", "/api/storage/file/blog/%", "/api/storage/file/blog/%2e%2e/secret.png",
    "/api/storage/file/blog/fig.png?token=abc", "/api/native/operations/management"]) {
    expect(previewMedia(value, origin, "blog")).toBeNull();
  }
  expect(previewExternalHref("/api/storage/file/blog/fig.png", origin)).toBeNull();
  expect(previewExternalHref("https://example.invalid/reference", origin)).toBe("https://example.invalid/reference");
});

test("authored Markdown, captions and attribution are preserved, and code literals stay inert", () => {
  const plain = "# Title\n\nA **paragraph** with $x^2$.";
  const literal = "```md\n:::media {src=\"https://invalid.example/a.mp4\"}\n:::\n```";
  const content = plain + "\n\n" + literal + "\n\n" +
    ':::media {src="/api/storage/file/blog/a.mp4" caption="Original caption" sourceLabel="Article" sourceUrl="https://example.invalid/"}\n:::\n\n' +
    ':::media {src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"} :::';
  expect(splitMarkdownPreview(content)).toEqual([
    { type: "markdown", source: plain + "\n\n" + literal },
    { type: "media", media: { src: "/api/storage/file/blog/a.mp4", caption: "Original caption", sourceLabel: "Article", sourceUrl: "https://example.invalid/" } },
    { type: "media", media: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "", sourceLabel: "", sourceUrl: "" } },
  ]);
});

test("renders native diagram topology with branches, reverse orientation and cycles", () => {
  const [block] = splitMarkdownPreview("~~~mermaid\nflowchart RL\nA[Start] --> B{Ready?}\nB -->|Yes| C[Finish]\nB -- No --> A\n~~~");
  expect(block.type).toBe("diagram");
  if (block.type !== "diagram" || !block.diagram) throw new Error("Expected a rendered diagram");
  expect(block.diagram.nodes.map(node => [node.id, node.label])).toEqual([["A", "Start"], ["B", "Ready?"], ["C", "Finish"]]);
  expect(block.diagram.edges.map(edge => edge.label)).toEqual([undefined, "Yes", "No"]);
  const positions = layoutMarkdownDiagram(block.diagram).positions;
  expect(new Set(positions.values()).size).toBe(3);
  expect(positions.get("A")?.x).toBeGreaterThan(positions.get("B")!.x);
  const [canonical] = splitMarkdownPreview(':::flowchart {title="Working process"}\n"Start" [start] --> "Finish" [end]\n:::');
  expect(canonical).toMatchObject({ type: "diagram", title: "Working process", diagram: { nodes: [{ kind: "start" }, { kind: "end" }] } });
  expect(splitMarkdownPreview("```mermaid\nsequenceDiagram\nAlice->>Bob: Hi\n```")[0]).toMatchObject({ type: "diagram", diagram: null });
});
