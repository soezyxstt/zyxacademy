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

/** Shared by the browser, Capacitor snapshot and Expo's local-only reading surface. */
export function buildOfflineReadingSections(record: ReadingSource, options?: OfflineRenderOptions, section?: string): NativeOfflineSection[] {
  const markdown = (value: string) => renderOfflineMarkdownHtml(value, options);
  const visualHtml = (visual: PublicVisualSpec) => renderOfflineVisualHtml(visual, options);
  const sections: NativeOfflineSection[] = [];

  function renderMathUnit(part: Extract<ArticlePart, { kind: "math_unit" }>) {
    const rows = part.relations ?? [];
    const cases = articleCaseLatex(part);
    return [
      ...(part.symbolDefinitions ?? []).flatMap(symbol => [
        renderOfflineMath(symbol.latex), markdown(symbol.meaningMarkdown),
        symbol.conditionsMarkdown ? markdown(symbol.conditionsMarkdown) : "",
      ]),
      renderOfflineMath(cases ?? part.latex ?? "", true),
      ...rows.flatMap(row => [
        cases ? "" : renderOfflineMath(row.latex, true),
        row.conditionLatex && !cases ? renderOfflineMath(row.conditionLatex) : "",
        markdown(row.meaningMarkdown), row.conditionsMarkdown ? markdown(row.conditionsMarkdown) : "",
      ]),
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
          htmlParts.push(visualHtml(visual));
        }
      }

      for (const block of sec.blocks ?? []) {
        const visualMap = collectVisualMap(record.article.visuals, sec.visuals, block.visuals);
        const renderedVisualIds = new Set<string>();

        if (block.title?.trim()) {
          parts.push(`### ${block.title.trim()}`);
          htmlParts.push(markdown(`### ${block.title.trim()}`));
        }

        if (block.parts?.length) {
          for (const part of block.parts) {
            if (part.kind === "visual_ref") {
              const vis = visualMap.get(part.visualId);
              if (vis) {
                renderedVisualIds.add(vis.id);
                htmlParts.push(visualHtml(vis));
              }
            } else if (part.kind === "math_unit") {
              htmlParts.push(renderMathUnit(part));
            } else if (part.kind === "worked_example") {
              htmlParts.push(markdown(`### ${part.title}`), markdown(part.problemMarkdown));
              for (const step of part.steps) {
                htmlParts.push(markdown(step.operationMarkdown), markdown(step.reasonMarkdown));
                if (step.conditionsMarkdown) htmlParts.push(markdown(step.conditionsMarkdown));
                for (const leaf of step.parts) {
                  if (leaf.kind === "markdown") htmlParts.push(markdown(leaf.markdown));
                  if (leaf.kind === "math_unit") htmlParts.push(renderMathUnit(leaf));
                  if (leaf.kind === "visual_ref") { const vis = visualMap.get(leaf.visualId); if (vis) { renderedVisualIds.add(vis.id); htmlParts.push(visualHtml(vis)); } }
                }
              }
              htmlParts.push(markdown(part.verificationMarkdown));
            } else if (part.kind === "code_example") {
              htmlParts.push(`<pre><code>${escapeHtml(part.code)}</code></pre>`);
            } else if (part.kind === "coding_exercise") {
              htmlParts.push(markdown(record.locale === "en" ? "Coding practice requires a connection." : "Latihan kode perlu koneksi."));
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
                htmlParts.push(markdown(cleanedPart));
              }
            }
          }
        } else {
          const cleaned = cleanOfflineMarkdown(block.content ?? "");
          if (cleaned) {
            parts.push(cleaned);
            htmlParts.push(markdown(cleaned));
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
          htmlParts.push(renderOfflineWorkedExampleHtml(block.workedExample, options));
        }

        for (const visual of block.visuals ?? []) {
          if (!renderedVisualIds.has(visual.id)) {
            htmlParts.push(visualHtml(visual));
          }
        }
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
