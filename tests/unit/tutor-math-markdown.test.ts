import { expect, test } from "bun:test";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";

test("standalone derivation steps become separate readable display blocks", () => {
  const result = normalizeTutorMathMarkdown(String.raw`Faktorkan dulu.
$\frac{x^2-1}{x-1}$
$=x+1$
Jadi limitnya $2$.`);
  expect(result).toContain("$$\n\\frac{x^2-1}{x-1}\n$$");
  expect(result).toContain("$$\n=x+1\n$$");
  expect(result).toContain("limitnya $2$");
  expect(normalizeTutorMathMarkdown(result)).toBe(result);
});

test("prose cleanup preserves LaTeX spacing commands and code", () => {
  const input = String.raw`Nilainya $x\;  + y\! + z$ dan kode ` + "`x  + y`.";
  expect(sanitizeAnswer(input)).toBe(input);
});

test("repairs escaped display line boundaries without damaging LaTeX commands", () => {
  expect(normalizeTutorMathMarkdown(String.raw`$$\n\frac{1}{x}\n$$`)).toBe("$$\n\\frac{1}{x}\n$$");
  expect(normalizeTutorMathMarkdown(String.raw`$x\neq y$ dan $\nabla f$`)).toBe(String.raw`$x\neq y$ dan $\nabla f$`);
});


test("restores escaped prose newlines before letters while protecting math and code", () => {
  expect(normalizeTutorMathMarkdown(String.raw`Langkah pertama\nKemudian hitung`)).toBe("Langkah pertama\nKemudian hitung");
  expect(normalizeTutorMathMarkdown(String.raw`\nabla f \neq 0`)).toBe(String.raw`\nabla f \neq 0`);
  expect(normalizeTutorMathMarkdown("`a\\nb`")).toBe("`a\\nb`");
});
