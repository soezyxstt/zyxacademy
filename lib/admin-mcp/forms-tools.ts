import { adminMcpFailure } from "./errors";
import { registerOperationDescriptor } from "./operation-contracts";
import { assertMcpTarget } from "@/lib/authoring/mcp-environment";
import { timestampRange } from "@/lib/db/timestamp-condition";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { customForms, customFormResponses, shortLink } from "@/db/schema";
import { requireMcpScope, resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { normalizeDate } from "@/lib/date-utils";
import { buildFormSteps } from "@/lib/forms/presentation";
import { formDefinitionSchema, formQuestionSchema, formSettingsSchema, validateFormAnswers, summarizeFormResponses, csvCell } from "@/lib/forms/validation";
import { AdminMcpError, mutationPlan, verifyMutationPlan } from "./mutations";
import { changeForm, changeShortlink, createForm, formView, readActiveForm, shortlinkDefinitionSchema, shortlinkView } from "./forms-service";
import { registerFormsUi, formsUiMeta, FORMS_PREVIEW_URI, FORMS_SUMMARY_URI } from "./forms-ui";

const pagination = { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) };
const id = z.string().min(1).max(200);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const mutationControls = { requestKey: z.string().min(8).max(100), dryRun: z.boolean().default(true), confirmationToken: z.string().max(4096).optional() };
const responseFilter = { formId: id, from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() };
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean }; _meta?: Record<string, unknown> }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };

/** Domain tools share live authorization, schemas, transactional receipts, and safe error output. */
export function registerFormsTools(server: McpServer, principal: McpPrincipal): void {
  registerFormsUi(server);
  const registrar = server as unknown as Registrar;
  function register<T extends z.ZodObject>(name: string, scope: string, schema: T, description: string, execute: (input: z.infer<T>) => Promise<unknown>, write = false, ui?: string) {
    const scopedSchema = schema.safeExtend({ expectedEnvironment: z.enum(["staging", "production", "local"]), expectedOrigin: z.url().max(2048) });
    const descriptor = registerOperationDescriptor(server, { name, scope, description, schema: scopedSchema, write });
    registrar.registerTool(name, { description, inputSchema: scopedSchema.shape, annotations: descriptor.annotations, ...(ui ? { _meta: formsUiMeta(ui) } : {}) }, async (raw) => {
      try {
        requireMcpScope(principal, scope);
        const { expectedEnvironment, expectedOrigin, ...businessInput } = scopedSchema.strict().parse(raw);
        try { assertMcpTarget(expectedEnvironment, expectedOrigin); } catch { throw new AdminMcpError("MCP_TARGET_ENVIRONMENT_MISMATCH"); }
        const input = businessInput as z.infer<T>;
        if (Buffer.byteLength(JSON.stringify(input)) > 1000000) throw new AdminMcpError("INPUT_TOO_LARGE");
        await resolveMcpAdmin(principal);
        const data = await execute(input);
        if (Buffer.byteLength(JSON.stringify(data) ?? "") > 1000000) throw new AdminMcpError("REDUCE_PAGE_SIZE");
        const payload = { ok: true, data };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
      } catch (error) {
        return adminMcpFailure(error);
      }
    });
  }
  function write<T extends z.ZodObject>(name: string, scope: string, schema: T, description: string, execute: (input: z.infer<T>, requestKey: string) => Promise<unknown>) {
    register(name, scope, schema.safeExtend(mutationControls), description + " dryRun=true mengembalikan rencana dan token; jalankan input yang sama dengan dryRun=false dan confirmationToken.", async raw => {
      const { dryRun, confirmationToken, requestKey, ...input } = raw;
      const target = input as z.infer<T>;
      const key = z.string().parse(requestKey);
      const token = confirmationToken === undefined ? undefined : z.string().parse(confirmationToken);
      const bound = { ...input, requestKey };
      if (dryRun) return mutationPlan(principal, name, bound, { target: input, operation: name });
      if (!token) throw new AdminMcpError("CONFIRMATION_REQUIRED");
      verifyMutationPlan(principal, name, bound, token);
      return execute(target, key);
    }, true);
  }
  register("shortlinks.list", "shortlinks:read", z.object(pagination), "Daftar tautan pendek.", async ({ limit, offset }) =>
    (await db.select().from(shortLink).orderBy(asc(shortLink.id)).limit(limit).offset(offset)).map(shortlinkView));
  register("shortlinks.get", "shortlinks:read", z.object({ id }), "Lihat tautan pendek dan revisinya.", async input => {
    const [row] = await db.select().from(shortLink).where(eq(shortLink.id, input.id)).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); return shortlinkView(row);
  });
  write("shortlinks.create", "shortlinks:write", z.object({ definition: shortlinkDefinitionSchema }), "Buat tautan pendek.", (input, key) => changeShortlink(principal, key, input));
  write("shortlinks.update", "shortlinks:write", z.object({ id, expectedRevision: revision, definition: shortlinkDefinitionSchema }), "Ubah tujuan, judul, atau slug tautan.", (input, key) => changeShortlink(principal, key, input));
  write("shortlinks.delete", "shortlinks:write", z.object({ id, expectedRevision: revision }), "Hapus tautan; URL pendek berhenti mengalihkan pengunjung.", (input, key) => changeShortlink(principal, key, { ...input, remove: true }));
  register("forms.list", "forms:read", z.object(pagination), "Daftar formulir aktif.", async ({ limit, offset }) =>
    (await db.select().from(customForms).where(isNull(customForms.deletedAt)).orderBy(asc(customForms.id)).limit(limit).offset(offset)).map(row => { const view = formView(row); return { id: view.id, slug: view.slug, title: view.title, category: view.category, revision: view.revision }; }));
  register("forms.get", "forms:read", z.object({ id }), "Lihat definisi formulir dan revisinya tanpa respons.", async input => formView(await readActiveForm(input.id)));
  register("forms.preview", "forms:read", z.object({ id }), "Coba formulir tanpa mengirim respons. Berkas tidak diunggah.", async input => {
    const form = formView(await readActiveForm(input.id));
    const settings = form.settings as z.infer<typeof formSettingsSchema> | null;
    return { form, steps: buildFormSteps(form.questions, settings?.displayMode ?? "question", settings?.collectEmail === "input"), simulationOnly: true };
  }, false, FORMS_PREVIEW_URI);
  write("forms.create", "forms:write", z.object({ definition: formDefinitionSchema }), "Buat formulir dengan slug yang tersedia.", (input, key) => createForm(principal, key, input.definition));
  write("forms.update", "forms:write", z.object({ id, expectedRevision: revision, definition: formDefinitionSchema }), "Ganti definisi formulir setelah memeriksa revisi.", (input, key) => changeForm(principal, key, input));
  write("forms.archive", "forms:write", z.object({ id, expectedRevision: revision }), "Arsipkan formulir; formulir tidak lagi tersedia untuk pengisian.", (input, key) => changeForm(principal, key, { ...input, archive: true }));
  write("forms.set_acceptance", "forms:write", z.object({ id, expectedRevision: revision, acceptingResponses: z.boolean() }), "Buka atau tutup penerimaan respons. Jadwal tetap berlaku.", (input, key) => changeForm(principal, key, input));
  const answerInput = z.object({ id, answers: z.record(z.string().max(10), z.unknown()).refine(v => JSON.stringify(v).length <= 1000000), responderEmail: z.email().optional(), authenticated: z.boolean().default(false), alreadyResponded: z.boolean().default(false) });
  async function validate(input: z.infer<typeof answerInput>) {
    const form = await readActiveForm(input.id);
    const questions = z.array(formQuestionSchema).parse(form.questions);
    const settings = formSettingsSchema.parse(form.settings ?? {});
    const validation = validateFormAnswers(questions, input.answers);
    const blockers: string[] = [];
    if (settings.acceptingResponses === false) blockers.push("FORM_CLOSED");
    if (settings.openAt && Date.now() < Date.parse(settings.openAt)) blockers.push("FORM_NOT_OPEN");
    if (settings.closeAt && Date.now() > Date.parse(settings.closeAt)) blockers.push("FORM_CLOSED");
    if ((settings.requireLogin || settings.collectEmail === "verified") && !input.authenticated) blockers.push("LOGIN_REQUIRED");
    if (settings.collectEmail === "input" && !input.responderEmail) blockers.push("EMAIL_REQUIRED");
    if (settings.limitToOneResponse && input.authenticated && input.alreadyResponded) blockers.push("ALREADY_RESPONDED");
    return { ...validation, valid: validation.valid && blockers.length === 0, blockers, simulated: true, persisted: false, identityVerified: false };
  }
  register("forms.validate_answers", "forms:read", answerInput, "Validasi jawaban berdasarkan indeks pertanyaan. Identitas dan kepemilikan berkas tidak diverifikasi.", validate);
  register("forms.simulate_submission", "forms:read", answerInput, "Simulasikan pengiriman tanpa penyimpanan, unggahan, atau efek integrasi.", validate);
  const whereResponses = (input: z.infer<z.ZodObject<typeof responseFilter>>) => {
    if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to)) throw new AdminMcpError("INVALID_DATE_RANGE");
    return and(eq(customFormResponses.formId, input.formId), timestampRange(customFormResponses.submittedAt, input.from, input.to));
  };
  register("forms.responses.list", "forms:responses:read", z.object({ ...responseFilter, ...pagination, includeAnswers: z.boolean().default(false) }), "Daftar respons dan identitas pengisi sesuai filter.", async input => {
    await readActiveForm(input.formId);
    const columns = { id: customFormResponses.id, formId: customFormResponses.formId, submittedAt: customFormResponses.submittedAt, responderEmail: customFormResponses.responderEmail, responderUserId: customFormResponses.responderUserId };
    return input.includeAnswers
      ? db.select().from(customFormResponses).where(whereResponses(input)).orderBy(asc(customFormResponses.id)).limit(input.limit).offset(input.offset)
      : db.select(columns).from(customFormResponses).where(whereResponses(input)).orderBy(asc(customFormResponses.id)).limit(input.limit).offset(input.offset);
  });
  register("forms.responses.get", "forms:responses:read", z.object({ formId: id, id }), "Lihat satu respons milik formulir.", async input => {
    await readActiveForm(input.formId);
    const [row] = await db.select().from(customFormResponses).where(and(eq(customFormResponses.formId, input.formId), eq(customFormResponses.id, input.id))).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
  });
  register("forms.responses.summarize", "forms:responses:read", z.object(responseFilter), "Ringkasan deterministik dan grafik pilihan tanpa identitas atau jawaban bebas. Maksimal 5000 respons per filter.", async input => {
    const form = await readActiveForm(input.formId);
    const rows = await db.select({ answers: customFormResponses.answers }).from(customFormResponses).where(whereResponses(input)).orderBy(asc(customFormResponses.id)).limit(5001);
    if (rows.length > 5000) throw new AdminMcpError("NARROW_DATE_FILTER");
    return summarizeFormResponses(z.array(formQuestionSchema).parse(form.questions), rows);
  }, false, FORMS_SUMMARY_URI);
  register("forms.responses.export", "forms:responses:export", z.object({ ...responseFilter, ...pagination }), "Ekspor satu halaman CSV berisi identitas dan jawaban. Lanjutkan dengan nextOffset hingga null.", async input => {
    requireMcpScope(principal, "forms:responses:read");
    const form = await readActiveForm(input.formId);
    const rows = await db.select().from(customFormResponses).where(whereResponses(input)).orderBy(asc(customFormResponses.id)).limit(input.limit + 1).offset(input.offset);
    const visible = rows.slice(0, input.limit);
    const questions = form.questions.map((q, index) => ({ q, index })).filter(({ q }) => !["SECTION", "STATEMENT"].includes(q.type));
    const csv = [["Response ID", "Submitted at", "Email", ...questions.map(({ q }) => q.title)].map(csvCell).join(","), ...visible.map(row => [row.id, normalizeDate(row.submittedAt).toISOString(), row.responderEmail, ...questions.map(({ q, index }) => row.answers[String(index)] ?? row.answers[q.title] ?? "")].map(csvCell).join(","))].join("\r\n");
    if (Buffer.byteLength(csv) > 1000000) throw new AdminMcpError("REDUCE_PAGE_SIZE");
    return { filename: `form-${form.slug}-responses-${input.offset}.csv`, mimeType: "text/csv", csv, rowCount: visible.length, nextOffset: rows.length > input.limit ? input.offset + input.limit : null };
  });
}
