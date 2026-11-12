import { compileMarkdown } from "@/lib/markdown-compiler";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "./interactive-document";

// Redaction needs valid identities even when another fence is malformed.
export function inspectInteractiveDocumentsInMarkdown(markdown: unknown) {
  const result: { specs: InteractiveDocumentSpec[]; invalid: boolean } = { specs: [], invalid: false };
  if (typeof markdown !== "string" || !markdown.includes("zyx-visual")) return result;
  for (const block of compileMarkdown(markdown).ast.blocks) {
    if (block.type !== "code" || block.language !== "zyx-visual") continue;
    try {
      if (block.content.length > 128 * 1024) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
      const value: unknown = JSON.parse(block.content);
      if (!value || typeof value !== "object" || (value as { kind?: unknown }).kind !== "interactive_document") continue;
      result.specs.push(interactiveDocumentSchema.parse(value));
    } catch { result.invalid = true; }
  }
  return result;
}

export function parseInteractiveDocumentsInMarkdown(markdown: unknown): InteractiveDocumentSpec[] {
  const result = inspectInteractiveDocumentsInMarkdown(markdown);
  if (result.invalid) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
  return result.specs;
}
