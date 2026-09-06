import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import katex from "katex";
import type { ProductEntity } from "./product-validator";


export const PRODUCT_DIKTAT_RENDERER_VERSION = "zyx-diktat-worker-v1";
export const PRODUCT_DIKTAT_PRINT_PROFILE = "a4-self-study-2-page-v1";

function buildSelfContainedKatexCss(): string {
  const cssPath = path.resolve(process.cwd(), "node_modules/katex/dist/katex.min.css");
  const fontsDir = path.resolve(process.cwd(), "node_modules/katex/dist/fonts");
  if (!existsSync(cssPath)) return "";
  const rawCss = readFileSync(cssPath, "utf8");
  return rawCss.replace(/url\(fonts\/(KaTeX_[^)]+\.woff2)\)/g, (_match, filename) => {
    const fontPath = path.join(fontsDir, filename);
    if (existsSync(fontPath)) {
      const base64 = readFileSync(fontPath).toString("base64");
      return `url("data:font/woff2;base64,${base64}")`;
    }
    return _match;
  });
}

const KATEX_CSS = buildSelfContainedKatexCss();

type ArticleProduct = Extract<ProductEntity, { productType: "article" }>;
type DiktatProduct = Extract<ProductEntity, { productType: "diktat" }>;

export interface ProductDiktatRenderSource {
  article: ArticleProduct;
  diktat: DiktatProduct;
}

export interface InspectedPdf {
  pageCount: number;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plain(value: string): string {
  return value
    .replaceAll("\\n", " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipped(value: string, max = 420): string {
  const text = plain(value);
  if (text.length <= max) return text;
  const candidate = text.slice(0, max);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! "),
  );
  if (sentenceEnd >= Math.floor(max * 0.55)) {
    return candidate
      .slice(0, sentenceEnd + 1)
      .trimEnd()
      .replace(/\s+\d+\.$/, "");
  }
  const wordEnd = candidate.lastIndexOf(" ");
  const prefix = candidate
    .slice(0, Math.max(wordEnd, 1))
    .trimEnd()
    .replace(/[\s([{:;,-]+$/, "");
  return `${prefix}...`;
}

function clippedMarkdown(value: string, max = 420): string {
  const formulas: string[] = [];
  const tokenized = value.replace(
    /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,
    (match) => `ZYXFORMULA${formulas.push(match) - 1}END`,
  );
  return clipped(tokenized, max).replace(
    /ZYXFORMULA(\d+)END/g,
    (_match, index) => formulas[Number(index)] ?? "",
  );
}

function renderMath(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: true,
      output: "html",
      strict: "error",
    });
  } catch {
    throw new Error("PRODUCT_DIKTAT_FORMULA_RENDER_ERROR");
  }
}

function inlineMarkup(value: string): string {
  const math: string[] = [];
  const tokenized = value.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_match, block, inline) => {
    const index = math.push(renderMath(block ?? inline, Boolean(block))) - 1;
    return `ZYXMATH${index}END`;
  });
  let html = escapeHtml(tokenized);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/ZYXMATH(\d+)END/g, (_match, index) => math[Number(index)] ?? "");
}

function articleBlocks(article: ArticleProduct) {
  if (article.sections.length > 0) {
    return article.sections
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .flatMap((section) => section.blocks.slice().sort((a, b) => a.orderIndex - b.orderIndex));
  }
  return article.blocks
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((block) => ({ ...block, contentMarkdown: block.content, ideaIds: article.ideaLinks.map((link) => link.id) }));
}

function formulaeFrom(source: ProductDiktatRenderSource): string[] {
  const values = [
    source.diktat.contentMarkdown,
    ...articleBlocks(source.article).map((block) => block.contentMarkdown),
  ];
  const found: string[] = [];
  for (const value of values) {
    for (const match of value.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) {
      const formula = (match[1] ?? match[2] ?? "").trim();
      const isStandaloneArrow = /^(?:\\to|\\rightarrow|\\Rightarrow)$/.test(formula);
      const isMeaningful = /[=<>]|\\(?:lim|det|begin|neq|to|Rightarrow)/.test(formula);
      if (isMeaningful && !isStandaloneArrow && !found.includes(formula)) {
        found.push(formula);
      }
    }
  }
  return found.slice(0, 6);
}

function ideaSummaries(source: ProductDiktatRenderSource): string[] {
  const blocks = articleBlocks(source.article);
  return source.article.ideaLinks.map((link, index) => {
    const matching = blocks.find((block) => block.ideaIds.includes(link.id));
    return matching ? clippedMarkdown(matching.contentMarkdown, 300) : `Pokok gagasan ${index + 1} dirangkum dari artikel sumber.`;
  });
}

function selectedLearningBlocks(source: ProductDiktatRenderSource): string[] {
  const priority = new Set(["worked_example", "formative_check", "misconception", "summary", "retrieval_close"]);
  return articleBlocks(source.article)
    .filter((block) => priority.has(block.blockType))
    .slice(0, 5)
    .map((block) => clippedMarkdown(block.contentMarkdown, 360));
}

export function compileProductDiktatHtml(source: ProductDiktatRenderSource): string {
  if (
    source.diktat.sourceArticleId !== source.article.id ||
    source.diktat.sourceArticleVersion !== source.article.version ||
    source.diktat.sourceArticleHash !== source.article.generationHash
  ) {
    throw new Error("PRODUCT_DIKTAT_LINEAGE_MISMATCH");
  }

  const ideas = ideaSummaries(source);
  const formulas = formulaeFrom(source);
  const learningBlocks = selectedLearningBlocks(source);
  const diktatSummary = clippedMarkdown(source.diktat.contentMarkdown, 650);
  const title = escapeHtml(source.diktat.title);

  const ideaHtml = ideas.map((idea, index) => `<li><strong>Pokok gagasan ${index + 1}.</strong> ${inlineMarkup(idea)}</li>`).join("");
  const formulaHtml = formulas.length > 0
    ? formulas.map((formula) => `<div class="formula">${renderMath(formula, true)}</div>`).join("")
    : `<p class="muted">Bab ini tidak memerlukan rumus khusus.</p>`;
  const learningHtml = learningBlocks.length > 0
    ? learningBlocks.map((block, index) => `<section class="learning"><h3>Langkah ${index + 1}</h3><p>${inlineMarkup(block)}</p></section>`).join("")
    : `<section class="learning"><h3>Uji pemahaman</h3><p>Tuliskan kembali gagasan utama bab ini, lalu jelaskan syarat penerapannya dengan kata-kata sendiri.</p></section>`;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${title}</title>
<style>${KATEX_CSS}
@page { size: A4; margin: 14mm 15mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10.2pt; line-height: 1.43; }
.page { break-after: page; min-height: 254mm; }
.page:last-child { break-after: auto; }
.eyebrow { color: #b94c16; font-size: 8.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { color: #111827; font-size: 23pt; line-height: 1.15; margin: 8mm 0 5mm; }
h2 { border-bottom: 1.5px solid #172033; font-size: 14pt; margin: 7mm 0 3mm; padding-bottom: 2mm; }
h3 { font-size: 10.5pt; margin: 0 0 1.5mm; }
p { margin: 0 0 3mm; }
ol, ul { margin: 0 0 4mm; padding-left: 6mm; }
li { margin-bottom: 2.2mm; }
.lead { color: #374151; font-size: 11pt; }
.formula { background: #f5f7fa; border-left: 3px solid #e66b2c; margin: 3mm 0; padding: 3mm; text-align: center; break-inside: avoid; }
.learning { border-bottom: 1px solid #d9dee8; margin-bottom: 3mm; padding-bottom: 3mm; break-inside: avoid; }
.muted, .footer { color: #667085; font-size: 8.5pt; }
.footer { margin-top: 8mm; }
.katex-display { margin: 0; overflow: visible; }
.katex { font-family: "DejaVu Serif", serif; }
</style></head><body>
<main class="page">
  <p class="eyebrow">Diktat belajar mandiri</p><h1>${title}</h1>
  <p class="lead">${inlineMarkup(diktatSummary)}</p>
  <h2>Gagasan yang perlu dikuasai</h2><ol>${ideaHtml}</ol>
  <h2>Rumus dan syarat</h2>${formulaHtml}
</main>
<main class="page">
  <p class="eyebrow">Latihan pemahaman</p><h1>${title}</h1>
  ${learningHtml}
  <h2>Ringkasan belajar</h2>
  <p>Hubungkan setiap rumus dengan syarat berlakunya. Periksa kembali langkah penyelesaian dan jelaskan alasan di balik setiap transformasi.</p>
  <p class="footer">Dihasilkan dari Artikel yang telah ditautkan dan sumber akademik terverifikasi. Informasi lineage teknis disimpan terpisah sebagai bukti publikasi.</p>
</main></body></html>`;
}

export function compileCanonicalDiktatHtml(title: string, markdown: string): string {
  const safeTitle = escapeHtml(title);
  const renderedContent = inlineMarkup(markdown)
    .split(/\n\n+/)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>${KATEX_CSS}
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10.2pt; line-height: 1.5; }
.page { break-after: page; min-height: 254mm; }
.page:last-child { break-after: auto; }
.eyebrow { color: #b94c16; font-size: 8.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 2mm; }
h1 { color: #111827; font-size: 20pt; line-height: 1.2; margin: 4mm 0 6mm; border-bottom: 2px solid #b94c16; padding-bottom: 3mm; }
h2 { font-size: 13pt; margin: 6mm 0 3mm; color: #1f2937; }
h3 { font-size: 11pt; margin: 4mm 0 2mm; color: #374151; }
p { margin: 0 0 3.5mm; }
ol, ul { margin: 0 0 4mm; padding-left: 6mm; }
li { margin-bottom: 2mm; }
.formula { background: #f5f7fa; border-left: 3px solid #e66b2c; margin: 3mm 0; padding: 3mm; text-align: center; break-inside: avoid; }
.katex-display { margin: 2mm 0; overflow: visible; }
.katex { font-family: "DejaVu Serif", serif; }
.footer { color: #667085; font-size: 8.5pt; margin-top: 10mm; border-top: 1px solid #e5e7eb; padding-top: 3mm; }
</style></head><body>
<main class="page">
  <p class="eyebrow">Zyx Academy · Diktat Belajar</p>
  <h1>${safeTitle}</h1>
  <div class="content">${renderedContent}</div>
  <p class="footer">Diterbitkan oleh Zyx Academy.</p>
</main></body></html>`;
}

export async function renderProductDiktatPdf(
  html: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const rendererUrl = process.env.DIKTAT_RENDERER_URL;
  const rendererSecret = process.env.DIKTAT_RENDERER_SECRET;
  if (!rendererUrl || !rendererSecret) {
    throw new Error("PRODUCT_DIKTAT_RENDERER_UNAVAILABLE");
  }
  const response = await (options.fetchImpl ?? fetch)(`${rendererUrl}/render`, {
    method: "POST",
    headers: { Authorization: `Bearer ${rendererSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ html, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
  });
  if (!response.ok) throw new Error("PRODUCT_DIKTAT_RENDERER_FAILED");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1000 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("PRODUCT_DIKTAT_RENDERER_INVALID_PDF");
  }
  return bytes;
}

export function canDownloadProductDiktat(input: { role?: string | null; enrolled: boolean }): boolean {
  return input.role === "admin" || (input.role === "student" && input.enrolled);
}
export { latestReadyProductDiktatEvidence } from "./product-diktat-evidence";
