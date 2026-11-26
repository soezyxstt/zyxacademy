import { compileMarkdown } from "../markdown-compiler";
import { appendArticleMarkdownScope, markdownPythonId } from "./article-markdown-scope";
import { articlePartsSchema, flattenArticleParts, type ArticlePart } from "../materials/article-parts";

type CodingPart = Extract<ArticlePart, { kind: "code_example" | "coding_exercise" }>;
type Entry = { part: CodingPart; title?: string; namespace?: "markdown-example" };
type Block = { id: string; parts?: unknown; title?: unknown; content?: string; blockType?: string; workedExample?: unknown; formativeCheck?: unknown };

function markdownExamples(source: string | undefined, parent: string): Entry[] {
  if (!source || !/```(?:python|py)\b/i.test(source) || /<!--[\s\S]*?```[\s\S]*?-->/.test(source)) return [];
  try { return compileMarkdown(source).ast.blocks.flatMap(block => {
    if (block.type !== "code" || !["python", "py"].includes(block.language?.toLowerCase() ?? "") || block.content.length > 64_000) return [];
    const id = markdownPythonId(appendArticleMarkdownScope(parent, block.id), block.id);
    return [{ part: { id, kind: "code_example", language: "python", code: block.content, runnable: true }, namespace: "markdown-example" }];
  }); } catch { return []; }
}

export function sectionCodingParts(blocks: readonly Block[], sectionId?: string) {
  const entries = new Map<string, Entry | null>();
  for (const [index, block] of blocks.entries()) {
    const sourceScope = appendArticleMarkdownScope(null, JSON.stringify([sectionId, block.id || index]));
    const parsed = articlePartsSchema.safeParse(block.parts);
    const candidates: Entry[] = [];
    if (parsed.success) {
      for (const part of flattenArticleParts(parsed.data)) {
        if (part.kind === "coding_exercise" || (part.kind === "code_example" && part.runnable)) candidates.push({ part });
      }
      if (sectionId) for (const part of parsed.data) {
        if (part.kind === "markdown") {
          candidates.push(...markdownExamples(part.markdown, appendArticleMarkdownScope(appendArticleMarkdownScope(sourceScope, part.id), "markdown")));
        }
      }
    } else if (sectionId && block.parts === undefined) {
      const wrapped = (block.blockType === "worked_example" && block.workedExample) ||
        ((block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close") && block.formativeCheck);
      candidates.push(...markdownExamples(block.content, wrapped ? appendArticleMarkdownScope(sourceScope, "content") : sourceScope));
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
