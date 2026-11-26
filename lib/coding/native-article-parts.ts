import { compileMarkdown } from "../markdown-compiler";
import { appendArticleMarkdownScope, markdownPythonId } from "./article-markdown-scope";
import { articlePartsSchema, flattenArticleParts, type ArticlePart } from "../materials/article-parts";

type CodingPart = Extract<ArticlePart, { kind: "code_example" | "coding_exercise" }>;
type Entry = { part: CodingPart; title?: string; namespace?: "markdown-example" };
type Block = { id: string; parts?: unknown; title?: unknown; content?: string; blockType?: string; workedExample?: unknown; formativeCheck?: unknown };

export function markdownExamples(source: string | undefined, parent: string): Entry[] {
  if (!source || !/```(?:python|py)\b/i.test(source) || /<!--[\s\S]*?```[\s\S]*?-->/.test(source)) return [];
  try {
    return compileMarkdown(source).ast.blocks.flatMap(block => {
      if (block.type !== "code" || !["python", "py"].includes(block.language?.toLowerCase() ?? "") || block.content.length > 64_000) return [];
      const id = markdownPythonId(appendArticleMarkdownScope(parent, block.id), block.id);
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
    if (parsed.success) {
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
    } else if (sourceScope && block.parts === undefined) {
      candidates.push(...markdownExamples(block.content, articleBlockContentScope(sourceScope, block)));
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
