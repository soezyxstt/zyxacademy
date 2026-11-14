import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import * as extras from "@/db/schedule-extras";
import { createPostgresTestDb } from "../helpers/postgres";
import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";

const { client } = await createPostgresTestDb();
const queries: { sql: string; params: unknown[] }[] = [];
let failLegacyWrite = false;
const database = drizzle(client, { schema: { ...schema, ...extras }, logger: { logQuery(sql, params) {
  queries.push({ sql, params });
  if (failLegacyWrite && sql.startsWith('update "user"')) throw new Error("SIMULATED_LEGACY_WRITE_FAILURE");
} } });
mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/db", () => ({ db: database }));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
mock.module("@/lib/auth/admin-guards", () => ({ assertAdmin: async () => ({ user: { id: "role-admin", role: "admin" } }) }));
mock.module("@/lib/notifications/send", () => ({ sendAdminBroadcast: async () => { throw new Error("UNUSED_NOTIFICATION"); } }));
mock.module("@/lib/authoring/mcp-auth", () => ({ MCP_MANUAL_CLIENT_ID: "zyx-admin-connection", requireMcpScope: (principal: { scopes: string[] }, scope: string) => { if (!principal.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); }, resolveMcpAdmin: async () => undefined }));
process.env.BETTER_AUTH_SECRET = "local-role-order-integration-signing-key";
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { updateUserRolesAction } = await import("../../app/(admin)/admin/(academic)/users/actions");
const { executeUpdateUserRole } = await import("@/lib/admin-ops-ai/domain-operations");
const { registerAccessTools } = await import("@/lib/admin-mcp/access-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = adminMcpTestPrincipal({ userId: "role-admin", actorId: "role-admin", sessionId: "role-session", scopes: ["users:read", "users:roles:write"], authMethod: "oauth" });
registerAccessTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, principal);
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
async function seed(id: string, role: "admin" | "student" = "student") {
  await database.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role });
  await provisionPenggunaForNewUser({ id, role });
}
beforeAll(async () => { await seed("role-admin", "admin"); await seedAdminMcpAuthority(database, principal); });
afterAll(async () => { await client.close(); });

// PGlite verifies emitted lock order and atomic rollback, not contention
// between independent PostgreSQL sessions.
for (const surface of ["admin", "mcp", "ops"] as const) test(`${surface} role changes lock user then identity before membership writes`, async () => {
  const id = `role-target-${surface}`;
  await seed(id);
  let input: Record<string, unknown> | undefined;
  let token: string | undefined;
  if (surface === "mcp") {
    const current = (await call("users.get", { id })).data;
    input = { id, roles: ["tutor"], expectedRevision: current.revision, requestKey: "role-order-commit" };
    const plan = await call("users.set_roles", input);
    expect(plan.ok).toBe(true);
    token = plan.data.confirmationToken;
  }
  queries.length = 0;
  if (surface === "admin") expect((await updateUserRolesAction(id, ["tutor"])).success).toBe(true);
  else if (surface === "ops") expect((await executeUpdateUserRole({ userId: id, roles: ["tutor"] }, "role-admin")).data.roles).toEqual(["tutor"]);
  else expect((await call("users.set_roles", { ...input, dryRun: false, confirmationToken: token })).ok).toBe(true);
  const userLock = queries.findIndex(query => query.sql.includes('from "user"') && query.sql.includes("for update") && query.params.includes(id));
  const identityLock = queries.findIndex(query => query.sql.includes('from "pengguna"') && query.sql.includes("for no key update") && query.params.includes(id));
  const membershipWrite = queries.findIndex(query => query.sql.startsWith('delete from "pengguna_peran"'));
  expect(userLock).toBeGreaterThanOrEqual(0);
  expect(identityLock).toBeGreaterThan(userLock);
  expect(membershipWrite).toBeGreaterThan(identityLock);
  expect((await database.select().from(schema.user).where(eq(schema.user.id, id)))[0].role).toBe("teacher");
  expect((await database.select().from(schema.penggunaPeran).innerJoin(schema.peran, eq(schema.penggunaPeran.peranId, schema.peran.id)).where(eq(schema.penggunaPeran.penggunaId, id))).map(row => row.peran.code)).toEqual(["tutor"]);
});

test("a failed legacy role write rolls back membership replacement", async () => {
  const id = "role-rollback-target";
  await seed(id);
  const before = await database.select().from(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, id));
  failLegacyWrite = true;
  try { await expect(executeUpdateUserRole({ userId: id, roles: ["tutor"] }, "role-admin")).rejects.toThrow(); }
  finally { failLegacyWrite = false; }
  expect(await database.select().from(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, id))).toEqual(before);
  expect((await database.select().from(schema.user).where(eq(schema.user.id, id)))[0].role).toBe("student");
});
