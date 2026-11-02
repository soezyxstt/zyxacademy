import { timestampRange } from "@/lib/db/timestamp-condition";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customForms, customFormResponses, exportSpreadsheets } from "@/db/schema";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";
import { normalizeDate } from "@/lib/date-utils";
export const notificationPayload = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(2000), link: z.string().max(2048).regex(/^\/(?!\/)/).default("/dashboard"), recipientIds: z.array(z.string().min(1).max(200)).min(1).max(1000), audienceRevision: z.string().length(64) }).strict();
export const sheetPayload = z.object({ formId: z.string().min(1).max(200), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), expectedDataRevision: z.string().length(64), expectedSpreadsheetId: z.string().max(200).nullable(), expectedSheetFingerprint: z.string().length(64).nullable(), overwritePhrase: z.string().max(200).optional() }).strict();
export const meetCreatePayload = z.object({ title: z.string().trim().min(1).max(500), slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/), accessType: z.enum(["OPEN", "TRUSTED", "RESTRICTED"]).default("RESTRICTED"), invitedEmails: z.array(z.email()).max(100).default([]) }).strict();
export const meetEndPayload = z.object({ id: z.string().min(1).max(200), expectedRevision: z.string().length(64) }).strict();
export const generationPayload = z.object({ courseId: z.string().min(1).max(200), chapterId: z.string().min(1).max(200), koId: z.string().min(1).max(200).optional(), expectedDataRevision: z.string().length(64) }).strict();
export async function formExportSnapshot(input: { formId: string; from?: string; to?: string }, source: typeof db | AdminTransaction = db) {
  const [form] = await source.select().from(customForms).where(eq(customForms.id, input.formId)).limit(1);
  if (!form || form.deletedAt) throw new AdminMcpError("NOT_FOUND");
  if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to)) throw new AdminMcpError("INVALID_DATE_RANGE");
  const responses = await source.select().from(customFormResponses).where(and(eq(customFormResponses.formId, input.formId), timestampRange(customFormResponses.submittedAt, input.from, input.to))).orderBy(asc(customFormResponses.id)).limit(5001);
  if (responses.length > 5000) throw new AdminMcpError("NARROW_DATE_FILTER");
  const [sheet] = await source.select().from(exportSpreadsheets).where(eq(exportSpreadsheets.id, `form_${form.id}`)).limit(1);
  const questions = form.questions.map((q, index) => ({ q, index })).filter(({ q }) => !["SECTION", "STATEMENT"].includes(q.type));
  const headers = ["Response ID", "Submitted at", "Email", ...questions.map(({ q }) => String(q.title))];
  const rows = responses.map(r => [r.id, normalizeDate(r.submittedAt).toISOString(), r.responderEmail, ...questions.map(({ q, index }) => { const value = r.answers[String(index)] ?? r.answers[q.title] ?? ""; return typeof value === "object" ? JSON.stringify(value) : String(value); })]);
  return { form, sheet, headers, rows, rowCount: responses.length, dataRevision: revisionOf({ form: { id: form.id, slug: form.slug, questions: form.questions }, responses }) };
}

export const mediaUploadInput = z.object({ folderPath: z.string().max(500).default(""), filename: z.string().trim().min(1).max(200), mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/markdown"]), dataBase64: z.string().min(4).max(699052).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict();
export const mediaUploadPayload = mediaUploadInput.omit({ folderPath: true }).extend({ key: z.string().min(1).max(1000) }).strict();
