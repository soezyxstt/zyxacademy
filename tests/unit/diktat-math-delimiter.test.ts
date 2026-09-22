import { describe, it, expect } from "bun:test";
import { preRenderMathInText } from "@/lib/diktat-renderer";

describe("diktat-renderer math delimiters", () => {
  it("renders standard $$ and $ math delimiters", () => {
    const markdown = "Rumus luas adalah $L = \\pi r^2$ pada lingkaran, dan integral tentu:\n\n$$\\int_0^1 x^2\\,\\mathrm{d}x = \\frac{1}{3}$$";
    const html = preRenderMathInText(markdown);

    expect(html).toContain('class="math-inline"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain("katex");
    expect(html).not.toContain("math-error");
  });

  it("renders LaTeX bracket delimiters \\[...\\] and \\(...\\)", () => {
    const markdown = "Fungsi gelombang memenuhi \\(\\psi(x) = A \\sin(kx)\\) dan persamaan energi:\n\n\\[E = \\frac{\\hbar^2 k^2}{2m}\\]";
    const html = preRenderMathInText(markdown);

    expect(html).toContain('class="math-inline"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain("katex");
    expect(html).not.toContain("math-error");
    expect(html).not.toContain("\\[E =");
    expect(html).not.toContain("\\(\\psi");
  });
});
