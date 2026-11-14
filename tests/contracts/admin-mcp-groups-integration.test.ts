import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";
import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database })); mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({ MCP_MANUAL_CLIENT_ID: "zyx-admin-connection", requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); }, resolveMcpAdmin: async () => undefined }));
process.env.BETTER_AUTH_SECRET = "local-only-group-integration-signing-key";
const { registerGroupTools } = await import("@/lib/admin-mcp/group-tools");
const { saveCourseWithCanonicalProjection } = await import("@/lib/academic/course-canonical-sync");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = adminMcpTestPrincipal({ userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: ["groups:read", "groups:write", "access:read", "access:write", "access:secrets:read"] });
registerGroupTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, principal);
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
let sequence = 0;
async function commit(name: string, input: Record<string, unknown>) { const target = { ...input, requestKey: input.requestKey ?? `group-action-${++sequence}` }; const plan = await call(name, target); expect(plan.ok).toBe(true); return call(name, { ...target, dryRun: false, confirmationToken: plan.data.confirmationToken }); }
beforeAll(async () => {  for (const id of ["admin", "one", "two"]) { await database.insert(schema.user).values({ id, name: id, email: `${id}@example.test` }); await database.insert(schema.pengguna).values({ id }); } await seedAdminMcpAuthority(database, principal); await saveCourseWithCanonicalProjection({ id: "math", title: "Math", category: "Matematika", isNew: true, actorId: "admin" }); });
afterAll(async () => { await client.close(); });
const definition = { name: "Study group", packageType: "reguler_15", academicYear: "2026/2027", semester: "Ganjil", startDate: "2026-11-01T00:00:00Z", endDate: "2099-01-31T23:59:00Z", courseIds: ["math"] };
let token: any;
test("token creation is idempotent, prefix is exact, audit receipt does not contain its secret", async () => {
  const input = { ...definition, capacity: 1, requestKey: "one-token-create" };
  const created = await commit("tokens.create", input); expect(created.ok).toBe(true); token = created.data;
  expect(token.token).toBeUndefined(); expect((await commit("tokens.create", input)).data.id).toBe(token.id);
  const revealed = await call("tokens.reveal", { id: token.id }); expect(revealed.data.token).toMatch(/^Zyx-[0-9A-F]{8}-1-1$/);
  expect(JSON.stringify(await database.select().from(schema.auditMutasi))).not.toContain(revealed.data.token);
});
test("membership creates enrollment and enforces the token's capacity transactionally", async () => {
  const snapshot = (await call("groups.inspect", { id: token.groupId })).data;
  const added = await commit("groups.members.add", { id: token.groupId, expectedRevision: snapshot.revision, userId: "one", role: "leader" }); expect(added.ok).toBe(true);
  expect(await database.select().from(schema.enrollments).where(eq(schema.enrollments.userId, "one"))).toHaveLength(1);
  const full = await commit("groups.members.add", { id: token.groupId, expectedRevision: added.data.revision, userId: "two" }); expect(full.error).toBe("GROUP_CAPACITY_REACHED");
  expect(await database.select().from(schema.groupMembers)).toHaveLength(1);
});
test("revocation and member removal preserve enrolled learning access", async () => {
  const revoked = await commit("tokens.revoke", { id: token.id, expectedRevision: token.revision }); expect(revoked.data.expiresAt.getTime()).toBeLessThan(Date.now());
  const snapshot = (await call("groups.inspect", { id: token.groupId })).data;
  expect((await commit("groups.members.remove", { id: token.groupId, expectedRevision: snapshot.revision, userId: "one" })).ok).toBe(true);
  expect(await database.select().from(schema.enrollments).where(eq(schema.enrollments.userId, "one"))).toHaveLength(1);
});
test("quota correction has a reason and refuses impossible usage", async () => {
  const snapshot = (await call("groups.inspect", { id: token.groupId })).data;
  expect((await commit("groups.adjust_quota", { id: token.groupId, expectedRevision: snapshot.revision, totalQuotaSessions: 1, usedQuotaSessions: 2, weeklyQuotaSessions: 1, reason: "Correction" })).error).toBe("INVALID_QUOTA");
  const changed = await commit("groups.adjust_quota", { id: token.groupId, expectedRevision: snapshot.revision, totalQuotaSessions: 10, usedQuotaSessions: 1, weeklyQuotaSessions: 1, reason: "Correction" }); expect(changed.ok).toBe(true);
});
