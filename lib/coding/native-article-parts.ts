import type { ASTBlock } from "../ast-validator";
import { compileMarkdown } from "../markdown-compiler";
import { appendArticleMarkdownScope, markdownPythonId } from "./article-markdown-scope";
import { articlePartsSchema, flattenArticleParts, type ArticlePart } from "../materials/article-parts";

type CodingPart = Extract<ArticlePart, { kind: "code_example" | "coding_exercise" }>;
type Entry = { part: CodingPart; title?: string; namespace?: "markdown-example" };
type Block = { id: string; parts?: unknown; title?: unknown; content?: string; blockType?: string; workedExample?: unknown; formativeCheck?: unknown };

function nestedMarkdown(block: ASTBlock): [field: string, markdown: string | undefined][] {
  switch (block.type) {
    case "concept": return [["body", block.content.bodyMarkdown]];
    case "formula": return [["interpretation", block.content.interpretation]];
    case "engineering_insight": return [["application", block.content.applicationMarkdown]];
    case "example": return [["problem", block.content.problemStatement], ...block.content.solutionSteps.map(
      (step, index): [string, string] => [`step:${index}`, step.explanationMarkdown],
    )];
    case "misconception": return [["correction", block.content.correctionMarkdown], ["rationale", block.content.physicalRationaleMarkdown]];
    case "exercise": return [["question", block.content.questionMarkdown]];
    case "summary": return block.content.bullets.map((bullet, index) => [`bullet:${index}`, bullet]);
    default: return [];
  }
}

function markdownExamples(source: unknown, parent: string, depth = 0): Entry[] {
  if (typeof source !== "string" || depth >= 12 || !/```(?:python|py)\b/i.test(source) || /<!--[\s\S]*?```[\s\S]*?-->/.test(source)) return [];
  try {
    return compileMarkdown(source).ast.blocks.flatMap(block => {
      const scope = appendArticleMarkdownScope(parent, block.id);
      if (block.type !== "code") return nestedMarkdown(block).flatMap(([field, raw]) =>
        markdownExamples(raw, appendArticleMarkdownScope(scope, field), depth + 1));
      if (!["python", "py"].includes(block.language?.toLowerCase() ?? "") || block.content.length > 64_000) return [];
      const id = markdownPythonId(scope, block.id);
      return [{ part: { id, kind: "code_example", language: "python", code: block.content, runnable: true }, namespace: "markdown-example" }];
    });
  } catch { return []; }
}

export function articleBlockScope(sectionId: string, block: Block, index: number) {
  return appendArticleMarkdownScope(null, JSON.stringify([sectionId, block.id || index]));
}

export function articleBlockContentScope(scope: string, block: Block) {
  const wrapped = (block.blockType === "worked_example" && block.workedExample) ||
    ((block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close") && block.formativeCheck);
  return wrapped ? appendArticleMarkdownScope(scope, "content") : scope;
}

export function typedArticleMarkdownScope(parent: string, id: string) {
  return appendArticleMarkdownScope(appendArticleMarkdownScope(parent, id), "markdown");
}

export function renderMarkdownCodeActions(raw: string, scope: string, render: (id: string) => string) {
  const bySource = new Map<string, string[]>();
  for (const { part } of markdownExamples(raw, scope)) {
    if (part.kind !== "code_example") continue;
    const keys = bySource.get(part.code) ?? [];
    keys.push(part.id);
    bySource.set(part.code, keys);
  }
  return (source: string, language: string) => {
    if (!["python", "py"].includes(language.toLowerCase())) return "";
    const id = bySource.get(source)?.shift();
    return id === undefined ? "" : render(id);
  };
}

export function sectionCodingParts(blocks: readonly Block[], sectionId?: string) {
  const entries = new Map<string, Entry | null>();
  for (const [index, block] of blocks.entries()) {
    const sourceScope = sectionId ? articleBlockScope(sectionId, block, index) : null;
    const parsed = articlePartsSchema.safeParse(block.parts);
    const candidates: Entry[] = [];
    if (parsed.success && parsed.data.length > 0) {
      for (const part of flattenArticleParts(parsed.data)) {
        if (part.kind === "coding_exercise" || (part.kind === "code_example" && part.runnable)) candidates.push({ part });
      }
      if (sourceScope) for (const part of parsed.data) {
        if (part.kind === "markdown") {
          candidates.push(...markdownExamples(part.markdown, typedArticleMarkdownScope(sourceScope, part.id)));
        } else if (part.kind === "worked_example") {
          const scope = appendArticleMarkdownScope(sourceScope, part.id);
          candidates.push(...markdownExamples(part.problemMarkdown, appendArticleMarkdownScope(scope, "problem")),
            ...markdownExamples(part.verificationMarkdown, appendArticleMarkdownScope(scope, "verification")));
          for (const step of part.steps) {
            const stepScope = appendArticleMarkdownScope(scope, `step:${step.id}`);
            candidates.push(...markdownExamples(step.operationMarkdown, appendArticleMarkdownScope(scope, `step:${step.id}:operation`)),
              ...markdownExamples(step.reasonMarkdown, appendArticleMarkdownScope(scope, `step:${step.id}:reason`)),
              ...markdownExamples(step.conditionsMarkdown, appendArticleMarkdownScope(scope, `step:${step.id}:conditions`)));
            for (const leaf of step.parts) {
              if (leaf.kind === "markdown") candidates.push(...markdownExamples(leaf.markdown, typedArticleMarkdownScope(stepScope, leaf.id)));
            }
          }
        }
      }
    } else if (sourceScope && (block.parts === undefined || (Array.isArray(block.parts) && block.parts.length === 0))) {
      candidates.push(...markdownExamples(block.content, articleBlockContentScope(sourceScope, block)));
    }
    const example = block.workedExample;
    if (sourceScope && block.blockType === "worked_example" && example && typeof example === "object" &&
      "steps" in example && Array.isArray(example.steps)) {
      for (const step of example.steps) {
        if (!step || !Number.isInteger(step.stepIndex)) continue;
        candidates.push(...markdownExamples(step.explanation, appendArticleMarkdownScope(sourceScope, `step:${step.stepIndex}:explanation`)),
          ...markdownExamples(step.reason, appendArticleMarkdownScope(sourceScope, `step:${step.stepIndex}:reason`)));
      }
      if ("verification" in example) {
        candidates.push(...markdownExamples(example.verification, appendArticleMarkdownScope(sourceScope, "verification")));
      }
    }
    for (const entry of candidates) {
      entries.set(entry.part.id, entries.has(entry.part.id) ? null : { ...entry, title: typeof block.title === "string" ? block.title : undefined });
    }
  }
  return [...entries.values()].filter(entry => entry !== null);
}

export function articleCodingDraftKey(articleId: string, version: number, part: CodingPart, namespace?: Entry["namespace"]) {
  return [namespace ?? (part.kind === "code_example" ? "example" : "exercise"), articleId, version, part.id].join(":");
}
