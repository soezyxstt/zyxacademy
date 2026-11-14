import { describe, expect, test } from "bun:test";
import { appendArticleMarkdownScope, markdownPythonId } from "@/lib/coding/article-markdown-scope";

describe("article Python Markdown draft identity", () => {
  const scope = (...segments: string[]) => segments.reduce<string | null>(appendArticleMarkdownScope, null)!;

  test("keeps the same snippet stable and separates blocks, fields and snippets", () => {
    const first = markdownPythonId(scope("section", "block", "part", "problem"), "md-0-code");
    expect(first).toBe(markdownPythonId(scope("section", "block", "part", "problem"), "md-0-code"));
    expect(first).not.toBe(markdownPythonId(scope("section", "block", "part", "reason"), "md-0-code"));
    expect(first).not.toBe(markdownPythonId(scope("section", "another", "part", "problem"), "md-0-code"));
    expect(first).not.toBe(markdownPythonId(scope("section", "block", "part", "problem"), "md-1-code"));
  });

  test("separates free-form identifiers that contain scope separators", () => {
    expect(markdownPythonId(scope("a:step:b:c", "markdown"), "md-0-code"))
      .not.toBe(markdownPythonId(scope("a", "step:b", "c", "markdown"), "md-0-code"));
  });
});
