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
    for (const content of ['**$a*b*c$**', '*$a*b*c$*']) {
      const html = renderToStaticMarkup(<DiscussionMarkdown content={content} />);
      expect(html).toContain('katex');
      expect(html).not.toContain('$');
      expect(html).not.toContain('<em>$a');
    }
  });
});
