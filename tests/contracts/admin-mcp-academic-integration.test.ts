import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database }));
mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({
  requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); },
  resolveMcpAdmin: async () => undefined,
}));
process.env.BETTER_AUTH_SECRET = "local-only-academic-integration-signing-key";
const { registerSchedulingTools } = await import("@/lib/admin-mcp/scheduling-tools");
const { registerAcademicTools } = await import("@/lib/admin-mcp/academic-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: ["courses:read", "courses:write", "chapters:read", "chapters:write", "videos:read", "videos:write", "materials:read", "materials:write"] };
const register = (scopes = principal.scopes) => registerAcademicTools({ registerTool: (name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, handler) } as never, { ...principal, scopes });
register();
registerSchedulingTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, { ...principal, scopes: [...principal.scopes, "schedules:read", "schedules:write"] });
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
let sequence = 0;
async function commit(name: string, input: Record<string, unknown>) {
  const target = { ...input, requestKey: `academic-${++sequence}` };
  const plan = await call(name, target); expect(plan.ok).toBe(true);
  return call(name, { ...target, dryRun: false, confirmationToken: plan.data.confirmationToken });
}
beforeAll(async () => {  await database.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test" }); await database.insert(schema.pengguna).values({ id: "admin" }); });
afterAll(async () => { await client.close(); });
let course: any, first: any, second: any;
test("creates and updates both course representations, rejects stale writes", async () => {
  const result = await commit("courses.create", { id: "calculus", title: "Calculus", category: "Matematika" }); expect(result.ok).toBe(true); course = result.data;
  const canonical = await database.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.legacyCourseId, course.id)); expect(canonical[0].title).toBe("Calculus");
  const updated = await commit("courses.update", { id: course.id, title: "Calculus 1", category: "Matematika", expectedRevision: course.revision }); expect(updated.ok).toBe(true);
  expect((await database.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.legacyCourseId, course.id)))[0].title).toBe("Calculus 1");
  expect((await commit("courses.update", { id: course.id, title: "Stale", category: "Matematika", expectedRevision: course.revision })).error).toBe("REVISION_CONFLICT"); course = updated.data;
});
test("chapter projection and full-set reorder preserve canonical order", async () => {
  first = (await commit("chapters.create", { courseId: course.id, title: "Limits", orderIndex: 1 })).data;
  second = (await commit("chapters.create", { courseId: course.id, title: "Derivatives", orderIndex: 2 })).data;
  const order = (await call("chapters.order", { courseId: course.id })).data;
  expect((await commit("chapters.reorder", { courseId: course.id, chapterIds: [first.id], expectedRevision: order.revision })).error).toBe("INVALID_CHAPTER_SET");
  expect((await commit("chapters.reorder", { courseId: course.id, chapterIds: [second.id, first.id], expectedRevision: order.revision })).ok).toBe(true);
  const canonical = await database.select().from(schema.bab).where(eq(schema.bab.legacyChapterId, second.id)); expect(canonical[0].orderIndex).toBe(1);
});
test("archive detects references and preserves inhabited courses", async () => {
  expect((await commit("courses.archive", { id: course.id, expectedRevision: course.revision })).error).toBe("DEPENDENCIES_EXIST");
  expect(await database.select().from(schema.courses)).toHaveLength(1);
});
test("video writes require playlist and chapter belonging to the same course", async () => {
  const playlist = (await commit("videos.playlists.create", { courseId: course.id, title: "Lessons" })).data;
  const invalid = await commit("videos.create", { courseId: course.id, playlistId: "missing", title: "Video", videoUrl: "https://example.test/v" }); expect(invalid.error).toBe("PLAYLIST_COURSE_MISMATCH");
  const created = await commit("videos.create", { courseId: course.id, playlistId: playlist.id, chapterId: first.id, title: "Video", videoUrl: "https://example.test/v" }); expect(created.ok).toBe(true); expect(created.data.videoUrl).toBeUndefined();
  expect((await commit("videos.delete", { id: created.data.id, expectedRevision: created.data.revision })).data.deleted).toBe(true);
});
test("legacy token has no mutation scope", async () => {
  register(["authoring:read"]); expect((await call("courses.create", { id: "x", title: "X", category: "Umum" })).error).toBe("AUTHORING_MCP_SCOPE_REQUIRED"); register();
});

test("academic schedules validate absolute times and protect against stale replacement", async () => {
  const input = { type: "general", title: "Exam", startDate: "2026-12-01T10:00:00+07:00", endDate: "2026-12-01T11:00:00+07:00", courseId: course.id };
  expect((await commit("schedules.create", { ...input, endDate: "2026-12-01T09:00:00+07:00" })).error).toBe("INVALID_DATE_RANGE");
  const created = await commit("schedules.create", input); expect(created.ok).toBe(true);
  const changed = await commit("schedules.update", { ...input, title: "New exam", id: created.data.id, expectedRevision: created.data.revision }); expect(changed.ok).toBe(true);
  expect((await commit("schedules.delete", { id: created.data.id, expectedRevision: created.data.revision })).error).toBe("REVISION_CONFLICT");
});
