import { z } from "zod";
import { isEmptyFormAnswer } from "./presentation";

const labels = z.array(z.string().trim().min(1).max(2000)).min(1).max(100).refine(v => new Set(v).size === v.length, "Pilihan tidak boleh berulang.");
export const formQuestionSchema = z.object({
  title: z.string().trim().min(1).max(2000), description: z.string().max(10000).optional(),
  imageUrl: z.string().max(2048).refine(v => v === "" || /^https:\/\//.test(v) || /^\/api\/storage\//.test(v)).optional(),
  type: z.enum(["TEXT", "PARAGRAPH", "RADIO", "CHECKBOX", "DROP_DOWN", "FILE_UPLOAD", "SCALE", "RATING", "GRID_RADIO", "GRID_CHECKBOX", "DATE", "TIME", "SECTION", "STATEMENT"]),
  required: z.boolean().optional(), showDescription: z.boolean().optional(), shuffleOptions: z.boolean().optional(),
  options: labels.optional(), otherOption: z.object({ enabled: z.boolean(), label: z.string().trim().min(1).max(200) }).strict().optional(),
  scaleLow: z.number().int().min(0).max(1).optional(), scaleHigh: z.number().int().min(2).max(10).optional(),
  scaleLowLabel: z.string().max(200).optional(), scaleHighLabel: z.string().max(200).optional(),
  gridRows: labels.optional(), gridColumns: labels.optional(), maxFileSizeMb: z.number().positive().max(50).optional(),
}).strict().superRefine((q, ctx) => {
  if (["RADIO", "CHECKBOX", "DROP_DOWN"].includes(q.type) && !q.options) ctx.addIssue({ code: "custom", path: ["options"], message: "Pilihan wajib diisi." });
  if (q.type.startsWith("GRID_") && (!q.gridRows || !q.gridColumns)) ctx.addIssue({ code: "custom", message: "Baris dan kolom wajib diisi." });
  if (["SECTION", "STATEMENT"].includes(q.type) && q.required) ctx.addIssue({ code: "custom", path: ["required"], message: "Bagian dan pernyataan tidak menerima jawaban." });
});
const instant = z.union([z.literal(""), z.iso.datetime({ offset: true })]);
export const formSettingsSchema = z.object({
  displayMode: z.enum(["question", "section"]).optional(), acceptingResponses: z.boolean().optional(),
  closedMessage: z.string().max(2000).optional(), openAt: instant.optional(), closeAt: instant.optional(),
  collectEmail: z.enum(["none", "input", "verified"]).optional(), limitToOneResponse: z.boolean().optional(),
  requireLogin: z.boolean().optional(), allowResponseEditing: z.boolean().optional(),
  sendResponseCopy: z.enum(["off", "requested", "always"]).optional(), maxFileSizeLimit: z.enum(["1GB", "10GB", "100GB"]).optional(),
  shuffleQuestions: z.boolean().optional(), customSuccessMessage: z.string().max(2000).optional(), showProgressBar: z.boolean().optional(),
}).strict().superRefine((s, ctx) => {
  if (s.openAt && s.closeAt && Date.parse(s.openAt) >= Date.parse(s.closeAt)) ctx.addIssue({ code: "custom", path: ["closeAt"], message: "Jadwal tutup harus setelah jadwal buka." });
});
export const formDefinitionSchema = z.object({
  title: z.string().trim().min(1).max(500), description: z.string().max(10000).nullable().optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  category: z.enum(["survey", "quiz", "feedback", "registration"]).default("survey"),
  questions: z.array(formQuestionSchema).min(1).max(200), settings: formSettingsSchema.default({ acceptingResponses: true }),
}).strict();
export type FormQuestion = z.infer<typeof formQuestionSchema>;
export type FormSettings = z.infer<typeof formSettingsSchema>;

/** Pure validation: never submits responses or performs uploads. Keys are question indices. */
export function validateFormAnswers(questions: FormQuestion[], answers: Record<string, unknown>) {
  const issues: { questionIndex: number; code: string }[] = [];
  for (const key of Object.keys(answers)) {
    if (!/^\d+$/.test(key) || !questions[Number(key)] || ["SECTION", "STATEMENT"].includes(questions[Number(key)].type)) issues.push({ questionIndex: /^\d+$/.test(key) ? Number(key) : -1, code: "UNKNOWN_ANSWER" });
  }
  questions.forEach((q, i) => {
    if (["SECTION", "STATEMENT"].includes(q.type)) return;
    const v = answers[String(i)];
    if (isEmptyFormAnswer(q, v)) { if (q.required) issues.push({ questionIndex: i, code: "REQUIRED" }); return; }
    const choice = (value: unknown) => typeof value === "string" && ((q.options || []).includes(value) || (q.otherOption?.enabled === true && value !== "\uE000__other__" && value.trim().length > 0));
    let valid = false;
    switch (q.type) {
      case "TEXT": case "PARAGRAPH": valid = typeof v === "string" && v.length <= 50000; break;
      case "RADIO": case "DROP_DOWN": valid = choice(v); break;
      case "CHECKBOX": valid = Array.isArray(v) && v.length <= 100 && new Set(v).size === v.length && v.every(choice); break;
      case "SCALE": case "RATING": valid = (typeof v === "string" || typeof v === "number") && String(v).trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= (q.scaleLow ?? 1) && Number(v) <= (q.scaleHigh ?? 5); break;
      case "DATE": valid = typeof v === "string" && z.iso.date().safeParse(v).success; break;
      case "TIME": valid = typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); break;
      case "GRID_RADIO": case "GRID_CHECKBOX": {
        valid = !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([row, value]) => (q.gridRows || []).includes(row) && (q.type === "GRID_RADIO" ? (q.gridColumns || []).includes(String(value)) : Array.isArray(value) && new Set(value).size === value.length && value.every(x => (q.gridColumns || []).includes(x)))); break;
      }
      // File answers require a real upload; simulation deliberately cannot attest ownership or storage availability.
      case "FILE_UPLOAD": valid = false; break;
    }
    if (!valid) issues.push({ questionIndex: i, code: q.type === "FILE_UPLOAD" ? "FILE_REQUIRES_UPLOAD_VERIFICATION" : "INVALID_ANSWER" });
  });
  return { valid: issues.length === 0, issues };
}

export function summarizeFormResponses(questions: FormQuestion[], responses: { answers: Record<string, unknown> }[]) {
  return { totalResponses: responses.length, questions: questions.flatMap((q, index) => {
    if (["SECTION", "STATEMENT"].includes(q.type)) return [];
    const values = responses.map(r => r.answers[String(index)] ?? r.answers[q.title]).filter(v => !isEmptyFormAnswer(q, v));
    const counts: Record<string, number> = Object.create(null);
    if (["RADIO", "CHECKBOX", "DROP_DOWN", "SCALE", "RATING"].includes(q.type)) {
      for (const value of values) {
        // Count a bucket once per respondent, even when several open choices map to Lainnya.
        const buckets = new Set((Array.isArray(value) ? value : [value]).map(option =>
          ["SCALE", "RATING"].includes(q.type) ? String(Number(option)) : (q.options || []).includes(String(option)) ? String(option) : "Lainnya"));
        for (const label of buckets) counts[label] = (counts[label] || 0) + 1;
      }
    }
    return [{ index, title: q.title, type: q.type, answered: values.length, denominator: responses.length, counts }];
  }) };
}
export function csvCell(value: unknown): string {
  let text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
