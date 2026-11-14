import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({ MCP_MANUAL_CLIENT_ID: "zyx-admin-connection", requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); }, resolveMcpAdmin: async () => undefined }));
const { registerTutorialTools } = await import("@/lib/admin-mcp/tutorial-tools");
const { registerEnrollmentTools } = await import("@/lib/admin-mcp/enrollment-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const server = { registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never;
const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: ["schedules:read", "access:read"] };
registerTutorialTools(server, principal); registerEnrollmentTools(server, principal);
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
beforeAll(async () => {

  await database.insert(schema.user).values([{ id: "one", name: "One", email: "one@example.test" }, { id: "two", name: "Two", email: "two@example.test" }]);
  await database.insert(schema.courses).values({ id: "course", title: "Course", category: "Matematika" });
  await database.insert(schema.enrollments).values([{ id: "e1", userId: "one", courseId: "course", expiresAt: new Date("2099-01-01") }, { id: "e2", userId: "two", courseId: "course", expiresAt: new Date("2099-01-01") }]);
  await database.insert(schema.tutorCourses).values({ id: "a1", tutorId: "one", courseId: "course" });
});
afterAll(async () => { await client.close(); });
test("enrollment reads are user scoped and validate pagination", async () => {
  const result = await call("enrollments.list", { userId: "one" });
  expect(result.ok).toBe(true); expect(result.data.map((row: { id: string }) => row.id)).toEqual(["e1"]); expect(result.data[0].revision).toHaveLength(64);
  expect((await call("enrollments.list", { userId: "one", limit: 101 })).error).toBe("INVALID_INPUT");
  expect((await call("enrollments.get", { id: "missing" })).error).toBe("NOT_FOUND");
});
test("tutorial assignments filter by tutor and enforce scope", async () => {
  expect((await call("tutorial.assignments.list", { tutorId: "two" })).data).toEqual([]);
  expect((await call("tutorial.assignments.list", { tutorId: "one" })).data).toHaveLength(1);
  principal.scopes = ["access:read"];
  expect((await call("tutorial.assignments.list", { tutorId: "one" })).error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
});
