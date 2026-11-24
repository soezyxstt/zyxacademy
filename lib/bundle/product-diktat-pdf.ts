import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import katex from "@/lib/math/katex";
import { splitScientificText } from "@/lib/math/text-segments";
import { isValidHttpUrl } from "@/lib/links";
import { legacyArticlePublicBlocks } from "@/lib/materials/legacy-article-public";
import type { ProductEntity } from "./product-validator";
import { materializeAuthoredDiktat, validateAuthoredDiktat } from "@/lib/materials/diktat-v4";
import { renderDiktatStaticVisual, type DiktatSourceFigureAssets } from "@/lib/materials/diktat-static-visual";


import { PRODUCT_DIKTAT_RENDERER_VERSION, PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/materials/diktat-renderer-policy";
export { PRODUCT_DIKTAT_RENDERER_VERSION, PRODUCT_DIKTAT_PRINT_PROFILE };

/** Resolves the KaTeX `dist` directory without letting Turbopack rewrite `require.resolve` to a numeric module ID. */
function resolveKatexDistDir(): string {
  const pkgName = ["ka", "tex"].join("");
  for (const base of [import.meta.url, path.join(process.cwd(), "package.json")]) {
    try {
      const require = createRequire(base);
      const resolved = require.resolve(pkgName);
      if (typeof resolved === "string") {
        const dir = path.dirname(resolved);
        if (existsSync(path.join(dir, "katex.min.css"))) {
          return dir;
        }
      }
    } catch {
      // Fall back to the next resolution root when running in bundled lambdas or outside repo cwd.
    }
  }
  const cwdDistDir = path.join(process.cwd(), "node_modules", "katex", "dist");
  if (existsSync(path.join(cwdDistDir, "katex.min.css"))) {
    return cwdDistDir;
  }
  throw new Error("KATEX_ASSETS_NOT_FOUND");
}

export function buildSelfContainedKatexCss(): string {
  const distDir = resolveKatexDistDir();
  const rawCss = readFileSync(path.join(distDir, "katex.min.css"), "utf8");
  return rawCss.replace(/url\(fonts\/(KaTeX_[^)]+\.woff2)\) format\("woff2"\)(?:,url\([^)]+\) format\("[^"]+"\))*/g, (_match, filename) => {
    const font = readFileSync(path.join(distDir, "fonts", filename)).toString("base64");
    return `url("data:font/woff2;base64,${font}") format("woff2")`;
  });
}

let cachedKatexCss: string | null = null;

function getKatexCss(): string {
  cachedKatexCss ??= buildSelfContainedKatexCss();
  return cachedKatexCss;
}

type ArticleProduct = Extract<ProductEntity, { productType: "article" }>;
type DiktatProduct = Extract<ProductEntity, { productType: "diktat" }>;

export interface ProductDiktatRenderSource {
  article?: ArticleProduct;
  diktat: DiktatProduct;
  staticFigureAssets?: DiktatSourceFigureAssets;
}

export interface InspectedPdf {
  pageCount: number;
  text: string;
}

export { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";

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

export const PRODUCT_DIKTAT_FOOTER_TEMPLATE = `<div style="width:100%;margin:0 12mm;font-family:Arial,sans-serif;font-size:8px;color:#334b78;border-top:1px solid #b9c5d2;padding-top:5px;display:flex;justify-content:space-between;white-space:nowrap">${DIKTAT_CONTACT_FOOTER_HTML}<span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

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
  const { article, diktat } = source;
  const visuals = article?.visuals ?? diktat.visuals ?? [];
  if ((article?.schemaVersion === "article.v4" || !article) && !diktat.units) throw new Error("DIKTAT_UNITS_REQUIRED");
  if (diktat.sourceArticleId && (!article || diktat.sourceArticleId !== article.id || diktat.sourceArticleVersion !== article.version || diktat.sourceArticleHash !== article.generationHash)) {
    throw new Error("PRODUCT_DIKTAT_LINEAGE_MISMATCH");
  }
  if (diktat.units) {
    const errors = validateAuthoredDiktat(article, diktat);
    if (errors.length) throw new Error(errors.join(":"));
  }
  const title = escapeHtml(source.diktat.title);
  const markdown = source.diktat.units ? materializeAuthoredDiktat(source.diktat.units) : source.diktat.contentMarkdown;
  const content = source.diktat.units
    ? source.diktat.units.map((unit) => `<section class="diktat-unit">${unit.parts.map((part) => {
      if (part.kind === "visual_ref") {
        const visual = visuals.find((visual) => visual.id === part.visualId);
        if (!visual) throw new Error("DIKTAT_VISUAL_SOURCE_MISSING");
        return renderDiktatStaticVisual(visual, source.staticFigureAssets) + parseCanonicalDiktatMarkdownToHtml(part.staticMarkdown, source.diktat.title);
      }
      const markerMap = new Map<string, string>();
      const markdown = withoutRepeatedDocumentHeading(materializeAuthoredDiktat([{ ...unit, parts: [part] }])).replace(/<!-- visual:([^>]+) -->/g, (_marker, id: string) => {
        const visual = visuals.find((visual) => visual.id === id);
        if (!visual) throw new Error("DIKTAT_VISUAL_SOURCE_MISSING");
        const token = `ZYXSTATICVISUAL${markerMap.size}TOKEN`;
        markerMap.set(token, renderDiktatStaticVisual(visual, source.staticFigureAssets));
        return `\n\n${token}\n\n`;
      });
      let html = parseCanonicalDiktatMarkdownToHtml(markdown, source.diktat.title);
      for (const [token, visualHtml] of markerMap) html = html.replace(`<p>${token}</p>`, visualHtml);
      return html;
    }).join("\n")}</section>`).join("\n")
    : parseCanonicalDiktatMarkdownToHtml(withoutRepeatedDocumentHeading(markdown), source.diktat.title);
  if (source.diktat.units && content.includes('class="katex-error"')) throw new Error("DIKTAT_MATH_RENDER_INVALID");

  return diktatPrintShell(title, content);
}

/** Shared Diktat presentation for authored bundles and Admin PDF regeneration. */
function diktatPrintShell(title: string, content: string): string {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>${getKatexCss()}
${WATERMARK_CSS}
@page { size: A4; margin: 9mm 12mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; background: #fff; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.38; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.diktat, .diktat-running-header, .diktat-running-footer { position: relative; z-index: 1; }
.diktat-running-header { display: flex; align-items: center; gap: 2mm; border-bottom: 1.5px solid #cf5127; padding-bottom: 2mm; margin-bottom: 4mm; color: #002B49; font-size: 9pt; font-weight: 700; }
.diktat-running-header svg { width: 7mm; height: 4.1mm; }
.diktat-header { background: #002B49; border-left: 4mm solid #cf5127; color: #fff; padding: 3mm 4mm; margin-bottom: 4mm; break-inside: avoid; break-after: avoid; }
h1 { color: #fff; font-size: 18pt; line-height: 1.2; margin: 0; overflow-wrap: anywhere; }
.diktat { column-count: 1; }
.diktat-unit { margin: 0 0 4mm; padding: 3mm 4mm; background: rgba(241,244,249,.75); border-bottom: 1px solid #cbd5e1; break-inside: avoid; }
.section-h1, .section-h2 { color: #b64420; font-size: 12pt; line-height: 1.25; margin: 4mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #e5b3a1; break-after: avoid; }
.diktat-unit > :first-child { margin-top: 0; }
.section-h3, .section-h4 { color: #002B49; font-size: 10.8pt; line-height: 1.3; margin: 3mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2mm; }
ol, ul { margin: 0 0 2mm; padding-left: 5.5mm; }
li { margin-bottom: 1mm; padding-left: .5mm; break-inside: avoid; }
.pedagogical-card { background: rgba(241,244,249,.75); border-bottom: 1px solid #cbd5e1; padding: 3mm 4mm; margin: 0 0 3mm; }
.diktat-unit .pedagogical-card { background: none; padding: 0; border: 0; }
.card-trap { border-left: 2px solid #cf5127; background: rgba(253,240,234,.75); }
.formula-display { margin: 2mm 0; text-align: center; break-inside: avoid; }
.katex-display { margin: 0; overflow: visible; }
.katex { font-size: 1.05em; }
.formula-list { display: grid; gap: 1.5mm; margin: 2mm 0; break-inside: avoid; }
.formula-item { min-width: 0; }
.formula-item .formula-display { margin: 0; }
.semantic-emphasis, .semantic-label { font-weight: 700; }
.semantic-label { margin-right: 3px; }
.semantic-caution, .semantic-avoid { color: #a13718; }
.diktat-divider { border: 0; border-top: 1px solid #cbd5e1; margin: 3mm 0; }
.diktat-page-break { break-before: page; page-break-before: always; column-span: all; }
.table-container { margin: 2mm 0; break-inside: avoid; }
.diktat-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.diktat-table th, .diktat-table td { border-bottom: 1px solid #cbd5e1; padding: 1.5mm 2mm; vertical-align: top; }
.diktat-table th { background: #e8edf5; color: #002B49; text-align: left; }
.diktat-static-visual { margin: 3mm 0; break-inside: avoid; }
.diktat-static-visual figcaption { color: #002B49; font-weight: 700; margin-bottom: 1.5mm; }
.diktat-static-visual > svg, .diktat-static-visual img { display: block; max-width: 100%; height: auto; }
.misconception-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin: 2mm 0; break-inside: avoid; }
.box-misconception, .box-correction { padding: 2mm; border-left: 2px solid #cf5127; }
.box-correction { border-color: #26704b; }
.label-wrong, .label-correct, .solution-header, .example-badge, .step-badge { font-weight: 700; }
.label-wrong { color: #a13718; }
.label-correct { color: #26704b; }
.example-header, .solution-header { margin: 2mm 0 1mm; }
.example-badge { color: #002B49; margin-right: 1.5mm; }
.inline-code { font-family: monospace; }
.article-print-link, .article-print-destination { overflow-wrap: anywhere; }
.article-print-link, .diktat-running-footer a { color: inherit; text-decoration: underline; }
.diktat-running-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2mm; border-top: 1px solid #cbd5e1; margin-top: 4mm; padding-top: 2mm; color: #64748b; font-size: 7pt; }
@media print { .diktat-running-footer { display: none; } }
@media screen { body { max-width: 186mm; margin: 0 auto; padding: 4mm; } }
@media screen and (max-width: 600px) { .diktat-header { padding: 3mm; } .diktat-unit, .pedagogical-card { padding: 2mm; } .misconception-grid { grid-template-columns: 1fr; } }
</style></head><body>
<div class="diktat-watermark" aria-hidden="true">${ZYX_MAIN_LOGO_SVG}</div>
<header class="diktat-running-header">${ZYX_MAIN_LOGO_SVG}<span>Zyx Academy</span></header>
<main class="diktat"><header class="diktat-header"><h1>${title}</h1></header>${content}</main>
<footer class="diktat-running-footer">${DIKTAT_CONTACT_FOOTER_HTML}</footer>
</body></html>`;
}

/** Retains the existing two-column legacy Article export. */
function productPrintShell(title: string, content: string, label: string): string {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>${getKatexCss()}
${WATERMARK_CSS}
@page { size: A4; margin: 9mm 12mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.38; }
.diktat { position: relative; z-index: 1; }
.diktat-header { border-bottom: 1px solid #b9c5d2; margin-bottom: 3mm; padding-bottom: 2mm; }
.eyebrow { color: #b94c16; font-size: 7pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
h1 { color: #172033; font-size: 15pt; line-height: 1.2; margin: 1mm 0 0; }
.diktat { column-count: 2; column-gap: 7mm; }
.diktat-unit { break-inside: avoid; }
.diktat-unit p { margin-bottom: 1mm; }
.diktat-static-visual { break-inside: avoid; margin: 2mm 0; }
.diktat-static-visual figcaption { font-weight: 700; margin-bottom: 1mm; }
.diktat:has(.diktat-unit) .diktat-header { column-span: all; }

@media screen { .diktat { padding-top: 2mm; } }
@media screen and (max-width: 600px) { .diktat { column-count: 1; } }
.section-h1, .section-h2 { color: #172033; font-size: 12pt; line-height: 1.2; margin: 3mm 0 1mm; break-after: avoid; }
.section-h3, .section-h4 { font-size: 10.8pt; margin: 2mm 0 .7mm; break-after: avoid; }
p { margin: 0 0 1.4mm; }
ol, ul { margin: 0 0 1.6mm; padding-left: 5.5mm; }
li { margin-bottom: .8mm; padding-left: .5mm; }
.pedagogical-card { display: contents; }
.formula-display { margin: 1mm 0 1.2mm; text-align: left; break-inside: avoid; }
.katex-display { margin: 0; overflow: visible; text-align: left; }
.formula-list { display: grid; gap: .6mm; margin: 1.4mm 0 2mm; padding-left: 1mm; break-inside: avoid; }
.formula-item { min-width: 0; }
.formula-item .formula-display { display: block; margin: 0; }
.katex { font-size: 1.05em; }
.semantic-emphasis { font-weight: 600; }
.semantic-label { font-weight: 700; margin-right: 3px; }
.semantic-caution { color: inherit; }
.diktat-divider { border: 0; border-top: 1px solid #d9dee8; margin: 2mm 0; }
.diktat-page-break { break-before: page; page-break-before: always; column-span: all; }
.table-container { break-inside: avoid; margin: 1.5mm 0; }
.diktat-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.diktat-table th, .diktat-table td { border: 1px solid #d9dee8; padding: 1mm; }
.misconception-grid { margin: 1.5mm 0; }
.label-wrong, .label-correct, .solution-header, .example-badge, .step-badge { font-weight: 700; }
.example-header, .solution-header { margin: 1.5mm 0 .5mm; }
.inline-code { font-family: monospace; }
.article-print-link, .article-print-destination { overflow-wrap: anywhere; }
.article-print-link { color: inherit; text-decoration: underline; }
</style></head><body>
<div class="diktat-watermark" aria-hidden="true">${ZYX_MAIN_LOGO_SVG}</div>

<main class="diktat"><header class="diktat-header"><span class="eyebrow">${label}</span><h1>${title}</h1></header>${content}</main></body></html>`;
}

/** Print the learner-visible legacy Article itself, without creating a Diktat. */
export function compileProductArticleHtml(article: ArticleProduct): string {
  if (/\.v[45]$/.test(article.schemaVersion)) throw new Error("PRODUCT_ARTICLE_LEGACY_REQUIRED");
  const sorted = <T extends { orderIndex: number; id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  const markdown = (value: string) => {
    // The local browser cannot fetch external media. Refuse rather than silently
    // print a URL or omit an authored image or embedded HTML.
    const html = parseCanonicalDiktatMarkdownToHtml(value, "", { preserveText: true });
    if (html.includes('class="katex-error"')) throw new Error("PRODUCT_ARTICLE_MATH_RENDER_INVALID");
    return html;
  };
  const visual = (id: string) => {
    const source = article.visuals?.find(item => item.id === id);
    if (!source) throw new Error("PRODUCT_ARTICLE_PRINT_VISUAL_MISSING");
    return renderDiktatStaticVisual(source);
  };
  const blockContent = (content: string, worked?: ArticleProduct["sections"][number]["blocks"][number]["workedExamplePayload"], formative?: ArticleProduct["sections"][number]["blocks"][number]["formativeCheckPayload"]) => [
    markdown(content),
    ...(worked ? sorted(worked.steps.map(step => ({ ...step, orderIndex: step.stepIndex, id: String(step.stepIndex) }))).map(step => markdown(`### ${step.label}\n\n${step.explanation}\n\n${step.reason}`)).concat(markdown(`### Verifikasi\n\n${worked.verification}`)) : []),
    // Formative answers, correctness and feedback remain behind their existing
    // evaluation boundary; the visible options are part of the prompt.
    ...(formative?.options?.map(option => markdown(`- ${option.text}`)) ?? []),
    ...(formative?.evaluation?.mode === "numeric" && formative.evaluation.unit ? [markdown(`Satuan: ${formative.evaluation.unit}`)] : []),
  ].join("\n");
  let content: string;
  if (article.blocks.length && !article.sections.length) {
    const projected = legacyArticlePublicBlocks(article.blocks);
    content = sorted(article.blocks).map((block, index) => {
      try {
        const embedded: unknown = JSON.parse(block.content);
        if (embedded && typeof embedded === "object" && "content" in embedded && typeof embedded.content === "string") {
          const metadata = embedded as { assets?: unknown; visualIds?: unknown };
          if ((metadata.assets && (!Array.isArray(metadata.assets) || metadata.assets.length)) || (metadata.visualIds && (!Array.isArray(metadata.visualIds) || metadata.visualIds.length))) throw new Error("PRODUCT_ARTICLE_PRINT_MEDIA_UNSUPPORTED");
        } else if (embedded && typeof embedded === "object" && !Array.isArray(embedded)) throw new Error("PRODUCT_ARTICLE_PRINT_BLOCK_INVALID");
      } catch (error) {
        if (error instanceof SyntaxError) { /* Plain Markdown is valid V2 content. */ }
        else throw error;
      }
      return `<section class="diktat-unit">${markdown(projected[index])}</section>`;
    }).join("\n");
  } else if (article.sections.length && !article.blocks.length) {
    content = sorted(article.sections).map(section => {
      const seen = new Set<string>();
      const blockVisualIds = new Set(section.blocks.flatMap(block => block.visualIds ?? []));
      const sectionVisuals = section.pedagogy?.visualRequirement.status === "required"
        ? section.pedagogy.visualRequirement.visualIds.filter(id => !blockVisualIds.has(id) && !seen.has(id)).map(id => { seen.add(id); return visual(id); }).join("\n") : "";
      const blocks = sorted(section.blocks).map(block => {
        if (block.parts) throw new Error("PRODUCT_ARTICLE_LEGACY_REQUIRED");
        const visuals = (block.visualIds ?? []).filter(id => !seen.has(id)).map(id => { seen.add(id); return visual(id); }).join("\n");
        return `<section class="diktat-unit">${block.title ? markdown(`### ${block.title}`) : ""}${blockContent(block.contentMarkdown, block.workedExamplePayload, block.formativeCheckPayload)}${visuals}</section>`;
      }).join("\n");
      return `${markdown(`## ${section.title}`)}${section.learningObjective ? markdown(section.learningObjective) : ""}${sectionVisuals}${blocks}`;
    }).join("\n");
  } else throw new Error("PRODUCT_ARTICLE_LEGACY_SHAPE_INVALID");
  return productPrintShell(escapeHtml(article.title), content, "Artikel");
}

/** Removes the leading Markdown title already printed in the document header. */
function withoutRepeatedDocumentHeading(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\r\n]+\r?\n/, "").trimStart();
}

/**
 * Parses canonical Markdown text into semantic HTML with KaTeX equations,
 * styled pedagogical cards, tables, and formatted lists.
 */
export function parseCanonicalDiktatMarkdownToHtml(markdown: string, documentTitle: string, options: { preserveText?: boolean } = {}): string {
  const mathMap = new Map<string, string>();
  const printDestinations = new Map<string, string>();
  const printUrls = new Map<string, string>();
  const inlineLinkPattern = /\[([^\]\n]*)\]\((<[^>\n]+>|(?:\\.|[^\s()\\]|\([^\s()]*\))+)(?:\s+"[^"\n]*")?\)/g;
  const protectDestination = (destination: string) => {
    const token = `%%ZYXPRINTDEST${printDestinations.size}%%`;
    printDestinations.set(token, destination);
    return token;
  };
  // URL punctuation is literal, including math delimiters. Restore it only after
  // math and inline formatting. Code keeps its original Markdown spelling too.
  const protectPrintLinks = () => {
    let result = "";
    let cursor = 0;
    const escaped = (position: number) => {
      let count = 0;
      while (position > 0 && markdown[--position] === "\\") count++;
      return count % 2 === 1;
    };
    while (cursor < markdown.length) {
      if (!escaped(cursor)) {
        const code = markdown[cursor] === "`" ? markdown.slice(cursor).match(/^`+/)?.[0] : undefined;
        const open = code ?? (["$$", "\\[", "\\("].find(delimiter => markdown.startsWith(delimiter, cursor)) ?? (markdown[cursor] === "$" ? "$" : undefined));
        if (open) {
          const close = code ?? (open === "\\[" ? "\\]" : open === "\\(" ? "\\)" : open);
          let end = cursor + open.length;
          while (end < markdown.length) {
            if (!code && open === "$" && markdown[end] === "\n") break;
            if (markdown.startsWith(close, end) && (code || !escaped(end)) && (close !== "$" || (markdown[end - 1] !== "$" && markdown[end + 1] !== "$")) && (!code || (markdown[end - 1] !== "`" && markdown[end + code.length] !== "`"))) break;
            end++;
          }
          if (end < markdown.length && markdown.startsWith(close, end)) {
            result += markdown.slice(cursor, end + close.length);
            cursor = end + close.length;
            continue;
          }
          if (code && code.length >= 3 && (cursor === 0 || markdown[cursor - 1] === "\n")) return result + markdown.slice(cursor);
        }
        if (markdown.startsWith("![", cursor) && /^!\[(.*?)\]\((.*?)\)/.test(markdown.slice(cursor))) throw new Error("PRODUCT_ARTICLE_PRINT_MEDIA_UNSUPPORTED");
        if (markdown[cursor] === "[") {
          inlineLinkPattern.lastIndex = cursor;
          const match = inlineLinkPattern.exec(markdown);
          if (match?.index === cursor) {
            const [source, label, href] = match;
            const token = protectDestination(href);
            result += (label === href ? `[${token}](` : source.slice(0, label.length + 3)) + token + source.slice(label.length + 3 + href.length);
            cursor += source.length;
            continue;
          }
        }
        if (markdown[cursor] === "<") {
          if (/^<\/?(?:img|video|audio|iframe|object|embed)(?:\s+[a-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/i.test(markdown.slice(cursor))) throw new Error("PRODUCT_ARTICLE_PRINT_MEDIA_UNSUPPORTED");
          const match = markdown.slice(cursor).match(/^<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+)>/);
          if (match) {
            result += `<${protectDestination(match[1])}>`;
            cursor += match[0].length;
            continue;
          }
        }
      }
      result += markdown[cursor++];
    }
    return result;
  };
  const protectedMarkdown = options.preserveText ? protectPrintLinks() : markdown;
  let tokenCounter = 0;

  function storeMath(latex: string, displayMode: boolean): string {
    const id = `%%ZYXMATH${tokenCounter++}%%`;
    let rendered = "";
    try {
      rendered = katex.renderToString(latex.trim(), {
        displayMode,
        throwOnError: true,
        output: options.preserveText ? "htmlAndMathml" : "html",
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

  const text = splitScientificText(protectedMarkdown).map((segment) => {
    if (segment.type === "math") return storeMath(segment.value, segment.display);
    if (segment.type === "text") return segment.value.replace(/\\\$/g, "$");
    const id = `%%ZYXMATH${tokenCounter++}%%`;
    mathMap.set(id, segment.display
      ? `<pre><code>${escapeHtml(segment.value)}</code></pre>`
      : `<code class="inline-code">${escapeHtml(segment.value)}</code>`);
    return id;
  }).join("");

  function formatInline(str: string): string {
    const links = new Map<string, string>();
    const link = (label: string, destination: string) => {
      const href = (printDestinations.get(destination) ?? destination).replace(/^<|>$/g, "").replace(/\\([()\\])/g, "$1");
      if (/[\u0000-\u0020\u007f\\]/.test(href) || !(isValidHttpUrl(href) || /^\/(?!\/)/.test(href) || /^#[^#]/.test(href) || /^mailto:[^@]+@[^@]+$/.test(href))) throw new Error("PRODUCT_ARTICLE_PRINT_LINK_UNSUPPORTED");
      if (isValidHttpUrl(href)) { const url = new URL(href); if (url.username || url.password) throw new Error("PRODUCT_ARTICLE_PRINT_LINK_UNSUPPORTED"); }
      const token = `%%ZYXPRINTLINK${links.size}%%`;
      const urlToken = `%%ZYXPRINTURL${printUrls.size}%%`;
      printUrls.set(urlToken, escapeHtml(href));
      const literalLabel = !label || label === destination || label === href;
      links.set(token, `<a class="article-print-link" href="${urlToken}">${literalLabel ? urlToken : formatInline(label)}</a>${!literalLabel ? `<span class="article-print-destination"> (${urlToken})</span>` : ""}`);
      return token;
    };
    const linked = options.preserveText ? str.replace(inlineLinkPattern, (_match, label: string, href: string) => link(label, href))
      .replace(/<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+|%%ZYXPRINTDEST\d+%%)>/g, (_match, href: string) => link(href, href)) : str;
    if (options.preserveText && (/\[[^\n]*\]\(/.test(linked) || /\[[^\]\n]*\]\[[^\]\n]*\]/.test(linked) || /^\s*\[[^\]\n]+\]:/.test(linked))) throw new Error("PRODUCT_ARTICLE_PRINT_LINK_UNSUPPORTED");
    const html = escapeHtml(linked)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    let formatted = applySemanticEmphasis(html);
    for (const [token, value] of links) formatted = formatted.replaceAll(token, value);
    return formatted;
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

    if (trimmed.toLowerCase() === "<!-- page-break -->") {
      closeCardIfOpen();
      out.push('<div class="diktat-page-break"></div>');
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
      !options.preserveText && trimmed.includes("Miskonsepsi:") &&
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
  for (const [placeholder, rendered] of printUrls) htmlResult = htmlResult.replaceAll(placeholder, rendered);
  for (const [placeholder, destination] of printDestinations) htmlResult = htmlResult.replaceAll(placeholder, escapeHtml(destination));

  return htmlResult;
}

/**
 * Compiles canonical diktat markdown and metadata into a complete, printable HTML document
 * with the shared Diktat layout, watermark and embedded KaTeX fonts.
 */
export function compileCanonicalDiktatHtml(title: string, markdown: string): string {
  const content = parseCanonicalDiktatMarkdownToHtml(withoutRepeatedDocumentHeading(markdown), title);
  return diktatPrintShell(escapeHtml(title), content);
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
