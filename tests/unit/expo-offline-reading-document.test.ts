import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { buildReadingContentHtml, buildReadingDocumentHtml, savedReadingContent } from "../../apps/mobile-native/offline/reading-document";
import type { OfflineReadingArticle, OfflineReadingPackage, OfflineReadingSummary } from "../../apps/mobile-native/offline/reading-contract";
import { buildReadingKatexCss } from "../../apps/mobile-native/offline/prepare-reading-katex.cjs";
import type { PublicArticleReadModel } from "../../lib/articles/structured-read-model";
import { buildOfflineReadingSections } from "../../lib/offline/reading-sections";

const require = createRequire(import.meta.url);
const katexCss = buildReadingKatexCss(dirname(require.resolve("katex/dist/katex.min.css")));
const summary: OfflineReadingSummary = { kind: "article", id: "article", courseId: "course", key: "saved-key", title: "Saved reading", revision: "a".repeat(64), bytes: 20, leaseExpiresAt: 200, savedAt: 100 };
const rawUrl = "/images/structure.png?width=480&height=320";
const identity = { id: summary.id, courseId: summary.courseId, title: summary.title };
const block = { id: "block", blockKey: "block", orderIndex: 0, blockType: "explanation", title: null, content: "" };
const section = {
  id: "first", slug: "section-one", title: "Learning goal", sectionNumber: "1", sectionKind: "topic" as const,
  learningObjective: "Explain equilibrium", estimatedReadingMinutes: 0, orderIndex: 0, parentSectionId: null,
};
function assetUrl(source: string, details = summary, locale = "en") {
  const { kind, id, courseId, revision } = details;
  return "/api/offline/asset?" + new URLSearchParams({ kind, id, courseId, revision, locale, asset: source });
}

test("uses the same authored Article sections as the Capacitor snapshot", () => {
  const figure = {
    id: "figure", kind: "source_figure", label: "Molecule diagram", description: "Electron arrangement",
    captionMarkdown: "Shared caption", asset: { imageUrl: assetUrl(rawUrl), attribution: "Course notes" },
  };
  const sections = [
    { ...section, blocks: [{ ...block, parts: [
      { id: "math", kind: "math_unit", layout: "cases",
        relations: [
          { id: "left", latex: "x", conditionLatex: "x>0", meaningMarkdown: "Positive side" },
          { id: "right", latex: "0", conditionLatex: "x\\leq 0", meaningMarkdown: "Nonpositive side" },
        ], meaningMarkdown: "Piecewise definition",
        symbolDefinitions: [{ id: "symbol", latex: "x", meaningMarkdown: "Real variable", conditionsMarkdown: "Bounded interval" }] },
      { id: "reuse", kind: "visual_ref", visualId: "figure" },
      { id: "react", kind: "markdown", markdown: "Chemistry: $\\ce{H2O}$" },
      { id: "example", kind: "worked_example", title: "Apply it", problemMarkdown: "Calculate both cases",
        steps: [{ id: "step", operationMarkdown: "Substitute", reasonMarkdown: "Use the definition", sourceElementRefs: ["math"],
          parts: [{ id: "why", kind: "markdown", markdown: "Show the result" }] }],
        verificationMarkdown: "Check by substitution" },
    ] }], visuals: [figure] },
    { ...section, id: "second", slug: "section-two", title: "Second title", blocks: [{ ...block, content: "Another topic." }] },
  ] as unknown as PublicArticleReadModel["sections"];
  const data = { ...identity, chapterId: "chapter", version: 4, sections } satisfies OfflineReadingArticle;
  const saved = {
    summary, data, assets: [{ url: assetUrl(rawUrl), mime: "image/png", bytes: Uint8Array.of(1, 2, 3) }],
  };
  const html = buildReadingDocumentHtml({ saved, locale: "en", section: "section-one" }, katexCss)!;
  const personalized = buildReadingContentHtml(savedReadingContent({ saved, locale: "en" }), katexCss, "light", { fontSize: "large", density: "tight" });
  expect(personalized).toContain("--reading-size: 20px; --reading-spacing: 0.875;");
  expect(personalized).toContain('src="data:image/png;base64,AQID"');
  const shared = buildOfflineReadingSections({ kind: "structured_article", article: { sections }, locale: "en" }, {
    allowLinks: false, resolveImage: (source) => source === assetUrl(rawUrl) ? "data:image/png;base64,AQID" : undefined,
  }, "first");
  expect(html).toContain(shared[0].bodyHtml!);
  expect(html).toContain("<math");
  for (const phrase of ["Piecewise definition", "Positive side", "Bounded interval", "Molecule diagram", "Shared caption", "Use the definition", "Check by substitution"]) {
    expect(html).toContain(phrase);
  }
  expect(html).toContain('src="data:image/png;base64,AQID"');
  expect(html).not.toContain("Another topic.");
  expect(buildReadingDocumentHtml({ saved, locale: "en", section: "stale-section" }, katexCss)).toContain("Another topic.");
});

test("renders legacy flat Articles and original image references from the matching local package", () => {
  const data: OfflineReadingArticle = {
    ...identity, chapterId: null, version: 1, sections: [{
      id: "article:offline", slug: "reading", title: "Old title",
      blocks: [{ ...block, content: `Paragraph **retained**.\n\n![](${rawUrl})` }],
    }],
  };
  const saved = {
    summary, data, assets: [
      { url: assetUrl(rawUrl, { ...summary, courseId: "other-course" }), mime: "image/png", bytes: Uint8Array.of(10) },
      { url: assetUrl(rawUrl), mime: "image/png", bytes: Uint8Array.of(27) },
      { url: assetUrl(rawUrl, summary, "id"), mime: "image/png", bytes: Uint8Array.of(31) },
    ],
  };
  const html = buildReadingDocumentHtml({ saved, locale: "en", section: "reading" }, katexCss)!;
  expect(html).toContain("<strong>retained</strong>");
  expect(html).toContain('src="data:image/png;base64,Gw=="');
  expect(html).not.toContain('src="data:image/png;base64,Cg=="');
  expect(html).not.toContain('src="data:image/png;base64,Hw=="');
  expect(html).not.toContain(rawUrl);
});

test("reads Diktat markdown and fences remote, script and unverified image inputs", () => {
  const diktat = { ...summary, kind: "diktat" as const, id: "diktat", title: 'Diktat <Example>' };
  const body = [
    "## Reaksi dan tekanan",
    "| Nilai | Satuan |\n| --- | --- |\n| $P$ | Pa |",
    `![Kurva](${assetUrl(rawUrl, diktat, "id")})`,
    "![Daring](https://other.example/tracker.png)", "![Aset mentah](data:image/png;base64,AA==)",
    "[Tautan luar](https://other.example/redirect)",
    "<script>alert(1)</script><img src='https://other.example/img' onerror='alert(1)'>",
    "```html\n<iframe src='https://other.example/frame'></iframe>\n```",
  ].join("\n\n");
  const saved: OfflineReadingPackage = { summary: diktat, data: {
    id: diktat.id, courseId: diktat.courseId, title: diktat.title, kind: "article", docCategory: "diktat", contentVersion: 1, body,
  }, assets: [{ url: assetUrl(rawUrl, diktat, "id"), mime: "image/png", bytes: Uint8Array.of(43) }] };
  const html = buildReadingDocumentHtml({ saved, locale: "id" }, katexCss, "dark")!;
  expect(html).toContain('<html lang="id">');
  expect(html).toContain("<title>Diktat &lt;Example&gt;</title>");
  expect(html).toContain("color-scheme: dark");
  expect(html).toContain("<table");
  expect(html).toContain("<math");
  expect(html).toContain('src="data:image/png;base64,Kw=="');
  expect(html).toContain("Daring");
  expect(html).toContain("Aset mentah");
  expect(html).toContain("Tautan luar");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<iframe");
  expect([...html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g)].map(match => match[1])).toEqual(["data:image/png;base64,Kw=="]);
  expect(html).not.toMatch(/<a\s[^>]*href=/);
});

test("the generated document permits only inline styles, local images and local fonts", async () => {
  const saved = { summary, data: { ...identity, chapterId: null, version: 1, sections: [{
    id: "intro", slug: "start", title: "First", blocks: [{ ...block, content: "$x^2$" }],
  }] }, assets: [] };
  const html = buildReadingDocumentHtml({ saved, locale: "en" }, katexCss)!;
  expect(html).toContain("default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'");
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<style>"));
  expect([...katexCss.matchAll(/url\(([^)]+)\)/g)].length).toBeGreaterThan(10);
  expect(katexCss).not.toMatch(/url\((?!["']data:font\/woff2;base64,)|@import/);
  const wrapper = await Bun.file("apps/mobile-native/offline/ReadingDocument.tsx").text();
  for (const option of ["javaScriptEnabled", "domStorageEnabled", "allowFileAccess", "allowUniversalAccessFromFileURLs", "thirdPartyCookiesEnabled"]) {
    expect(wrapper).toContain(`${option}={false}`);
  }
  expect(wrapper).toContain('const initialPage = "about:blank"');
  expect(wrapper).toContain("request.url === initialPage");
});
