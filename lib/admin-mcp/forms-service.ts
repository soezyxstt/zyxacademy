import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { customForms, customFormResponses, googleMeetSessions, shortLink } from "@/db/schema";
import { formDefinitionSchema, formSettingsSchema } from "@/lib/forms/validation";
import { AdminMcpError, auditedMutation, revisionOf, type AdminTransaction } from "./mutations";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { z } from "zod";

export const shortlinkDefinitionSchema = z.object({ slug: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/), url: z.url().max(2048).refine(value => { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }, "URL harus memakai HTTP atau HTTPS tanpa kredensial."), title: z.string().trim().min(1).max(500).nullable().optional() }).strict();
export async function readActiveForm(id: string, source: AdminTransaction | typeof db = db) {
  const [row] = await source.select().from(customForms).where(and(eq(customForms.id, id), isNull(customForms.deletedAt))).limit(1);
  if (!row) throw new AdminMcpError("NOT_FOUND");
  return row;
}
export function formView(row: typeof customForms.$inferSelect) {
  return { id: row.id, title: row.title, slug: row.slug, description: row.description, category: row.category, questions: row.questions, settings: row.settings, revision: formRevision(row), publicPath: `/f/${row.slug}`, adminPath: `/admin/forms/${row.id}` };
}
export function formRevision(row: typeof customForms.$inferSelect) {
  return revisionOf({ id: row.id, title: row.title, slug: row.slug, description: row.description, category: row.category, questions: row.questions, settings: row.settings, deletedAt: row.deletedAt });
}
export function shortlinkView(row: typeof shortLink.$inferSelect) {
  return { id: row.id, slug: row.slug, url: row.url, title: row.title, clicks: row.clicks, publicPath: `/s/${row.slug}`, revision: revisionOf({ id: row.id, slug: row.slug, url: row.url, title: row.title }) };
}
export async function assertFormSlugAvailable(tx: AdminTransaction, slug: string, exceptId?: string) {
  // Stored slugs remain globally unique even when a row was archived.
  const [forms, meets] = await Promise.all([
    tx.select({ id: customForms.id }).from(customForms).where(and(eq(customForms.slug, slug), exceptId ? ne(customForms.id, exceptId) : undefined)).limit(1),
    tx.select({ id: googleMeetSessions.id }).from(googleMeetSessions).where(eq(googleMeetSessions.slug, slug)).limit(1),
  ]);
  if (forms.length || meets.length) throw new AdminMcpError("SLUG_CONFLICT");
}
export async function createForm(principal: McpPrincipal, requestKey: string, definition: z.infer<typeof formDefinitionSchema>) {
  return auditedMutation(principal, "forms.create", requestKey, definition, async tx => {
    await assertFormSlugAvailable(tx, definition.slug);
    const [row] = await tx.insert(customForms).values({ ...definition, id: crypto.randomUUID(), createdById: principal.userId }).returning();
    return formView(row);
  });
}
export async function changeForm(principal: McpPrincipal, requestKey: string, input: { id: string; expectedRevision: string; definition?: z.infer<typeof formDefinitionSchema>; acceptingResponses?: boolean; archive?: boolean }) {
  const operation = input.archive ? "forms.archive" : input.definition ? "forms.update" : "forms.set_acceptance";
  return auditedMutation(principal, operation, requestKey, input, async tx => {
    const current = await readActiveForm(input.id, tx);
    if (formRevision(current) !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.definition) {
      await assertFormSlugAvailable(tx, input.definition.slug, input.id);
      if (revisionOf(current.questions) !== revisionOf(input.definition.questions)) {
        const responses = await tx.select({ id: customFormResponses.id }).from(customFormResponses).where(eq(customFormResponses.formId, input.id)).limit(1);
        if (responses.length) throw new AdminMcpError("FORM_HAS_RESPONSES");
      }
    }
    const update = input.archive ? { deletedAt: new Date() } : input.definition ?? { settings: formSettingsSchema.parse({ ...current.settings, acceptingResponses: input.acceptingResponses }) };
    const [row] = await tx.update(customForms).set({ ...update, updatedAt: new Date() }).where(eq(customForms.id, input.id)).returning();
    return input.archive ? { id: row.id, archived: true } : formView(row);
  });
}
export async function changeShortlink(principal: McpPrincipal, requestKey: string, input: { id?: string; expectedRevision?: string; definition?: z.infer<typeof shortlinkDefinitionSchema>; remove?: boolean }) {
  const operation = !input.id ? "shortlinks.create" : input.remove ? "shortlinks.delete" : "shortlinks.update";
  return auditedMutation(principal, operation, requestKey, input, async tx => {
    if (!input.id) {
      const definition = shortlinkDefinitionSchema.parse(input.definition);
      const existing = await tx.select({ id: shortLink.id }).from(shortLink).where(eq(shortLink.slug, definition.slug)).limit(1);
      if (existing.length) throw new AdminMcpError("SLUG_CONFLICT");
      const [row] = await tx.insert(shortLink).values({ ...definition, id: crypto.randomUUID(), userId: principal.userId }).returning();
      return shortlinkView(row);
    }
    const [current] = await tx.select().from(shortLink).where(eq(shortLink.id, input.id)).limit(1);
    if (!current) throw new AdminMcpError("NOT_FOUND");
    if (shortlinkView(current).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.remove) { await tx.delete(shortLink).where(eq(shortLink.id, input.id)); return { id: input.id, deleted: true }; }
    const definition = shortlinkDefinitionSchema.parse(input.definition);
    const existing = await tx.select({ id: shortLink.id }).from(shortLink).where(and(eq(shortLink.slug, definition.slug), ne(shortLink.id, input.id))).limit(1);
    if (existing.length) throw new AdminMcpError("SLUG_CONFLICT");
    const [row] = await tx.update(shortLink).set(definition).where(eq(shortLink.id, input.id)).returning();
    return shortlinkView(row);
  });
}
