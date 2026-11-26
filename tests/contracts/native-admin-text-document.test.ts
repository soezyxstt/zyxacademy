import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import { handleNativeTextDocumentWrite } from "@/lib/native/academic/course-text-document-command";
import type { TextDocumentSource } from "@/packages/native-parity/academic/courses/text-document";
import { createPostgresTestDb } from "../helpers/postgres";

let database: Awaited<ReturnType<typeof createPostgresTestDb>>;
const connection = new Proxy({} as Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"], {
  get(_target, key) {
    const value = Reflect.get(database.testDb, key);
    return typeof value === "function" ? value.bind(database.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: connection }));
mock.module("@/lib/db", () => ({ db: connection }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
mock.module("@/lib/admin/course-material-preview", () => ({ getAdminCourseMaterialPreview: async () => null }));

const { readNativeCourseTextDocument, writeNativeCourseTextDocument } = await import("@/lib/native/academic/course-text-document-service");
const origin = "https://preview.example.test";
const courseId = "native-document-course";
const legacyId = "native-document-legacy";
const viewer = (sessionId = "native-document-session", userId = "native-document-admin") => ({
  user: { id: userId }, session: { id: sessionId },
});

beforeAll(async () => {
  database = await createPostgresTestDb();
  const { testDb: db } = database;
  await db.insert(tables.peran).values({ id: "native-document-role", code: "admin" }).onConflictDoNothing();
  const [role] = await db.select().from(tables.peran).where(eq(tables.peran.code, "admin"));
  const admin = viewer().user.id;
  const student = "native-document-student";
  await db.insert(tables.user).values([admin, student].map(id => ({ id, name: id, email: id + "@example.test" })));
  await db.insert(tables.pengguna).values([admin, student].map(id => ({ id, status: "active" as const })));
  await db.insert(tables.penggunaPeran).values({ id: "native-document-admin-access", penggunaId: admin, peranId: role.id, source: "test" });
  await db.insert(tables.session).values([
    viewer(), viewer("native-document-other-session"), viewer("native-document-student-session", student),
  ].map(value => ({ id: value.session.id, userId: value.user.id, token: value.session.id, expiresAt: new Date(Date.now() + 300_000) })));
  await db.insert(tables.courses).values({ id: legacyId, title: "Legacy", category: "Matematika" });
  await db.insert(tables.mataKuliah).values([
    { id: courseId, code: "DOCUMENT-COURSE", title: "Course", legacyCourseId: legacyId },
    { id: "native-document-other", code: "DOCUMENT-OTHER", title: "Other" },
  ]);
  await db.insert(tables.bab).values([
    { id: "chapter-first", mataKuliahId: courseId, code: "FIRST", title: "First", orderIndex: 1 },
    { id: "chapter-second", mataKuliahId: courseId, code: "SECOND", title: "Second", orderIndex: 2 },
    { id: "chapter-other", mataKuliahId: "native-document-other", code: "OTHER", title: "Other", orderIndex: 1 },
  ]);
  await db.insert(tables.chapters).values([
    { id: "legacy-chapter-first", courseId: legacyId, title: "First", orderIndex: 1 },
    { id: "legacy-chapter-second", courseId: legacyId, title: "Second", orderIndex: 2 },
  ]);
  const base = { mataKuliahId: courseId, babId: "chapter-first", creatorId: admin, version: 4, contentMarkdown: "# Awal",
    title: "Awal", sourceHash: "source", generationHash: "version" };
  await db.insert(tables.artikel).values({ ...base, id: "native-document-article", slug: "native-document-article-slug" });
  await db.insert(tables.diktatMateri).values({ ...base, id: "native-document-diktat", fileKey: "fixture/document.pdf" });
  await db.insert(tables.masterTeachingDocuments).values({ id: "native-document-mtd", courseId: legacyId,
    createdById: admin, markdownContent: "# Awal", title: "Sumber" });
  await db.insert(tables.websiteMaterials).values({ id: "native-document-website", courseId: legacyId,
    title: "Awal", chapterId: "legacy-chapter-first", sourceMtdId: "native-document-mtd", sourceMtdVersion: 1,
    generationHash: "version", slug: "native-document-website-slug", canonicalMarkdown: "# Awal", structuredContent: {}, contentVersion: 4,
  });
}, 60_000);

afterAll(async () => { await database?.client.close(); });

function patch(id: string, body: unknown, key: string, actor = viewer(), slug = courseId) {
  return handleNativeTextDocumentWrite(new Request(origin, { method: "PATCH",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
  }), slug, id, origin, {
    session: async () => actor, hasAdmin: async () => true, write: writeNativeCourseTextDocument,
  });
}

const sources: Array<{ source: TextDocumentSource; id: string; chapterId: string }> = [
  { source: "canonical-article", id: "native-document-article", chapterId: "chapter-second" },
  { source: "canonical-diktat", id: "native-document-diktat", chapterId: "chapter-second" },
  { source: "legacy-article", id: "native-document-website", chapterId: "legacy-chapter-second" },
];

for (const { source, id, chapterId } of sources) {
  test(`${source} edits and changes publication under source, revision and session scope`, async () => {
    const { testDb: db } = database;
    const first = await readNativeCourseTextDocument(legacyId, id, viewer());
    expect(first.data.courseId).toBe(courseId);
    expect(first.kind).toBe(source === "canonical-diktat" ? "diktat" : "article");
    expect(first.edit?.source).toBe(source);
    expect(first.edit?.chapters.map(option => option.id)).toContain(chapterId);
    await expect(readNativeCourseTextDocument("native-document-other", id, viewer())).rejects.toThrow("MATERIAL_NOT_FOUND");

    const expectedRevision = first.edit!.revision;
    const edit = { source, expectedRevision, action: "content", title: "Sesudah", markdown: "# Sesudah", chapterId };
    const key = id + "-content";
    expect((await patch(id, edit, key, viewer("native-document-student-session", "native-document-student"))).status).toBe(403);
    expect((await patch(id, edit, key, viewer("expired-session"))).status).toBe(401);
    expect((await patch(id, { ...edit, chapterId: "chapter-other" }, id + "-wrong-chapter")).status).toBe(422);
    const otherSource = source === "canonical-article" ? "canonical-diktat" : "canonical-article";
    expect((await patch(id, { ...edit, source: otherSource }, id + "-wrong-source")).status).toBe(404);
    expect((await patch(id, edit, key)).status).toBe(200);
    expect((await patch(id, edit, key)).status).toBe(200);
    expect((await patch(id, edit, key, viewer("native-document-other-session"))).status).toBe(409);
    expect((await patch(id, edit, id + "-stale-content")).status).toBe(409);
    const after = await readNativeCourseTextDocument(courseId, id, viewer());
    const version = "version" in after.data ? after.data.version : after.data.contentVersion;
    expect(version).toBe(4);
    expect(after.edit).toMatchObject({ title: "Sesudah", markdown: "# Sesudah", chapterId, status: "draft" });

    const publish = { source, action: "status", status: "published", expectedRevision: after.edit!.revision };
    expect((await patch(id, publish, id + "-publish")).status).toBe(200);
    const published = await readNativeCourseTextDocument(courseId, id, viewer());
    expect(published.edit?.status).toBe("published");
    const unpublish = { ...publish, status: "draft", expectedRevision: published.edit!.revision };
    expect((await patch(id, unpublish, id + "-draft")).status).toBe(200);
    expect((await patch(id, unpublish, id + "-draft")).status).toBe(200);

    if (source === "legacy-article") {
      const log = await db.select().from(tables.offlineContentChanges).where(eq(tables.offlineContentChanges.courseId, legacyId));
      expect(log.map(event => [event.kind, event.action])).toEqual(Array(3).fill(["course", "invalidate"]));
    } else {
      const table = source === "canonical-article" ? tables.artikel : tables.diktatMateri;
      const [row] = await db.select({ publishedAt: table.publishedAt, status: table.status }).from(table).where(eq(table.id, id));
      expect(row).toEqual({ publishedAt: null, status: "draft" });
      const kind = source === "canonical-article" ? "article" : "diktat";
      const log = await db.select().from(tables.offlineContentChanges).where(eq(tables.offlineContentChanges.resourceId, id))
        .orderBy(tables.offlineContentChanges.cursor);
      expect(log.map(event => [event.kind, event.action])).toEqual([[kind, "upsert"], [kind, "upsert"], [kind, "delete"]]);
    }
  });
}
