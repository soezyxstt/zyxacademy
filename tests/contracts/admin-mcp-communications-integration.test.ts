import { adminMcpTestPrincipal, seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";
import { beforeAll, afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: database })); mock.module("@/db", () => ({ db: database }));
mock.module("@/lib/authoring/mcp-auth", () => ({ MCP_MANUAL_CLIENT_ID: "zyx-admin-connection", requireMcpScope: (p: { scopes: string[] }, scope: string) => { if (!p.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); }, resolveMcpAdmin: async () => undefined }));
process.env.BETTER_AUTH_SECRET = "local-only-group-integration-signing-key";
const { registerBlogTools } = await import("@/lib/admin-mcp/blog-tools");
const { registerCommunicationsTools } = await import("@/lib/admin-mcp/communications-tools");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = adminMcpTestPrincipal({ userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: ["links:read", "links:write", "blog:read", "blog:write"] });
registerCommunicationsTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, principal);
registerBlogTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, principal);
const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!({ expectedEnvironment: "local", expectedOrigin: process.env.BETTER_AUTH_URL || "http://localhost:3000", ...input })).structuredContent;
let sequence = 0;
async function commit(name: string, input: Record<string, unknown>) { const target = { ...input, requestKey: input.requestKey ?? `group-action-${++sequence}` }; const plan = await call(name, target); expect(plan.ok).toBe(true); return call(name, { ...target, dryRun: false, confirmationToken: plan.data.confirmationToken }); }
beforeAll(async () => {  await database.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test" }); await database.insert(schema.pengguna).values({ id: "admin" }); await seedAdminMcpAuthority(database, principal); });
afterAll(async () => { await client.close(); });
test("link writes preserve revisions, archive state and idempotency", async () => {
 const input = { title: "Help", url: "https://example.test/help", requestKey: "create-help-link" };
 const created = await commit("links.create", input); expect(created.ok).toBe(true);
 expect((await commit("links.create", input)).data.id).toBe(created.data.id);
 const updated = await commit("links.update", { id: created.data.id, expectedRevision: created.data.revision, changes: { title: "Support" } }); expect(updated.data.title).toBe("Support");
 expect((await commit("links.update", { id: created.data.id, expectedRevision: created.data.revision, changes: { title: "Stale" } })).error).toBe("REVISION_CONFLICT");
 expect((await commit("links.delete", { id: created.data.id, expectedRevision: updated.data.revision })).ok).toBe(true);
 expect((await call("links.get", { id: created.data.id })).error).toBe("NOT_FOUND");
 expect((await call("links.list", {})).data).toHaveLength(0);
});
test("blog draft publication is explicit, revision checked and retry safe", async () => {
 const input = { title: "Study", slug: "study", summary: "Learn", content: "Lesson", category: "tips_kuliah", requestKey: "create-study-article" };
 const created = await commit("blog.create", input); expect(created.ok).toBe(true); expect(created.data.status).toBe("draft");
 expect((await commit("blog.create", input)).data.id).toBe(created.data.id);
 const published = await commit("blog.set_publication", { id: created.data.id, expectedRevision: created.data.revision, published: true }); expect(published.data.status).toBe("published");
 expect((await call("blog.update", { id: created.data.id, expectedRevision: created.data.revision, changes: { title: "Stale" }, requestKey: "stale-study-article" })).error).toBe("REVISION_CONFLICT");
 expect((await commit("blog.set_publication", { id: created.data.id, expectedRevision: published.data.revision, published: false })).data.publishedAt).toBeNull();
});
