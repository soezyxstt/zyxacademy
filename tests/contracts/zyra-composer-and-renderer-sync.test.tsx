import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import { isZyraImageFeatureEnabled } from "@/lib/zyra/images/contracts";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import { sanitizeAnswer, extractEmbeddedArticleParts } from "@/lib/tutor/answer-sanitizer";
import { compileMarkdown } from "@/lib/markdown-compiler";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ZyraFormulaPreview } from "@/components/course/zyra-formula-preview";
import { extractContextFromContainer } from "@/lib/zyra/selection-serializer";
import { semanticArticleParts } from "@/tests/fixtures/product-learning/article-semantics";

describe("Zyra composer Ctrl+V paste and Artikel v4 renderer sync", () => {
  test("enables Zyra image attachments by default unless explicitly disabled", () => {
    expect(isZyraImageFeatureEnabled(undefined)).toBe(true);
    expect(isZyraImageFeatureEnabled("1")).toBe(true);
    expect(isZyraImageFeatureEnabled("0")).toBe(false);
    expect(getTutorCapabilities("fisika-dasar").imageInput).toBe(true);
  });

  test("extracts image files from clipboard items, FileList fallback, and extension MIME fallback", () => {
    const pngFromItems = new File([new Uint8Array([137, 80, 78, 71])], "paste.png", {
      type: "image/png",
      lastModified: 1000,
    });
    const webpWithoutMime = new File([new Uint8Array([82, 73, 70, 70])], "diagram.webp", {
      type: "",
      lastModified: 2000,
    });
    const nonImage = new File(["hello"], "notes.txt", {
      type: "text/plain",
      lastModified: 3000,
    });

    const fromItemsAndFiles = zyraImageFilesFromClipboard(
      [
        {
          kind: "string",
          type: "text/plain",
          getAsFile: () => null,
        },
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => pngFromItems,
        },
      ],
      [pngFromItems, webpWithoutMime, nonImage],
    );

    expect(fromItemsAndFiles).toHaveLength(2);
    expect(fromItemsAndFiles[0]?.name).toBe("paste.png");
    expect(fromItemsAndFiles[0]?.type).toBe("image/png");
    expect(fromItemsAndFiles[1]?.name).toBe("diagram.webp");
    expect(fromItemsAndFiles[1]?.type).toBe("image/webp");
  });

  test("wires Ctrl+V paste, Paperclip button, and draft session creation in TutorDrawerView and attachment route", () => {
    const drawerSource = readFileSync("components/course/tutor-drawer-view.tsx", "utf8");
    expect(drawerSource).toContain("onPaste={handlePaste}");
    expect(drawerSource).toContain("zyraImageFilesFromClipboard");
    expect(drawerSource).toContain("attachmentComposerRef.current?.addFiles(files)");
    expect(drawerSource).toContain("attachmentComposerRef.current?.openFileDialog()");
    expect(drawerSource).toContain("onSessionCreated={handleComposerSessionCreated}");

    const routeSource = readFileSync("app/api/zyra/attachments/route.ts", "utf8");
    expect(routeSource).toContain('createChatSession(user.id, rawCourseId, "General Chat")');
    expect(routeSource).toContain("sessionId: resolvedSessionId");
  });

  test("renders live KaTeX math preview in ZyraFormulaPreview", () => {
    const html = renderToStaticMarkup(<ZyraFormulaPreview input="Hitung $\frac{a^2 + b^2}{c}$" />);
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('class="katex-error"');
  });

  test("sanitizes Artikel v4 HTML comments and extracts embedded Artikel v4 parts", () => {
    const payload = Buffer.from(JSON.stringify({ parts: semanticArticleParts }), "utf8").toString("base64url");
    const rawWithV4Comment = `<!--__ZYX_V4_BLOCK_PAYLOAD__:${payload}-->\n<!-- visual:v1 -->\nPenjelasan singkat \\[x^2 + y^2 = r^2\\]`;

    const extracted = extractEmbeddedArticleParts(rawWithV4Comment);
    expect(extracted).not.toBeNull();
    expect(extracted?.length).toBe(semanticArticleParts.length);

    const cleaned = sanitizeAnswer(rawWithV4Comment);
    expect(cleaned).not.toContain("__ZYX_V4_BLOCK_PAYLOAD__");
    expect(cleaned).not.toContain("<!-- visual:v1 -->");
    expect(cleaned).toContain("\\[x^2 + y^2 = r^2\\]");

    const materializedFromCommentOnly = sanitizeAnswer(`<!--__ZYX_V4_BLOCK_PAYLOAD__:${payload}-->`);
    expect(materializedFromCommentOnly).not.toContain("__ZYX_V4_BLOCK_PAYLOAD__");
    expect(materializedFromCommentOnly.length).toBeGreaterThan(20);
  });

  test("compiles multi-line display math, strips standalone HTML comments, and preserves code block lines", () => {
    const md = [
      "<!-- visual:step-response -->",
      "$$\\begin{aligned}",
      "f(x) &= x^2 + 2x + 1 \\\\",
      "&= (x + 1)^2",
      "\\end{aligned}$$",
      "",
      "```python",
      "- item inside code",
      "$$not_math_outside_code$$",
      "```",
    ].join("\n");

    const compiled = compileMarkdown(md);
    expect(compiled.ast.blocks).toHaveLength(2);
    expect(compiled.ast.blocks[0]?.type).toBe("p");
    if (compiled.ast.blocks[0]?.type === "p") {
      expect(compiled.ast.blocks[0].content).toContain("\\begin{aligned}");
      expect(compiled.ast.blocks[0].content).toContain("\\end{aligned}");
    }
    expect(compiled.ast.blocks[1]?.type).toBe("code");
    if (compiled.ast.blocks[1]?.type === "code") {
      expect(compiled.ast.blocks[1].content).toContain("- item inside code");
      expect(compiled.ast.blocks[1].content).toContain("$$not_math_outside_code$$");
    }
  });

  test("renders Artikel v4 embedded parts and scientific table cells in MarkdownRenderer", () => {
    const encoded = Buffer.from(JSON.stringify({ parts: semanticArticleParts }), "utf8").toString("base64url");
    const v4Comment = `<!--__ZYX_V4_BLOCK_PAYLOAD__:${encoded}-->`;
    const v4Html = renderToStaticMarkup(<MarkdownRenderer content={v4Comment} density="compact" />);
    expect(v4Html).toContain('data-step-id="cancel-step"');
    expect(v4Html).toContain('data-symbol-id="c"');
    expect(v4Html).toContain('class="katex"');

    const tableMd = [
      "| Besaran | Rumus |",
      "| :--- | :--- |",
      "| Energi | E = mc^2 |",
    ].join("\n");
    const tableHtml = renderToStaticMarkup(<MarkdownRenderer content={tableMd} density="compact" />);
    expect(tableHtml).toContain('class="katex"');
  });

  test("detects Artikel v4 [data-part-kind] and sanitizes KaTeX headings in selection serializer", () => {
    const sectionHeading = {
      tagName: "H2",
      innerHTML:
        'Turunan <span class="katex"><span class="katex-mathml"><math><semantics><mi>f</mi><annotation encoding="application/x-tex">f(x)</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">f(x)</span></span>',
      textContent: "Turunan f(x)f(x)",
    };
    const blockHeading = {
      tagName: "H3",
      innerHTML:
        'Contoh <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x2</span></span>',
      textContent: "Contoh x^2x2",
    };
    const articleEl: any = {
      tagName: "ARTICLE",
      parentElement: null,
      previousElementSibling: null,
      getAttribute: () => null,
      querySelector: (selector: string) => (selector.includes("h2") ? sectionHeading : null),
      closest: () => null,
    };
    const partEl: any = {
      tagName: "DIV",
      parentElement: articleEl,
      previousElementSibling: sectionHeading,
      getAttribute: (name: string) => (name === "data-part-kind" ? "worked_example" : null),
      querySelector: (selector: string) => (selector.includes("h3") ? blockHeading : null),
      closest: () => null,
    };

    const ctx = extractContextFromContainer(partEl as unknown as Element);
    expect(ctx.blockType).toBe("worked_example");
    expect(ctx.sectionTitle).toBe("Turunan $f(x)$");
    expect(ctx.blockTitle).toBe("Contoh $x^2$");
  });
});
