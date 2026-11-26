import { appendArticleMarkdownScope } from "../coding/article-markdown-scope";
import { articleBlockContentScope, articleBlockScope, renderMarkdownCodeActions, typedArticleMarkdownScope } from "../coding/native-article-parts";
import { interactiveMarkdown } from "../materials/interactive-document-display";
import type { InteractiveDocumentSpec } from "../materials/interactive-document";
import type { ArticleField } from "../materials/interactive-document-path";
import { articleCaseLatex, type ArticlePart } from "../materials/article-parts";
import type { PublicArticleReadModel, PublicVisualSpec } from "../articles/structured-read-model";
import {
  escapeHtml,
  renderOfflineMarkdownHtml,
  renderOfflineMath,
  renderOfflineVisualHtml,
  renderOfflineWorkedExampleHtml,
  type OfflineRenderOptions,
} from "./offline-snapshot-renderer";

export interface NativeOfflineSection {
  id?: string;
  slug?: string;
  heading: string;
  headingHtml?: string;
  body: string;
  bodyHtml?: string;
}

function cleanOfflineMarkdown(raw: string): string {
  return raw
    .replace(/\n*<!--__ZYX_V3_ARTICLE_VISUALS__:[A-Za-z0-9_-]+-->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function collectVisualMap(
  articleVisuals?: PublicVisualSpec[],
  sectionVisuals?: PublicVisualSpec[],
  blockVisuals?: PublicVisualSpec[],
): Map<string, PublicVisualSpec> {
  const map = new Map<string, PublicVisualSpec>();
  for (const list of [articleVisuals, sectionVisuals, blockVisuals]) {
    if (!list) continue;
    for (const v of list) {
      if (v?.id) map.set(v.id, v);
    }
  }
  return map;
}

type ReadingSource = {
  kind: "structured_article" | "course_material";
  article?: Pick<PublicArticleReadModel, "sections" | "visuals">;
  material?: { body?: string };
  locale?: "id" | "en";
};

export type ReadingVisualLocation = Pick<ArticleField, "sectionId" | "blockId" | "partId" | "field">;
export type ReaderFocus = { sectionId: string; blockId: string; partId?: string; elementId?: string };
export const readingFocusAnchor = "reading-search-result";
export type RenderReadingVisualAction = (spec: InteractiveDocumentSpec, location: ReadingVisualLocation) => string;

/** Shared by the browser, Capacitor snapshot and Expo's local-only reading surface. */
export function buildOfflineReadingSections(record: ReadingSource, options?: OfflineRenderOptions, section?: string,
  renderCodingAction?: (partId: string) => string, renderVisualAction?: RenderReadingVisualAction, focus?: ReaderFocus): NativeOfflineSection[] {
  const markdown = (value: string) => renderOfflineMarkdownHtml(value, options);
  const scopedOptions = (raw: string, scope?: string): OfflineRenderOptions | undefined => renderCodingAction && scope
    ? { ...options, renderCodeAction: renderMarkdownCodeActions(raw, scope, renderCodingAction) } : options;
  const scopedMarkdown = (raw: string, scope: string) => renderOfflineMarkdownHtml(cleanOfflineMarkdown(raw), scopedOptions(raw, scope));
  const visualHtml = (visual: PublicVisualSpec, location?: ReadingVisualLocation) =>
    renderOfflineVisualHtml(visual, options) +
    (location && visual.kind === "interactive_document" ? renderVisualAction?.(visual, location) ?? "" : "");
  const locatedMarkdown = (raw: string, location: ReadingVisualLocation, scope: string) => {
    const value = cleanOfflineMarkdown(raw);
    const renderOptions = scopedOptions(raw, scope);
    return renderVisualAction
      ? interactiveMarkdown(value).map(part => typeof part === "string" ? renderOfflineMarkdownHtml(part, renderOptions) : visualHtml(part, location)).join("")
      : renderOfflineMarkdownHtml(value, renderOptions);
  };
  const sections: NativeOfflineSection[] = [];
  let focused = false;
  function anchor(parts: string[], start: number) {
    if (start === parts.length) return;
    const html = parts.splice(start).join("\n");
    parts.push(`<div id="${readingFocusAnchor}">${html}</div>`);
    focused = true;
  }

  function renderMathUnit(part: Extract<ArticlePart, { kind: "math_unit" }>, match?: string) {
    const rows = part.relations ?? [];
    const cases = articleCaseLatex(part);
    return [
      ...(part.symbolDefinitions ?? []).flatMap(symbol => [
        renderOfflineMath(symbol.latex), markdown(symbol.meaningMarkdown),
        symbol.conditionsMarkdown ? markdown(symbol.conditionsMarkdown) : "",
      ]),
      renderOfflineMath(cases ?? part.latex ?? "", true),
      ...rows.flatMap(row => {
        const rendered = [
          cases ? "" : renderOfflineMath(row.latex, true),
          row.conditionLatex && !cases ? renderOfflineMath(row.conditionLatex) : "",
          markdown(row.meaningMarkdown), row.conditionsMarkdown ? markdown(row.conditionsMarkdown) : "",
        ];
        if (row.id === match && !focused) anchor(rendered, 0);
        return rendered;
      }),
      markdown(part.meaningMarkdown), part.conditionsMarkdown ? markdown(part.conditionsMarkdown) : "",
    ].join("\n");
  }

  if (record.kind === "structured_article" && record.article) {
    const selected = section && record.article.sections.find(item => item.id === section || item.slug === section);
    for (const sec of record.article.sections) {
      if (selected && sec !== selected) continue;
      const parts: string[] = [];
      const htmlParts: string[] = [];

      if (sec.learningObjective?.trim()) {
        const obj = sec.learningObjective.trim();
        parts.push(obj);
        htmlParts.push(`<div class="offline-objective">${markdown(obj)}</div>`);
      }

      const hasBlockParts = (sec.blocks ?? []).some((b) => Boolean(b.parts?.length));
      if (!hasBlockParts && sec.visuals?.length) {
        for (const visual of sec.visuals) {
          const requirement = sec.pedagogy?.visualRequirement;
          const location = requirement?.status === "required" && requirement.visualIds?.includes(visual.id)
            ? { sectionId: sec.id, field: "section_visual" as const } : undefined;
          htmlParts.push(visualHtml(visual, location));
        }
      }

      for (const [blockIndex, block] of (sec.blocks ?? []).entries()) {
        const targetBlock = !focused && focus !== undefined && sec.id === focus.sectionId && block.id === focus.blockId;
        const blockStart = htmlParts.length;
        const sourceScope = articleBlockScope(sec.id, block, blockIndex);
        const visualMap = collectVisualMap(record.article.visuals, sec.visuals, block.visuals);
        const renderedVisualIds = new Set<string>();

        if (block.title?.trim()) {
          parts.push(`### ${block.title.trim()}`);
          htmlParts.push(markdown(`### ${block.title.trim()}`));
        }

        if (block.parts?.length) {
          for (const part of block.parts) {
            const partStart = htmlParts.length;
            const targetPart = targetBlock && focus?.partId === part.id;
            const elementId = targetPart ? focus?.elementId : undefined;
            if (part.kind === "visual_ref") {
              const vis = visualMap.get(part.visualId);
              if (vis) {
                renderedVisualIds.add(vis.id);
                htmlParts.push(visualHtml(vis, { sectionId: sec.id, blockId: block.id, partId: part.id, field: "visual_ref" }));
              }
            } else if (part.kind === "math_unit") {
              htmlParts.push(renderMathUnit(part, elementId));
            } else if (part.kind === "worked_example") {
              const exampleScope = appendArticleMarkdownScope(sourceScope, part.id);
              htmlParts.push(markdown(`### ${part.title}`), scopedMarkdown(part.problemMarkdown, appendArticleMarkdownScope(exampleScope, "problem")));
              for (const step of part.steps) {
                const stepStart = htmlParts.length;
                const stepScope = appendArticleMarkdownScope(exampleScope, `step:${step.id}`);
                htmlParts.push(scopedMarkdown(step.operationMarkdown, appendArticleMarkdownScope(exampleScope, `step:${step.id}:operation`)),
                  scopedMarkdown(step.reasonMarkdown, appendArticleMarkdownScope(exampleScope, `step:${step.id}:reason`)));
                if (step.conditionsMarkdown) htmlParts.push(scopedMarkdown(step.conditionsMarkdown, appendArticleMarkdownScope(exampleScope, `step:${step.id}:conditions`)));
                for (const leaf of step.parts) {
                  const leafStart = htmlParts.length;
                  if (leaf.kind === "markdown") htmlParts.push(locatedMarkdown(leaf.markdown,
                    { sectionId: sec.id, blockId: block.id, partId: leaf.id, field: "markdown" }, typedArticleMarkdownScope(stepScope, leaf.id)));
                  if (leaf.kind === "math_unit") htmlParts.push(renderMathUnit(leaf, elementId));
                  if (leaf.kind === "visual_ref") { const vis = visualMap.get(leaf.visualId); if (vis) { renderedVisualIds.add(vis.id); htmlParts.push(visualHtml(vis, { sectionId: sec.id, blockId: block.id, partId: leaf.id, field: "visual_ref" })); } }
                  if (!focused && elementId === leaf.id) anchor(htmlParts, leafStart);
                }
                if (!focused && elementId === step.id) anchor(htmlParts, stepStart);
              }
              htmlParts.push(scopedMarkdown(part.verificationMarkdown, appendArticleMarkdownScope(exampleScope, "verification")));
            } else if (part.kind === "code_example") {
              htmlParts.push(`<pre><code>${escapeHtml(part.code)}</code></pre>`);
              if (part.runnable && renderCodingAction) htmlParts.push(renderCodingAction(part.id));
            } else if (part.kind === "coding_exercise") {
              htmlParts.push(renderCodingAction?.(part.id) ||
                markdown(record.locale === "en" ? "Coding practice requires a connection." : "Latihan kode perlu koneksi."));
            } else if ("content" in part && typeof part.content === "string") {
              const cleanedPart = cleanOfflineMarkdown(part.content);
              if (cleanedPart) {
                parts.push(cleanedPart);
                htmlParts.push(markdown(cleanedPart));
              }
            } else if ("markdown" in part && typeof part.markdown === "string") {
              const cleanedPart = cleanOfflineMarkdown(part.markdown);
              if (cleanedPart) {
                parts.push(cleanedPart);
                htmlParts.push(part.kind === "markdown" ? locatedMarkdown(part.markdown, { sectionId: sec.id, blockId: block.id, partId: part.id, field: "markdown" },
                  typedArticleMarkdownScope(sourceScope, part.id))
                  : markdown(cleanedPart));
              }
            }
            if (targetPart && !focused) anchor(htmlParts, partStart);
          }
        } else {
          const cleaned = cleanOfflineMarkdown(block.content ?? "");
          if (cleaned) {
            parts.push(cleaned);
            htmlParts.push(locatedMarkdown(block.content, { sectionId: sec.id, blockId: block.id, field: "content" }, articleBlockContentScope(sourceScope, block)));
          }
        }

        if (block.workedExample?.steps?.length) {
          const stepLines = block.workedExample.steps.map(
            (step) => `${step.stepIndex + 1}. ${step.label}: ${step.explanation}`,
          );
          if (block.workedExample.verification?.trim()) {
            stepLines.push(block.workedExample.verification.trim());
          }
          parts.push(stepLines.join("\n"));
          htmlParts.push(renderOfflineWorkedExampleHtml(block.workedExample, options,
            renderCodingAction && block.blockType === "worked_example"
              ? (value, field) => scopedMarkdown(value, appendArticleMarkdownScope(sourceScope, field))
              : undefined));
        }

        for (const visual of block.visuals ?? []) {
          if (!renderedVisualIds.has(visual.id)) {
            htmlParts.push(visualHtml(visual));
          }
        }
        if (targetBlock && !focused) anchor(htmlParts, blockStart);
      }

      const body = parts.join("\n\n").trim();
      const bodyHtml = htmlParts.filter(Boolean).join("\n").trim();
      if (body || bodyHtml) {
        const headingHtml = sec.title
          ? markdown(sec.title).replace(/^<p>|<\/p>$/g, "")
          : "";
        sections.push({
          id: sec.id,
          slug: sec.slug,
          heading: sec.title,
          headingHtml,
          body,
          bodyHtml,
        });
      }
    }
  } else if (record.material?.body) {
    const cleaned = cleanOfflineMarkdown(record.material.body);
    if (cleaned) {
      sections.push({
        heading: "",
        body: cleaned,
        bodyHtml: markdown(cleaned),
      });
    }
  }

  return sections;
}
