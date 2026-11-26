import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { handleAdminCourseManagementCommand } from "@/lib/native/academic/course-management-command";
import { handleAdminCourseChapterCommand } from "@/lib/native/academic/course-chapter-command";
import { courseChapterRevision } from "@/lib/academic/course-chapter-revision";

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
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));

const { createCourseFromNative, archiveCourseFromNative } = await import("@/lib/native/academic/course-management-service");
const { readCourseSettingsEditView } = await import("@/lib/native/academic/course-settings-service");
const { archiveCourseChapterFromNative, reorderCourseChaptersFromNative, saveCourseChapterFromNative } = await import("@/lib/native/academic/course-chapter-service");
const { saveChapterWithCanonicalProjection } = await import("@/lib/academic/course-canonical-sync");
const origin = "https://example.test";
const admin = "native-course-admin";
const student = "native-course-student";

beforeAll(async () => {
  database = await createPostgresTestDb();
  const { testDb: db } = database;
  await db.insert(tables.peran).values({ id: "native-courses-role-admin", code: "admin" }).onConflictDoNothing();
  const [role] = await db.select().from(tables.peran).where(eq(tables.peran.code, "admin"));
  await db.insert(tables.user).values([admin, student].map(id => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(tables.pengguna).values([admin, student].map(id => ({ id, status: "active" as const })));
  await db.insert(tables.penggunaPeran).values({ id: "course-admin-access", penggunaId: admin, peranId: role.id, source: "test" });
  await db.insert(tables.session).values([
    { id: "admin-first", userId: admin }, { id: "admin-second", userId: admin }, { id: "student-first", userId: student },
  ].map(row => ({ ...row, token: `synthetic-${row.id}`, expiresAt: new Date(Date.now() + 300_000) })));
}, 60_000);
afterAll(async () => { await database?.client.close(); });

async function command(requestId: string, body: unknown, path: string[] = [], account = admin, sessionId = "admin-first") {
  return handleAdminCourseManagementCommand(new Request(origin, { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(body) }),
  ["admin", "courses", ...path], origin, {
    session: async () => ({ user: { id: account }, session: { id: sessionId } }),
    // Force the transactional role and live-session checks to prove authority.
    hasAdmin: async () => true,
    create: createCourseFromNative, archive: archiveCourseFromNative,
  });
}

const create = (id: string) => ({ id, title: "Kalkulus", category: "Matematika", description: null,
  pricing: { category: "free", startsAt: null, endsAt: null } });

test("creates and archives an empty course with durable same-session retries", async () => {
  const { testDb: db } = database;
  const id = "native-course-empty";
  const createKey = "contract-course-create-01";
  const archiveKey = "contract-course-archive-01";
  expect((await command(createKey, create(id), [], student, "student-first")).status).toBe(403);
  expect((await command(createKey, create(id), [], admin, "missing-session")).status).toBe(401);
  expect((await command(createKey, create(id))).status).toBe(200);
  expect((await command(createKey, create(id))).status).toBe(200);
  expect((await command(createKey, create(id), [], admin, "admin-second")).status).toBe(409);
  const detail = await readCourseSettingsEditView(id);
  expect(detail?.pricing.category).toBe("free");
  const consent = { expectedRevision: detail!.revision, confirmed: true };
  expect((await command(archiveKey, { ...consent, expectedRevision: "a".repeat(64) }, [id, "archive"])).status).toBe(409);
  expect((await command(archiveKey, consent, [id, "archive"])).status).toBe(200);
  expect((await command(archiveKey, consent, [id, "archive"])).status).toBe(200);
  expect((await command(archiveKey, consent, [id, "archive"], admin, "admin-second")).status).toBe(409);
  expect(await db.select().from(tables.courses).where(eq(tables.courses.id, id))).toHaveLength(0);
  const [row] = await db.select().from(tables.mataKuliah).where(eq(tables.mataKuliah.id, id));
  expect(row?.status).toBe("archived");
  const changes = await db.select().from(tables.offlineContentChanges).where(eq(tables.offlineContentChanges.courseId, id));
  expect(changes.filter(change => change.kind === "access" && change.action === "delete")).toHaveLength(1);
});

test("a canonical chapter blocks archive even when the legacy course has no child rows", async () => {
  const { testDb: db } = database;
  const id = "native-course-with-chapter";
  expect((await command("contract-course-create-02", create(id))).status).toBe(200);
  await db.insert(tables.bab).values({ id: "native-course-chapter", mataKuliahId: id, code: "ONE", title: "Bab", orderIndex: 1 });
  const detail = await readCourseSettingsEditView(id);
  const response = await command("contract-course-archive-02", { expectedRevision: detail!.revision, confirmed: true }, [id, "archive"]);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "DEPENDENCIES_EXIST" });
  expect(await readCourseSettingsEditView(id)).not.toBeNull();
});

test("reorders both chapter projections and blocks archival while a document references either identity", async () => {
  const { testDb: db } = database;
  const id = "native-chapter-management";
  expect((await command("contract-course-structure-01", create(id))).status).toBe(200);
  const first = await saveChapterWithCanonicalProjection({ courseId: id, title: "Batas", orderIndex: 1 });
  const second = await saveChapterWithCanonicalProjection({ courseId: id, title: "Turunan", orderIndex: 2 });
  const currentRows = async () => Promise.all([
    db.select().from(tables.bab).where(eq(tables.bab.mataKuliahId, id)),
    db.select().from(tables.chapters).where(eq(tables.chapters.courseId, id)),
  ]);
  const revision = async () => courseChapterRevision(id, id, ...await currentRows());
  const send = (method: string, target: string, writeId: string, body: unknown, sessionId = "admin-first") =>
    handleAdminCourseChapterCommand(new Request(origin, { method,
      headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": writeId }, body: JSON.stringify(body),
    }), ["admin", "courses", id, "chapters", target], origin, {
      session: async () => ({ user: { id: admin }, session: { id: sessionId } }),
      hasAdmin: async () => true,
      save: saveCourseChapterFromNative, archive: archiveCourseChapterFromNative, reorder: reorderCourseChaptersFromNative,
    });
  const orderKey = "contract-chapter-structure-order";
  const before = await revision();
  expect((await send("POST", "order", orderKey, { expectedRevision: before, chapterIds: [second.canonicalChapterId] })).status).toBe(422);
  const order = { expectedRevision: before, chapterIds: [second.canonicalChapterId, first.id] };
  expect((await send("POST", "order", orderKey, order)).status).toBe(200);
  expect((await send("POST", "order", orderKey, order)).status).toBe(200);
  expect((await send("POST", "order", orderKey, order, "admin-second")).status).toBe(409);
  const [live, legacy] = await currentRows();
  expect(live.find(row => row.id === second.canonicalChapterId)?.orderIndex).toBe(1);
  expect(legacy.find(row => row.id === second.id)?.orderIndex).toBe(1);
  await db.insert(tables.courseMaterials).values({
    id: "native-course-linked-document", courseId: id, title: "Berkas", type: "materi", fileUrl: "/fixtures/course.pdf", chapterIds: [first.id],
  });
  const archiveKey = "contract-chapter-structure-archive";
  const approval = { expectedRevision: await revision(), confirmed: true };
  const blocked = await send("DELETE", first.canonicalChapterId, archiveKey, approval);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({ error: "DEPENDENCIES_EXIST" });
  await db.delete(tables.courseMaterials).where(eq(tables.courseMaterials.id, "native-course-linked-document"));
  expect((await send("DELETE", first.canonicalChapterId, archiveKey, approval)).status).toBe(200);
  expect((await send("DELETE", first.canonicalChapterId, archiveKey, approval)).status).toBe(200);
  const [archived, remaining] = await currentRows();
  expect(archived.find(row => row.id === first.canonicalChapterId)?.status).toBe("archived");
  expect(remaining.map(row => row.id)).toEqual([second.id]);
});
