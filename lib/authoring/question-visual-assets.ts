import "server-only";
import { z } from "zod";
import { collectQuestionVisualReferences, type QuestionVisualFields } from "@/lib/authoring/question-visual-references";
import { validateInteractiveDocumentArchive } from "@/lib/materials/interactive-document-assets";

export const questionVisualAssetsSchema = z.array(z.object({
  path: z.string().regex(/^visuals\/[a-f0-9]{64}\.(html|png)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(6 * 1024 * 1024),
  base64: z.string().min(1).max(8 * 1024 * 1024),
}).strict()).max(16);

export type QuestionVisualAssets = z.infer<typeof questionVisualAssetsSchema>;
export async function validateQuestionVisualAssets(questions: readonly QuestionVisualFields[], input?: QuestionVisualAssets) {
  const specs = collectQuestionVisualReferences(questions);
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
