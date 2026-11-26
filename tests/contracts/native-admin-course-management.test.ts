import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { handleAdminCourseManagementCommand } from "@/lib/native/academic/course-management-command";
import { handleAdminCourseChapterCommand } from "@/lib/native/academic/course-chapter-command";
import { handleAdminCourseVideoCommand } from "@/lib/native/academic/course-video-command";
import { handleAdminCourseFlashcardCommand } from "@/lib/native/academic/course-flashcard-command";
import { flashcardRevision, flashcardSetRevision, legacyFlashcardStatus } from "@/lib/academic/flashcard-admin-revisions";
import { videoEntryRevision, videoPlaylistRevision } from "@/lib/video/catalog-revisions";
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

const { saveAdminCourseFlashcard } = await import("@/lib/native/academic/course-flashcard-service");
const { deleteAdminCourseVideoEntry } = await import("@/lib/native/academic/course-video-service");
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

test("video and playlist removal scope catalog changes and leave shared media references intact", async () => {
  const { testDb: db } = database;
  const course = "native-video-course";
  const other = "native-video-other";
  expect((await command("native-video-create-course", create(course))).status).toBe(200);
  expect((await command("native-video-create-other", create(other))).status).toBe(200);
  const [first, second] = await db.insert(tables.courseVideoPlaylists).values([
    { id: "course-native-video-list", courseId: course, title: "Daftar putar" },
    { id: "other-native-video-list", courseId: other, title: "Daftar lain" },
  ]).returning();
  const immutable = { videoUrl: "video/shared-movie.mp4", thumbnailUrl: "video/shared-preview.png" };
  const [video, shared, foreignMember] = await db.insert(tables.courseVideos).values([
    { ...immutable, id: "native-video-item", courseId: course, playlistId: first.id, title: "Video pertama" },
    { ...immutable, id: "native-video-shared", courseId: other, playlistId: second.id, title: "Video kedua" },
    { ...immutable, id: "native-video-foreign", courseId: other, playlistId: first.id, title: "Video keliru" },
  ]).returning();
  const send = (courseId: string, playlist: string, key: string, revision: string, videoId?: string, sessionId = "admin-first") =>
    handleAdminCourseVideoCommand(new Request(origin, { method: "DELETE",
      headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ expectedRevision: revision, confirmed: true }),
    }), ["admin", "courses", courseId, "videos", "playlists", playlist, ...(videoId ? ["videos", videoId] : [])], origin, {
      session: async () => ({ user: { id: admin }, session: { id: sessionId } }), hasAdmin: async () => true, remove: deleteAdminCourseVideoEntry,
    });
  const listKey = "native-video-playlist-delete";
  const videoKey = "native-video-entry-delete";
  expect((await send(course, second.id, videoKey, videoEntryRevision(shared), shared.id)).status).toBe(404);
  expect((await send(course, first.id, videoKey, videoEntryRevision(foreignMember), foreignMember.id)).status).toBe(404);
  const blocked = await send(course, first.id, listKey, videoPlaylistRevision(first, [video, foreignMember]));
  expect(await blocked.json()).toEqual({ error: "DEPENDENCIES_EXIST" });
  await db.delete(tables.courseVideos).where(eq(tables.courseVideos.id, foreignMember.id));
  expect((await send(course, first.id, videoKey, "a".repeat(64), video.id)).status).toBe(409);
  expect((await send(course, first.id, videoKey, videoEntryRevision(video), video.id)).status).toBe(200);
  expect((await send(course, first.id, videoKey, videoEntryRevision(video), video.id, "admin-second")).status).toBe(409);
  expect((await send(course, first.id, videoKey, videoEntryRevision(video), video.id)).status).toBe(200);
  expect((await send(course, first.id, listKey, videoPlaylistRevision(first, [video]))).status).toBe(409);
  expect((await send(course, first.id, listKey, videoPlaylistRevision(first, []))).status).toBe(200);
  expect((await send(course, first.id, listKey, videoPlaylistRevision(first, []))).status).toBe(200);
  const [remaining] = await db.select().from(tables.courseVideos).where(eq(tables.courseVideos.id, shared.id));
  expect(remaining).toMatchObject(immutable);
  const changes = await db.select().from(tables.offlineContentChanges).where(eq(tables.offlineContentChanges.courseId, course));
  expect(changes.filter(change => change.kind === "video_catalog" && change.action === "delete")).toHaveLength(2);
});

test("Admin creates, edits, moves and removes flashcards with course, chapter and version checks", async () => {
  const { testDb: db } = database;
  const course = "native-flashcard-course";
  const other = "native-flashcard-other";
  expect((await command("native-fc-create-course", create(course))).status).toBe(200);
  expect((await command("native-fc-create-other", create(other))).status).toBe(200);
  const chapter = await saveChapterWithCanonicalProjection({ courseId: course, title: "Turunan", orderIndex: 1 });
  const foreign = await saveChapterWithCanonicalProjection({ courseId: other, title: "Deret", orderIndex: 1 });
  const [outside] = await db.insert(tables.setFlashcard).values({
    id: "external-flashcard-set", mataKuliahId: other, title: "Set lain", generationHash: "manual", creatorId: admin,
  }).returning();
  const send = (method: string, key: string, body: unknown, parts: string[] = [], account = admin, sessionId = "admin-first") =>
    handleAdminCourseFlashcardCommand(new Request(origin, { method,
      headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
    }), ["admin", "courses", course, "flashcards", "sets", ...parts], origin, {
      session: async () => ({ user: { id: account }, session: { id: sessionId } }), hasAdmin: async () => true, save: saveAdminCourseFlashcard,
    });
  const setDraft = { title: "Turunan", chapterId: chapter.id, status: "draft", expectedRevision: null };
  const setKey = "native-first-flashcard-set";
  expect((await send("POST", setKey, setDraft, [], student, "student-first")).status).toBe(403);
  expect((await send("POST", setKey, { ...setDraft, chapterId: foreign.id })).status).toBe(422);
  expect((await send("POST", setKey, setDraft)).status).toBe(200);
  expect((await send("POST", setKey, setDraft)).status).toBe(200);
  expect((await send("POST", setKey, setDraft, [], admin, "admin-second")).status).toBe(409);
  const sets = () => db.select().from(tables.setFlashcard).where(eq(tables.setFlashcard.mataKuliahId, course));
  const [first] = await sets();
  expect(await sets()).toHaveLength(1);
  expect(first.babId).toBe(chapter.canonicalChapterId);
  expect((await send("POST", "native-second-flashcard-set", { ...setDraft, title: "Latihan", chapterId: null })).status).toBe(200);
  const second = (await sets()).find(row => row.id !== first.id)!;
  const setRevision = flashcardSetRevision({ ...first, chapterId: first.babId });
  expect((await send("PATCH", "native-first-flashcard-edit", { ...setDraft, status: "published", expectedRevision: setRevision }, [first.id])).status).toBe(200);
  const cardDraft = { front: " $x^2$ ", back: " $2x$ ", explanation: " Aturan pangkat ", status: "published", targetSetId: first.id, expectedRevision: null };
  expect((await send("POST", "native-create-flashcard-item", { ...cardDraft, targetSetId: outside.id }, [first.id, "cards"])).status).toBe(422);
  expect((await send("POST", "native-create-flashcard-item", { ...cardDraft, role: "admin" }, [first.id, "cards"])).status).toBe(422);
  expect((await send("POST", "native-create-flashcard-item", cardDraft, [first.id, "cards"])).status).toBe(200);
  const [card] = await db.select().from(tables.flashcard).where(eq(tables.flashcard.setFlashcardId, first.id));
  expect(card).toMatchObject({ front: "$x^2$", back: "$2x$", explanation: "Aturan pangkat" });
  const edit = { ...cardDraft, front: " $x^3$ ", back: "$3x^2$", expectedRevision: flashcardRevision(card), targetSetId: second.id };
  const cardPath = [first.id, "cards", card.id];
  expect((await send("PATCH", "native-move-flashcard-item", { ...edit, targetSetId: outside.id }, cardPath)).status).toBe(404);
  expect((await send("PATCH", "native-move-flashcard-item", edit, cardPath)).status).toBe(200);
  expect((await send("PATCH", "native-move-flashcard-item", edit, cardPath)).status).toBe(200);
  const [moved] = await db.select().from(tables.flashcard).where(eq(tables.flashcard.setFlashcardId, second.id));
  expect(moved).toMatchObject({ id: card.id, front: "$x^3$", back: "$3x^2$" });
  await db.insert(tables.kemajuanFlashcardMurid).values({ id: "native-existing-review", penggunaId: student, flashcardId: card.id, dueAt: new Date() });
  const consent = { expectedRevision: flashcardRevision(moved), confirmed: true };
  expect((await send("DELETE", "native-delete-flashcard-item", consent, cardPath)).status).toBe(404);
  expect(await (await send("DELETE", "native-delete-flashcard-item", consent, [second.id, "cards", card.id])).json())
    .toEqual({ error: "DEPENDENCIES_EXIST" });
  await db.delete(tables.kemajuanFlashcardMurid).where(eq(tables.kemajuanFlashcardMurid.flashcardId, card.id));
  const listConsent = { expectedRevision: flashcardSetRevision({ ...second, chapterId: second.babId }, [moved]), confirmed: true };
  expect((await send("DELETE", "native-delete-flashcard-item", consent, [second.id, "cards", card.id])).status).toBe(200);
  expect((await send("DELETE", "native-delete-flashcard-set", listConsent, [second.id])).status).toBe(409);
  const freshConsent = { ...listConsent, expectedRevision: flashcardSetRevision({ ...second, chapterId: second.babId }, []) };
  expect((await send("DELETE", "native-delete-flashcard-set", freshConsent, [second.id])).status).toBe(200);
  expect((await send("DELETE", "native-delete-flashcard-set", freshConsent, [second.id])).status).toBe(200);
  expect((await sets()).map(row => row.id)).toEqual([first.id]);
  const [untouched] = await db.select().from(tables.setFlashcard).where(eq(tables.setFlashcard.id, outside.id));
  expect(untouched?.title).toBe(outside.title);
});

test("legacy-only flashcards stay editable and mirrored deletion protects unseen cards", async () => {
  const { testDb: db } = database;
  const course = "native-legacy-flashcards";
  expect((await command("native-legacy-fc-create-course", create(course))).status).toBe(200);
  const chapter = await saveChapterWithCanonicalProjection({ courseId: course, title: "Bab lama", orderIndex: 1 });
  const [source] = await db.insert(tables.masterTeachingDocuments).values({
    id: "native-legacy-flashcard-source", courseId: course, title: "Materi", markdownContent: "Definisi", createdById: admin,
  }).returning();
  const [legacy] = await db.insert(tables.flashcardSets).values({
    id: "native-legacy-flashcard-set", courseId: course, chapterId: chapter.id, sourceMtdId: source.id, sourceMtdVersion: 1,
    generationHash: "generated", title: "Set lama", status: "published",
  }).returning();
  const viewer = { user: { id: admin }, session: { id: "admin-first" } };
  const draft = { targetSetId: legacy.id, front: "Sisi depan", back: "Sisi belakang", explanation: null, expectedRevision: null, status: "published" } as const;
  await saveAdminCourseFlashcard(course, { kind: "card", method: "create", parentId: legacy.id, draft }, "native-legacy-create-card", viewer);
  const [card] = await db.select().from(tables.flashcards).where(eq(tables.flashcards.setId, legacy.id));
  const cardView = { ...card, status: legacyFlashcardStatus(card.status), updatedAt: card.createdAt };
  await saveAdminCourseFlashcard(course, { kind: "card", method: "update", id: card.id, parentId: legacy.id,
    draft: { ...draft, status: "draft", expectedRevision: flashcardRevision(cardView) },
  }, "native-legacy-update-card", viewer);
  const [edited] = await db.select().from(tables.flashcards).where(eq(tables.flashcards.id, card.id));
  expect(edited.status).toBe("retired");
  const [canonical] = await db.insert(tables.setFlashcard).values({ id: legacy.id, mataKuliahId: course, babId: chapter.canonicalChapterId,
    title: legacy.title, generationHash: "manual", creatorId: admin,
  }).returning();
  const change = { kind: "set", method: "delete", id: legacy.id, expectedRevision: flashcardSetRevision({ ...canonical, chapterId: canonical.babId }, []) } as const;
  await expect(saveAdminCourseFlashcard(course, change, "native-protect-hidden-card", viewer)).rejects.toThrow("DEPENDENCIES_EXIST");
  expect(await db.select().from(tables.flashcards).where(eq(tables.flashcards.setId, legacy.id))).toHaveLength(1);
});

test("PDF metadata and deletion bind the document, chapters, revision and actor before updating the course catalog", async () => {
  const { testDb: db } = database;
  const { updateCoursePdfTitleFromNative, deleteCoursePdfFromNative } = await import("@/lib/native/academic/course-material-service");
  const { revisionOf } = await import("@/lib/admin-mcp/revision");
  const id = "native-course-documents";
  expect((await command("native-pdf-test-course", create(id))).status).toBe(200);
  const chapter = await saveChapterWithCanonicalProjection({ courseId: id, title: "Latihan", orderIndex: 1 });
  const [document] = await db.insert(tables.courseMaterials).values({ id: "native-pdf-document", courseId: id, title: "Draft",
    type: "materi", fileUrl: "https://example.invalid/legacy/document.pdf", chapterIds: [] }).returning();
  const viewer = { user: { id: admin }, session: { id: "admin-first" } };
  const metadata = { type: "soal", subcategory: "uts", year: 2025, chapterIds: [chapter.id] } as const;
  const draft = { expectedRevision: revisionOf(document), title: "Latihan UTS", metadata: { ...metadata, chapterIds: [...metadata.chapterIds] } };
  await expect(updateCoursePdfTitleFromNative(id, document.id, { ...draft, metadata: { ...draft.metadata, chapterIds: ["outside"] } }, "native-pdf-foreign-chapter", viewer)).rejects.toThrow("CHAPTER_NOT_FOUND");
  await updateCoursePdfTitleFromNative(id, document.id, draft, "native-pdf-save-metadata", viewer);
  const [saved] = await db.select().from(tables.courseMaterials).where(eq(tables.courseMaterials.id, document.id));
  expect(saved).toMatchObject({ title: draft.title, ...metadata });
  const consent = { confirmed: true as const, expectedRevision: revisionOf(saved) };
  await expect(deleteCoursePdfFromNative(id, document.id, { ...consent, expectedRevision: draft.expectedRevision }, "native-pdf-stale-delete", viewer)).rejects.toThrow("REVISION_CONFLICT");
  await deleteCoursePdfFromNative(id, document.id, consent, "native-pdf-confirm-delete", viewer);
  await deleteCoursePdfFromNative(id, document.id, consent, "native-pdf-confirm-delete", viewer);
  await expect(deleteCoursePdfFromNative(id, document.id, consent, "native-pdf-confirm-delete", { ...viewer, session: { id: "admin-second" } })).rejects.toThrow("REQUEST_CONFLICT");
  expect(await db.select().from(tables.courseMaterials).where(eq(tables.courseMaterials.id, document.id))).toHaveLength(0);
});
