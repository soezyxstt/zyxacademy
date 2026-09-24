import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";

describe("semantic emphasis labels", () => {
  it("keeps a longer word that starts with the label", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content="[[emphasis:remember]]Ingatan itu penting[[/emphasis]]" />);
    expect(html).toContain("Ingatan itu penting");
    expect(html).not.toContain(">an itu penting<");
  });

  it("removes an explicitly repeated label", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content="[[emphasis:caution]]Hati-hati: periksa syaratnya[[/emphasis]]" />);
    expect(html).toContain("periksa syaratnya");
    expect(html.match(/Hati-hati/g)).toHaveLength(2);
  });
});
