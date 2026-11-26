import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const tutor = { user: { id: "tutor" } };
const previousSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = "synthetic-tutor-discussion-secret-for-hosted-tests";
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => tutor, getAuthUser: async () => tutor.user, requireAuthUser: async () => tutor.user,
}));
mock.module("@/lib/queue/outbox", () => ({
  wakeOutbox: () => {}, withQueueWakeups: (transaction: () => unknown) => transaction(),
}));
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { tutorSupportServices } = await import("@/lib/native/academic/tutor-support-services");
const { handleTutorDiscussionWorkspace } = await import("@/lib/native/academic/handle-tutor-discussion-workspace");
const { tutorDiscussionWorkspaceServices } = await import("@/lib/native/academic/tutor-discussion-workspace-services");
const { handleTutorDiscussionAnswer, handleTutorSupport } = await import("@/lib/native/academic/handle-tutor-support");

const origin = "https://integration.example.test";
const parts = ["courses", "course-legacy", "discussions"];
const scope = origin + "/api/native/academic/tutor-support/" + parts.join("/");
const threadId = "course-discussion";

beforeAll(async () => {
  for (const user of [
    { id: "tutor", role: "teacher", name: "Tutor Biologi" },
    { id: "eligible", role: "student", name: "Nadia Peserta" },
    { id: "outside", role: "student", name: "Nadia Luar" },
  ]) {
    await testDb.insert(schema.user).values({ ...user, email: `${user.id}@example.test` });
    await provisionPenggunaForNewUser(user);
  }
  await testDb.insert(schema.courses).values({ id: "course-legacy", title: "Biologi", category: "Matematika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course-canonical", code: "BIO", title: "Biologi", legacyCourseId: "course-legacy" });
  await testDb.insert(schema.tutorCourses).values({ id: "assignment", tutorId: "tutor", courseId: "course-legacy" });
  await testDb.insert(schema.enrollments).values({ id: "entry", userId: "eligible", courseId: "course-legacy", expiresAt: new Date("2099-01-01") });
  await testDb.insert(schema.discussionChannels).values({ id: "course-channel", title: "Biologi", kind: "course", courseId: "course-canonical", legacyCourseId: "course-legacy" });
  await testDb.insert(schema.discussionThreads).values({ id: threadId, channelId: "course-channel", authorId: "eligible", title: "Paragraf pembuka", nextSeq: 2 });
  await testDb.insert(schema.discussionMessages).values({ id: "first-message", threadId, authorId: "eligible", kind: "human",
    messageType: "question", body: "Tolong bahas sel", seq: 1, requestId: "fixture-question" });
});
afterAll(async () => {
  if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = previousSecret;
  await client.close();
});

test("native Tutor can create one real course question and change the verified channel preference", async () => {
  const path = scope + "/workspace";
  const segments = [...parts, "workspace"];
  const read = (query: string) => handleTutorDiscussionWorkspace(new Request(path + query), segments, origin, tutorDiscussionWorkspaceServices);
  expect(await (await read("?view=catalog")).json()).toMatchObject({ items: [{ id: "course-channel", muted: false }] });
  const write = (body: object, requestId: string) => handleTutorDiscussionWorkspace(new Request(path, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(body),
  }), segments, origin, tutorDiscussionWorkspaceServices);
  const requestId = "new-native-question";
  const input = { action: "create", requestId, input: {
    channelId: "course-channel", title: "Pertanyaan dari tutor", body: "Apa perbedaan kedua jenis sel?",
  } };
  expect((await write({ ...input, input: { ...input.input, channelId: "another-channel" } }, requestId)).status).toBe(404);
  const first = await (await write(input, requestId)).json();
  expect(first).toMatchObject({ ok: true, value: { threadId: expect.any(String), messageId: expect.any(String) } });
  expect(await (await write(input, requestId)).json()).toEqual(first);
  expect(await testDb.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.requestId, requestId))).toHaveLength(1);
  expect(await (await write({ action: "mute", requestId: "mute-course", channelId: "course-channel", muted: true }, "mute-course")).json())
    .toEqual({ ok: true });
  expect(await (await read("?view=catalog")).json()).toMatchObject({ items: [{ id: "course-channel", muted: true }] });
});

test("native Tutor edit, delete, report and forward share the web permission checks", async () => {
  await testDb.insert(schema.discussionThreads).values({ id: "public-destination", channelId: "course-channel", authorId: "eligible", title: "Tujuan" });
  await testDb.insert(schema.discussionChannels).values({ id: "private-channel", title: "Akademik", kind: "academic", requesterId: "eligible",
    courseId: "course-canonical", legacyCourseId: "course-legacy" });
  await testDb.insert(schema.discussionThreads).values({ id: "private-destination", channelId: "private-channel", authorId: "eligible", title: "Privat", nextSeq: 2 });
  await testDb.insert(schema.discussionMessages).values({ id: "private-message", threadId: "private-destination", authorId: "eligible", kind: "human",
    messageType: "question", body: "Permintaan privat", seq: 1, requestId: "fixture-private" });
  const write = (body: object, requestId: string, route = [...parts, "workspace"]) =>
    handleTutorDiscussionWorkspace(new Request(origin + "/api/native/academic/tutor-support/" + route.join("/"), {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId },
      body: JSON.stringify({ requestId, ...body }),
    }), route, origin, tutorDiscussionWorkspaceServices);
  const global = ["discussions", "workspace"];
  const requestId = "editable-native-question";
  const input = { action: "create", input: { channelId: "course-channel", title: "Pesan tutor", body: "Draf awal" } };
  const created = await (await write(input, requestId)).json();
  expect(created.ok).toBe(true);
  const editable = { threadId: created.value.threadId, messageId: created.value.messageId };
  const edit = { action: "edit", ...editable, body: "Draf diperbarui", revision: 1 };
  expect((await write({ ...edit, threadId }, "bad-thread")).status).toBe(404);
  expect((await write(edit, "edit-new")).status).toBe(200);
  expect((await write(edit, "edit-stale")).status).toBe(409);
  expect((await write({ action: "report", ...editable, reason: "Laporan diri" }, "own-report")).status).toBe(404);
  expect((await write({ action: "report", threadId: "private-destination", messageId: "private-message", reason: "Alasan laporan" }, "private-report", global)).status).toBe(404);
  expect((await write({ action: "report", threadId, messageId: "first-message", reason: "Alasan laporan" }, "valid-report")).status).toBe(200);
  expect((await testDb.select().from(schema.discussionReports)).map(row => row.messageId)).toEqual(["first-message"]);
  const forward = { action: "forward", threadId, messageId: "first-message", destinationId: "public-destination" };
  expect(await (await write({ ...forward, destinationId: "private-destination" }, "public-private")).json())
    .toMatchObject({ ok: false, error: "unavailable" });
  expect((await write({ ...forward, threadId: "private-destination", messageId: "private-message" }, "private-outside", global)).status).toBe(404);
  const first = await (await write(forward, "valid-forward")).json();
  expect(first).toMatchObject({ ok: true, value: { threadId: "public-destination" } });
  expect(await (await write(forward, "valid-forward")).json()).toEqual(first);
  expect((await write({ action: "delete", ...editable }, "delete-own")).status).toBe(200);
  const [deleted] = await testDb.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.id, editable.messageId));
  expect(deleted?.deletedById).toBe("tutor");
});

test("native Tutor mention search and writes use the current course audience and enqueue Zyra exactly once", async () => {
  const lookup = (query: Record<string, string>) => handleTutorSupport(new URL(scope + "?" + new URLSearchParams({ thread: threadId, ...query })), parts, tutorSupportServices);
  const results = await lookup({ mention: "Nadia" });
  expect(results.status).toBe(200);
  expect(await results.json()).toMatchObject([{ id: "eligible", name: "Nadia Peserta", role: "student" }]);
  const send = (requestId: string, personId = "eligible") => handleTutorDiscussionAnswer(new Request(scope, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify({ threadId, body: "@Nadia @Zyra bahas sel", mentionIds: [personId], mentionHandles: ["Nadia"],
      askZyra: true, requestId, replyTo: "first-message" }),
  }), parts, origin, tutorSupportServices);
  expect(await (await send("outside-audience", "outside")).json()).toMatchObject({ ok: false, error: "unavailable" });
  const first = await (await send("native-zyra")).json();
  expect(first).toMatchObject({ ok: true, value: { threadId, messageId: expect.any(String) } });
  expect(await (await send("native-zyra")).json()).toEqual(first);
  expect(await (await send("native-zyra", "outside")).json()).toMatchObject({ ok: false, error: "conflict" });
  const rows = await testDb.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.requestId, "native-zyra"));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ mentionIds: ["eligible"], mentionHandles: ["Nadia"], askZyra: true,
    authorId: "tutor", replyToId: "first-message" });
  const queued = await testDb.select().from(schema.discussionAiRequests)
    .where(and(eq(schema.discussionAiRequests.messageId, rows[0].id), eq(schema.discussionAiRequests.kind, "zyra")));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ requestedById: "tutor", status: "pending" });
  const profile = await lookup({ profile: "eligible" });
  expect(profile.status).toBe(200);
  expect(await profile.json()).toMatchObject({ name: "Nadia Peserta", role: "student" });
  expect((await lookup({ profile: "outside" })).status).toBe(404);
  const read = await lookup({ message: rows[0].id });
  expect(await read.json()).toMatchObject({ aiStatuses: [{ messageId: rows[0].id, status: "pending", reason: null }] });
  await testDb.delete(schema.tutorCourses).where(eq(schema.tutorCourses.id, "assignment"));
  expect((await lookup({ mention: "Nadia" })).status).toBe(403);
  expect((await send("revoked")).status).toBe(403);
});
