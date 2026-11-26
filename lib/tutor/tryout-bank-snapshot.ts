import "server-only";

import type { aiQuestionBank } from "@/db/schema";
import { questionProvenanceSnapshot } from "@/lib/asesmen/question-provenance";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { verifyQuestionVisualBinding } from "@/lib/materials/question-visual-binding";

export async function buildTryoutBankSnapshot(courseId: string, row: typeof aiQuestionBank.$inferSelect) {
  const copied = { prompt: row.prompt, options: Array.isArray(row.options) ? row.options.map(String) : [], explanation: row.explanation };
  const hasVisual = [copied.prompt, ...copied.options, copied.explanation]
    .some((value) => parseInteractiveDocumentsInMarkdown(value).length > 0);
  if (hasVisual && !await verifyQuestionVisualBinding(courseId, copied)) {
    throw new Error("TRYOUT_BANK_VISUAL_UNVERIFIED");
  }
  return {
    ...copied,
    bankQuestionId: row.id,
    correctIndex: Array.isArray(row.correctIndices) ? row.correctIndices[0] : undefined,
    correctIndices: Array.isArray(row.correctIndices) ? row.correctIndices : [],
    acceptsImage: false,
    acceptsFile: row.questionType === "essay",
    acceptableAnswers: Array.isArray(row.acceptableAnswers) ? row.acceptableAnswers : [],
    ...questionProvenanceSnapshot(row),
  };
}
