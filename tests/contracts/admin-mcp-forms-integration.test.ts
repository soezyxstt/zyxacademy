// Run in its own Bun process: the database and authentication modules are intentionally isolated.
import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
let active = true;
mock.module("@/lib/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({
  requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); },
  resolveMcpAdmin: async () => { if (!active) throw new Error("private revoked session"); },
}));
process.env.BETTER_AUTH_SECRET = "local-only-admin-mcp-integration-signing-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
const { registerFormPresetsTools } = await import("@/lib/admin-mcp/form-presets-tools");
const { registerFormsTools } = await import("@/lib/admin-mcp/forms-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const scopes = ["shortlinks:read", "shortlinks:write", "forms:read", "forms:write", "forms:responses:read", "forms:responses:export"];
registerFormsTools({ registerResource: () => undefined, registerTool: (name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, handler) } as never, { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth", scopes });
registerFormPresetsTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth", scopes });
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
const commit = async (name: string, input: Record<string, unknown>) => {
  const plan = await call(name, input);
  expect(plan.ok).toBe(true);
  return call(name, { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken });
};
beforeAll(async () => { await database.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test", role: "admin" }); await database.insert(schema.pengguna).values({ id: "admin" }); });
afterAll(async () => { await client.close(); });
const definition = { title: "Pendaftaran", slug: "pendaftaran", category: "registration", questions: [{ title: "Nama", type: "TEXT", required: true }, { title: "Jadwal", type: "CHECKBOX", options: ["Sabtu", "Minggu"] }], settings: { acceptingResponses: true, collectEmail: "input" } };
let form: any;
test("plans do not write; create retries are idempotent and conflict on changed payload", async () => {
  const input = { requestKey: "create-form-1", definition };
  const plan = await call("forms.create", input);
  expect(plan.data.dryRun).toBe(true);
  expect(await database.select().from(schema.customForms)).toHaveLength(0);
  const created = await call("forms.create", { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken });
  expect(created.ok).toBe(true); form = created.data;
  const retry = await call("forms.create", { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken });
  expect(retry.data.id).toBe(form.id);
  expect(await database.select().from(schema.customForms)).toHaveLength(1);
  const conflict = await commit("forms.create", { ...input, definition: { ...definition, slug: "different" } });
  expect(conflict.error).toBe("IDEMPOTENCY_CONFLICT");
  expect(await database.select().from(schema.auditMutasi)).toHaveLength(1);
});
test("a plan cannot authorize changed input or be used after session revocation", async () => {
  const input = { requestKey: "create-form-2", definition: { ...definition, slug: "second" } };
  const plan = await call("forms.create", input);
  const changed = await call("forms.create", { ...input, definition: { ...definition, slug: "tampered" }, dryRun: false, confirmationToken: plan.data.confirmationToken });
  expect(changed.error).toBe("CONFIRMATION_INVALID");
  active = false;
  const revoked = await call("forms.create", { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken });
  expect(revoked.error).toBe("ADMIN_MCP_REQUEST_FAILED");
  expect(JSON.stringify(revoked)).not.toContain("private revoked"); active = true;
});
test("slug collision rolls back without receipt; stale revisions cannot update", async () => {
  const collision = await commit("forms.create", { requestKey: "create-form-3", definition });
  expect(collision.error).toBe("SLUG_CONFLICT");
  const updated = await commit("forms.set_acceptance", { requestKey: "close-form-1", id: form.id, expectedRevision: form.revision, acceptingResponses: false });
  expect(updated.data.settings.acceptingResponses).toBe(false);
  const stale = await commit("forms.update", { requestKey: "update-form-1", id: form.id, expectedRevision: form.revision, definition });
  expect(stale.error).toBe("REVISION_CONFLICT"); form = updated.data;
});
test("simulation reports schedule and answer failures with no writes", async () => {
  const before = await database.select().from(schema.auditMutasi);
  const result = await call("forms.simulate_submission", { id: form.id, answers: { "1": ["Unknown"] } });
  expect(result.data.persisted).toBe(false); expect(result.data.valid).toBe(false);
  expect(result.data.blockers).toContain("FORM_CLOSED"); expect(result.data.blockers).toContain("EMAIL_REQUIRED");
  expect(result.data.issues.map((i: any) => i.code)).toEqual(["REQUIRED", "INVALID_ANSWER"]);
  expect(await database.select().from(schema.customFormResponses)).toHaveLength(0);
  expect(await database.select().from(schema.auditMutasi)).toHaveLength(before.length);
});
test("summary omits identity and open answers, uses respondent denominator; CSV is safe", async () => {
  await database.insert(schema.customFormResponses).values([
    { id: "r1", formId: form.id, responderEmail: "private@example.test", submittedAt: new Date("2025-01-01T00:00:00.000Z"), answers: { "0": "=HYPERLINK(private)", "1": ["Sabtu", "Minggu"] } },
    { id: "r2", formId: form.id, submittedAt: new Date("2025-01-02T00:00:00.000Z"), answers: { "0": "Sensitive name", "1": ["Sabtu"] } },
  ]);
  const result = await call("forms.responses.summarize", { formId: form.id });
  expect(result.data.totalResponses).toBe(2);
  const filtered = await call("forms.responses.summarize", { formId: form.id, from: "2020-01-01T00:00:00Z", to: "2099-01-01T00:00:00Z" });
  expect(filtered.data.totalResponses).toBe(2);
  const boundary = await call("forms.responses.summarize", { formId: form.id, from: "2025-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" });
  expect(boundary.data.totalResponses).toBe(1);
  const excluded = await call("forms.responses.summarize", { formId: form.id, from: "2025-01-01T00:00:00.001Z", to: "2025-01-01T23:59:59Z" });
  expect(excluded.data.totalResponses).toBe(0);
  expect(result.data.questions[1]).toMatchObject({ denominator: 2, answered: 2, counts: { Sabtu: 2, Minggu: 1 } });
  expect(JSON.stringify(result)).not.toContain("private"); expect(JSON.stringify(result)).not.toContain("Sensitive name");
  const csv = await call("forms.responses.export", { formId: form.id, limit: 1 });
  expect(csv.data.nextOffset).toBe(1); expect(csv.data.csv).toContain("'=HYPERLINK");
  expect(csv.data.rowCount).toBe(1);
});
test("shortlink update/delete checks revision and audit, and creation retries preserve ID", async () => {
  const input = { requestKey: "shortlink-create", definition: { slug: "join", url: "https://example.test/join", title: "Join" } };
  const created = await commit("shortlinks.create", input); expect(created.ok).toBe(true);
  const retry = await commit("shortlinks.create", input); expect(retry.data.id).toBe(created.data.id);
  const updated = await commit("shortlinks.update", { requestKey: "shortlink-update", id: created.data.id, expectedRevision: created.data.revision, definition: { ...input.definition, url: "https://example.test/new" } });
  expect(updated.data.url).toBe("https://example.test/new");
  const stale = await commit("shortlinks.delete", { requestKey: "shortlink-delete-old", id: created.data.id, expectedRevision: created.data.revision }); expect(stale.error).toBe("REVISION_CONFLICT");
  const removed = await commit("shortlinks.delete", { requestKey: "shortlink-delete", id: created.data.id, expectedRevision: updated.data.revision }); expect(removed.data.deleted).toBe(true);
  expect(await database.select().from(schema.shortLink).where(eq(schema.shortLink.id, created.data.id))).toHaveLength(0);
});

test("presets retain validated questions and updates use their own revision", async () => {
  const input = { name: "Registration", questions: definition.questions, settings: definition.settings };
  const created = await commit("forms.presets.create", { ...input, requestKey: "preset-create-1" }); expect(created.ok).toBe(true);
  const changed = await commit("forms.presets.update", { ...input, name: "Updated", id: created.data.id, expectedRevision: created.data.revision, requestKey: "preset-update-1" }); expect(changed.data.name).toBe("Updated");
  expect((await commit("forms.presets.delete", { id: created.data.id, expectedRevision: created.data.revision, requestKey: "preset-delete-stale" })).error).toBe("REVISION_CONFLICT");
});
