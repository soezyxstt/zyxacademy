// Run alone: this file isolates its PostgreSQL fixture from application credentials.
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import * as schema from "@/db/schema";
import { membershipIdFor } from "@/lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";
import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";

const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database }));
mock.module("@/db", () => ({ db: database }));
process.env.BETTER_AUTH_SECRET = "local-only-agent-experience-signing-key";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3100";
const { adminToolkit } = await import("@/lib/admin-mcp/toolkit");
const { registerAgentTools } = await import("@/lib/admin-mcp/agent-tools");
const { registerOperationsTools } = await import("@/lib/admin-mcp/operations-tools");
const { registerFormsTools } = await import("@/lib/admin-mcp/forms-tools");
const { registerRevisionTools } = await import("@/lib/authoring/revision-mcp");
const { adminMcpFailure } = await import("@/lib/admin-mcp/errors");
const { registeredOperation } = await import("@/lib/admin-mcp/operation-contracts");
const { auditedMutation, AdminMcpError } = await import("@/lib/admin-mcp/mutations");
const { storeAuthorizationCode } = await import("@/lib/authoring/mcp-oauth");
const originalScopes = ["blog:read", "blog:write", "groups:read", "groups:write", "forms:read", "forms:write", "forms:responses:export", "forms:responses:read", "notifications:send", "jobs:write", "jobs:read"];
const principal = adminMcpTestPrincipal({ userId: "agent-admin", actorId: "agent-admin", sessionId: "agent-session", authMethod: "oauth", scopes: originalScopes });
const target = { expectedEnvironment: "local", expectedOrigin: "http://localhost:3100" };
let writes = 0;
function harness(actor: McpPrincipal = principal) {
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<CallToolResult>>();
  const configurations = new Map<string, Record<string, unknown>>();
  const server = { registerResource: () => undefined, registerTool(name: string, config: Record<string, unknown>, handler: (input: Record<string, unknown>) => Promise<CallToolResult>) { handlers.set(name, handler); configurations.set(name, config); } } as unknown as McpServer;
  const { read, write } = adminToolkit(server, actor);
  write("blog.create", "blog:write", z.object({ title: z.string() }), "Create a draft", async tx => {
    const id = `agent-blog-${++writes}`;
    await tx.insert(schema.blogArticles).values({ id, title: "Draft", slug: id, summary: "Summary", content: "Body", category: "tips_kuliah", createdById: actor.actorId, status: "draft" });
    return { id, status: "draft" };
  });
  write("groups.update", "groups:write", z.object({ id: z.string() }), "Update group", async (_tx, input) => ({ id: input.id, name: "Zyx-AB12CD34-10-2", nested: [{ name: "Zyx-AB12CD34-10-2" }] }));
  write("notifications.send", "notifications:send", z.object({ title: z.string() }), "Queue notification", async () => ({ id: "job-fixture", status: "queued" }));
  write("adminjobs.reconcile", "jobs:write", z.object({ id: z.string() }), "Reconcile provider", async (_tx, input) => ({ id: input.id, result: { privateProviderData: "never-return-via-receipt" }, status: "succeeded" }));
  read("blog.validate", "blog:read", z.object({ title: z.string() }).superRefine((input, context) => { if (input.title === "invalid") context.addIssue({ code: "custom", path: ["title"], message: "private validation detail" }); }), "Validate without writes", async input => input);
  registerAgentTools(server, actor);
  return { server, configurations, call: async (name: string, input: Record<string, unknown> = {}) => (await handlers.get(name)!({ ...target, ...input })).structuredContent as any, raw: async (name: string, input: Record<string, unknown> = {}) => handlers.get(name)!({ ...target, ...input }) };
}
const main = harness();
async function commit(name: string, input: Record<string, unknown>, source = main) {
  const plan = await source.call(name, input);
  expect(plan.ok).toBe(true);
  return source.call(name, { ...input, dryRun: false, confirmationToken: plan.data.confirmationToken });
}
async function grant(scopes = originalScopes) {
  await storeAuthorizationCode({ userId: principal.userId, sessionId: principal.sessionId, clientId: principal.clientId!, resource: principal.resource!, scope: scopes, redirectUri: "https://client.example.test/callback", codeChallenge: "fixture" }, new Date("2099-01-01T00:00:00Z"));
}
beforeAll(async () => {
  for (const id of [principal.actorId, "other-admin"]) await database.insert(schema.user).values({ id, name: id, email: `${id}@example.test` });
  await seedAdminMcpAuthority(database, principal);
  await seedAdminMcpAuthority(database, adminMcpTestPrincipal({ ...principal, userId: "other-admin", actorId: "other-admin", sessionId: "other-session" }));
});
afterAll(async () => { await client.close(); });

test("capabilities derive actual registrations, schemas, permissions, pagination and accurate annotations", async () => {
  const listed = await main.call("admin.capabilities", { domain: "blog", limit: 1 });
  expect(listed.data.operations).toHaveLength(1);
  expect(listed.data.pagination).toMatchObject({ limit: 1, offset: 0, total: 2, nextOffset: 1 });
  expect(listed.data.operations[0]).toMatchObject({ name: "blog.create", requiredScopes: ["blog:write"], available: true, risk: "reversible_write", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } });
  expect(listed.data.operations[0].requiredInputs).toContain("title");
  expect(listed.data.operations[0].requiredInputs).toContain("expectedOrigin");
  expect(JSON.stringify(listed)).not.toContain("never-return-via-receipt");
  const restricted = harness({ ...principal, scopes: ["blog:read"] });
  const unavailable = await restricted.call("admin.capabilities", { domain: "blog" });
  expect(unavailable.data.operations.find((item: any) => item.name === "blog.create")).toMatchObject({ available: false, missingScopes: ["blog:write"] });
  expect((await restricted.call("admin.capabilities", { domain: "blog", availableOnly: true })).data.operations.map((item: any) => item.name)).toEqual(["blog.validate"]);
  expect((await main.call("admin.capabilities", { domain: "not_registered" })).data.operations).toEqual([]);
  expect((await main.call("admin.capabilities", { expectedOrigin: "http://localhost:3101" })).error).toBe("MCP_TARGET_ENVIRONMENT_MISMATCH");
  expect((await main.call("blog.validate", { title: "invalid" })).issues).toEqual([{ code: "custom", path: ["title"] }]);
  expect(JSON.stringify(await main.call("blog.validate", { title: "invalid" }))).not.toContain("private validation detail");
  expect(registeredOperation(main.server, "notifications.send")?.annotations.openWorldHint).toBe(true);
});

test("shared registrar, forms and actual revision registrations supply exact scope challenges and schemas", async () => {
  const noScopes = harness({ ...principal, scopes: [] });
  registerOperationsTools(noScopes.server, { ...principal, scopes: [] });
  registerFormsTools(noScopes.server, { ...principal, scopes: [] });
  registerRevisionTools(noScopes.server, { ...principal, scopes: [] });
  for (const [operation, requiredScope] of [["blog.create", "blog:write"], ["courses.list", "courses:read"], ["forms.get", "forms:read"]]) {
    const denied = await noScopes.raw(operation);
    expect(denied.structuredContent).toMatchObject({ ok: false, error: "AUTHORING_MCP_SCOPE_REQUIRED", requiredScope, action: "reauthorize" });
    expect(denied._meta?.["mcp/www_authenticate"]).toBeArray();
  }
  const revision = (await noScopes.call("admin.capabilities", { domain: "authoring", limit: 20 })).data;
  expect(revision.operations).toHaveLength(9);
  expect(revision.operations.find((item: any) => item.name === "authoring.publish_release")).toMatchObject({ requiredScopes: ["authoring:read", "authoring:publish"], protocol: "authoring-revision", retry: { strategy: "exact_revision" } });
  expect(revision.workflows[0].tools).toContain("authoring.get_edit_context");
  expect(registeredOperation(noScopes.server, "forms.responses.export")?.requiredScopes).toEqual(["forms:responses:export", "forms:responses:read"]);
});

test("response loss recovers a committed database result without repeating the write or exposing raw audit", async () => {
  const input = { title: "Draft", requestKey: "agent-response-loss" };
  const created = await commit("blog.create", input);
  expect(created.ok).toBe(true);
  const metadata = await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey });
  expect(metadata.data).toMatchObject({ state: "committed", databaseOutcome: "committed", targetId: created.data.id });
  expect(metadata.data.result).toBeUndefined();
  expect(metadata.data.inputHash).toBeUndefined();
  const recovered = await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey, includeResult: true });
  expect(recovered.data.result).toEqual(created.data);
  expect(recovered.data.resultIsHistorical).toBe(true);
  const before = writes;
  expect((await commit("blog.create", input)).data).toEqual(created.data);
  expect(writes).toBe(before);
  expect((await main.call("admin.operation_receipt", { operation: "groups.update", requestKey: input.requestKey })).error).toBe("IDEMPOTENCY_CONFLICT");
  const other = harness(adminMcpTestPrincipal({ ...principal, userId: "other-admin", actorId: "other-admin", sessionId: "other-session" }));
  expect((await other.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey })).data.state).toBe("not_recorded");
  expect((await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey, expectedOrigin: "https://www.zyxacademy.com" })).error).toBe("MCP_TARGET_ENVIRONMENT_MISMATCH");
});

test("unknown outcomes preserve the same key; original scopes and original result redaction also apply to receipts", async () => {
  const unknown = await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: "never-submitted-key" });
  expect(unknown.data).toMatchObject({ state: "not_recorded", databaseOutcome: "unknown", recovery: { receiptMayStillBeInFlight: true, preserveOperationPayloadAndRequestKey: true, newRequestKeyAllowedBecauseMissingReceipt: false } });
  await commit("groups.update", { id: "group-id", requestKey: "groups-private-receipt" });
  const receipt = await main.call("admin.operation_receipt", { operation: "groups.update", requestKey: "groups-private-receipt", includeResult: true });
  expect(JSON.stringify(receipt)).not.toContain("AB12CD34");
  expect(receipt.data.result.name).toBe("Token aktivasi");
  const noWrite = harness({ ...principal, scopes: ["blog:read"] });
  expect((await noWrite.call("admin.operation_receipt", { operation: "groups.update", requestKey: "groups-private-receipt", includeResult: true })).requiredScope).toBe("groups:write");
  expect((await main.call("admin.operation_receipt", { operation: "blog.validate", requestKey: "never-submitted-key" })).error).toBe("OPERATION_RECEIPT_UNSUPPORTED");
});

test("queued receipts attest database commit only and job reconciliation never discloses stored provider results", async () => {
  await commit("notifications.send", { title: "Class", requestKey: "queued-operation-key" });
  const queued = await main.call("admin.operation_receipt", { operation: "notifications.send", requestKey: "queued-operation-key", includeResult: true });
  expect(queued.data).toMatchObject({ state: "committed", providerOutcome: "not_attested", result: { id: "job-fixture", status: "queued" }, nextActions: [{ tool: "adminjobs.get", arguments: { id: "job-fixture" }, requiredScopes: ["jobs:read", "notifications:send"] }] });
  await commit("adminjobs.reconcile", { id: "provider-job", requestKey: "provider-reconcile-key" });
  const metadata = await main.call("admin.operation_receipt", { operation: "adminjobs.reconcile", requestKey: "provider-reconcile-key", includeResult: true });
  expect(metadata.data.state).toBe("committed");
  expect(metadata.data.result).toBeUndefined();
  expect(metadata.data.resultOmitted).toBeString();
  expect(JSON.stringify(metadata)).not.toContain("never-return-via-receipt");
});

test("transaction authority and receipt replay reject revoked session, canonical membership, suspension and narrowed consent", async () => {
  const input = { title: "Authority baseline", requestKey: "authority-baseline-key" };
  await commit("blog.create", input);
  let reached = false;
  const execute = async () => { reached = true; return { id: "should-never-commit" }; };
  await database.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, principal.actorId));
  await expect(auditedMutation(principal, "blog.create", input.requestKey, { title: input.title }, execute)).rejects.toThrow("AUTHORING_MCP_ADMIN_REQUIRED");
  expect((await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey })).error).toBe("AUTHORING_MCP_ADMIN_REQUIRED");
  await database.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, principal.actorId));
  await database.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.id, membershipIdFor(principal.actorId, "admin")));
  await expect(auditedMutation(principal, "blog.create", "revoked-membership-key", {}, execute)).rejects.toThrow("AUTHORING_MCP_ADMIN_REQUIRED");
  await seedAdminMcpAuthority(database, principal);
  await database.update(schema.session).set({ expiresAt: new Date("2000-01-01T00:00:00Z") }).where(eq(schema.session.id, principal.sessionId));
  await expect(auditedMutation(principal, "blog.create", input.requestKey, { title: input.title }, execute)).rejects.toThrow("AUTHORING_MCP_SESSION_INVALID");
  await database.update(schema.session).set({ expiresAt: new Date("2099-01-01T00:00:00Z") }).where(eq(schema.session.id, principal.sessionId));
  await grant(["blog:read"]);
  await expect(auditedMutation(principal, "blog.create", input.requestKey, { title: input.title }, execute)).rejects.toThrow("OAUTH_CONSENT_REQUIRED");
  expect((await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey })).error).toBe("OAUTH_CONSENT_REQUIRED");
  expect(reached).toBe(false);
  await grant();
  expect((await main.call("admin.operation_receipt", { operation: "blog.create", requestKey: input.requestKey })).data.state).toBe("committed");
});

test("concurrent transaction errors and unknown writes have bounded nonsecret same-key recovery", () => {
  const failure = adminMcpFailure(new Error("private SQL query", { cause: Object.assign(new Error("private database detail"), { code: "40001" }) }));
  expect(failure.structuredContent).toMatchObject({ error: "CONCURRENT_WRITE_RETRY_REQUIRED", action: "retry_same_request", retryable: true });
  expect(JSON.stringify(failure)).not.toContain("private");
  const unknown = adminMcpFailure(new Error("private provider details"));
  expect(unknown.structuredContent).toMatchObject({ error: "ADMIN_MCP_REQUEST_FAILED", action: "retry_same_request", retryable: true });
  expect(JSON.stringify(unknown)).not.toContain("private");
  const conflict = adminMcpFailure(new AdminMcpError("REVISION_CONFLICT"));
  expect(conflict.structuredContent).toMatchObject({ action: "refresh_revision", retryable: false });
});
