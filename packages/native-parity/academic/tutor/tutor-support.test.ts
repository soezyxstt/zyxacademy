import { describe, expect, test } from "bun:test";
import { createTutorSupportClient } from "../../../../apps/mobile-native/features/academic/tutor/support-client";
import { handleTutorDiscussionAnswer, handleTutorSupport, type TutorSupportServices } from "../../../../lib/native/academic/handle-tutor-support";
import type { TutorDiscussionDetail, TutorDiscussionDraft } from "../../../academic/tutor-support";

const origin = "https://academic.example.test";
const thread = { id: "thread-1", title: "Biologi sel", status: "open", answerCount: 1, canReply: true } as const;
const target = { threadId: thread.id, messageId: "message-2" };
const draft = { body: "Mitokondria berperan dalam respirasi sel.", requestId: "request-1" };
const route = ["courses", "course-1", "discussions"];
const signal = new AbortController().signal;

function services(overrides: Partial<TutorSupportServices> = {}): TutorSupportServices {
  return {
    async session() { return { user: { id: "tutor-1" } }; },
    async hasTutor() { return true; },
    async authorizeCourse(_userId, courseId) {
      if (!["course-1", "biologi-dasar"].includes(courseId)) throw new Error("TUTOR_ACCESS_DENIED");
    },
    async schedule() { return { from: "2026-11-23", to: "2026-11-29", slots: [], sessions: [], tickets: [], groups: [] }; },
    async materials() { return { title: "Biologi Dasar", items: [] }; },
    async videos() { return { title: "Biologi Dasar", playlists: [] }; },
    async live() { return { configured: false, templates: [], active: null }; },
    async discussions() { return { items: [thread], nextCursor: null }; },
    async discussion() { return { thread, messages: { items: [], nextCursor: null } }; },
    async answer() { return { ok: true, value: target }; },
    ...overrides,
  };
}

function answerRequest(input: Partial<TutorDiscussionDraft> = {}, headers: Record<string, string> = {}) {
  return new Request(origin, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "Idempotency-Key": draft.requestId, ...headers },
    body: JSON.stringify({ ...draft, ...input, threadId: thread.id, userId: "spoofed-user" }),
  });
}

describe("tutor support route", () => {
  test("uses session identity and permits only assigned canonical or legacy course paths", async () => {
    const calls: unknown[][] = [];
    const readers = services({
      async materials(...parts) { calls.push(parts); return { title: "Biologi Dasar", items: [] }; },
    });
    for (const course of ["course-1", "biologi-dasar"]) {
      const result = await handleTutorSupport(new URL(origin + "?userId=spoofed"), ["courses", course, "materials"], readers);
      expect(result.status).toBe(200);
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect((await handleTutorSupport(new URL(origin), ["courses", "outside", "materials"], readers)).status).toBe(403);
    expect(calls).toEqual([["tutor-1", "course-1"], ["tutor-1", "biologi-dasar"]]);
  });

  test("bounds week and paging inputs and checks tutor role first", async () => {
    let week: number | undefined;
    const readers = services({
      async schedule(_id, value) { week = value; return { from: "", to: "", slots: [], sessions: [], tickets: [], groups: [] }; },
    });
    expect((await handleTutorSupport(new URL(origin + "?week=999"), ["schedule"], readers)).status).toBe(200);
    expect(week).toBe(520);
    expect((await handleTutorSupport(new URL(origin + "?search=" + "x".repeat(161)), ["discussions"], readers)).status).toBe(400);
    expect((await handleTutorSupport(new URL(origin + "?message=bad"), ["discussions"], readers)).status).toBe(400);
    expect((await handleTutorSupport(new URL(origin), ["schedule"], services({ async session() { return null; } }))).status).toBe(401);
    expect((await handleTutorSupport(new URL(origin), ["schedule"], services({ async hasTutor() { return false; } }))).status).toBe(403);
  });

  test("rejects cross-origin, malformed and unassigned discussion commands before the action", async () => {
    const writes: unknown[][] = [];
    const readers = services({ async answer(...args) { writes.push(args); return { ok: true, value: target }; } });
    expect((await handleTutorDiscussionAnswer(answerRequest({}, { Origin: "https://other.test" }), route, origin, readers)).status).toBe(403);
    expect((await handleTutorDiscussionAnswer(answerRequest({}, { "Sec-Fetch-Site": "cross-site" }), route, origin, readers)).status).toBe(403);
    expect((await handleTutorDiscussionAnswer(answerRequest({}, { "Content-Type": "text/plain" }), route, origin, readers)).status).toBe(415);
    expect((await handleTutorDiscussionAnswer(answerRequest({ requestId: "different" }), route, origin, readers)).status).toBe(400);
    expect((await handleTutorDiscussionAnswer(answerRequest({ body: "x".repeat(70 * 1024) }), route, origin, readers)).status).toBe(400);
    expect((await handleTutorDiscussionAnswer(answerRequest(), ["courses", "outside", "discussions"], origin, readers)).status).toBe(403);
    expect(writes).toEqual([]);
    const result = await handleTutorDiscussionAnswer(answerRequest(), route, origin, readers);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, value: target });
    expect(writes).toEqual([["tutor-1", "course-1", thread.id, draft]]);
  });

  test("routes contextual replies, image-only messages and observed actions to the same Tutor and course", async () => {
    const writes: unknown[][] = [];
    const readers = services({
      async answer(...args) { writes.push(args); return { ok: true, value: target }; },
      async changeDiscussion(...args) { writes.push(args); },
    });
    const send = (body: object, path = route, scoped = readers) => handleTutorDiscussionAnswer(new Request(origin, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "Idempotency-Key": draft.requestId },
      body: JSON.stringify({ threadId: thread.id, requestId: draft.requestId, ...body }),
    }), path, origin, scoped);
    expect((await send({ body: "", replyTo: "message-source", attachmentIds: ["attached-image"] })).status).toBe(200);
    expect((await send({ body: "Tanggapan", attachmentIds: ["duplicate", "duplicate"] })).status).toBe(400);
    expect((await send({ body: "Tanggapan", replyTo: null })).status).toBe(400);
    expect((await send({ action: "reaction", emoji: "invalid", messageId: "reaction-target", selected: true })).status).toBe(400);
    const reception = { action: "read", throughSeq: 3, receipt: "session-observation", messageIds: ["message-source"] };
    expect((await send(reception, ["courses", "other-course", "discussions"])).status).toBe(403);
    expect((await send(reception, route, { ...readers, hasTutor: async () => false })).status).toBe(403);
    expect((await send(reception)).status).toBe(200);
    expect(writes).toEqual([
      ["tutor-1", "course-1", thread.id, { body: "", requestId: draft.requestId, replyTo: "message-source", attachmentIds: ["attached-image"] }],
      ["tutor-1", "course-1", thread.id, reception],
    ]);
  });
});

test("discussion command reuses its request ID after lost response and reads back the returned message", async () => {
  const writes = new Map<string, TutorDiscussionDraft>();
  const observed: string[] = [];
  const responses = services({
    async answer(_user, _course, _thread, attempt) {
      writes.set(attempt.requestId, attempt);
      return { ok: true, value: target };
    },
    async discussion(_user, _course, _thread, _cursor, messageId): Promise<TutorDiscussionDetail> {
      observed.push(messageId!);
      return { thread, messages: { items: [{ id: messageId!, seq: 2, author: "Tutor", body: draft.body, attachmentCount: 0, messageType: "answer" }], nextCursor: null } };
    },
  });
  let calls = 0;
  const scope = { accountId: "tutor-1", origin, locale: "id" };
  const client = createTutorSupportClient({
    ...scope,
    get: (path) => handleTutorSupport(new URL(path, origin), route, responses),
    async command(path, init) {
      expect(path).toBe("/api/native/academic/tutor-support/courses/course-1/discussions");
      expect(init.requestId).toBe(draft.requestId);
      const result = await handleTutorDiscussionAnswer(new Request(origin, {
        method: init.method,
        headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": init.requestId },
        body: JSON.stringify(init.body),
      }), route, origin, responses);
      calls += 1;
      if (calls === 1) throw new Error("LOST_RESPONSE");
      if (calls === 2) return Response.json({ incorrect: true });
      return result;
    },
  });

  await expect(client.answer!("course-1", thread.id, draft, signal)).rejects.toThrow("LOST_RESPONSE");
  expect(client.pendingAnswer!(thread.id)).toEqual(draft);
  await expect(client.answer!("course-1", thread.id, { ...draft, requestId: "different" }, signal)).rejects.toMatchObject({ status: 502 });
  expect(client.pendingAnswer!(thread.id)).toEqual(draft);
  expect(await client.answer!("course-1", thread.id, { ...draft, requestId: "another" }, signal)).toEqual({ ok: true, value: target });
  expect(writes.size).toBe(1);
  expect(client.pendingAnswer!(thread.id)).toBeUndefined();
  const result = await client.discussion("course-1", thread.id, undefined, signal, target.messageId);
  expect(result.messages.items[0]).toMatchObject({ id: target.messageId, body: draft.body });
  expect(observed).toEqual([target.messageId]);
});

test("retains an uncertain draft on route remount inside the same live session and clears it on definitive status", async () => {
  const authStatuses = [401, 403, 404, 409];
  for (const status of authStatuses) {
    let rejected = false;
    const transport = {
      accountId: "tutor-1", origin, locale: "id",
      async get() { return Response.json({}); },
      async command() {
        if (rejected) return Response.json({ error: "FORBIDDEN" }, { status });
        throw new Error("OFFLINE");
      },
    };
    const session = createTutorSupportClient(transport);
    await expect(session.answer!(undefined, thread.id, draft, signal)).rejects.toThrow("OFFLINE");
    expect(session.pendingAnswer!(thread.id)).toEqual(draft);
    expect(createTutorSupportClient({ ...transport, accountId: "tutor-2" }).pendingAnswer!(thread.id)).toBeUndefined();
    expect(createTutorSupportClient(transport).pendingAnswer!(thread.id)).toBeUndefined();
    rejected = true;
    await expect(session.answer!(undefined, thread.id, draft, signal)).rejects.toMatchObject({ status });
    expect(session.pendingAnswer!(thread.id)).toBeUndefined();
  }
});

test("definitive request validation lets the tutor correct an answer", async () => {
  for (const status of [400, 413, 415, 422]) {
    const client = createTutorSupportClient({
      accountId: "tutor-1", origin, locale: "id",
      async get() { return Response.json({}); },
      async command() { return Response.json({ error: "INVALID_INPUT" }, { status }); },
    });
    expect(await client.answer!(undefined, thread.id, { ...draft, body: "Jawaban\0" }, signal)).toEqual({ ok: false, error: "invalid" });
    expect(client.pendingAnswer!(thread.id)).toBeUndefined();
  }
});

test("video playback opens only validated HTTPS targets and supported YouTube references", async () => {
  const signedUrl = "https://assets.example.test/biology.mp4?token=encoded%2Fsignature";
  let target: unknown = signedUrl;
  const client = createTutorSupportClient({
    accountId: "tutor-1", origin, locale: "id",
    async get(path) {
      expect(path).toBe("/api/videos/video-1/playback-url");
      return Response.json({ url: target });
    },
  });
  expect(await client.playback!("video-1", signal)).toBe(signedUrl);
  target = "youtube/dQw4w9WgXcQ";
  expect(await client.playback!("video-1", signal)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  for (const invalid of ["/api/storage/private.mp4", "javascript:alert(1)", "https://user:pass@example.test", "https://example.test\\wrong", "youtube/short", "http://example.test", null]) {
    target = invalid;
    await expect(client.playback!("video-1", signal)).rejects.toMatchObject({ status: 422 });
  }
});

test("the embedded Tutor player preserves the signed URL and authorized proxy fallback from the same request", async () => {
  const signed = "https://assets.example.test/course.mp4?sig=2";
  const fallback = "/api/storage/file/course-videos/course.mp4";
  const paths: string[] = [];
  const client = createTutorSupportClient({ accountId: "tutor-1", origin, locale: "en",
    async get(path, abort) {
      expect(abort).toBe(signal);
      paths.push(path);
      return Response.json({ url: signed, fallbackUrl: fallback });
    },
  });
  const player = client.videoPlayer!;
  expect([player.origin, player.locale]).toEqual([origin, "en"]);
  expect(await player.load("vid 1", signal)).toEqual({ url: signed, fallbackUrl: fallback });
  expect(paths).toEqual(["/api/videos/vid%201/playback-url"]);
});
