import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { customFormPresets } from "@/db/schema";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { formQuestionSchema, formSettingsSchema } from "@/lib/forms/validation";
import { adminToolkit, adminId, adminRevision, adminPagination } from "./toolkit";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";
const definition = z.object({ name: z.string().trim().min(1).max(500), description: z.string().max(10000).nullable().default(null), category: z.enum(["survey", "quiz", "feedback", "registration"]).default("survey"), questions: z.array(formQuestionSchema).min(1).max(200), settings: formSettingsSchema.default({}) }).strict();
const view = (row: typeof customFormPresets.$inferSelect) => ({ id: row.id, name: row.name, description: row.description, category: row.category, questions: row.questions, settings: row.settings, revision: revisionOf(row) });
export function registerFormPresetsTools(server: McpServer, principal: McpPrincipal) {
  const { read, write } = adminToolkit(server, principal);
  const get = async (id: string, source: AdminTransaction | typeof db = db) => {
    const [row] = await source.select().from(customFormPresets).where(eq(customFormPresets.id, id)).limit(1); if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
  };
  read("forms.presets.list", "forms:read", z.object(adminPagination), "Daftar preset formulir yang dapat dipakai ulang.", async ({ limit, offset }) => (await db.select().from(customFormPresets).orderBy(asc(customFormPresets.id)).limit(limit).offset(offset)).map(view));
  read("forms.presets.get", "forms:read", z.object({ id: adminId }), "Ambil pertanyaan dan pengaturan preset untuk forms.create.", async ({ id }) => view(await get(id)));
  write("forms.presets.create", "forms:write", definition, "Simpan pertanyaan dan pengaturan sebagai preset.", async (tx, input) => {
    const [row] = await tx.insert(customFormPresets).values({ ...input, id: crypto.randomUUID(), createdById: principal.userId }).returning(); return view(row);
  });
  write("forms.presets.update", "forms:write", definition.extend({ id: adminId, expectedRevision: adminRevision }), "Ubah preset tanpa mengubah formulir yang sudah dibuat.", async (tx, { id, expectedRevision, ...input }) => {
    if (revisionOf(await get(id, tx)) !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    const [row] = await tx.update(customFormPresets).set(input).where(eq(customFormPresets.id, id)).returning(); return view(row);
  });
  write("forms.presets.delete", "forms:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Hapus preset tanpa menghapus formulir yang sudah dibuat.", async (tx, { id, expectedRevision }) => {
    if (revisionOf(await get(id, tx)) !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    await tx.delete(customFormPresets).where(eq(customFormPresets.id, id)); return { id, deleted: true };
  });
}
