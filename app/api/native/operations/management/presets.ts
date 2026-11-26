import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customFormPresets } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { parseJakartaDatetimeLocal } from "@/lib/date-utils";
import { formDefinitionSchema, formQuestionSchema, formSettingsSchema } from "@/lib/forms/validation";
import { ManagementFailure, type FormPreset } from "@/packages/native-parity/operations/management-contract";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = { name: z.string().trim().min(1).max(500), description: z.string().trim().max(10000) };
// A preset can keep incomplete questions as templates. Publication performs the full question validation.
const labels = z.array(z.string().max(2000)).max(100).optional();
const presetQuestion = z.strictObject({ ...formQuestionSchema.shape, title: z.string().max(2000), options: labels, gridRows: labels, gridColumns: labels });
const presetQuestions = z.array(presetQuestion).max(200);
export const presetOperations = [
  z.strictObject({ type: z.literal("form.preset.create"), fields: z.strictObject({
    ...metadata, category: formDefinitionSchema.shape.category,
    questions: presetQuestions, settings: formSettingsSchema.optional(),
  }) }),
  z.strictObject({ type: z.literal("form.preset.update"), id, revision, ...metadata }),
  z.strictObject({ type: z.literal("form.preset.delete"), id, revision }),
] as const;
type PresetAction = z.infer<typeof presetOperations[number]>;

function normalizePresetSchedule(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    try { return parseJakartaDatetimeLocal(value).toISOString(); }
    catch { return value; }
  }
  return value;
}

export async function readFormPresets(): Promise<FormPreset[]> {
  const rows = await db.select().from(customFormPresets).orderBy(desc(customFormPresets.createdAt));
  return rows.map(row => {
    const questions = presetQuestions.safeParse(row.questions);
    const settings = row.settings && formSettingsSchema.safeParse({
      ...row.settings, openAt: normalizePresetSchedule(row.settings.openAt), closeAt: normalizePresetSchedule(row.settings.closeAt),
    });
    return {
      id: row.id, name: row.name, description: row.description ?? "", category: row.category,
      questions: questions.success ? questions.data : [], canApplyQuestions: questions.success,
      settings: settings?.success ? settings.data : undefined, invalidSettings: settings?.success === false, revision: revisionOf(row),
    };
  });
}

export async function applyPreset(tx: Transaction, actorId: string, action: PresetAction) {
  if (action.type === "form.preset.create") {
    const { fields } = action;
    const [item] = await tx.insert(customFormPresets).values({ ...fields, id: crypto.randomUUID(), description: fields.description || null, createdById: actorId }).returning();
    return { id: item.id, revision: revisionOf(item) };
  }
  const [current] = await tx.select().from(customFormPresets).where(eq(customFormPresets.id, action.id)).limit(1).for("update");
  if (!current) throw new ManagementFailure("not-found");
  if (action.revision !== revisionOf(current)) throw new ManagementFailure("conflict");
  if (action.type === "form.preset.delete") {
    await tx.delete(customFormPresets).where(eq(customFormPresets.id, current.id));
    return { id: current.id };
  }
  const [item] = await tx.update(customFormPresets).set({ name: action.name, description: action.description || null })
    .where(eq(customFormPresets.id, current.id)).returning();
  return { id: item.id, revision: revisionOf(item) };
}
