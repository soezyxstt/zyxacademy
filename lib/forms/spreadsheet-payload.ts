import type { SpreadsheetExportPayload } from "@/lib/export-spreadsheet-client";
import { slugifySegment } from "@/lib/storage/keys";
import { formAttachmentExportUrl } from "./attachment";

type Question = { title?: string; type: string };
type ResponseRow = { id: string; submittedAt: string | Date; responderEmail?: string | null; answers: Record<string, unknown> };

function formatAnswer(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(formatAnswer).join(", ");
  const entries = Object.entries(value);
  return entries.length
    ? entries.map(([label, entry]) => `${label}: ${Array.isArray(entry) ? entry.join(", ") : String(entry ?? "")}`).join(" | ")
    : "-";
}

export function buildFormSpreadsheetPayload(form: {
  id: string; slug: string; title: string; questions: Question[];
}, responses: ResponseRow[], origin: string, attachment: (value: unknown, index: number) => string | null = value => formAttachmentExportUrl(value, origin)): SpreadsheetExportPayload {
  const slug = slugifySegment(form.slug || form.title, "form");
  const fields = form.questions.map((question, index) => ({ question, index }))
    .filter(({ question }) => question && question.type !== "SECTION" && question.type !== "STATEMENT");
  return {
    entityType: "form",
    entityId: form.id,
    folderSubpath: `forms/${slug}`,
    title: `form-${slug}-responses`,
    headers: ["Response ID", "Submitted At", "Responder Email", ...fields.map(({ question }, index) =>
      `${index + 1}. ${question.title || `Soal #${index + 1}`}`)],
    rows: responses.map(({ id, submittedAt, responderEmail, answers }) => [
      id, submittedAt instanceof Date ? submittedAt.toISOString() : submittedAt, responderEmail || "Anonim",
      ...fields.map(({ question, index }) => {
        const value = answers[index] ?? (question.title ? answers[question.title] : undefined);
        return question.type === "FILE_UPLOAD" ? attachment(value, index) ?? "-" : formatAnswer(value);
      }),
    ]),
  };
}
