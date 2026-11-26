import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { interactiveDocumentPath } from "@/lib/materials/interactive-document-path";
import { interactiveDocumentResponse } from "@/lib/materials/interactive-document-verified";
import { interactiveMarkdown, interactiveMarkdownFallback } from "@/lib/materials/interactive-document-display";
import { buildOfflineReadingSections } from "@/lib/offline/reading-sections";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { interactiveFrameHtml, isInteractiveDocumentNavigation, loadInteractiveDocument } from "../../apps/mobile-native/features/student/interactive-document";

const encode = new TextEncoder();
const source = '<script>document.body.textContent = "Hello & welcome"</script>';
const html = encode.encode(source);
const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const verifies = async (bytes: Uint8Array, expected: string) => hash(bytes) === expected;
const spec = interactiveDocumentSchema.parse({
  id: "graph", kind: "interactive_document", version: 1, label: "Graph", description: "A visual.",
  documentSha256: hash(html), documentBytes: html.length, printSha256: hash(png), printBytes: png.length,
  height: 320, staticFallback: { type: "text", summary: "Graph", content: "A line." }, printCaption: "Initial line.",
});
const courseId = "example";
const scope = { courseId, attemptId: "owned-attempt", questionId: "question", field: "option" as const, option: 0 };
const fenced = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;

test("uses the exact web scopes and the admitted digest for the selected representation", () => {
  expect(interactiveDocumentPath(scope, spec)).toContain(`field=option&option=0&visualId=graph&hash=${hash(html)}&kind=document`);
  expect(interactiveDocumentPath(scope, spec, "print")).toContain(`&hash=${hash(png)}&kind=print`);
  expect(interactiveDocumentPath({ courseId, examId: "tryout", questionId: "question", field: "prompt" }, spec))
    .toStartWith("/api/materials/interactive-document/tryout?");
  expect(interactiveDocumentPath({ grant: "field-grant" }, spec)).toStartWith("/api/materials/interactive-document/reveal?grant=field-grant&");
  const article = { courseId, articleId: "article:v2", articleVersion: 2, sectionId: "section", blockId: "block" };
  expect(interactiveDocumentPath({ ...article, field: "visual_ref" }, spec)).toBeUndefined();
  expect(interactiveDocumentPath({ ...article, field: "markdown", partId: "exact-part" }, spec)).toContain("field=markdown&partId=exact-part&");
  expect(interactiveDocumentPath({ ...article, optionId: "option" }, spec)).toStartWith("/api/materials/interactive-document/option?");
  expect(interactiveDocumentPath(null, spec)).toBeUndefined();
});

test("loads bounded bytes under the expected private delivery policy and digest", async () => {
  const signal = new AbortController().signal;
  expect(await loadInteractiveDocument(async () => interactiveDocumentResponse(html, "document"), { spec, scope }, "document", signal, verifies)).toEqual(html);
  expect(await loadInteractiveDocument(async () => interactiveDocumentResponse(png, "print"), { spec, scope }, "print", signal, verifies)).toEqual(png);
  await expect(loadInteractiveDocument(async () => interactiveDocumentResponse(new Uint8Array(html.length), "document"),
    { spec, scope }, "document", signal, verifies)).rejects.toThrow("VISUAL_VALIDATION_FAILED");
  await expect(loadInteractiveDocument(async () => interactiveDocumentResponse(new Uint8Array(html.length + 1), "document"),
    { spec, scope }, "document", signal, verifies)).rejects.toThrow("VISUAL_FORMAT_INVALID");
  await expect(loadInteractiveDocument(async () => new Response(null, { status: 403 }),
    { spec, scope }, "document", signal, verifies)).rejects.toThrow("VISUAL_UNAVAILABLE");
  await expect(loadInteractiveDocument(async () => new Response(html),
    { spec, scope }, "document", signal, verifies)).rejects.toThrow("VISUAL_UNAVAILABLE");
  await expect(loadInteractiveDocument(async () => interactiveDocumentResponse(html, "document"),
    { spec, scope }, "document", AbortSignal.abort(), verifies)).rejects.toThrow();
});

test("authored HTML stays inside an opaque srcdoc frame with only local navigation", () => {
  const opaque = interactiveFrameHtml(source + '</iframe><img src="https://other.example/">', '"Graph"', "dark");
  expect(opaque).toContain('<iframe sandbox="allow-scripts" referrerpolicy="no-referrer"');
  expect(opaque).toContain("connect-src &#39;none&#39;");
  expect(opaque).toContain("frame-src &#39;none&#39;");
  expect(opaque).toContain("frame.contentWindow?.postMessage");
  expect(opaque).toContain("theme: \"dark\"");
  expect(opaque).not.toContain("<img");
  expect(opaque).not.toContain("allow-same-origin");
  expect(opaque).not.toContain("ReactNativeWebView");
  expect(isInteractiveDocumentNavigation("about:srcdoc")).toBe(true);
  for (const url of ["https://other.example/", "file:///local", "javascript:alert(1)", "about:blank?remote"]) {
    expect(isInteractiveDocumentNavigation(url)).toBe(false);
  }
});

test("format handling preserves authored prose and only substitutes valid visual fences", () => {
  expect(interactiveMarkdown("Before\n\n" + fenced + "\n\nAfter")).toEqual(["Before\n\n", spec, "\n\nAfter"]);
  expect(interactiveMarkdownFallback(fenced)).toBe("A line.");
  const example = "\`\`\`\`text\n" + fenced + "\n\`\`\`\`";
  expect(interactiveMarkdown(example)).toEqual([example]);
  const malformed = fenced.replace("interactive_document", "unknown");
  expect(interactiveMarkdown(malformed)).toEqual([malformed]);
});

test("the same rendered Article gets actions only at its admitted section and part positions", () => {
  const article = { visuals: [spec], sections: [
    { id: "s1", title: "Part one", blocks: [{ id: "b1", parts: [
      { id: "r1", kind: "visual_ref", visualId: spec.id },
      { id: "m1", kind: "markdown", markdown: fenced },
    ] }] },
    { id: "s2", title: "Part two", pedagogy: { visualRequirement: { status: "required", visualIds: [spec.id] } },
      visuals: [spec], blocks: [{ id: "b2", content: fenced }] },
  ] } as Pick<PublicArticleReadModel, "visuals" | "sections">;
  const reading = { kind: "structured_article" as const, article };
  const emitted: unknown[] = [];
  const action: NonNullable<Parameters<typeof buildOfflineReadingSections>[4]> = (_spec, location) => {
    emitted.push(location);
    return "<a>Open visual</a>";
  };
  expect(buildOfflineReadingSections(reading, undefined, "s1", undefined, action)[0].bodyHtml).toContain("<a>Open visual</a>");
  expect(emitted).toEqual([
    { sectionId: "s1", blockId: "b1", partId: "r1", field: "visual_ref" },
    { sectionId: "s1", blockId: "b1", partId: "m1", field: "markdown" },
  ]);
  emitted.length = 0;
  buildOfflineReadingSections(reading, undefined, "s2", undefined, action);
  expect(emitted).toEqual([{ sectionId: "s2", field: "section_visual" }, { sectionId: "s2", blockId: "b2", field: "content" }]);
  expect(buildOfflineReadingSections(reading, undefined, "s1")[0].bodyHtml).not.toContain("<a>Open visual</a>");
});

test("published Article widgets are reachable from legacy sections, typed references and admitted Markdown, with private figures limited to already resolved bytes", async () => {
  const { prompt } = await import("../../app/visual-fixtures/content-visuals/content");
  const { solutionCollectionFixture } = await import("../../app/visual-fixtures/solution-collection/fixture");
  const { readSolutionVisual } = await import("../../apps/mobile-native/features/solutions/visual-preview-model");
  const geometry = solutionCollectionFixture.items[0].visuals[0];
  const figure = { id: "figure", kind: "source_figure", label: "Figure", description: "Details", assetId: "a".repeat(64),
    asset: { assetId: "a".repeat(64), imageUrl: "/private/figure", attribution: "Author", width: 40, height: 40 },
    staticFallback: { type: "text", summary: "Summary", content: "The curve doubles." } };
  const reading = { kind: "structured_article" as const, article: { visuals: [geometry, spec], sections: [
    { id: "first", title: "Inline", blocks: [{ id: "block", parts: [
      { kind: "visual_ref", id: "shape", visualId: geometry.id },
      { kind: "visual_ref", id: "document", visualId: spec.id },
      { kind: "markdown", id: "plot", markdown: prompt },
    ] }] },
    { id: "second", title: "Section", visuals: [figure], blocks: [] },
  ] } as unknown as Pick<PublicArticleReadModel, "visuals" | "sections"> };
  const received: string[] = [];
  const render: NonNullable<Parameters<typeof buildOfflineReadingSections>[6]> = widget => {
    received.push(widget.kind);
    if (widget.kind !== "source_figure") expect(readSolutionVisual(widget)?.kind).toBe(widget.kind);
    return "<button>Explore</button>";
  };
  const first = buildOfflineReadingSections(reading, undefined, "first", undefined, undefined, undefined, render)[0];
  expect(received).toEqual(["geometry_2d", "learning_canvas"]);
  expect(first.bodyHtml?.match(/<button>Explore/g)).toHaveLength(2);
  expect(first.bodyHtml).toContain("Apa yang terjadi");
  expect(buildOfflineReadingSections(reading, undefined, "second", undefined, undefined, undefined, render)[0].bodyHtml).not.toContain("<button>");
  const fitted = buildOfflineReadingSections(reading, { resolveImage: () => "data:image/png;base64,AQ==" }, "second", undefined, undefined, undefined, render)[0];
  expect(received.at(-1)).toBe("source_figure");
  expect(fitted.bodyHtml).toContain("The curve doubles.");
  expect(fitted.bodyHtml).toContain("<button>Explore");
  expect(buildOfflineReadingSections(reading, undefined, "first")[0].bodyHtml).not.toContain("<button>");
});
