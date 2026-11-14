import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import { createPostgresTestDb } from "../helpers/postgres";

// PostgreSQL constraints and real service/MCP mutation transactions. Authentication
// uses an isolated persisted session. No provider, browser or storage is called.
const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
let aiCalls = 0;
mock.module("@/lib/gemini", () => ({ generateContentWithFallback: async () => { aiCalls++; throw new Error("No provider in this fixture"); } }));
const invalidated: string[] = [];
mock.module("next/cache", () => ({ revalidatePath: (path: string) => invalidated.push(path) }));
mock.module("@/lib/auth/admin-guards", () => ({ assertTutorOrAdmin: async () => ({ user: { id: "blog-admin" } }) }));
process.env.BETTER_AUTH_SECRET = "local-test-only-blog-mutation-signing-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { registerBlogTools } = await import("@/lib/admin-mcp/blog-tools");
const service = await import("@/lib/blog/service");
const { saveArticle } = await import("@/app/(admin)/admin/blog/actions");
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
const principal = { userId: "blog-admin", actorId: "blog-admin", sessionId: "blog-session", authMethod: "session" as const, scopes: ["blog:read", "blog:write"] };
registerBlogTools({ registerTool(name: string, _config: unknown, execute: (input: Record<string, unknown>) => Promise<any>) { handlers.set(name, execute); } } as never, principal);
const target = { expectedEnvironment: "local", expectedOrigin: "http://localhost:3000" };
async function call(name: string, input: Record<string, unknown>) { return (await handlers.get(name)!({ ...target, ...input })).structuredContent; }
let sequence = 0;
async function commit(name: string, input: Record<string, unknown>, requestKey = `blog-operation-${++sequence}`) {
  const plan = await call(name, { ...input, requestKey });
  expect(plan.ok).toBe(true);
  return call(name, { ...input, requestKey, dryRun: false, confirmationToken: plan.data.confirmationToken });
}
async function create(input: Record<string, unknown> = {}) {
  const result = await commit("blog.create", { title: "Belajar efektif", content: "Periksa pemahaman melalui latihan dan pembahasan.", category: "tips_kuliah", ...input });
  expect(result.ok).toBe(true);
  return result.data;
}
beforeAll(async () => {
  await testDb.insert(schema.user).values({ id: principal.userId, name: "Blog admin", email: "blog-admin@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: principal.userId, role: "admin" });
  await testDb.insert(schema.session).values({ id: principal.sessionId, token: "local-blog-session-only", userId: principal.userId, expiresAt: daysFrom(1) });
});
beforeEach(async () => {
  await testDb.delete(schema.blogArticles);
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, principal.actorId));
  aiCalls = 0; invalidated.length = 0;
});
afterAll(async () => { await client.close(); });

test("MCP creates deterministic drafts with a thumbnail, reading time, and replay-safe identity", async () => {
  const input = { content: "# Belajar efektif\n\nIsi artikel yang membantu pembaca.", slug: "belajar-efektif", category: "tips_kuliah", thumbnailUrl: "http://localhost:3000/api/storage/file/media/blog/hero.png", readMinutes: 999 };
  const key = "blog-create-replay";
  const created = await commit("blog.create", input, key);
  expect(created.data).toMatchObject({ status: "draft", title: "Belajar efektif", slug: "belajar-efektif", thumbnailUrl: "/api/storage/file/media/blog/hero.png", readMinutes: 1 });
  expect(created.data.content).toBe("Isi artikel yang membantu pembaca.");
  expect(created.data.summary).toBe(created.data.content);
  const replayed = await commit("blog.create", input, key);
  expect(replayed.data.id).toBe(created.data.id);
  expect(await testDb.select().from(schema.blogArticles)).toHaveLength(1);
  expect(aiCalls).toBe(0);
});

test("validation and edit context expose exact visibility without saving or spending quota", async () => {
  const before = await testDb.select().from(schema.blogArticles);
  const result = await call("blog.validate", { article: { content: "# Panduan kampus\n\nPanduan belajar.", thumbnailUrl: "https://images.unsplash.com/hero.png" } });
  expect(result.data.valid).toBe(true);
  expect(result.data.normalized.slug).toBe("panduan-kampus");
  expect(result.data.impact.isPublic).toBe(false);
  expect(await testDb.select().from(schema.blogArticles)).toEqual(before);
  const article = await create();
  const context = await call("blog.get_edit_context", { id: article.id });
  expect(context.data.revision).toBe(article.revision);
  expect(context.data.capabilities.scheduling).toBe(false);
  expect(context.data.publication).toEqual({ isPublic: false, publicPath: null });
  expect(aiCalls).toBe(0);
});

test("published edits preserve URL and publication time while deriving new reading time", async () => {
  const draft = await create();
  const published = await commit("blog.set_publication", { id: draft.id, expectedRevision: draft.revision, published: true });
  const input = { id: draft.id, expectedRevision: published.data.revision, changes: { title: "Judul diperbarui", content: Array(401).fill("kata").join(" "), readMinutes: 999 } };
  const plan = await call("blog.update", { ...input, requestKey: "blog-visible-edit" });
  expect(plan.data.impact.changesLiveContent).toBe(true);
  expect(plan.data.impact.previousPublicPath).toBe("/blog/belajar-efektif");
  const updated = await call("blog.update", { ...input, requestKey: "blog-visible-edit", dryRun: false, confirmationToken: plan.data.confirmationToken });
  expect(updated.data.slug).toBe(draft.slug);
  expect(updated.data.publishedAt).toEqual(published.data.publishedAt);
  expect(updated.data.readMinutes).toBe(3);
  expect(updated.data.status).toBe("published");
  const renewed = await call("blog.update", { ...input, requestKey: "blog-visible-edit" });
  expect(renewed.data.impact).toMatchObject({ alreadyCommitted: true, replayOnly: true, currentTargetStateAttested: false });
  const replayed = await call("blog.update", { ...input, requestKey: "blog-visible-edit", dryRun: false, confirmationToken: renewed.data.confirmationToken });
  expect(JSON.parse(JSON.stringify(replayed.data))).toEqual(JSON.parse(JSON.stringify(updated.data)));
  expect((await call("blog.update", { ...input, changes: { title: "Payload lain" }, requestKey: "blog-visible-edit" })).error).toBe("IDEMPOTENCY_CONFLICT");
});

test("Admin and MCP saves share exact observed revisions and retain drafts on conflict", async () => {
  const original = await create({ summary: "Ringkasan eksplisit" });
  const changed = await commit("blog.update", { id: original.id, expectedRevision: original.revision, changes: { summary: "Ringkasan dari agent" } });
  const stale = await saveArticle({ id: original.id, expectedRevision: original.revision, title: original.title, content: original.content, summary: original.summary, category: original.category, status: "draft" });
  expect(stale).toMatchObject({ success: false, code: "REVISION_CONFLICT" });
  expect((await service.getBlogArticle(principal.actorId, original.id)).summary).toBe("Ringkasan dari agent");
  const saved = await saveArticle({ id: original.id, expectedRevision: changed.data.revision, title: "Judul Admin", content: changed.data.content, summary: changed.data.summary, category: changed.data.category, status: "published" });
  expect(saved.success).toBe(true);
  expect(saved).toMatchObject({ id: original.id, slug: original.slug, status: "published" });
  expect((await call("blog.update", { id: original.id, expectedRevision: changed.data.revision, changes: { title: "Usang" }, requestKey: "blog-stale-after-admin" })).error).toBe("REVISION_CONFLICT");
  expect(invalidated).toContain(`/blog/${original.slug}`);
  expect(aiCalls).toBe(0);
});

test("automatic slugs resolve collisions while explicit collisions fail actionably", async () => {
  const first = await create();
  const second = await create();
  expect(second.slug).toBe(`${first.slug}-2`);
  expect((await call("blog.create", { title: "Judul lain", content: "Konten", slug: first.slug, requestKey: "blog-explicit-slug-conflict" })).error).toBe("BLOG_SLUG_CONFLICT");
  const changed = await commit("blog.update", { id: second.id, expectedRevision: second.revision, changes: { slug: "alamat-yang-dipilih" } });
  expect(changed.data.slug).toBe("alamat-yang-dipilih");
});

test("filtered search pages metadata and revisions while legacy list remains an array", async () => {
  const first = await create({ title: "Alpha", category: "tips_kuliah" });
  await create({ title: "Beta", category: "pojok_kampus" });
  await create({ title: "Gamma", category: "tips_kuliah" });
  const page = await call("blog.search", { category: "tips_kuliah", limit: 1 });
  expect(page.data.items).toHaveLength(1);
  expect(page.data.items[0]).toMatchObject({ id: first.id, revision: first.revision });
  expect(page.data.items[0]).not.toHaveProperty("content");
  expect(page.data.pagination).toMatchObject({ nextOffset: 1, hasMore: true });
  const next = await call("blog.search", { category: "tips_kuliah", limit: 1, offset: 1 });
  expect(next.data.items[0].title).toBe("Gamma");
  expect(next.data.pagination.nextOffset).toBeNull();
  expect((await call("blog.list", { query: "Beta" })).data.map((row: { title: string }) => row.title)).toEqual(["Beta"]);
});

test("scheduled publication remains explicitly unsupported and invalid references never persist", async () => {
  const result = await saveArticle({ title: "Besok", content: "Isi", category: "tips_kuliah", status: "scheduled" });
  expect(result).toMatchObject({ success: false, code: "BLOG_SCHEDULING_UNAVAILABLE" });
  expect((await call("blog.create", { title: "Tidak aman", content: "Isi", thumbnailUrl: "javascript:alert(1)", requestKey: "blog-invalid-thumbnail" })).ok).toBe(false);
  expect(await testDb.select().from(schema.blogArticles)).toHaveLength(0);
  const draft = await create();
  expect((await call("blog.validate", { id: draft.id })).ok).toBe(false);
  expect((await call("blog.validate", { id: draft.id, expectedRevision: "0".repeat(64), changes: { title: "Usang" } })).error).toBe("REVISION_CONFLICT");
});

test("direct shared writes reject a suspended canonical identity", async () => {
  await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, principal.actorId));
  await expect(testDb.transaction(tx => service.createBlogArticle(tx, { actorId: principal.actorId, article: { title: "Ditolak", content: "Isi" } }))).rejects.toThrow("BLOG_FORBIDDEN");
  expect(await testDb.select().from(schema.blogArticles)).toHaveLength(0);
});
