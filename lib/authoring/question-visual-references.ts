import { MAX_INTERACTIVE_DOCUMENT_SPECS, type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";

export type QuestionVisualFields = { prompt: string; options: string[]; explanation?: string | null };

export function collectQuestionVisualReferences(questions: readonly QuestionVisualFields[]) {
  const specs: InteractiveDocumentSpec[] = [];
  const visible = new Set<string>();
  const hidden = new Set<string>();
  for (const question of questions) {
    const start = specs.length;
    for (const [field, text] of [["visible", question.prompt], ...question.options.map(value => ["visible", value.trim()]), ["hidden", question.explanation ?? ""]] as Array<[string, string]>) {
      if (text.includes("<!--__ZYX_V4_")) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
      for (const spec of parseInteractiveDocumentsInMarkdown(text)) {
        specs.push(spec);
        if (specs.length > MAX_INTERACTIVE_DOCUMENT_SPECS) throw new Error("INTERACTIVE_DOCUMENT_COUNT_LIMIT");
        const target = field === "visible" ? visible : hidden;
        target.add(spec.documentSha256);
        target.add(spec.printSha256);
      }
    }
    if (specs.length > start && [question.prompt, ...question.options, question.explanation ?? ""].some(text => /<\/?[a-z][^>]*>|data:[^\s]*;base64,|\b[A-Za-z0-9+/]{256,}={0,2}\b/i.test(text))) {
      throw new Error("QUESTION_VISUAL_FORMAT_INVALID: HTML dan base64 harus berada dalam visualAssets, bukan teks soal.");
    }
  }
  if ([...visible].some(hash => hidden.has(hash))) throw new Error("QUESTION_VISUAL_DISCLOSURE: Aset prompt atau opsi tidak boleh digunakan dalam pembahasan.");
  return specs;
}

export function rejectQuestionVisualReferences(questions: readonly QuestionVisualFields[]): void {
  if (collectQuestionVisualReferences(questions).length) throw new Error("QUESTION_VISUAL_ASSETS_REQUIRED: Sertakan visualAssets dengan HTML dan PNG untuk setiap visual.");
}
