import { compileMarkdown } from "@/lib/markdown-compiler";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "./interactive-document";

export function parseInteractiveDocumentsInMarkdown(markdown: unknown): InteractiveDocumentSpec[] {
  if (typeof markdown !== "string" || !markdown.includes("zyx-visual")) return [];
  return compileMarkdown(markdown).ast.blocks.flatMap((block) => {
    if (block.type !== "code" || block.language !== "zyx-visual") return [];
    if (block.content.length > 128 * 1024) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
    let value: unknown;
    try { value = JSON.parse(block.content); } catch { throw new Error("QUESTION_VISUAL_FORMAT_INVALID"); }
    if (!value || typeof value !== "object" || (value as { kind?: unknown }).kind !== "interactive_document") return [];
    const parsed = interactiveDocumentSchema.safeParse(value);
    if (!parsed.success) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
    return [parsed.data];
  });
}
