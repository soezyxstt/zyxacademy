import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { PERAN_SEEDS, peranIdFor } from "@/lib/auth/peran";
import type { VideoUploadClaims } from "@/lib/video/upload-grant";
import { createPostgresTestDb } from "../helpers/postgres";

let database: Awaited<ReturnType<typeof createPostgresTestDb>>;
const dbProxy = new Proxy({} as Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"], {
  get(_target, key) {
    const value = Reflect.get(database.testDb, key);
    return typeof value === "function" ? value.bind(database.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: dbProxy }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
const promoted: VideoUploadClaims[] = [];
const cleaned: string[] = [];
mock.module("@/lib/storage", () => ({
  storage: {
    getSignedUrl: async () => "https://storage.fixture.invalid",
    delete: async (key: string) => { cleaned.push(key); },
  },
}));
mock.module("@/lib/video/verified-upload", () => ({
  verifyAndPromoteVideoUpload: async (claims: VideoUploadClaims) => {
    promoted.push(claims);
    return claims.kind === "video" ? "courses/legacy-video-a/videos/promoted.mp4" : "courses/legacy-video-a/videos/thumbnails/promoted.png";
  },
}));

const { prepareVideoUpload, readVideoManagement, writeVideoManagement } = await import("@/lib/native/academic/video-management");
const courseId = "canonical-video-a";
const tutor = { role: "tutor", courseId, viewer: { user: { id: "assigned-tutor" }, session: { id: "assigned-tutor-session" } } } as const;
const admin = { role: "admin", courseId, viewer: { user: { id: "video-admin" }, session: { id: "video-admin-session" } } } as const;
const otherTutor = { ...tutor, viewer: { user: { id: "unassigned-tutor" }, session: { id: "unassigned-tutor-session" } } } as const;
const fields = { title: "Video playlist", description: null };

beforeAll(async () => {
  database = await createPostgresTestDb();
  const db = database.testDb;
  await db.insert(schema.peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  for (const context of [admin, tutor, otherTutor]) {
    const id = context.viewer.user.id;
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: context.role === "admin" ? "admin" : "teacher" });
    await db.insert(schema.pengguna).values({ id, status: "active" });
    await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: peranIdFor(context.role), source: "fixture" });
    await db.insert(schema.session).values({ id: context.viewer.session.id, userId: id, token: `synthetic-${id}`, expiresAt: new Date("2099-01-01") });
  }
  await db.insert(schema.courses).values([
    { id: "legacy-video-a", title: "Video A", category: "Matematika" }, { id: "foreign-course", title: "Video B", category: "Matematika" },
  ]);
  await db.insert(schema.mataKuliah).values({ id: courseId, title: "Video A", code: "VIDEO-A", legacyCourseId: "legacy-video-a" });
  await db.insert(schema.penugasanTutor).values({ id: "assigned-course", penggunaId: tutor.viewer.user.id, mataKuliahId: courseId });
}, 60_000);
afterAll(() => database?.client.close());
beforeEach(async () => {
  await database.testDb.delete(schema.courseVideoPlaylists);
  await database.testDb.delete(schema.auditMutasi);
  await database.testDb.delete(schema.offlineContentChanges);
  promoted.length = 0;
  cleaned.length = 0;
});

test("Admin and assigned Tutor write the canonical course's physical catalog, and stale revisions and unassigned writes fail", async () => {
  const command = { action: "new-playlist", fields } as const;
  await expect(writeVideoManagement(otherTutor, command, crypto.randomUUID())).rejects.toThrow("FORBIDDEN");
  const idempotency = crypto.randomUUID();
  const created = await writeVideoManagement(tutor, command, idempotency);
  expect(await writeVideoManagement(tutor, command, idempotency)).toEqual(created);
  const [stored] = await database.testDb.select().from(schema.courseVideoPlaylists);
  expect(stored.courseId).toBe("legacy-video-a");
  const [row] = (await readVideoManagement(admin)).playlists;
  const edit = { action: "edit-playlist", id: created.id, expectedRevision: row.revision, fields: { ...fields, title: "Updated" } } as const;
  await writeVideoManagement(admin, edit, crypto.randomUUID());
  await expect(writeVideoManagement(tutor, edit, crypto.randomUUID())).rejects.toThrow("REVISION_CONFLICT");
  const [updated] = (await readVideoManagement(tutor)).playlists;
  await writeVideoManagement(tutor, { action: "delete-playlist", id: updated.id, expectedRevision: updated.revision, confirmed: true }, crypto.randomUUID());
  expect((await readVideoManagement(admin)).playlists).toEqual([]);
  expect((await database.testDb.select().from(schema.offlineContentChanges)).map(event => event.action)).toContain("delete");
});

test("a signed video and thumbnail attach only under the originating role and session and replays avoid provider operations", async () => {
  const playlist = await writeVideoManagement(admin, { action: "new-playlist", fields }, crypto.randomUUID());
  const video = await prepareVideoUpload(tutor, { kind: "video", name: "Lesson.mp4", mime: "video/mp4", size: 120, uploadId: crypto.randomUUID() });
  const thumbnail = await prepareVideoUpload(tutor, { kind: "thumbnail", name: "Cover.png", mime: "image/png", size: 60, uploadId: crypto.randomUUID() });
  const command = { action: "new-video", fields: {
    title: "Uploaded lesson", description: null, playlistId: playlist.id, chapterId: null,
    source: { kind: "uploaded", token: video.token, duration: 42 }, thumbnail: { kind: "uploaded", token: thumbnail.token },
  } } as const;
  await expect(writeVideoManagement(admin, command, crypto.randomUUID())).rejects.toThrow("INVALID_VIDEO");
  expect(promoted).toHaveLength(0);
  const idempotency = crypto.randomUUID();
  const added = await writeVideoManagement(tutor, command, idempotency);
  expect(await writeVideoManagement(tutor, command, idempotency)).toEqual(added);
  const [row] = await database.testDb.select().from(schema.courseVideos).where(eq(schema.courseVideos.id, added.id));
  expect(row).toMatchObject({ courseId: "legacy-video-a", playlistId: playlist.id, fileSize: 120, duration: 42,
    videoUrl: "courses/legacy-video-a/videos/promoted.mp4", thumbnailUrl: "courses/legacy-video-a/videos/thumbnails/promoted.png" });
  expect(promoted.map(entry => entry.kind)).toEqual(["video", "thumbnail"]);
  expect(cleaned).toEqual(promoted.map(entry => entry.key));
  expect(JSON.stringify(await readVideoManagement(tutor))).not.toContain("promoted.mp4");
});
