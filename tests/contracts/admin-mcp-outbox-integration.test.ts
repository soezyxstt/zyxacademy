import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";
import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq, like } from "drizzle-orm";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb(); let active = true;
mock.module("@/lib/db", () => ({ db: database })); mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({
  MCP_MANUAL_CLIENT_ID: "zyx-admin-connection",
  requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); },
  resolveMcpAdmin: async () => { if (!active) throw new Error("private expired authorization"); },
}));
process.env.BETTER_AUTH_SECRET = "local-only-outbox-integration-signing-key";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
process.env.NEXT_PUBLIC_APP_URL = process.env.BETTER_AUTH_URL;
const { registerExternalTools } = await import("@/lib/admin-mcp/external-tools");
let spreadsheetWrites = 0;
mock.module("@/lib/google-sheets", () => ({ readSheetGrid: async () => [["manual"]], syncGoogleSpreadsheet: async () => { spreadsheetWrites++; return { spreadsheetId: "sheet", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet", isNew: false }; } }));
const { executeAdminOperation } = await import("@/lib/admin-mcp/external-executor");
const { formExportSnapshot } = await import("@/lib/admin-mcp/external-contracts");
const { revisionOf } = await import("@/lib/admin-mcp/mutations");
const { processAdminOperation } = await import("@/lib/admin-mcp/external-jobs");
const { storeAuthorizationCode } = await import("@/lib/authoring/mcp-oauth");
const grant = async (scope: string[] = principal.scopes) => storeAuthorizationCode({ userId: "admin", sessionId: "session", clientId: "fixture-oauth-client", resource: "http://localhost:3100/api/mcp/authoring", scope, redirectUri: "https://client.example.test/callback", codeChallenge: "fixture" }, new Date("2099-01-01"));
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, clientId: "fixture-oauth-client", resource: "http://localhost:3100/api/mcp/authoring", scopes: ["notifications:send", "notifications:read", "jobs:read", "jobs:write", "meet:write", "meet:read", "forms:responses:read", "forms:responses:export"] };
registerExternalTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, principal);
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
async function commit(name: string, input: Record<string, unknown>) { const plan = await call(name, input); expect(plan.ok).toBe(true); return call(name, { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken }); }
beforeAll(async () => {  for (const id of ["admin", "one", "two", "suspended"]) { await database.insert(schema.user).values({ id, name: id, email: `${id}@example.test` }); await database.insert(schema.pengguna).values({ id, status: id === "suspended" ? "suspended" : "active" }); } await seedAdminMcpAuthority(database, principal); await grant(); });
afterAll(async () => { await client.close(); });
let jobId = "";
test("audience is explicit, excludes suspended users, never widens malformed targets", async () => {
  expect((await call("notifications.audience", { target: "course" })).error).toBe("INVALID_AUDIENCE");
  const audience = await call("notifications.audience", { target: "users", userIds: ["one", "suspended"] });
  expect(audience.data.recipientIds).toEqual(["one"]);
  const input = { requestKey: "send-one-notification", title: "Reminder", body: "Class", recipientIds: audience.data.recipientIds, audienceRevision: audience.data.audienceRevision };
  const created = await commit("notifications.send", input); expect(created.ok).toBe(true); jobId = created.data.id;
  expect((await commit("notifications.send", input)).data.id).toBe(jobId);
  expect(await database.select().from(schema.adminOperationJobs)).toHaveLength(1);
  const [stored] = await database.select().from(schema.adminOperationJobs); expect(stored.payload.recipientIds).toEqual(["one"]);
});
test("durable claim prevents duplicate side effects after uncertain provider failure", async () => {
  let effects = 0;
  const execute = async () => { effects++; throw new Error("private provider credential failure after side effect"); };
  expect((await processAdminOperation(jobId, execute)).status).toBe("unknown");
  expect((await processAdminOperation(jobId, execute)).claimed).toBe(false);
  expect(effects).toBe(1);
  const view = await call("adminjobs.get", { id: jobId });
  expect(view.data.errorCode).toBe("RECONCILIATION_REQUIRED"); expect(view.data.payload).toBeUndefined();
  expect(JSON.stringify(view)).not.toContain("private provider");
});
test("cancel can stop queued jobs but cannot claim to stop an unknown provider effect", async () => {
  const unknown = await call("adminjobs.get", { id: jobId });
  expect((await commit("adminjobs.cancel", { requestKey: "cancel-unknown-job", id: jobId, expectedRevision: unknown.data.revision })).error).toBe("JOB_NOT_QUEUED");
  const created = await commit("meet.create", { requestKey: "queued-meet-create", title: "Class", slug: "class" });
  const view = await call("adminjobs.get", { id: created.data.id });
  expect((await commit("adminjobs.cancel", { requestKey: "cancel-queued-meet", id: view.data.id, expectedRevision: view.data.revision })).data.status).toBe("cancelled");
  let effects = 0; await processAdminOperation(view.data.id, async () => { effects++; return {}; }); expect(effects).toBe(0);
});
test("expired live authority fails the job before provider invocation", async () => {
  const created = await commit("meet.create", { requestKey: "expired-meet-create", title: "Class", slug: "expired-class" });
  active = false; let effects = 0;
  const result = await processAdminOperation(created.data.id, async () => { effects++; return {}; });
  expect(result.status).toBe("failed"); expect(effects).toBe(0); active = true;
});

test("sheet overwrite requires the typed phrase and rejects a stale sheet snapshot before writing", async () => {
  await database.insert(schema.customForms).values({ id: "sheet-form", slug: "sheet-form", title: "Form", questions: [{ title: "Name", type: "TEXT" }], createdById: "admin" });
  await database.insert(schema.exportSpreadsheets).values({ id: "form_sheet-form", entityType: "form", entityId: "sheet-form", driveFolderId: "folder", folderPath: "forms/sheet-form", spreadsheetId: "sheet", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet" });
  process.env.GOOGLE_CLIENT_ID = "fixture"; process.env.GOOGLE_CLIENT_SECRET = "fixture"; process.env.GOOGLE_REFRESH_TOKEN = "fixture";
  const state = await formExportSnapshot({ formId: "sheet-form" });
  const input = { formId: "sheet-form", expectedDataRevision: state.dataRevision, expectedSpreadsheetId: "sheet", expectedSheetFingerprint: revisionOf([["old"]]) };
  const invalid = await commit("forms.responses.export_sheet", { ...input, requestKey: "invalid-phrase-export", overwritePhrase: "yes" });
  expect(invalid.error).toBe("OVERWRITE_PHRASE_INVALID");
  const created = await commit("forms.responses.export_sheet", { ...input, requestKey: "stale-sheet-export" });
  expect(created.ok).toBe(true);
  expect((await processAdminOperation(created.data.id, executeAdminOperation)).status).toBe("failed");
  expect((await call("adminjobs.get", { id: created.data.id })).data.errorCode).toBe("SPREADSHEET_CHANGED");
  expect(spreadsheetWrites).toBe(0);
});

test("late completion cannot overwrite operator reconciliation after a lost claim", async () => {
  const created = await commit("meet.create", { requestKey: "lost-claim-meet", title: "Class", slug: "lost-claim" });
  const result = await processAdminOperation(created.data.id, async () => {
    await database.update(schema.adminOperationJobs).set({ status: "failed", errorCode: "OPERATOR_RECONCILED_FAILURE" }).where(eq(schema.adminOperationJobs.id, created.data.id));
    throw new Error("late provider failure");
  });
  expect(result.status).toBe("unknown");
  const [stored] = await database.select().from(schema.adminOperationJobs).where(eq(schema.adminOperationJobs.id, created.data.id));
  expect(stored.status).toBe("failed");
  expect(stored.errorCode).toBe("OPERATOR_RECONCILED_FAILURE");
});

test("a worker on a different origin cannot claim a queued operation", async () => {
  const created = await commit("meet.create", { requestKey: "environment-isolated-meet", title: "Class", slug: "environment-isolated" });
  const previous = process.env.BETTER_AUTH_URL;
  let effects = 0;
  try {
    process.env.BETTER_AUTH_URL = "https://www.zyxacademy.com";
    process.env.NEXT_PUBLIC_APP_URL = process.env.BETTER_AUTH_URL;
    expect((await processAdminOperation(created.data.id, async () => { effects++; return {}; })).claimed).toBe(false);
  } finally { process.env.BETTER_AUTH_URL = previous; process.env.NEXT_PUBLIC_APP_URL = previous; }
  expect(effects).toBe(0);
  const [stored] = await database.select().from(schema.adminOperationJobs).where(eq(schema.adminOperationJobs.id, created.data.id));
  expect(stored.status).toBe("queued");
});

test("revoked client consent blocks queued effects even while the admin session remains active", async () => {
  const created = await commit("meet.create", { requestKey: "revoked-consent-meet", title: "Class", slug: "revoked-consent" });
  await database.delete(schema.verification).where(like(schema.verification.identifier, "mcp:oauth:consent:%"));
  expect((await commit("meet.create", { requestKey: "revoked-consent-new-job", title: "Class", slug: "revoked-new" })).error).toBe("OAUTH_CONSENT_REQUIRED");
  let effects = 0;
  const result = await processAdminOperation(created.data.id, async () => { effects++; return {}; });
  expect(result.status).toBe("failed"); expect(effects).toBe(0);
  const [stored] = await database.select().from(schema.adminOperationJobs).where(eq(schema.adminOperationJobs.id, created.data.id));
  expect(stored.errorCode).toBe("AUTHORIZATION_EXPIRED");
  await grant();
});
test("export jobs recheck secondary response permission and reject manual connections", async () => {
  const snapshot = await formExportSnapshot({ formId: "sheet-form" });
  const created = await commit("forms.responses.export_sheet", { requestKey: "narrowed-consent-export", formId: "sheet-form", expectedDataRevision: snapshot.dataRevision, expectedSpreadsheetId: "sheet", expectedSheetFingerprint: revisionOf([["manual"]]) });
  expect(created.ok).toBe(true);
  await grant(principal.scopes.filter(scope => scope !== "forms:responses:read"));
  let effects = 0;
  expect((await processAdminOperation(created.data.id, async () => { effects++; return {}; })).status).toBe("failed");
  expect(effects).toBe(0); await grant();
  principal.clientId = "zyx-admin-connection";
  try { expect((await commit("meet.create", { requestKey: "manual-denied-meet", title: "Class", slug: "manual-denied" })).error).toBe("OAUTH_CONSENT_REQUIRED"); }
  finally { principal.clientId = "fixture-oauth-client"; }
});
