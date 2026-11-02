import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database })); mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({ requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); }, resolveMcpAdmin: async () => undefined }));
process.env.BETTER_AUTH_SECRET = "local-only-access-integration-signing-key";
const { registerAccessTools } = await import("@/lib/admin-mcp/access-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const scopes = ["users:read", "users:roles:write", "users:status:write"];
function register(extra: string[] = []) { registerAccessTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, { userId: "admin", actorId: "admin", sessionId: "session", scopes: [...scopes, ...extra], authMethod: "oauth" }); }
register();
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
let sequence = 0;
async function commit(name: string, input: Record<string, unknown>) { const target = { ...input, requestKey: `access-action-${++sequence}` }; const plan = await call(name, target); expect(plan.ok).toBe(true); return call(name, { ...target, dryRun: false, confirmationToken: plan.data.confirmationToken }); }
beforeAll(async () => {  for (const id of ["admin", "student"]) { await database.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: id === "admin" ? "admin" : "student" }); await database.insert(schema.pengguna).values({ id }); } });
afterAll(async () => { await client.close(); });
test("personal email requires a separate grant", async () => {
  const read = await call("users.get", { id: "student" }); expect(read.data.email).toBeUndefined();
  expect((await call("users.get", { id: "student", includeEmail: true })).error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
});
test("role grant cannot escalate to admin without the extra scope", async () => {
  const current = (await call("users.get", { id: "student" })).data;
  expect((await commit("users.set_roles", { id: "student", expectedRevision: current.revision, roles: ["admin"] })).error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
  expect((await database.select().from(schema.user).where(eq(schema.user.id, "student")))[0].role).toBe("student");
  register(["users:roles:admin"]);
  expect((await commit("users.set_roles", { id: "student", expectedRevision: current.revision, roles: ["admin"] })).ok).toBe(true);
  expect((await database.select().from(schema.user).where(eq(schema.user.id, "student")))[0].role).toBe("admin"); register();
});
test("self demotion and suspension are rejected, stale status changes cannot overwrite", async () => {
  const admin = (await call("users.get", { id: "admin" })).data;
  expect((await commit("users.set_roles", { id: "admin", expectedRevision: admin.revision, roles: ["murid"] })).error).toBe("SELF_ADMIN_CHANGE");
  expect((await commit("users.set_status", { id: "admin", expectedRevision: admin.revision, status: "suspended" })).error).toBe("SELF_ADMIN_CHANGE");
  const student = (await call("users.get", { id: "student" })).data;
  expect((await commit("users.set_status", { id: "student", expectedRevision: student.revision, status: "suspended" })).ok).toBe(true);
  expect((await commit("users.set_status", { id: "student", expectedRevision: student.revision, status: "active" })).error).toBe("REVISION_CONFLICT");
});
