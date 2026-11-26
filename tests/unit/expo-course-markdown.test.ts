import { expect, test } from "bun:test";
import { prepareCourseMarkdown, safeCourseMarkdownLink, safeInlineCourseImage } from "../../apps/mobile-native/features/student/course-markdown-model";

test("plain learner copy uses native text, while authored Markdown and loose scientific notation use rich text", () => {
  const prose = "Tulis alasan dalam dua kalimat.";
  expect(prepareCourseMarkdown(prose)).toEqual({ markdown: prose, rich: false });
  expect(prepareCourseMarkdown("**Tentukan** x^2.")).toEqual({ markdown: "**Tentukan** $x^2$.", rich: true });
  expect(prepareCourseMarkdown("Kapan lim x → a f(x) ada?").markdown).toContain("$f(x)$");
  expect(prepareCourseMarkdown("[Ringkasan](https://example.test/a^2?q=1)").markdown)
    .toBe("[Ringkasan](https://example.test/a^2?q=1)");
});

test("inline and block formulas are prepared without disturbing fenced, indented or inline code", () => {
  const authored = String.raw`Sebelum \(x^2\) dan $ y $.

\[
\frac{a}{b}
\]

    const y =  x^2;
    <img src="x^2">
` + "\n```python\nlet $ x^2 = `x`\n```\n\n~~~python\n\\[x\n~~~\n\n`x^2`";
  const result = prepareCourseMarkdown(authored);
  expect(result.rich).toBe(true);
  expect(result.markdown).toContain("Sebelum $x^2$ dan $y$.");
  expect(result.markdown).toContain("\n\n$$\\frac{a}{b}$$\n\n");
  expect(result.markdown).toContain("    const y =  x^2;");
  expect(result.markdown).toContain('    <img src="x^2">');
  expect(result.markdown).toContain("```python\nlet $ x^2 = `x`\n```");
  expect(result.markdown).toContain("~~~python\n\\[x\n~~~");
  expect(result.markdown.endsWith("`x^2`")).toBe(true);
});

test("HTML media is inert and image requests are restricted to bounded embedded raster bytes", () => {
  expect(prepareCourseMarkdown('<video src="https://example.test/a.mp4"></video>').markdown)
    .toEqual('&lt;video src="https://example.test/a.mp4">&lt;/video>');
  expect(safeInlineCourseImage("data:image/png;base64, Zm8=\n")).toBe("data:image/png;base64,Zm8=");
  expect(safeInlineCourseImage("data:image/svg+xml;base64,Zm8=")).toBeUndefined();
  expect(safeInlineCourseImage("https://example.test/image.png")).toBeUndefined();
  expect(safeInlineCourseImage("file:///data/asset.png")).toBeUndefined();
  expect(safeInlineCourseImage(`data:image/gif;base64,${"A".repeat(350_001)}`)).toBeUndefined();
});

test("link handoff permits HTTPS pages and rejects private endpoints and signed URLs", () => {
  const origin = "https://staging.zyxacademy.com";
  expect(safeCourseMarkdownLink("https://example.test/material", origin)).toBe("https://example.test/material");
  expect(safeCourseMarkdownLink("/courses/matematika-1/material", origin)).toBe("/courses/matematika-1/material");
  for (const denied of ["javascript:alert(1)", "http://example.test", "//example.test", "/api/storage/file/a",
    "/%61pi/storage/file/a", "https://user:pass@example.test", "https://example.test/a?x-amz-signature=private"]) {
    expect(safeCourseMarkdownLink(denied, origin)).toBeNull();
  }
});
