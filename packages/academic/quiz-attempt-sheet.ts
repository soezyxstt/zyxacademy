import { z } from "zod";
import type { SpreadsheetExportPayload } from "../../lib/export-spreadsheet-client";

const option = z.union([z.string(), z.object({ text: z.string() })]);
const question = z.object({
  id: z.string(), prompt: z.string().nullish(), content: z.string().nullish(), options: z.array(option).nullish(),
  correct_indices: z.array(z.number()).nullish(), correctIndices: z.array(z.number()).nullish(),
});
const attempt = z.object({
  id: z.string(), studentName: z.string(), studentEmail: z.string(), score: z.number(),
  durationSeconds: z.number(), status: z.string(), startedAt: z.string().nullable(), submittedAt: z.string().nullable(),
  questionsSnapshot: z.array(question), answersSnapshot: z.record(z.string(), z.unknown()),
});
const listing = z.object({ template: z.object({ id: z.string(), courseId: z.string() }), attempts: z.array(attempt) });
export type QuizSheetAttempt = z.infer<typeof attempt>;
export function readQuizAttempts(raw: unknown, id: string, courseId: string) {
  const data = listing.safeParse(raw);
  if (!data.success || data.data.template.id !== id || data.data.template.courseId !== courseId) throw new Error("Invalid quiz attempts");
  return data.data.attempts;
}

export function snapshotAnswer(raw: unknown, options?: z.infer<typeof option>[] | null): string {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    const selected = options?.[raw];
    return (typeof selected === "string" ? selected : selected?.text) ?? (raw < 26 ? String.fromCharCode(65 + raw) : String(raw + 1));
  }
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map(value => snapshotAnswer(value, options)).filter(Boolean).join(", ");
  if (raw && typeof raw === "object") return [("text" in raw && raw.text), ("fileName" in raw && raw.fileName)]
    .filter(value => typeof value === "string" && value.trim()).join(" ");
  return "";
}

export type QuizAnswerDetail = {
  id: string; prompt: string; options?: string[]; answer: string; answerKey?: string;
  selected?: number[]; correct?: number[]; verdict?: "correct" | "incorrect" | "unanswered";
};

export function quizAnswerDetail(item: QuizSheetAttempt["questionsSnapshot"][number], raw: unknown): QuizAnswerDetail {
  const options = item.options?.map(value => typeof value === "string" ? value : value.text);
  const indices = (value: unknown): number[] | undefined => {
    const values = Array.isArray(value) ? value : typeof value === "number" ? [value] : undefined;
    if (!values || !options || !values.every(n => Number.isInteger(n) && n >= 0 && n < options.length)) return;
    return [...new Set<number>(values)];
  };
  const selected = indices(raw);
  const key = item.correct_indices ?? item.correctIndices;
  const correct = indices(key);
  const answer = snapshotAnswer(raw, item.options);
  const verdict = !answer.trim() ? "unanswered" : selected?.length && correct?.length
    ? selected.length === correct.length && selected.every(index => correct.includes(index)) ? "correct" : "incorrect"
    : undefined;
  return { id: item.id, prompt: item.prompt || item.content || "", options, selected, correct, verdict,
    answer, answerKey: snapshotAnswer(key, item.options) };
}

export type QuizSheetFormat = "matrix" | "summary";
export function quizAttemptSheet(quiz: { id: string; title: string }, all: QuizSheetAttempt[], filtered: QuizSheetAttempt[], format: QuizSheetFormat): SpreadsheetExportPayload {
  const base = { entityType: "quiz", entityId: quiz.id + ":" + format, folderSubpath: "quizzes/" + quiz.title,
    title: quiz.title + (format === "matrix" ? " (Matriks)" : " (Ringkasan)") };
  const identity = ["ID pengerjaan", "Nama peserta", "Email peserta"];
  const date = (value: string | null) => value === null ? "-" : new Date(value).toLocaleString("id-ID");
  if (format === "summary") return { ...base, headers: [...identity, "Status", "Skor", "Durasi (detik)", "Mulai", "Dikumpulkan"],
    rows: filtered.map(a => [a.id, a.studentName, a.studentEmail, a.status, a.score, a.durationSeconds, date(a.startedAt), date(a.submittedAt)]) };
  const byId = new Map<string, QuizSheetAttempt["questionsSnapshot"][number]>();
  for (const row of all) for (const item of row.questionsSnapshot) if (!byId.has(item.id)) byId.set(item.id, item);
  const questions = [...byId.values()];
  return { ...base, headers: [...identity, "Skor", ...questions.map((q, i) => "Q" + (i + 1) + ": " + (q.prompt || q.content || "").slice(0, 30))],
    rows: filtered.map(a => {
      const own = new Map(a.questionsSnapshot.map(q => [q.id, q]));
      return [a.id, a.studentName, a.studentEmail, a.score, ...questions.map(q => snapshotAnswer(a.answersSnapshot[q.id], own.get(q.id)?.options) || "Tidak dijawab")];
    }) };
}
