import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ArticleParts, normalizeSingleStatementFormula } from "@/components/course/article-parts";
import { semanticArticleParts } from "@/tests/fixtures/product-learning/article-semantics";
import { articlePartSearchEntries } from "@/lib/materials/article-parts";
import { searchArticleContent, type PublicSectionReadModel } from "@/lib/articles/structured-read-model";

describe("V4 semantic reader", () => {
 test("renders formulas and step reasons mathematically with stable anchors", () => {
  const html = renderToStaticMarkup(<ArticleParts parts={semanticArticleParts} />);
  expect(html).toContain('data-step-id="cancel-step"');
  expect(html).toContain('data-symbol-id="c"');
  expect(html).toContain('data-math-layout="cases"');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('class="katex-error"');
  expect(html).not.toContain("undefined");
 });
 test("search reaches the exact step instead of only its parent block", () => {
  const section: PublicSectionReadModel = { id: "s", slug: "s", title: "Syarat", sectionNumber: "1", sectionKind: "topic", orderIndex: 0, learningObjective: "Penalaran", estimatedReadingMinutes: 1, parentSectionId: null, blocks: [{ id: "b", blockKey: "b", blockType: "worked_example", title: "Faktorisasi", orderIndex: 0, content: "A compatibility projection", parts: semanticArticleParts }] };
  const result = searchArticleContent([section], "bernilai bukan nol");
  expect(result[0].elementId).toBe("cancel-step");
  expect(result[0].snippet).toContain("bernilai bukan nol");
  expect(articlePartSearchEntries(semanticArticleParts).find((entry) => entry.id === "defined")?.text).toContain("tersedia");
 });
});

test("comparison math keeps each formula beside its meaning and domain", () => {
 const html = renderToStaticMarkup(<ArticleParts parts={[{ id: "compare", kind: "math_unit", layout: "comparison", relations: [{ id: "square", latex: "x^2", meaningMarkdown: "Kuadrat", conditionsMarkdown: "Domain real" }, { id: "root", latex: "\\sqrt{x}", meaningMarkdown: "Akar", conditionsMarkdown: "Domain nonnegatif" }], meaningMarkdown: "Bandingkan domain." }]} />);
 expect(html).toContain('data-math-layout="comparison"');
 expect(html.indexOf("Kuadrat")).toBeLessThan(html.indexOf("Domain real"));
 expect(html.indexOf("Domain real")).toBeLessThan(html.indexOf('data-relation-id="root"'));
 expect(html).not.toContain("border-l-2");
 expect(html).not.toContain("katex-error");
});

test("short legacy statements pair their formula and explanation without flattening long math", () => {
 const short = renderToStaticMarkup(<ArticleParts parts={[{ id: "real", kind: "math_unit", latex: "\\mathbb{R}\\supset\\mathbb{Q}", meaningMarkdown: "Rasional bagian dari real.", conditionsMarkdown: "Dalam bilangan real." }]} />);
 expect(short).toContain('data-math-pair="compact"');
 expect(short).toContain("Dalam bilangan real.");
 const long = renderToStaticMarkup(<ArticleParts parts={[{ id: "long", kind: "math_unit", latex: "x+".repeat(50)+"1", meaningMarkdown: "Rumus panjang." }]} />);
 expect(long).not.toContain('data-math-pair="compact"');
});

test("standalone inline equations stay scrollable in editorial mode without altering shared Markdown defaults", () => {
 for (const content of ["$D=(-5)^2-4(1)(6)=25-24=1>0$.", "$$x=1$$,", "\\(x=1\\)."] ) {
  const html=renderToStaticMarkup(<MarkdownRenderer content={content} standaloneInlineMath />);
  expect(html).toContain('data-content-kind="formula"');
  expect(html).toContain('data-math-scroll');
  expect(html).not.toMatch(/<[^>]+>\.<\//);
 }
 for (const inlineContent of ["$x=1$.", "\\(x=1\\)", "\\(x=1\\)."]) {
  const sharedHtml = renderToStaticMarkup(<MarkdownRenderer content={inlineContent} />);
  expect(sharedHtml).not.toContain('data-content-kind="formula"');
  expect(sharedHtml).not.toContain('formula-focus');
 }
 const displayWithPunctuation = renderToStaticMarkup(<MarkdownRenderer content={"$$x=1$$."} />);
 expect(displayWithPunctuation).toContain('data-content-kind="formula"');
 const prose=renderToStaticMarkup(<MarkdownRenderer content={"Ambil $x=1$. Lalu hitung $y=2$."} standaloneInlineMath />);
 expect(prose).not.toContain('data-content-kind="formula"');
});


test("compound equations stack and precede meaning, conditions and symbols", () => {
 const html = renderToStaticMarkup(<ArticleParts parts={[{ id: "transform", kind: "math_unit", latex: "h(x)=Af(C(x-H))+K", meaningMarkdown: "Transformasi utama.", conditionsMarkdown: "Syarat utama.", symbolDefinitions: [{ id: "shift", latex: "H", meaningMarkdown: "Geseran horizontal." }] }]} />);
 const domain = renderToStaticMarkup(<ArticleParts parts={[{id: "domain", kind: "math_unit", latex: String.raw`D_h=\{x:C(x-H)\in D_f\}`, meaningMarkdown: "Domain baru."}]} />);
 expect(domain).not.toContain('data-math-pair="compact"');
 expect(html).not.toContain('data-math-pair="compact"');
 expect(html).not.toContain('data-math-symbols-disclosure');
 expect(html.indexOf('class="katex"')).toBeLessThan(html.indexOf("Transformasi utama."));
 expect(html.indexOf("Transformasi utama.")).toBeLessThan(html.indexOf("Syarat utama."));
 expect(html.indexOf("Syarat utama.")).toBeLessThan(html.indexOf('data-symbol-id="shift"'));
});

test("more than four symbol definitions default collapsed while preserving all content", () => {
 const symbols = ["h", "x", "f", "A", "C", "H", "K"].map((sym) => ({ id: `sym-${sym}`, latex: sym, meaningMarkdown: `Makna ${sym}` }));
 const html = renderToStaticMarkup(<ArticleParts parts={[{ id: "many-symbols", kind: "math_unit", latex: "h(x)=Af(C(x-H))+K", meaningMarkdown: "Transformasi lengkap.", symbolDefinitions: symbols }]} />);
 expect(html).toContain('data-math-symbols-disclosure');
 expect(html).toContain('aria-expanded="false"');
 expect(html).toContain('hidden=""');
 expect(html).toContain("Keterangan simbol (7)");
 for (const sym of symbols) {
  expect(html).toContain(`data-symbol-id="${sym.id}"`);
  expect(html).toContain(sym.meaningMarkdown);
 }
 const symbolListHtml = html.slice(html.indexOf('data-math-symbols'));
 expect(symbolListHtml).not.toContain('data-content-kind="formula"');
});

test("single-statement gathered implications render inline on one line while preserving aligned and cases", () => {
 const gathered = String.raw`\begin{gathered}(u,v)\in\operatorname{grafik}(f)\\\Longrightarrow\\(H+u/C,K+Av)\in\operatorname{grafik}(h)\end{gathered}`;
 expect(normalizeSingleStatementFormula(gathered)).toBe(String.raw`(u,v)\in\operatorname{grafik}(f) \Longrightarrow (H+u/C,K+Av)\in\operatorname{grafik}(h)`);
 const aligned = String.raw`\begin{aligned}f(-x)&=f(x)\\f(-x)&=-f(x)\end{aligned}`;
 expect(normalizeSingleStatementFormula(aligned)).toBe(aligned);
 const cases = String.raw`|x|=\begin{cases}-x,&x<0\\x,&x\ge0\end{cases}`;
 expect(normalizeSingleStatementFormula(cases)).toBe(cases);
});
