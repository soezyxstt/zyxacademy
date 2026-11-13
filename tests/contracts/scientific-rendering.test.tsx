import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import katex from "@/lib/math/katex";
import { scientificNumberToLatex, scientificNumberToText } from "@/lib/math/scientific-format";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { LocaleProvider } from "@/components/providers/locale-provider";
import enLearningMessages from "@/messages/en/learning.json";
import { parseCanonicalDiktatMarkdownToHtml } from "@/lib/bundle/product-diktat-pdf";

describe("shared scientific rendering", () => {
  const expressions = [String.raw`\ce{2 H2 + O2 -> 2 H2O}`, String.raw`\pu{1.0 mol L-1}`, String.raw`\vec{v}=\begin{pmatrix}1\\2\end{pmatrix}`];
  for (const expression of expressions) {
    for (const display of [false, true]) {
      test(`${expression} in ${display ? "display" : "inline"} mode`, () => {
        expect(() => katex.renderToString(expression, { throwOnError: true, displayMode: display })).not.toThrow();
        const source = display ? `$$${expression}$$` : `$${expression}$`;
        for (const html of [renderToStaticMarkup(<MathText>{source}</MathText>), renderToStaticMarkup(<MarkdownRenderer content={source} />), parseCanonicalDiktatMarkdownToHtml(source, "Test")]) {
          expect(html).toContain('class="katex');
          expect(html).not.toContain("katex-error");
          expect(html).not.toContain("color:#cc0000");
        }
      });
    }
  }
  test("keeps trusted HTML commands disabled even when requested by a caller", () => {
    expect(katex.renderToString(String.raw`\href{https://example.com}{x}`, { trust: true })).not.toContain("<a ");
  });
  test("does not turn ordinary prose into mathematical italics", () => {
    expect(renderToStaticMarkup(<MathText>Materi kimia dan fisika</MathText>)).not.toContain('class="katex');
  });
});

describe("scientific numeric formatting", () => {
  test("uses four significant digits and preserves finite nonzero extremes", () => {
    expect(scientificNumberToLatex(0)).toBe("0");
    expect(scientificNumberToLatex(-0)).toBe("0");
    expect(scientificNumberToLatex(1.23456)).toBe("1.235");
    expect(scientificNumberToLatex(1e-20)).toBe(String.raw`1\times 10^{-20}`);
    expect(scientificNumberToLatex(-1.23456e20)).toBe(String.raw`-1.235\times 10^{20}`);
    expect(scientificNumberToText(1e-20)).toBe("1 × 10⁻²⁰");
    for (const value of [Number.MIN_VALUE, Number.MAX_VALUE, -Number.MIN_VALUE]) {
      expect(scientificNumberToLatex(value)).not.toBe("0");
      expect(scientificNumberToText(value)).not.toMatch(/[eE][+-]?\d/);
      expect(() => katex.renderToString(scientificNumberToLatex(value), { throwOnError: true })).not.toThrow();
    }
  });
  test("shows explicit states for nonfinite values", () => {
    expect(scientificNumberToLatex(NaN)).toBe(String.raw`\text{tidak terdefinisi}`);
    expect(scientificNumberToLatex(Infinity)).toBe(String.raw`\infty`);
    expect(scientificNumberToText(-Infinity)).toBe("-∞");
  });
});


describe("scientific delimiter boundaries", () => {
  for (const source of [String.raw`Harga \$5 dan \$10`, "`$x$`", "``$x$ dan `kode` ``", "```latex\n$x$", "```latex\n$x$\n\\ce{H2O}\n```".replaceAll("\\n", "\n")]) {
    test(`protects literal content: ${source}`, () => {
      for (const html of [renderToStaticMarkup(<MathText>{source}</MathText>), renderToStaticMarkup(<MarkdownRenderer content={source} />), parseCanonicalDiktatMarkdownToHtml(source, "Test")]) {
        expect(html).not.toContain('class="katex');
        expect(html).not.toContain("katex-error");
        expect(html).toContain(source.includes("Harga") ? "$5" : "$x$");
      }
    });
  }
  test("keeps real inline and display math alongside protected code", () => {
    const source = '`$literal$` dengan $x^2$ dan \\(y_1\\), serta $$z^3$$';
    for (const html of [renderToStaticMarkup(<MathText>{source}</MathText>), renderToStaticMarkup(<MarkdownRenderer content={source} />), parseCanonicalDiktatMarkdownToHtml(source, "Test")]) {
      expect(html).toContain("$literal$");
      expect(html.match(/class="katex"/g)).toHaveLength(3);
    }
  });
});


test("formula labels keep standalone SSR safe and follow the application locale", () => {
  const standalone = renderToStaticMarkup(<MarkdownRenderer content="$$x=1$$" />);
  expect(standalone).toContain('aria-label="Rumus utama"');
  const english = renderToStaticMarkup(<LocaleProvider initialLocale="en" initialMessages={{ learning: enLearningMessages }}><MarkdownRenderer content="$$x=1$$" /></LocaleProvider>);
  expect(english).toContain('aria-label="Main formula"');
  expect(english).not.toContain('aria-label="Rumus utama"');
});
