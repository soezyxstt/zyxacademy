import { describe, expect, it } from "bun:test";
import {
  compileCanonicalDiktatHtml,
  parseCanonicalDiktatMarkdownToHtml,
} from "@/lib/bundle/product-diktat-pdf";

describe("compileCanonicalDiktatHtml", () => {
  const sampleMarkdown = `# Pertaksamaan dan Fungsi

## Peta Konsep
Struktur materi terbagi menjadi empat pilar utama:
1. Sistem Bilangan dan Pertaksamaan: Bilangan real, rasional, dan irasional.
2. Nilai Mutlak dan Radikal: Definisi nilai mutlak sepotong-sepotong.
3. Geometri Analitik Bidang: Sistem koordinat Kartesius.
4. Teori Fungsi dan Trigonometri: Definisi fungsi dan domain.

Berikut tabel ringkasan visual klasifikasi objek geometri dan fungsi:

| Kategori Objek | Persamaan Baku / Notasi | Karakteristik Utama | Domain / Sifat |
|---|---|---|---|
| Bilangan Rasional | $Q = \\{m/n \\mid m, n \\in \\mathbb{Z}, n \\neq 0\\}$ | Desimal berhenti atau berulang | Himpunan bagian $\\mathbb{R}$ |
| Garis Lurus | $y - y_1 = m(x - x_1)$ | Gradien konstan $m = \\Delta y/\\Delta x$ | Terdefinisi untuk $x_1 \\neq x_2$ |

## Formula Penting
1. Diskriminan dan Rumus Kuadrat ABC:
$$D = b^2 - 4ac, \\quad x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}$$

2. Jarak Euclidean dan Titik Tengah:
$$d(P, Q) = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$

## Langkah Cepat
1. Menyelesaikan Pertaksamaan Rasional:
- Langkah 1: Tetapkan syarat penyebut $Q(x) \\neq 0$.
- Langkah 2: Pindahkan seluruh suku ke ruas kiri sehingga ruas kanan bernilai nol.

## Contoh Kilat
Contoh Kilat 1: Menyelesaikan Pertaksamaan Rasional Nilai Mutlak
Selesaikan pertaksamaan $|\\frac{2x-1}{x+2}| \\le 1$.
Penyelesaian:
Syarat penyebut $x + 2 \\neq 0 \\implies x \\neq -2$.

## Jebakan dan Miskonsepsi
Jebakan 1: Perkalian Silang dengan Variabel Penyebut
Miskonsepsi: Pada $\\frac{1}{x-2} < 3$, langsung mengalikan kedua ruas dengan $(x-2)$.
Koreksi: Tanda dari $(x-2)$ bergantung pada $x$. Perkalian silang variabel dilarang.

## Cek Ingatan
1. Mengapa fungsi tangen memiliki asimtot tegak pada $\\theta = \\frac{\\pi}{2} + k\\pi$?
2. Bagaimana cara menguraikan transformasi $y = -3f(2(x + 1)) - 5$?
`;

  it("renders watermark with official Zyx main SVG logo", () => {
    const html = compileCanonicalDiktatHtml("Pertaksamaan dan Fungsi - Review Cepat", sampleMarkdown);
    expect(html).toContain('class="diktat-watermark"');
    // Verify main logo viewBox
    expect(html).toContain('viewBox="0 0 2182 1275"');
    // Verify path 1 and path 2 from main SVG logo
    expect(html).toContain("M820.486 0L1043.32");
    expect(html).toContain("M1548 389.927L1826.91");
    // Verify colors inside the watermark fragment so static CSS cannot mask a missing logo
    const watermark = html.match(/<div class="diktat-watermark"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(watermark).toContain("#002B49");
    expect(watermark).toContain("#FF6B35");
  });

  it("renders running header and footer on every page", () => {
    const html = compileCanonicalDiktatHtml("Pertaksamaan dan Fungsi - Review Cepat", sampleMarkdown);
    expect(html).toContain('class="diktat-running-header"');
    expect(html).toContain('class="diktat-running-footer"');
    expect(html).toContain("Zyx Academy");
    expect(html).toContain("Diktat Belajar");
    expect(html).toContain("Pertaksamaan dan Fungsi - Review Cepat");
    expect(html).toContain("Instagram: zyx_academy");
    expect(html).toContain("zyxforbusiness@gmail.com");
  });

  it("parses markdown headings without leaving raw hashes", () => {
    const html = compileCanonicalDiktatHtml("Pertaksamaan dan Fungsi - Review Cepat", sampleMarkdown);
    expect(html).not.toContain("<p># Pertaksamaan");
    expect(html).not.toContain("<p>## Peta Konsep");
    expect(html).not.toContain("<p>## Formula Penting");
    expect(html).toContain("<h2");
    expect(html).toContain("Peta Konsep");
    expect(html).toContain("Formula Penting");
    expect(html).toContain("Langkah Cepat");
  });

  it("parses markdown tables into HTML tables", () => {
    const html = compileCanonicalDiktatHtml("Pertaksamaan dan Fungsi - Review Cepat", sampleMarkdown);
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<th");
    expect(html).toContain("Kategori Objek");
    expect(html).toContain("Bilangan Rasional");
    expect(html).not.toContain("|---|---|");
  });

  it("renders KaTeX math equations properly", () => {
    const content = parseCanonicalDiktatMarkdownToHtml(sampleMarkdown, "Pertaksamaan dan Fungsi - Review Cepat");
    expect(content).toContain('class="formula-display"');
    expect(content).toContain("katex-display");
    expect(content).not.toContain("katex-error");
  });

  it("renders an explicit page break marker for print review sections", () => {
    const markdown = "Pertanyaan\n\n<!-- page-break -->\n\n## Kunci jawaban\nJawaban ringkas.";
    const content = parseCanonicalDiktatMarkdownToHtml(markdown, "Diktat");
    const html = compileCanonicalDiktatHtml("Diktat", markdown);
    expect(content).toContain('<div class="diktat-page-break"></div>');
    expect(content.indexOf('<div class="diktat-page-break"></div>')).toBeLessThan(content.indexOf("Kunci jawaban"));
    expect(html).toContain(".diktat-page-break { break-before: page; page-break-before: always; column-span: all; }");
  });

  it("wraps pedagogical sections into structured cards", () => {
    const content = parseCanonicalDiktatMarkdownToHtml(sampleMarkdown, "Pertaksamaan dan Fungsi - Review Cepat");
    expect(content).toContain("card-formula");
    expect(content).toContain("card-trap");
    expect(content).toContain("card-example");
    expect(content).toContain("card-steps");
    expect(content).toContain("box-misconception");
    expect(content).toContain("box-correction");
  });

  it("escapes raw HTML in markdown content while preserving math formatting", () => {
    const markdownWithHtml = "Berikut teks dengan `<script>alert('xss')</script>` dan formula $x = 1$.";
    const html = compileCanonicalDiktatHtml("Uji XSS", markdownWithHtml);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("katex");
  });

  it("handles malformed math formulas safely with katex-error fallback without crashing", () => {
    const markdownWithBrokenMath = "Formula salah $$\\frac{invalid}{$$ tetap aman.";
    const html = compileCanonicalDiktatHtml("Uji Math Error", markdownWithBrokenMath);
    expect(html).toContain("katex-error");
    expect(html).toContain("invalid");
  });
});

