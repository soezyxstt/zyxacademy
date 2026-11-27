import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { DEFAULT_OFFLINE_POLICY, OFFLINE_HEADERS, offlinePolicySettingsSchema } from "@/lib/offline/sync-contract";
import type { OfflineTransaction } from "@/lib/offline/server-events";

const { client, testDb: db } = await createPostgresTestDb();
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => "https://staging.zyxacademy.com" }));
mock.module("@/lib/storage", () => ({ storage: { getUrl: (key: string) => key.startsWith("/") || key.startsWith("http") ? key : `/api/storage/file/${key}` } }));
let signedIn = true;
let signedInAdmin = false;
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => signedIn ? { user: { id: signedInAdmin ? "offline-admin" : "offline-user" }, session: { id: signedInAdmin ? "offline-admin-session" : "offline-session" } } : null }));

const articleRepository = await import("@/lib/articles/structured-repository");
const originalArticleReader = articleRepository.getCanonicalPublishedArticle;
let articleReads = 0;
let afterArticleRead: (() => Promise<void>) | undefined;
let mismatchedArticleVersion = false;
mock.module("@/lib/articles/structured-repository", () => ({ ...articleRepository, getCanonicalPublishedArticle: async (...args: Parameters<typeof originalArticleReader>) => {
  articleReads++;
  const article = await originalArticleReader(...args);
  await afterArticleRead?.();
  return article && mismatchedArticleVersion ? { ...article, version: article.version + 1 } : article;
} }));

const events = await import("@/lib/offline/server-events");
const { requireOfflineActor } = await import("@/lib/offline/server-auth");
const { buildOfflineManifest, buildOfflineResource, offlineCourseAccess } = await import("@/lib/offline/server-resources");
const { synchronizeOffline } = await import("@/lib/offline/server-sync");
const { offlineAssetFetchTarget, readBoundedOfflineAsset, OFFLINE_ASSET_MAX_BYTES } = await import("@/lib/offline/server-assets");
const { GET: getResource } = await import("@/app/api/offline/resource/route");
const { GET: getAsset } = await import("@/app/api/offline/asset/route");
const { PATCH: patchPolicy } = await import("@/app/api/admin/offline/policy/route");
const { POST: revalidate } = await import("@/app/api/admin/offline/revalidate/route");
afterAll(() => client.close());

await db.insert(schema.user).values({ id: "offline-user", email: "offline@example.test", name: "Offline", role: "student" });
await db.insert(schema.pengguna).values({ id: "offline-user", status: "active" });
await db.insert(schema.peran).values({ id: "offline-murid", code: "murid" });
await db.insert(schema.penggunaPeran).values({ id: "offline-membership", penggunaId: "offline-user", peranId: "offline-murid", source: "test" });
await db.insert(schema.session).values({ id: "offline-session", userId: "offline-user", token: "offline-test-token", expiresAt: new Date(Date.now() + 7 * 86_400_000) });
await db.insert(schema.user).values({ id: "offline-admin", email: "offline-admin@example.test", name: "Admin", role: "admin" });
await db.insert(schema.pengguna).values({ id: "offline-admin", status: "active" });
await db.insert(schema.peran).values({ id: "offline-admin-role", code: "admin" });
await db.insert(schema.penggunaPeran).values({ id: "offline-admin-membership", penggunaId: "offline-admin", peranId: "offline-admin-role", source: "test" });
await db.insert(schema.session).values({ id: "offline-admin-session", userId: "offline-admin", token: "offline-admin-token", expiresAt: new Date(Date.now() + 7 * 86_400_000) });
await db.insert(schema.courses).values({ id: "offline-course", title: "Matematika", category: "Matematika" });
await db.insert(schema.mataKuliah).values({ id: "offline-mk", code: "OFFLINE", title: "Matematika", legacyCourseId: "offline-course", status: "active" });
await db.insert(schema.bab).values([
  { id: "offline-first", mataKuliahId: "offline-mk", code: "FIRST", title: "Dasar", orderIndex: 1, status: "active" },
  { id: "offline-second", mataKuliahId: "offline-mk", code: "SECOND", title: "Lanjut", orderIndex: 2, status: "active" },
]);
await db.insert(schema.pendaftaranMurid).values({ id: "offline-enrollment", penggunaId: "offline-user", mataKuliahId: "offline-mk", status: "active", endAt: new Date(Date.now() + 2 * 86_400_000) });
await db.insert(schema.artikel).values({ id: "offline-article", mataKuliahId: "offline-mk", babId: "offline-second", slug: "offline-article", title: "Artikel", contentMarkdown: "Public reading", version: 3, structureStatus: "structured", status: "published", sourceHash: "source", generationHash: "hash-v3", creatorId: "offline-user" });
await db.insert(schema.bagianArtikel).values({ id: "offline-section", artikelId: "offline-article", sectionKey: "section", sectionKind: "topic", slug: "section", title: "Bagian", learningObjective: "Belajar", orderIndex: 0, estimatedReadingMinutes: 1, version: 3 });
const privatePayload = Buffer.from(JSON.stringify({ formativeCheckPayload: { checkKind: "short_answer", answer: "SECRET_ANSWER", explanation: "SECRET_RATIONALE", evaluation: { mode: "text_exact", acceptedAnswers: ["SECRET_ANSWER"], caseSensitive: false } } })).toString("base64url");
await db.insert(schema.blokArtikel).values({ id: "offline-block", artikelId: "offline-article", bagianArtikelId: "offline-section", blockKey: "block", blockType: "formative_check", orderIndex: 0, content: `Bacaan ![gambar](/images/example.png)\n<!--__ZYX_V3_BLOCK_PAYLOAD__:${privatePayload}-->`, version: 3, generationHash: "private-block-hash", status: "published" });
await db.insert(schema.diktatMateri).values({ id: "offline-diktat", mataKuliahId: "offline-mk", babId: "offline-second", title: "Diktat", contentMarkdown: "Ringkasan", version: 7, status: "published", sourceHash: "source", generationHash: "diktat-v7", creatorId: "offline-user" });

beforeEach(async () => {
  signedIn = true; signedInAdmin = false; articleReads = 0; afterArticleRead = undefined; mismatchedArticleVersion = false;
  await db.delete(schema.offlineContentChanges);
  await db.delete(schema.offlineSyncState);
  await db.delete(schema.offlineCachePolicy);
  await db.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "offline-user"));
  await db.update(schema.session).set({ expiresAt: new Date(Date.now() + 7 * 86_400_000) }).where(eq(schema.session.id, "offline-session"));
  await db.update(schema.pendaftaranMurid).set({ status: "active" }).where(eq(schema.pendaftaranMurid.id, "offline-enrollment"));
  await db.update(schema.artikel).set({ status: "published", version: 3, generationHash: "hash-v3" }).where(eq(schema.artikel.id, "offline-article"));
});

function request(kind = "article", id = "offline-article", headers: HeadersInit = {}) {
  return new Request(`https://staging.zyxacademy.com/api/offline/resource?kind=${kind}&id=${id}&courseId=offline-course`, { headers });
}
async function actor() { return requireOfflineActor(request(), "id"); }
const asEventTx = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => tx as unknown as OfflineTransaction;

describe("offline committed change log", () => {
  it("reads only the head for a matching cursor, including an empty log", async () => {
    for (const cursor of ["0", "1"]) {
      if (cursor === "1") await db.transaction(tx => events.recordOfflineChange(asEventTx(tx), { kind: "course", action: "invalidate" }));
      const select = spyOn(PgDatabase.prototype, "select");
      try {
        expect(await events.readOfflineChanges("offline-user", [], cursor)).toEqual({ cursor, reset: false, hasMore: false, changes: [] });
        expect(select).toHaveBeenCalledTimes(1);
      } finally {
        select.mockRestore();
      }
    }
  });

  it("rolls back mutation, cursor and invalidation together, then allocates monotonic committed cursors", async () => {
    await expect(db.transaction(async tx => {
      await tx.update(schema.artikel).set({ title: "Rollback" }).where(eq(schema.artikel.id, "offline-article"));
      await events.recordOfflineChange(asEventTx(tx), { kind: "article", resourceId: "offline-article", courseId: "offline-course", action: "upsert" });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await events.currentOfflineCursor()).toBe("0");
    expect((await db.select().from(schema.artikel).where(eq(schema.artikel.id, "offline-article")))[0].title).toBe("Artikel");
    for (let i = 1; i <= 3; i++) expect(await db.transaction(tx => events.recordOfflineChange(asEventTx(tx), { kind: "course", courseId: "offline-course", action: "invalidate" }))).toBe(String(i));
    expect((await events.readOfflineChanges("offline-user", ["offline-course"], "0")).changes.map(row => row.cursor)).toEqual(["1", "2", "3"]);
  });

  it("advances over private scopes, delivers own access revocation without an active course, and resets missing/future cursors", async () => {
    for (const input of [
      { kind: "access" as const, userId: "other", courseId: "offline-course", action: "invalidate" as const },
      { kind: "course" as const, courseId: "other-course", action: "invalidate" as const },
      { kind: "access" as const, userId: "offline-user", courseId: "offline-course", action: "invalidate" as const },
    ]) await db.transaction(tx => events.recordOfflineChange(asEventTx(tx), input));
    const first = await events.readOfflineChanges("offline-user", [], "0", 2);
    expect(first).toEqual({ cursor: "2", reset: false, hasMore: true, changes: [] });
    expect((await events.readOfflineChanges("offline-user", [], first.cursor)).changes[0].cursor).toBe("3");
    expect((await events.readOfflineChanges("offline-user", [], null)).reset).toBe(true);
    expect((await events.readOfflineChanges("offline-user", [], "999")).reset).toBe(true);
  });

  it("syncs real course creation and edits, and delivers archive on both old aliases", async () => {
    const { saveCourseWithCanonicalProjection, archiveCourseWithLegacyDeletion } = await import("@/lib/academic/course-canonical-sync");
    const id = "offline-test-mutation";
    const created = await saveCourseWithCanonicalProjection({ id, title: "Before", category: "Matematika", isNew: true });
    const initial = await synchronizeOffline(await actor(), { courseIds: [id], locale: "id", cursor: "0" });
    expect(initial.changes.map(change => change.courseId)).toEqual([id]);
    const canonicalId = "offline-test-mutation-canonical";
    // Older catalog rows can have independent canonical and legacy IDs.
    await db.update(schema.mataKuliah).set({ id: canonicalId }).where(eq(schema.mataKuliah.id, created.canonicalCourseId));
    const requested = { courseIds: [id, canonicalId], locale: "id" as const };
    await saveCourseWithCanonicalProjection({ id, title: "After", category: "Matematika", isNew: false });
    const updated = await synchronizeOffline(await actor(), { ...requested, cursor: initial.cursor });
    expect(updated.changes.filter(change => change.action === "invalidate").map(change => change.courseId).sort()).toEqual([...requested.courseIds].sort());
    const outline = await buildOfflineResource(await actor(), "course_outline", id, id);
    expect(outline.data).toMatchObject({ title: "After" });
    await archiveCourseWithLegacyDeletion(canonicalId, "offline-admin");
    expect(await db.select().from(schema.courses).where(eq(schema.courses.id, id))).toEqual([]);
    const revoked = await synchronizeOffline(await actor(), { ...requested, cursor: updated.cursor });
    expect(revoked.changes.filter(change => change.kind === "access" && change.action === "delete").map(change => change.courseId).sort()).toEqual([...new Set(requested.courseIds)].sort());
    expect(revoked.access.filter(grant => requested.courseIds.includes(grant.courseId)).every(grant => !grant.allowed)).toBe(true);
    const unrelated = await synchronizeOffline(await actor(), { courseIds: [], locale: "id", cursor: updated.cursor });
    expect(unrelated.changes).toEqual([]);
  });

  it("prunes a bounded cursor prefix and makes old clients reconcile a full manifest", async () => {
    for (let i = 0; i < 5; i++) await db.transaction(tx => events.recordOfflineChange(asEventTx(tx), { kind: "course", action: "invalidate" }));
    await db.update(schema.offlineContentChanges).set({ createdAt: new Date(Date.now() - 100 * 86_400_000) }).where(sql`${schema.offlineContentChanges.cursor} < 5`);
    expect(await events.pruneOfflineChanges(new Date(), 2)).toEqual({ removed: 2, hasMore: true });
    expect((await events.readOfflineChanges("offline-user", [], "0")).reset).toBe(true);
    expect(await events.pruneOfflineChanges(new Date(), 2)).toEqual({ removed: 2, hasMore: false });
    expect((await events.readOfflineChanges("offline-user", [], "4")).changes[0].cursor).toBe("5");
  });

  it("updates policy and its durable event atomically with optimistic revision checks", async () => {
    const settings = offlinePolicySettingsSchema.parse(Object.fromEntries(Object.entries(DEFAULT_OFFLINE_POLICY).filter(([key]) => key !== "revision" && key !== "updatedAt")));
    const saved = await events.writeOfflinePolicy("offline-admin", 0, { ...settings, contentMaxAgeMs: 86_400_000 });
    expect(saved.revision).toBe(1);
    expect((await events.readOfflineChanges("offline-user", [], "0")).changes[0].kind).toBe("policy");
    await expect(events.writeOfflinePolicy("offline-admin", 0, settings)).rejects.toThrow("OFFLINE_POLICY_CONFLICT");
    expect(await events.currentOfflineCursor()).toBe("1");
  });

  it("requires an admin and same-origin mutation, rejects stale policy saves, and records manual revalidation", async () => {
    const settings = offlinePolicySettingsSchema.parse(Object.fromEntries(Object.entries(DEFAULT_OFFLINE_POLICY).filter(([key]) => key !== "revision" && key !== "updatedAt")));
    const edit = (origin = "https://staging.zyxacademy.com") => new Request("https://staging.zyxacademy.com/api/admin/offline/policy", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, policy: settings }) });
    expect((await patchPolicy(edit())).status).toBe(403);
    signedInAdmin = true;
    expect((await patchPolicy(edit("https://other.example"))).status).toBe(403);
    expect((await patchPolicy(edit())).status).toBe(200);
    expect((await patchPolicy(edit())).status).toBe(409);
    expect((await revalidate(new Request("https://staging.zyxacademy.com/api/admin/offline/revalidate", { method: "POST", headers: { origin: "https://staging.zyxacademy.com", "content-type": "application/json" }, body: JSON.stringify({ scope: "all" }) }))).status).toBe(200);
    expect(await events.currentOfflineCursor()).toBe("2");
  });
});

describe("offline authorized immutable reading packages", () => {
  it("exports public article content and explicit diktat versions without progress or evaluation secrets", async () => {
    const article = await buildOfflineResource(await actor(), "article", "offline-article", "offline-course");
    const serialized = JSON.stringify(article);
    expect(serialized).not.toContain("SECRET_");
    expect(serialized).not.toContain("private-block-hash");
    expect(article.data).not.toHaveProperty("progress");
    expect(article.data).toHaveProperty("version", 3);
    expect(article.assets[0].url).toStartWith("/api/offline/asset?");
    expect(article.assets[0].required).toBe(true);
    expect(article.leaseExpiresAt).toBeGreaterThan(Date.now());
    const diktat = await buildOfflineResource(await actor(), "diktat", "offline-diktat", "offline-course");
    expect(diktat.data).toMatchObject({ body: "Ringkasan", contentVersion: 7 });
    expect((await buildOfflineManifest(await actor(), "offline-course")).resources.find(row => row.kind === "article")?.revision).toBe(article.resource.revision);
  });

  it("returns auth-bound 304 without loading article bodies and denies the same ETag after withdrawal or expiry", async () => {
    const first = await getResource(request());
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;
    articleReads = 0;
    const unchanged = await getResource(request("article", "offline-article", { "if-none-match": etag }));
    expect(unchanged.status).toBe(304);
    expect(articleReads).toBe(0);
    expect(unchanged.headers.get(OFFLINE_HEADERS.accountId)).toBe("offline-user");
    expect(Number(unchanged.headers.get(OFFLINE_HEADERS.leaseExpiresAt))).toBeGreaterThan(Date.now());
    await db.update(schema.artikel).set({ status: "withdrawn" }).where(eq(schema.artikel.id, "offline-article"));
    expect((await getResource(request("article", "offline-article", { "if-none-match": etag }))).status).toBe(404);
    await db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.session.id, "offline-session"));
    expect((await getResource(request("article", "offline-article", { "if-none-match": etag }))).status).toBe(401);
  });

  it("rejects stale account/session headers and suspensions before serving cached validators", async () => {
    expect((await getResource(request("article", "offline-article", { [OFFLINE_HEADERS.accountId]: "other" }))).status).toBe(409);
    expect((await getResource(request("article", "offline-article", { [OFFLINE_HEADERS.sessionId]: "old-session" }))).status).toBe(409);
    signedIn = false;
    expect((await getResource(request())).status).toBe(401);
    signedIn = true;
    await db.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "offline-user"));
    expect((await getResource(request())).status).toBe(403);
  });

  it("rejects mixed article versions and revocation racing the article read", async () => {
    mismatchedArticleVersion = true;
    expect((await getResource(request())).status).toBe(409);
    mismatchedArticleVersion = false;
    afterArticleRead = async () => { await db.update(schema.pendaftaranMurid).set({ status: "cancelled" }).where(eq(schema.pendaftaranMurid.id, "offline-enrollment")); };
    expect((await getResource(request())).status).toBe(409);
    const grant = await offlineCourseAccess(await actor(), "offline-course", DEFAULT_OFFLINE_POLICY);
    expect(grant.publicAccess.fullContent).toBe(false);
    expect(grant.publicAccess.chapterIds).toEqual(["offline-first"]);
  });

  it("keeps a valid metadata lease for an empty library without creating a content grant", async () => {
    await db.update(schema.pendaftaranMurid).set({ status: "cancelled" }).where(eq(schema.pendaftaranMurid.id, "offline-enrollment"));
    const synced = await synchronizeOffline(await actor(), { cursor: null, locale: "id", courseIds: [] });
    expect(synced.enrollments).toEqual([]);
    expect(synced.access).toEqual([]);
    expect(synced.leaseExpiresAt).toBeGreaterThan(synced.serverTime);
    const catalog = await buildOfflineResource(await actor(), "achievement_catalog", "catalog");
    expect(catalog.data).toHaveProperty("achievements");
    expect(JSON.stringify(catalog.data)).toContain("Warrior Reader");
    expect(JSON.stringify(catalog.data)).not.toContain("offline-user");
  });

  it("maps canonical publication events to every cached course alias", async () => {
    await db.transaction(tx => events.recordOfflineChange(asEventTx(tx), { kind: "article", courseId: "offline-mk", resourceId: "offline-article", action: "upsert" }));
    const synced = await synchronizeOffline(await actor(), { cursor: "0", locale: "id", courseIds: ["offline-course", "offline-mk"] });
    expect(synced.changes.map(change => change.courseId).sort()).toEqual(["offline-course", "offline-mk"]);
    expect(synced.cursor).toBe("1");
  });

  it("changes the text revision even if a direct edit retains the authoring version and timestamp", async () => {
    const first = await buildOfflineResource(await actor(), "diktat", "offline-diktat", "offline-course");
    const [before] = await db.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, "offline-diktat"));
    await db.update(schema.diktatMateri).set({ contentMarkdown: "Ringkasan baru", updatedAt: before.updatedAt }).where(eq(schema.diktatMateri.id, "offline-diktat"));
    try {
      const next = await buildOfflineResource(await actor(), "diktat", "offline-diktat", "offline-course");
      expect(next.resource.revision).not.toBe(first.resource.revision);
      expect(next.data).toHaveProperty("contentVersion", 7);
    } finally { await db.update(schema.diktatMateri).set({ contentMarkdown: before.contentMarkdown, updatedAt: before.updatedAt }).where(eq(schema.diktatMateri.id, "offline-diktat")); }
  });
});

describe("offline asset admission", () => {
  it("uses same-origin allowlisted routes and never forwards cookies to public image hosts", () => {
    expect(offlineAssetFetchTarget("/images/example.png", "https://staging.zyxacademy.com").sendCookies).toBe(true);
    expect(offlineAssetFetchTarget("https://i.ytimg.com/vi/id/default.jpg", "https://staging.zyxacademy.com").sendCookies).toBe(false);
    for (const source of ["http://169.254.169.254/latest", "https://evil.example/image.png", "/api/admin/users", "https://i.ytimg.com@evil.example/image.png"]) expect(() => offlineAssetFetchTarget(source, "https://staging.zyxacademy.com")).toThrow();
  });

  it("rejects unadmitted URLs before fetch, HTML responses and oversized asset bodies", async () => {
    const article = await buildOfflineResource(await actor(), "article", "offline-article", "offline-course");
    const url = new URL(article.assets[0].url, "https://staging.zyxacademy.com");
    url.searchParams.set("asset", "/images/unrelated.png");
    expect((await getAsset(new Request(url))).status).toBe(403);
    await expect(readBoundedOfflineAsset(new Response("<html/>", { headers: { "content-type": "text/html" } }))).rejects.toThrow("OFFLINE_ASSET_TYPE_UNSUPPORTED");
    await expect(readBoundedOfflineAsset(new Response("x", { headers: { "content-type": "image/png", "content-length": String(OFFLINE_ASSET_MAX_BYTES + 1) } }))).rejects.toThrow("OFFLINE_ASSET_TOO_LARGE");
    expect(await readBoundedOfflineAsset(new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/png" } }))).toEqual(new Uint8Array([1, 2]));
  });
});
