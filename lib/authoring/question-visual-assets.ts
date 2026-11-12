import "server-only";
import { z } from "zod";
import { type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { validateInteractiveDocumentArchive } from "@/lib/materials/interactive-document-assets";

export const questionVisualAssetsSchema = z.array(z.object({
  path: z.string().regex(/^visuals\/[a-f0-9]{64}\.(html|png)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(6 * 1024 * 1024),
  base64: z.string().min(1).max(8 * 1024 * 1024),
}).strict()).max(16);

export type QuestionVisualAssets = z.infer<typeof questionVisualAssetsSchema>;
type Fields = { prompt: string; options: string[]; explanation?: string | null };

export async function validateQuestionVisualAssets(questions: readonly Fields[], input?: QuestionVisualAssets) {
  const specs: InteractiveDocumentSpec[] = [];
  const visible = new Set<string>();
  const hidden = new Set<string>();
  for (const question of questions) {
    const start = specs.length;
    for (const [field, text] of [["visible", question.prompt], ...question.options.map(value => ["visible", value.trim()]), ["hidden", question.explanation ?? ""]] as Array<[string, string]>) {
      if (text.includes("<!--__ZYX_V4_")) throw new Error("QUESTION_VISUAL_FORMAT_INVALID");
      for (const spec of parseInteractiveDocumentsInMarkdown(text)) {
        specs.push(spec);
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
  const entries = questionVisualAssetsSchema.parse(input ?? []);
  if (entries.reduce((sum, entry) => sum + entry.base64.length, 0) > Math.ceil(16 * 1024 * 1024 / 3) * 4 + 32) throw new Error("INTERACTIVE_DOCUMENT_TOTAL_LIMIT");
  if (specs.length && !entries.length) throw new Error("QUESTION_VISUAL_ASSETS_REQUIRED: Sertakan visualAssets dengan HTML dan PNG untuk setiap visual.");
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.base64)) throw new Error("QUESTION_VISUAL_BASE64_INVALID");
    const bytes = Buffer.from(entry.base64, "base64");
    if (bytes.length !== entry.bytes) throw new Error("QUESTION_VISUAL_SIZE_MISMATCH");
    total += bytes.length;
    if (total > 16 * 1024 * 1024) throw new Error("INTERACTIVE_DOCUMENT_TOTAL_LIMIT");
    files.set(entry.path, bytes);
  }
  return validateInteractiveDocumentArchive(specs, entries.map(({ base64: _base64, ...entry }) => entry), files);
}
