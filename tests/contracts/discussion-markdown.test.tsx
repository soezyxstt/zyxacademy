import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscussionMarkdown } from "@/components/discussions/discussion-markdown";
import { safeDiscussionLink } from "@/lib/discussions/markdown-policy";

describe("discussion Markdown safety", () => {
  test("only allows safe http, https, and same-origin relative links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "//evil.test", "/\\evil.test", "https://user:pass@example.com", "https://example.com/\nfoo"]) expect(safeDiscussionLink(url)).toBeNull();
    expect(safeDiscussionLink("https://example.com/a")).toBe("https://example.com/a");
    expect(safeDiscussionLink("/courses/a")).toBe("/courses/a");
  });

  test("renders safe subset without executing HTML, images, directives, or unsafe links", () => {
    const html = renderToStaticMarkup(<DiscussionMarkdown content={'<script>alert(1)</script> ![secret](https://evil.test/a.png) [unsafe](javascript:alert) [link](https://example.com) **bold** *italic* `code` $x^2$\n\n- one\n- two\n\n```js\nalert(1)\n```'} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<ul");
    expect(html).toContain("break-words text-body-sm leading-relaxed");
    expect(html).toContain("<pre");
    expect(html).toContain("katex");
  });

  test("resolves mentions in prose while preserving code, links and email addresses", () => {
    const mentions: string[] = [];
    const html = renderToStaticMarkup(<DiscussionMarkdown
      content={"**@Raka_Pratama**, @Zyra? Coba `@contoh`, nama@example.org dan [@tautan](/courses)."}
      renderMention={handle => { mentions.push(handle); return <button>{handle.replaceAll("_", " ")}</button>; }}
    />);
    expect(mentions).toEqual(["Raka_Pratama", "Zyra"]);
    expect(html).toContain("<button>Raka Pratama</button>");
    expect(html).toContain("nama@example.org");
  });

  test("untrusted math cannot create links or HTML attributes", () => {
    const html = renderToStaticMarkup(<DiscussionMarkdown content={'$\\href{javascript:alert(1)}{click}$ $\\htmlClass{owned}{x}$'} />);
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('class="owned"');
  });

  test("renders math inside emphasis with the same safe subset", () => {
    const html = renderToStaticMarkup(<DiscussionMarkdown content={'**$(x-2)(x+2)$** *$x^2$* **[unsafe](javascript:alert)**'} />);
    expect(html).toContain('<strong><span');
    expect(html).toContain('<em><span');
    expect(html).not.toContain('$(x-2)(x+2)$');
    expect(html).not.toContain('href="javascript:');
  });

  test("keeps multiplication inside emphasized math atomic", () => {
    for (const content of ['**$a*b*c$**', '*$a*b*c$*', '**\\(a*b*c\\)**', '*\\(a*b*c\\)*']) {
      const html = renderToStaticMarkup(<DiscussionMarkdown content={content} />);
      expect(html).toContain('katex');
      expect(html).not.toContain('$');
      expect(html).not.toContain('\\(');
      expect(html).not.toContain('<em>$a');
    }
  });

  test("renders LaTeX \\(...\\) inline math and \\[...\\] display math", () => {
    const content = [
      "Gunakan rumus kuadrat untuk \\(x^2-5x+3=0\\):",
      "\\[",
      "x=\\frac{5\\pm\\sqrt{(-5)^2-4(1)(3)}}{2} = \\frac{5\\pm\\sqrt{13}}{2}.",
      "\\]",
      "Jadi, solusinya adalah \\(x=\\frac{5+\\sqrt{13}}{2}\\) atau \\(x=\\frac{5-\\sqrt{13}}{2}\\).",
    ].join("\n");
    const html = renderToStaticMarkup(<DiscussionMarkdown content={content} />);
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("\\(");
    expect(html).not.toContain("\\)");
    expect(html).not.toContain("\\[");
    expect(html).not.toContain("\\]");
  });

  test("does not execute untrusted commands inside \\(...\\) or \\[...\\] math", () => {
    const html = renderToStaticMarkup(
      <DiscussionMarkdown content={'\\(\\href{javascript:alert(1)}{click}\\) \\[\\htmlClass{owned}{x}\\]'} />
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('class="owned"');
  });

  test("renders mixed intro prose with lists and markdown headings safely", () => {
    const content = "### Langkah penyelesaian\nPerhatikan langkah berikut:\n- Cek diskriminan\n- Hitung akar\n1. Substitusi\n2. Sederhanakan";
    const html = renderToStaticMarkup(<DiscussionMarkdown content={content} />);
    expect(html).toContain("Langkah penyelesaian");
    expect(html).not.toContain("###");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("Cek diskriminan");
    expect(html).toContain("Substitusi");
  });
});
