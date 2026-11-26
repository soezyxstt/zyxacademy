import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customFormResponses, customForms } from "@/db/schema";
import { protectedFormAttachmentKey } from "@/lib/forms/attachment";
import { buildFormSpreadsheetPayload } from "@/lib/forms/spreadsheet-payload";
import { syncGoogleSpreadsheet } from "@/lib/google-sheets";
import { slugifyFormTitle } from "@/lib/storage/keys";
import { ManagementFailure, type ManagementReceipt } from "@/packages/native-parity/operations/management-contract";

export async function exportNativeFormResults(formId: string, origin: string, confirmedRevision?: string): Promise<ManagementReceipt> {
  const [form] = await db.select({
    id: customForms.id, title: customForms.title, slug: customForms.slug, questions: customForms.questions,
  }).from(customForms).where(and(eq(customForms.id, formId), isNull(customForms.deletedAt))).limit(1);
  if (!form) throw new ManagementFailure("not-found");
  const responses = await db.select({
    id: customFormResponses.id, submittedAt: customFormResponses.submittedAt, responderEmail: customFormResponses.responderEmail,
    answers: customFormResponses.answers,
  }).from(customFormResponses).where(eq(customFormResponses.formId, formId))
    .orderBy(desc(customFormResponses.submittedAt), asc(customFormResponses.id));
  if (!responses.length) throw new ManagementFailure("invalid");

  const payload = buildFormSpreadsheetPayload(form, responses, origin, (value, index) => {
    const key = protectedFormAttachmentKey(value, {
      origin, legacyBase: process.env.R2_PUBLIC_URL, folders: [slugifyFormTitle(form.title), slugifyFormTitle(form.slug)], questionIndex: index,
    });
    return key ? new URL(`/api/storage/file/${key.map(encodeURIComponent).join("/")}`, origin).href : null;
  });
  const result = await syncGoogleSpreadsheet({ ...payload, entityType: "form", confirmedRevision });
  if (result.needsConfirmation) {
    if (!result.revision) throw new ManagementFailure("uncertain");
    return { id: formId, formSheet: { kind: "confirm", revision: result.revision,
      conflicts: result.conflicts?.map(({ code }) => code) ?? [] } };
  }
  return { id: formId, formSheet: { kind: "saved", url: result.spreadsheetUrl, created: result.isNew, sharingIncomplete: Boolean(result.sharingIncomplete) } };
}
