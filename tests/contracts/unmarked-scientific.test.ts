import { describe, expect, test } from "bun:test";
import { findUnmarkedScientificNotation, findUnmarkedScientificProse } from "@/lib/math/unmarked-scientific";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

describe("obvious unmarked scientific notation", () => {
 test("flags raw absolute values, inequalities, exponents, scientific e notation and mathematical glyphs", () => {
  for (const prose of ["Jarak |x-c| harus kecil.", "Jika 0 < |x-c| < delta.", "Pilih epsilon > 0.", "Gunakan x^2 atau 10^(-5).", "Hasil 1.7e-5.", "Hasil $1.7e-5$.", "Delta δ dan ε.", "f(x) = 2x + 1", "x = c", "Himpunan ℝ.", "Pakai \\delta di sini."]) expect(findUnmarkedScientificNotation(prose)).not.toBeNull();
 });
 test("preserves delimited math, code, currency, prose words and normal Markdown tables", () => {
  for (const prose of ["Syarat $0<|x-c|<\\delta$.", "Hasil $1.7\\times10^{-5}$.", "Eksponensial $e^{-5}$.", "Satuan $\\pu{1.7e-5 m}$.", "Rumus \\(x^2\\) dan \\[1.7\\times10^{-5}\\].", "Kode `x^2 = 1e-5`.", "```js\nconst δ = 1e-5;\n```", "Harga \\$10 dan \\$20.", "Kita memilih epsilon terlebih dahulu dan mencari delta.", "| Konsep | Penjelasan |\n| --- | --- |\n| Limit | Pendekatan |", "Gunakan langkah-langkah yang benar."]) expect(findUnmarkedScientificNotation(prose)).toBeNull();
 });
 test("scans visible prose but does not treat formula models, identifiers and numeric data as prose", () => {
  const object = { id: "a1e-5", latex: "x^2", expression: "x^2", rows: [["1e-5"]], meaningMarkdown: "Jarak |x-c| dibatasi." };
  expect(findUnmarkedScientificProse(object)).toEqual([{ path: "meaningMarkdown", notation: "|x-c|" }]);
  expect(findUnmarkedScientificProse({ latex: "a=1.7e-5", expression: "1.7e-5*x", rows: [["1.7e-5"]] })).toEqual([{ path: "latex", notation: "1.7e-5" }]);
 });
 test("local signed verification fixture explicitly authors every mathematical passage", () => {
  const { bundle: fixture } = buildLocalVerificationFixture();
  expect(findUnmarkedScientificProse(fixture.products)).toEqual([]);
  const article = fixture.products.find((product) => product.productType === "article");
  expect(article?.productType === "article" && article.sections.flatMap((section) => section.blocks).length).toBe(10);
 });
});
