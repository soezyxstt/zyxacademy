import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditMutasi, customForms, customFormResponses, session } from "@/db/schema";
import { assertFormSlugAvailable } from "@/lib/admin-mcp/forms-service";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { blogFieldsSchema, createBlogArticle, updateBlogArticle } from "@/lib/blog/service";
import { nextMonotonicTimestamp } from "@/lib/date-utils";
import { formDefinitionSchema, formQuestionSchema, formSettingsSchema } from "@/lib/forms/validation";
import { applyConfiguration, configurationOperations } from "./configuration";
import { ManagementFailure } from "@/packages/native-parity/operations/management-contract";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const articleRevision = z.string().regex(/^[a-f0-9]{64}$/);
const requestKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);
const optionalHeading = z.unknown().transform((value, ctx) => {
  if (value && typeof value === "object" && "type" in value && "title" in value &&
    (value.type === "SECTION" || value.type === "STATEMENT") && typeof value.title === "string" && !value.title.trim()) {
    const question = formQuestionSchema.safeParse({ ...value, title: "Bagian" });
    if (question.success && (question.data.type === "SECTION" || question.data.description?.trim() || question.data.imageUrl)) return { ...question.data, title: "" };
  }
  ctx.addIssue({ code: "custom", message: "Bagian atau pernyataan tidak valid." });
  return z.NEVER;
});
const formFields = formDefinitionSchema.extend({
  slug: z.union([formDefinitionSchema.shape.slug, z.literal("")]),
  questions: z.array(z.union([formQuestionSchema, optionalHeading])).min(1).max(200),
});
const nativeAuthoring = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("article.save"), id: id.optional(), revision: articleRevision.optional(), fields: blogFieldsSchema.omit({ slug: true, readMinutes: true }).extend({ status: z.enum(["draft", "published"]) }) }),
  z.strictObject({ type: z.literal("form.save"), id: id.optional(), revision: z.iso.datetime().optional(), fields: formFields }),
  z.strictObject({ type: z.literal("form.settings"), id, revision: z.iso.datetime(), settings: formSettingsSchema }),
  z.strictObject({ type: z.literal("form.delete"), id, revision: z.iso.datetime() }),
  ...configurationOperations,
]);

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FormRow = typeof customForms.$inferSelect;
type Receipt = { id: string; revision?: string; slug?: string; previousSlug?: string };
const authorityFailure = "NATIVE_OPERATIONS_ADMIN_REQUIRED";

async function getFormForWrite(tx: Transaction, formId: string, expectedRevision?: string): Promise<FormRow> {
  const [form] = await tx.select().from(customForms).where(and(eq(customForms.id, formId), isNull(customForms.deletedAt))).limit(1).for("update");
  if (!form) throw new ManagementFailure("not-found");
  if (expectedRevision !== form.updatedAt.toISOString()) throw new ManagementFailure("conflict");
  return form;
}

export async function nativeAuthoringMutation(actor: { id: string; sessionId: string }, origin: string, requestKeyValue: unknown, actionValue: unknown): Promise<Receipt> {
  const requestKey = requestKeySchema.parse(requestKeyValue);
  const action = nativeAuthoring.parse(actionValue);
  const receiptId = `native_ops_${revisionOf({ actor: actor.id, origin, requestKey })}`;
  const inputHash = revisionOf(action);
  const result = await db.transaction(async (tx): Promise<Receipt> => {
    await assertAuthoringActor(tx, actor.id, { roles: ["admin"], error: authorityFailure, lock: true });
    const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session).where(and(eq(session.id, actor.sessionId), eq(session.userId, actor.id))).limit(1).for("share");
    if (!active || active.expiresAt.getTime() <= Date.now()) throw new ManagementFailure("forbidden");
    // Serialize only replays of this action identity. Domain handlers still hold their target locks.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptId}, 0))`);
    const [previous] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (previous) {
      if (previous.actorId !== actor.id || previous.entityType !== "native_operations" || previous.action !== action.type || previous.afterSnapshot?.sessionHash !== revisionOf(actor.sessionId) || previous.afterSnapshot?.inputHash !== inputHash) throw new ManagementFailure("conflict");
      return previous.afterSnapshot.result as Receipt;
    }

    let receipt: Receipt;
    switch (action.type) {
      case "article.save": {
        const { status, ...fields } = action.fields;
        if (action.id && !action.revision) throw new ManagementFailure("conflict");
        const article = action.id
          ? await updateBlogArticle(tx, { actorId: actor.id, id: action.id, expectedRevision: action.revision!, changes: fields, status })
          : await createBlogArticle(tx, { actorId: actor.id, article: fields, status });
        receipt = { id: article.id, revision: article.revision, slug: article.slug };
        break;
      }
      case "form.save": {
        const { fields } = action;
        const form = action.id ? await getFormForWrite(tx, action.id, action.revision) : undefined;
        const slug = fields.slug || form?.slug || crypto.randomUUID().replaceAll("-", "").slice(0, 7);
        await assertFormSlugAvailable(tx, slug, form?.id);
        if (form && revisionOf(form.questions) !== revisionOf(fields.questions)) {
          const [response] = await tx.select({ id: customFormResponses.id }).from(customFormResponses).where(eq(customFormResponses.formId, form.id)).limit(1);
          if (response) throw new ManagementFailure("conflict", "Pertanyaan formulir dengan respons harus dipertahankan.");
        }
        const definition = { ...fields, slug, updatedAt: nextMonotonicTimestamp(form?.updatedAt) };
        const [saved] = form
          ? await tx.update(customForms).set(definition).where(eq(customForms.id, form.id)).returning()
          : await tx.insert(customForms).values({ ...definition, id: crypto.randomUUID(), createdById: actor.id }).returning();
        receipt = { id: saved.id, revision: saved.updatedAt.toISOString(), slug: saved.slug, ...(form && form.slug !== saved.slug ? { previousSlug: form.slug } : {}) };
        break;
      }
      case "form.settings":
      case "form.delete": {
        const form = await getFormForWrite(tx, action.id, action.revision);
        const updatedAt = nextMonotonicTimestamp(form.updatedAt);
        const [saved] = await tx.update(customForms)
          .set(action.type === "form.settings" ? { settings: action.settings, updatedAt } : { deletedAt: updatedAt, updatedAt })
          .where(eq(customForms.id, form.id)).returning();
        receipt = { id: saved.id, revision: saved.updatedAt.toISOString(), slug: saved.slug };
        break;
      }
      default: receipt = await applyConfiguration(tx, actor.id, action);
    }
    await tx.insert(auditMutasi).values({ id: receiptId, actorId: actor.id, entityType: "native_operations", entityId: receipt.id, action: action.type, correlationId: requestKey, outcome: "success", afterSnapshot: { inputHash, sessionHash: revisionOf(actor.sessionId), result: receipt } });
    return receipt;
  });

  if (action.type === "article.save") {
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    if (result.slug) revalidatePath(`/blog/${result.slug}`);
  } else if (action.type.startsWith("form.")) {
    revalidatePath("/admin/forms");
    revalidatePath(`/admin/forms/${result.id}`);
    if (result.slug) revalidatePath(`/f/${result.slug}`);
    if (result.previousSlug && result.previousSlug !== result.slug) revalidatePath(`/f/${result.previousSlug}`);
  } else if (action.type.startsWith("link.")) {
    revalidatePath("/admin/tautan");
  } else {
    revalidatePath("/admin/pricing");
    if (action.type === "pricing.discounts") revalidatePath("/plans");
  }
  return result;
}

export function nativeAuthoringStatus(error: unknown) {
  if (error instanceof z.ZodError) return 400;
  if (!(error instanceof Error)) return 503;
  const wrapped = error.cause;
  const code = "code" in error ? error.code : wrapped instanceof Error && "code" in wrapped ? wrapped.code : error.message;
  switch (code) {
    case authorityFailure: case "forbidden": case "BLOG_FORBIDDEN": return 403;
    case "not-found": case "NOT_FOUND": return 404;
    case "payload-too-large": return 413;
    case "uncertain": return 424;
    case "pending": return 425;
    case "conflict": case "REVISION_CONFLICT": case "SLUG_CONFLICT": case "BLOG_SLUG_CONFLICT": case "23505": return 409;
    case "invalid": case "BLOG_TITLE_REQUIRED": case "BLOG_CONTENT_REQUIRED": case "BLOG_THUMBNAIL_UNSUPPORTED": case "BLOG_SCHEDULING_UNAVAILABLE": return 400;
    default: return 503;
  }
}
