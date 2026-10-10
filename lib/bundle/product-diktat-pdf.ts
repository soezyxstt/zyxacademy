import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import katex from "katex";
import type { ProductEntity } from "./product-validator";


export const PRODUCT_DIKTAT_RENDERER_VERSION = "zyx-diktat-worker-v2";
export const PRODUCT_DIKTAT_PRINT_PROFILE = "a4-self-study-compact-v2";

export function buildSelfContainedKatexCss(): string {
  const require = createRequire(import.meta.url);
  const distDir = path.dirname("Deno" in globalThis ? fileURLToPath(import.meta.resolve("katex")) : require.resolve("katex"));
  const rawCss = readFileSync(path.join(distDir, "katex.min.css"), "utf8");
  return rawCss.replace(/url\(fonts\/(KaTeX_[^)]+\.woff2)\) format\("woff2"\)(?:,url\([^)]+\) format\("[^"]+"\))*/g, (_match, filename) => {
    const font = readFileSync(path.join(distDir, "fonts", filename)).toString("base64");
    return `url("data:font/woff2;base64,${font}") format("woff2")`;
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

/** Escapes authored text before inserting it into printable HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const SEMANTIC_EMPHASIS_LABELS = {
  remember: "Ingat",
  avoid: "Hindari",
  caution: "Hati-hati",
  definition: "Definisi",
  formula: "Rumus",
} as const;

/** Replaces semantic emphasis markers with labeled, print-ready HTML spans. */
function applySemanticEmphasis(html: string): string {
  return html.replace(
    /\[\[emphasis:(remember|avoid|caution|definition|formula)\]\]([\s\S]*?)\[\[\/emphasis\]\]/gi,
    (_match, tone: keyof typeof SEMANTIC_EMPHASIS_LABELS, content: string) => {
      const label = SEMANTIC_EMPHASIS_LABELS[tone.toLowerCase() as keyof typeof SEMANTIC_EMPHASIS_LABELS];
      const withoutDuplicateLabel = content.replace(new RegExp(`^${label}:?\\s*`, "i"), "");
      return `<span class="semantic-emphasis semantic-${tone.toLowerCase()}"><span class="semantic-label">${label}</span>${withoutDuplicateLabel}</span>`;
    },
  );
}

export const ZYX_MAIN_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2182 1275" fill="none">
  <path d="M820.486 0L1043.32 311.527L561.052 985.764H785.07C1218.92 985.764 1414.6 741.149 1490.45 548.958C1530.06 448.611 1614.41 218.403 1779.69 153.473C1726.56 188.889 1645.61 253.821 1596.7 619.792C1511.51 1257.29 1018.23 1275 675.869 1275H0L705.095 289.236H0V0H820.486Z" fill="#002B49"/>
  <path d="M1548 389.927L1826.91 0H2181.08L1725.09 637.5L2181.08 1275H1826.91L1584.83 936.551C1624.06 852.061 1646.88 746.292 1646.88 613.889C1646.88 330.556 1729.52 188.89 1782.64 153.473C1617.37 218.403 1594.99 445.66 1555.38 546.007C1531.12 607.48 1494.6 674.317 1441.95 736.797L914.931 0H1269.1L1548 389.927Z" fill="#FF6B35"/>
</svg>`;

const DIKTAT_CONTACT_FOOTER_HTML = `<span>Instagram: zyx_academy</span><span>Email: zyxforbusiness@gmail.com</span><span>WhatsApp: 0851 9475 4224</span><a href="https://zyxacademy.com">zyxacademy.com</a>`;

export const PRODUCT_DIKTAT_FOOTER_TEMPLATE = `<div style="width:100%;margin:0 12mm;font-family:Arial,sans-serif;font-size:8px;color:#334b78;border-top:1px solid #b9c5d2;padding-top:5px;display:flex;justify-content:space-between;white-space:nowrap">${DIKTAT_CONTACT_FOOTER_HTML}</div>`;

const WATERMARK_CSS = `
.diktat-watermark {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  width: 360px;
  max-width: 65%;
  opacity: 0.045;
  pointer-events: none;
  z-index: 0;
}
.diktat-watermark svg { width: 100%; height: auto; display: block; }
`;

/** Compiles the authored Diktat into a compact print layout. */
export function compileProductDiktatHtml(source: ProductDiktatRenderSource): string {
  if (
    source.diktat.sourceArticleId !== source.article.id ||
    source.diktat.sourceArticleVersion !== source.article.version ||
    source.diktat.sourceArticleHash !== source.article.generationHash
  ) {
    throw new Error("PRODUCT_DIKTAT_LINEAGE_MISMATCH");
  }

  const title = escapeHtml(source.diktat.title);
  const content = parseCanonicalDiktatMarkdownToHtml(withoutRepeatedDocumentHeading(source.diktat.contentMarkdown), source.diktat.title);

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${title}</title>
<style>${KATEX_CSS}
${WATERMARK_CSS}
@page { size: A4; margin: 9mm 12mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: Arial, sans-serif; font-size: 8.4pt; line-height: 1.32; }
.diktat { position: relative; z-index: 1; }
.diktat-header { border-bottom: 1px solid #b9c5d2; margin-bottom: 3mm; padding-bottom: 2mm; }
.eyebrow { color: #b94c16; font-size: 7pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
h1 { color: #172033; font-size: 15pt; line-height: 1.2; margin: 1mm 0 0; }
.diktat-content { column-count: 2; column-gap: 7mm; }
.section-h1, .section-h2 { color: #172033; font-size: 10pt; line-height: 1.2; margin: 3mm 0 1mm; break-after: avoid; }
.section-h3, .section-h4 { font-size: 8.7pt; margin: 2mm 0 .7mm; break-after: avoid; }
p { margin: 0 0 1.4mm; }
ol, ul { margin: 0 0 1.6mm; padding-left: 5.5mm; }
li { margin-bottom: .8mm; padding-left: .5mm; }
.pedagogical-card { display: contents; }
.formula-display { margin: 1mm 0 1.2mm; text-align: left; break-inside: avoid; }
.katex-display { margin: 0; overflow: visible; text-align: left; }
.formula-list { display: grid; gap: .6mm; margin: 1.4mm 0 2mm; padding-left: 1mm; }
.formula-item { min-width: 0; }
.formula-item .formula-display { display: block; margin: 0; }
.katex { font-size: .92em; }
.semantic-emphasis { font-weight: 600; }
.semantic-label { font-weight: 700; margin-right: 3px; }
.semantic-caution { color: inherit; }
.diktat-divider { border: 0; border-top: 1px solid #d9dee8; margin: 2mm 0; }
.table-container { break-inside: avoid; margin: 1.5mm 0; }
.diktat-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
.diktat-table th, .diktat-table td { border: 1px solid #d9dee8; padding: 1mm; }
.misconception-grid { margin: 1.5mm 0; }
.label-wrong, .label-correct, .solution-header, .example-badge, .step-badge { font-weight: 700; }
.example-header, .solution-header { margin: 1.5mm 0 .5mm; }
.inline-code { font-family: monospace; }
</style></head><body>
<div class="diktat-watermark" aria-hidden="true">${ZYX_MAIN_LOGO_SVG}</div>

<main class="diktat"><header class="diktat-header"><span class="eyebrow">Diktat</span><h1>${title}</h1></header><div class="diktat-content">${content}</div></main></body></html>`;
}

/** Removes the leading Markdown title already printed in the document header. */
function withoutRepeatedDocumentHeading(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\r\n]+\r?\n/, "").trimStart();
}

/**
 * Parses canonical Markdown text into semantic HTML with KaTeX equations,
 * styled pedagogical cards, tables, and formatted lists.
 */
export function parseCanonicalDiktatMarkdownToHtml(markdown: string, documentTitle: string): string {
  const mathMap = new Map<string, string>();
  let tokenCounter = 0;

  function storeMath(latex: string, displayMode: boolean): string {
    const id = `%%ZYXMATH${tokenCounter++}%%`;
    let rendered = "";
    try {
      rendered = katex.renderToString(latex.trim(), {
        displayMode,
        throwOnError: true,
        output: "html",
      });
      if (displayMode) {
        rendered = `<div class="formula-display">${rendered}</div>`;
      }
    } catch {
      rendered = displayMode
        ? `<div class="katex-error">$$${escapeHtml(latex)}$$</div>`
        : `<span class="katex-error">$${escapeHtml(latex)}$</span>`;
    }
    mathMap.set(id, rendered);
    return id;
  }

  // 1. Protect and pre-render block equations: $$ ... $$ and \[ ... \]
  let text = markdown
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, eq) => storeMath(eq, true))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, eq) => storeMath(eq, true));

  // 2. Protect and pre-render inline equations: \( ... \) and $ ... $
  text = text
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, eq) => storeMath(eq, false))
    .replace(/\$([^\$\n]+?)\$/g, (orig, eq) => {
      const trimmed = eq.trim();
      if (!trimmed) return orig;
      return storeMath(trimmed, false);
    });

  function formatInline(str: string): string {
    const html = escapeHtml(str)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    return applySemanticEmphasis(html);
  }

  function detectCardClass(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes("formula") || lower.includes("rumus")) return "card-formula";
    if (lower.includes("jebakan") || lower.includes("miskonsepsi")) return "card-trap";
    if (lower.includes("contoh")) return "card-example";
    if (lower.includes("langkah") || lower.includes("metode")) return "card-steps";
    if (lower.includes("peta konsep")) return "card-concept-map";
    if (lower.includes("cek ingatan") || lower.includes("checklist")) return "card-recall";
    return "";
  }

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let inCard = false;

  function closeCardIfOpen() {
    if (inCard) {
      out.push("</div>");
      inCard = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***") {
      closeCardIfOpen();
      out.push('<hr class="diktat-divider" />');
      i++;
      continue;
    }

    // Markdown Table Detection
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].trim().includes("|") &&
      /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(lines[i + 1].trim())
    ) {
      const splitRow = (row: string) => {
        let clean = row.trim();
        if (clean.startsWith("|")) clean = clean.slice(1);
        if (clean.endsWith("|")) clean = clean.slice(0, -1);
        return clean.split("|").map((c) => c.trim());
      };

      const headers = splitRow(lines[i]);
      const alignTokens = splitRow(lines[i + 1]);
      const alignments = alignTokens.map((t) => {
        if (t.startsWith(":") && t.endsWith(":")) return "center";
        if (t.endsWith(":")) return "right";
        return "left";
      });

      let rowIdx = i + 2;
      const bodyRows: string[][] = [];
      while (rowIdx < lines.length) {
        const rLine = lines[rowIdx].trim();
        if (!rLine || !rLine.includes("|")) break;
        bodyRows.push(splitRow(rLine));
        rowIdx++;
      }

      const thHtml = headers
        .map((h, idx) => `<th style="text-align: ${alignments[idx] || "left"}">${formatInline(h)}</th>`)
        .join("");

      const trHtml = bodyRows
        .map((row) => {
          const tdHtml = row
            .map((cell, idx) => `<td style="text-align: ${alignments[idx] || "left"}">${formatInline(cell)}</td>`)
            .join("");
          return `<tr>${tdHtml}</tr>`;
        })
        .join("\n");

      out.push(
        `<div class="table-container"><table class="diktat-table"><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table></div>`
      );
      i = rowIdx;
      continue;
    }

    // Heading 1 (#)
    const h1Match = trimmed.match(/^#\s+(.*)/);
    if (h1Match) {
      closeCardIfOpen();
      const h1Text = h1Match[1].trim();
      if (h1Text.toLowerCase() !== documentTitle.toLowerCase()) {
        out.push(`<h1 class="section-h1">${formatInline(h1Text)}</h1>`);
      }
      i++;
      continue;
    }

    // Heading 2 (##)
    const h2Match = trimmed.match(/^##\s+(.*)/);
    if (h2Match) {
      closeCardIfOpen();
      const h2Text = h2Match[1].trim();
      const cardClass = detectCardClass(h2Text);
      out.push(`<h2 class="section-h2">${formatInline(h2Text)}</h2>`);
      if (cardClass) {
        out.push(`<div class="pedagogical-card ${cardClass}">`);
        inCard = true;
      }
      i++;
      continue;
    }

    // Heading 3 (###)
    const h3Match = trimmed.match(/^###\s+(.*)/);
    if (h3Match) {
      out.push(`<h3 class="section-h3">${formatInline(h3Match[1].trim())}</h3>`);
      i++;
      continue;
    }

    // Heading 4 (####)
    const h4Match = trimmed.match(/^####\s+(.*)/);
    if (h4Match) {
      out.push(`<h4 class="section-h4">${formatInline(h4Match[1].trim())}</h4>`);
      i++;
      continue;
    }

    // Blockquote (> )
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
        i++;
      }
      out.push(`<blockquote>${formatInline(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered List (- or *)
    if (trimmed.match(/^[-*]\s+/)) {
      const items: string[] = [];
      const rawItems: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^[-*]\s+/)) {
        const itemContent = lines[i].trim().replace(/^[-*]\s+/, "");
        rawItems.push(itemContent);
        const stepMatch = itemContent.match(/^Langkah\s*(\d+):?\s*(.*)/i);
        if (stepMatch) {
          items.push(
            `<li class="step-item"><span class="step-badge">Langkah ${stepMatch[1]}</span> <span>${formatInline(stepMatch[2])}</span></li>`
          );
        } else {
          items.push(`<li>${formatInline(itemContent)}</li>`);
        }
        i++;
      }
      if (rawItems.every((item) => mathMap.has(item) && mathMap.get(item)?.startsWith('<div class="formula-display">'))) {
        out.push(`<div class="formula-list">${rawItems.map((item) => `<div class="formula-item">${item}</div>`).join("\n")}</div>`);
      } else {
        out.push(`<ul class="diktat-list">${items.join("\n")}</ul>`);
      }
      continue;
    }

    // Ordered List (1. )
    if (trimmed.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\.\s+/)) {
        const itemContent = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(`<li>${formatInline(itemContent)}</li>`);
        i++;
      }
      out.push(`<ol class="diktat-ordered-list">${items.join("\n")}</ol>`);
      continue;
    }

    // Misconception / Pitfall pattern in text
    if (
      trimmed.includes("Miskonsepsi:") &&
      (trimmed.includes("Koreksi:") || (i + 1 < lines.length && lines[i + 1].includes("Koreksi:")))
    ) {
      let combined = trimmed;
      if (!trimmed.includes("Koreksi:") && i + 1 < lines.length) {
        combined += " " + lines[i + 1].trim();
        i++;
      }
      const mythMatch = combined.match(/Miskonsepsi:\s*(.*?)(?=Koreksi:|$)/i);
      const correctionMatch = combined.match(/Koreksi:\s*(.*?)$/i);

      if (mythMatch && correctionMatch) {
        out.push(`
<div class="misconception-grid">
  <div class="box-misconception">
    <span class="label-wrong">❌ Miskonsepsi</span>
    <div class="misconception-body">${formatInline(mythMatch[1].trim())}</div>
  </div>
  <div class="box-correction">
    <span class="label-correct">✅ Koreksi</span>
    <div class="correction-body">${formatInline(correctionMatch[1].trim())}</div>
  </div>
</div>`);
        i++;
        continue;
      }
    }

    // Example header pattern: "Contoh Kilat 1: ..." or "Contoh 1: ..."
    const exampleMatch = trimmed.match(/^(Contoh(?:\s+Kilat|\s+Soal)?\s*\d+):?\s*(.*)/i);
    if (exampleMatch) {
      out.push(`
<div class="example-header">
  <span class="example-badge">${exampleMatch[1]}</span>
  <span class="example-title">${formatInline(exampleMatch[2])}</span>
</div>`);
      i++;
      continue;
    }

    // Solution separator: "Penyelesaian:"
    if (trimmed.toLowerCase().startsWith("penyelesaian:")) {
      const rest = trimmed.replace(/^penyelesaian:\s*/i, "");
      out.push(`<div class="solution-header">Penyelesaian</div>`);
      if (rest) {
        out.push(`<p>${formatInline(rest)}</p>`);
      }
      i++;
      continue;
    }

    // Standalone Block Math
    if (mathMap.has(trimmed)) {
      out.push(trimmed);
      i++;
      continue;
    }

    // Regular Paragraph
    out.push(`<p>${formatInline(trimmed)}</p>`);
    i++;
  }

  closeCardIfOpen();

  let htmlResult = out.join("\n");

  // 3. Restore KaTeX equations
  for (const [placeholder, rendered] of mathMap.entries()) {
    htmlResult = htmlResult.replaceAll(placeholder, rendered);
  }

  return htmlResult;
}

/**
 * Compiles canonical diktat markdown and metadata into a complete, printable HTML document
 * with watermark, running header, running footer, and KaTeX fonts.
 */
export function compileCanonicalDiktatHtml(title: string, markdown: string): string {
  const safeTitle = escapeHtml(title);
  const renderedContent = parseCanonicalDiktatMarkdownToHtml(withoutRepeatedDocumentHeading(markdown), title);

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>${KATEX_CSS}
${WATERMARK_CSS}
@page {
  size: A4;
  margin: 22mm 15mm 18mm 15mm;
}
* { box-sizing: border-box; }

body {
  margin: 0;
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.55;
  background: #ffffff;
}

/* Running Header & Footer (Repeated on every page) */
.diktat-running-header {
  position: fixed;
  top: -15mm;
  left: 0;
  right: 0;
  height: 8mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 0.75pt solid #cbd5e1;
  font-size: 7.5pt;
  color: #64748b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  z-index: 10;
}
.diktat-running-header .brand-text {
  color: #002B49;
  font-weight: 800;
}
.diktat-running-header .brand-sep {
  margin: 0 4px;
  color: #cbd5e1;
}
.diktat-running-header .running-header-right {
  color: #94a3b8;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  font-weight: 500;
}

.diktat-running-footer {
  position: fixed;
  bottom: -12mm;
  left: 0;
  right: 0;
  height: 7mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 0.75pt solid #e2e8f0;
  font-size: 7pt;
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  z-index: 10;
}

/* First Page Cover Header */
.diktat-cover-header {
  margin-bottom: 6mm;
  border-bottom: 2px solid #002B49;
  padding-bottom: 3.5mm;
}
.cover-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2mm;
}
.eyebrow-badge {
  background: #002B49;
  color: #ffffff;
  font-size: 7pt;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.eyebrow-type {
  color: #FF6B35;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cover-title {
  font-size: 19pt;
  font-weight: 800;
  color: #002B49;
  line-height: 1.2;
  margin: 1.5mm 0 2mm;
  letter-spacing: -0.02em;
}
.cover-meta-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8pt;
  color: #64748b;
  margin-top: 2mm;
}

/* Typography & Flow */
h1, h2, h3, h4 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  color: #002B49;
  break-after: avoid;
  page-break-after: avoid;
}
.section-h1 {
  font-size: 14pt;
  font-weight: 800;
  color: #002B49;
  margin: 6mm 0 2.5mm;
}
.section-h2 {
  font-size: 12pt;
  font-weight: 700;
  color: #002B49;
  margin: 6.5mm 0 2.5mm;
  padding-bottom: 1.5mm;
  border-bottom: 1.5px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.section-h2::before {
  content: "";
  display: inline-block;
  width: 3.5px;
  height: 13pt;
  background: #FF6B35;
  border-radius: 2px;
}
.section-h3 {
  font-size: 10pt;
  font-weight: 700;
  color: #0f172a;
  margin: 4mm 0 2mm;
}
.section-h4 {
  font-size: 9.5pt;
  font-weight: 600;
  color: #334155;
  margin: 3mm 0 1.5mm;
}
p {
  margin: 0 0 2.5mm;
  text-align: justify;
}
.diktat-divider {
  border: 0;
  border-top: 1px dashed #cbd5e1;
  margin: 4mm 0;
}

/* Lists */
ol, ul {
  margin: 0 0 3mm;
  padding-left: 5mm;
}
li {
  margin-bottom: 1.8mm;
  line-height: 1.5;
}
.diktat-list {
  list-style-type: disc;
}
.diktat-running-footer a { color: inherit; text-decoration: underline; }
.formula-list {
  display: grid;
  gap: 2mm;
  margin: 2mm 0 4mm;
}
.formula-item .formula-display {
  margin: 0;
  text-align: left;
}
.formula-item .katex-display {
  text-align: left;
}
.diktat-ordered-list {
  list-style-type: decimal;
}

/* Tables */
.table-container {
  width: 100%;
  margin: 4mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.diktat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
  line-height: 1.4;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  overflow: hidden;
}
.diktat-table th {
  background-color: #002B49;
  color: #ffffff;
  font-weight: 700;
  text-align: left;
  padding: 5pt 7pt;
  border: 1px solid #002B49;
  font-size: 8pt;
  letter-spacing: 0.02em;
}
.diktat-table td {
  padding: 4.5pt 7pt;
  border: 1px solid #e2e8f0;
  vertical-align: middle;
  color: #334155;
}
.diktat-table tr:nth-child(even) {
  background-color: #f8fafc;
}

/* Pedagogical Section Cards */
.pedagogical-card {
  border-radius: 6px;
  padding: 3.5mm 4mm;
  margin: 3mm 0 4mm;
  break-inside: avoid;
  page-break-inside: avoid;
  position: relative;
}
.card-formula {
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-left: 3.5px solid #2563eb;
}
.card-trap {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-left: 3.5px solid #dc2626;
}
.card-example {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3.5px solid #002B49;
}
.card-steps {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-left: 3.5px solid #16a34a;
}
.card-concept-map {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-left: 3.5px solid #FF6B35;
}
.card-recall {
  background: #fdf4ff;
  border: 1px solid #f5d0fe;
  border-left: 3.5px solid #a855f7;
}

/* Trap Grid */
.misconception-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 3mm 0;
  break-inside: avoid;
}
.box-misconception {
  background: #ffffff;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 6pt 8pt;
  font-size: 8.5pt;
}
.box-correction {
  background: #ffffff;
  border: 1px solid #86efac;
  border-radius: 4px;
  padding: 6pt 8pt;
  font-size: 8.5pt;
}
.label-wrong {
  display: block;
  color: #991b1b;
  font-size: 7.5pt;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 2pt;
}
.label-correct {
  display: block;
  color: #166534;
  font-size: 7.5pt;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 2pt;
}

/* Badges & Steps */
.step-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 2mm;
  list-style: none;
}
.step-badge {
  display: inline-block;
  background: #16a34a;
  color: #ffffff;
  font-size: 7pt;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Example Box */
.example-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3mm;
  margin-bottom: 1.5mm;
  font-weight: 700;
}
.example-badge {
  background: #002B49;
  color: #ffffff;
  font-size: 7pt;
  font-weight: 700;
  padding: 1.5px 6px;
  border-radius: 3px;
  text-transform: uppercase;
}
.example-title {
  color: #0f172a;
  font-size: 9pt;
}
.solution-header {
  font-weight: 700;
  color: #002B49;
  font-size: 8pt;
  margin-top: 2.5mm;
  margin-bottom: 1.5mm;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-top: 1px dashed #cbd5e1;
  padding-top: 2mm;
}

/* Formulas */
.formula-display {
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  padding: 5pt 8pt;
  margin: 3mm 0;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.semantic-emphasis { border-bottom: 1px solid currentColor; border-radius: 2px; padding: 0 2px; font-weight: 600; }
.semantic-label { font-size: 7pt; font-weight: 700; letter-spacing: .04em; margin-right: 3px; text-transform: uppercase; }
.semantic-remember { background: #ecfdf3; color: #166534; }
.semantic-avoid { background: #fff1f2; color: #9f1239; }
.semantic-caution { background: #fffbeb; color: #92400e; }
.semantic-definition { background: #eff6ff; color: #1d4ed8; }
.semantic-formula { background: #f5f3ff; color: #6d28d9; }
.katex-display {
  margin: 0;
  overflow: visible;
  text-align: center;
}
.katex {
  font-family: "DejaVu Serif", serif;
  font-size: 1.05em;
}
.inline-code {
  background: #f1f5f9;
  color: #b94c16;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 8.5pt;
  font-family: monospace;
}
blockquote {
  margin: 3mm 0;
  padding: 2mm 4mm;
  border-left: 3px solid #002B49;
  background: #f8fafc;
  color: #475569;
  font-style: italic;
}

/* Print Container */
.diktat-container {
  position: relative;
  z-index: 1;
}
</style></head><body>
<!-- Watermark (Main Zyx SVG Logo repeated on every page) -->
<div class="diktat-watermark" aria-hidden="true">
  ${ZYX_MAIN_LOGO_SVG}
</div>

<!-- Running Header (Repeated on every page) -->
<header class="diktat-running-header" aria-hidden="true">
  <div class="running-header-left">
    <span class="brand-text">Zyx Academy</span>
    <span class="brand-sep">·</span>
    <span class="doc-type">Diktat Belajar</span>
  </div>
  <div class="running-header-right">${safeTitle}</div>
</header>

<!-- Running Footer (Repeated on every page) -->
<footer class="diktat-running-footer">
  ${DIKTAT_CONTACT_FOOTER_HTML}
</footer>

<main class="diktat-container">
  <div class="diktat-cover-header">
    <div class="cover-eyebrow">
      <span class="eyebrow-badge">Zyx</span>
      <span class="eyebrow-type">Diktat Belajar Mandiri</span>
    </div>
    <h1 class="cover-title">${safeTitle}</h1>
    <div class="cover-meta-bar">
      <span>Ringkasan Materi & Persiapan Ujian</span>
      <span>·</span>
      <span>Standar Kompetensi Mandiri</span>
    </div>
  </div>
  <div class="content">${renderedContent}</div>
</main></body></html>`;
}

export async function renderProductDiktatPdf(
  html: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const rendererUrl = process.env.DIKTAT_RENDERER_URL;
  const rendererSecret = process.env.DIKTAT_RENDERER_SECRET;
  if (!rendererUrl || !rendererSecret) {
    throw new Error("PRODUCT_DIKTAT_RENDERER_CONFIG_MISSING");
  }
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${rendererUrl}/render`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rendererSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ html, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, footerTemplate: PRODUCT_DIKTAT_FOOTER_TEMPLATE }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new Error("PRODUCT_DIKTAT_RENDERER_UNAVAILABLE", { cause: error });
  }
  if (response.status >= 500) throw new Error("PRODUCT_DIKTAT_RENDERER_UNAVAILABLE");
  if (!response.ok) throw new Error(`PRODUCT_DIKTAT_RENDERER_REJECTED:${response.status}`);
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
