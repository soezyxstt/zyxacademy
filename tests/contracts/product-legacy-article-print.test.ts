import { expect, test } from "bun:test";
import { compileProductArticleHtml, compileProductDiktatHtml } from "@/lib/bundle/product-diktat-pdf";
import { findStalePdfEvidenceProductIds } from "@/lib/bundle/product-review-preservation";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const base = { id: "article", productType: "article", schemaVersion: "1.0", title: "Aljabar", version: 2, generationHash: "a".repeat(64), blocks: [], sections: [], visuals: [] };
const worked = { steps: [{ stepIndex: 0, label: "Langkah", explanation: "Penjelasan langkah", reason: "Alasan langkah" }], verification: "Verifikasi akhir" };
const formative = { checkKind: "multiple_choice", answer: "jawaban-rahasia", explanation: "umpan-balik-rahasia", options: [{ id: "a", text: "Pilihan satu", isCorrect: true }, { id: "b", text: "Pilihan dua", isCorrect: false }] };

test("V2 prints flat blocks in order, including embedded learner-visible payloads", () => {
  const article = { ...base, blocks: [
    { id: "b", orderIndex: 2, blockType: "worked_example", content: JSON.stringify({ content: "Kedua $x^2$", workedExamplePayload: worked, formativeCheckPayload: formative }) },
    { id: "a", orderIndex: 1, blockType: "explanation", content: "Pertama sebelum Miskonsepsi: salah Koreksi: benar" },
  ] };
  const html = compileProductArticleHtml(article as any);
  expect(html.indexOf("Pertama sebelum")).toBeLessThan(html.indexOf("Kedua"));
  for (const text of ["Miskonsepsi:", "Koreksi:", "Penjelasan langkah", "Alasan langkah", "Verifikasi akhir", "Pilihan satu", "Pilihan dua", 'class="katex"']) expect(html).toContain(text);
  expect(html).not.toContain("jawaban-rahasia");
  expect(html).not.toContain("umpan-balik-rahasia");
  expect(html).toContain(">Artikel</span>");
});

test("V3 prints every ordered section, title, block and visible formative option", () => {
  const block = (id: string, orderIndex: number, contentMarkdown: string) => ({ id, orderIndex, blockType: "explanation", contentMarkdown });
  const article = { ...base, schemaVersion: "article.v3", sections: [
    { id: "z", title: "Bagian akhir", orderIndex: 2, blocks: [block("z", 0, "Konten akhir")] },
    { id: "a", title: "Bagian awal", orderIndex: 1, blocks: [{ ...block("b", 2, "Cek $y$"), title: "Judul cek", formativeCheckPayload: formative }, { ...block("a", 1, "Contoh awal"), workedExamplePayload: worked }] },
  ] };
  const html = compileProductArticleHtml(article as any);
  const sequence = ["Bagian awal", "Contoh awal", "Penjelasan langkah", "Judul cek", "Cek", "Pilihan satu", "Bagian akhir", "Konten akhir"];
  for (let i = 1; i < sequence.length; i++) expect(html.indexOf(sequence[i - 1])).toBeLessThan(html.indexOf(sequence[i]));
  expect(html).not.toContain("jawaban-rahasia");
  expect(html).not.toContain("umpan-balik-rahasia");
});

test("V3 projects referenced static visuals alongside the correct block", () => {
  const graph = LIMIT_EPSILON_DELTA_GRAPH;
  const article = { ...base, visuals: [graph], sections: [{ id: "s", title: "Limit", learningObjective: "Memahami limit", orderIndex: 0,
    pedagogy: { visualRequirement: { status: "required", visualIds: [graph.id] } },
    blocks: [{ id: "b", orderIndex: 0, contentMarkdown: "Isi sebelum grafik", visualIds: [graph.id] }] }] };
  const html = compileProductArticleHtml(article as any);
  expect(html).toContain("Memahami limit");
  expect(html.indexOf("Isi sebelum grafik")).toBeLessThan(html.indexOf(`data-visual-id="${graph.id}"`));
  expect(html.split(`data-visual-id="${graph.id}"`)).toHaveLength(2);
});

test("Article export fails closed for unsupported content or missing visuals and rejects V4", () => {
  const article = { ...base, blocks: [{ id: "a", orderIndex: 0, blockType: "explanation", content: "Teks" }] };
  expect(() => compileProductArticleHtml({ ...article, schemaVersion: "article.v4" } as any)).toThrow("LEGACY_REQUIRED");
  expect(() => compileProductArticleHtml({ ...article, blocks: [{ ...article.blocks[0], content: "![diagram](https://example.test/a.png)" }] } as any)).toThrow("MEDIA_UNSUPPORTED");
  expect(() => compileProductArticleHtml({ ...article, blocks: [{ ...article.blocks[0], content: "$\\notacommand{x}$" }] } as any)).toThrow("MATH_RENDER_INVALID");
  expect(() => compileProductArticleHtml({ ...article, blocks: [{ ...article.blocks[0], content: 'Intro\n{"content":"Question","answer":"private","isCorrect":true}' }] } as any)).toThrow("PAYLOAD_INVALID");
  expect(() => compileProductArticleHtml({ ...article, blocks: [{ id: "a", orderIndex: 0, content: "Intro\n{" }, { id: "b", orderIndex: 1, content: '"answer":"private"}' }] } as any)).toThrow("PAYLOAD_INVALID");
  expect(() => compileProductArticleHtml({ ...base, sections: [{ id: "s", title: "S", orderIndex: 0, blocks: [{ id: "b", orderIndex: 0, contentMarkdown: "Teks", visualIds: ["missing"] }] }] } as any)).toThrow("VISUAL_MISSING");
});

test("Article links print safe labels and destinations without interpreting code or unsafe protocols", () => {
  const render = (content: string) => compileProductArticleHtml({ ...base, blocks: [{ id: "a", orderIndex: 0, blockType: "explanation", content }] } as any);
  const html = render('[**Rujukan**](https://example.test/a_(b)?x=1&y=two_words) dan [Bab](/courses/course/article). [Bagian](#bagian). [Email](mailto:team@example.test). <https://example.test/next>');
  expect(html).toContain('<strong>Rujukan</strong></a><span class="article-print-destination"> (https://example.test/a_(b)?x=1&amp;y=two_words)</span>');
  expect(html).toContain('href="https://example.test/a_(b)?x=1&amp;y=two_words"');
  for (const href of ['/courses/course/article', '#bagian', 'mailto:team@example.test', 'https://example.test/next']) expect(html).toContain(`href="${href}"`);
  expect(html).not.toContain('[**Rujukan**](');
  expect(render('<https://example.test/a_b_c>')).toContain('href="https://example.test/a_b_c">https://example.test/a_b_c</a>');
  const dollarLinks = render('[Rujukan $y$](https://example.test/$x$) <https://example.test/$z$> dan $q$');
  expect(dollarLinks).toContain('href="https://example.test/$x$"');
  expect(dollarLinks).toContain('(https://example.test/$x$)</span>');
  expect(dollarLinks).toContain('href="https://example.test/$z$">https://example.test/$z$</a>');
  expect(dollarLinks).toContain('Rujukan <span class="katex"');
  expect(dollarLinks).not.toContain('%%ZYX');
  expect(render('`[code](https://example.test/$x$ "title")`')).toContain('[code](https://example.test/$x$ &quot;title&quot;)');
  expect(render('$[f](x)$')).toContain('class="katex"');
  expect(render('```text\n[code](https://example.test/$x$)\n```')).toContain('[code](https://example.test/$x$)');
  expect(render('`[code](javascript:alert)`')).toContain('[code](javascript:alert)');
  for (const href of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///private', '//foreign.test/a', 'https://user:password@example.test']) expect(() => render(`[Tautan](${href})`)).toThrow('LINK_UNSUPPORTED');
  expect(() => render('[Rujukan][id]\n\n[id]: https://example.test')).toThrow('LINK_UNSUPPORTED');
});

test("Article code can teach media syntax without fetching media, and math retains its semantic source", () => {
  const source = 'Teks belum lengkap: ![diagram] dan <img\n\n`![diagram](https://example.test/a.png)`\n\n```html\n<img src="https://example.test/a.png">\n```\n\n$\\frac12(2)(3^2-1^2)=8$';
  const v2 = { ...base, blocks: [{ id: "b", orderIndex: 0, blockType: "explanation", content: source }] };
  const v3 = { ...base, schemaVersion: "article.v3", sections: [{ id: "s", title: "Markdown", orderIndex: 0, blocks: [{ id: "b", orderIndex: 0, blockType: "explanation", contentMarkdown: source }] }] };
  for (const article of [v2, v3]) {
    const html = compileProductArticleHtml(article as any);
    expect(html).toContain('![diagram](https://example.test/a.png)');
    expect(html).toContain('&lt;img src=&quot;https://example.test/a.png&quot;&gt;');
    expect(html).not.toContain('<img src=');
    expect(html).toContain('Teks belum lengkap: ![diagram] dan &lt;img');
    expect(html).toContain('<math ');
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac12(2)(3^2-1^2)=8</annotation>');
  }
  expect(() => compileProductArticleHtml({ ...v2, blocks: [{ ...v2.blocks[0], content: '<img src="https://example.test/a.png">' }] } as any)).toThrow('MEDIA_UNSUPPORTED');
  expect(() => compileProductArticleHtml({ ...v2, blocks: [{ ...v2.blocks[0], content: '![diagram](https://example.test/$x$)' }] } as any)).toThrow('MEDIA_UNSUPPORTED');
  expect(() => compileProductArticleHtml({ ...v2, blocks: [{ ...v2.blocks[0], content: '<img\nsrc="https://example.test/a.png">' }] } as any)).toThrow('MEDIA_UNSUPPORTED');
});

test("linked Diktat rendering and Article-owned restage invalidation retain their contracts", () => {
  const article = { ...base, blocks: [{ id: "a", orderIndex: 0, blockType: "explanation", content: "Teks awal" }] };
  const diktat = { id: "d", title: "Diktat", sourceArticleId: article.id, sourceArticleVersion: article.version, sourceArticleHash: article.generationHash, contentMarkdown: "## Ringkasan\nIsi diktat" };
  expect(compileProductDiktatHtml({ article, diktat } as any)).toContain(">Diktat</span>");
  expect(() => compileProductDiktatHtml({ article, diktat: { ...diktat, sourceArticleHash: "b".repeat(64) } } as any)).toThrow("LINEAGE_MISMATCH");
  const before = { products: [article] }, unchanged = { products: [{ ...article }] }, changed = { products: [{ ...article, blocks: [{ ...article.blocks[0], content: "Teks berubah" }] }] };
  expect(findStalePdfEvidenceProductIds(before as any, unchanged as any).has("article")).toBe(false);
  expect(findStalePdfEvidenceProductIds(before as any, changed as any).has("article")).toBe(true);
  const linked = { products: [article, { ...diktat, productType: "diktat", version: 1, generationHash: "b".repeat(64) }] };
  expect(findStalePdfEvidenceProductIds(linked as any, before as any).has("article")).toBe(true);
  expect(findStalePdfEvidenceProductIds(before as any, linked as any).has("article")).toBe(true);
});
