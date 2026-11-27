import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import { penggunaPeran, peran, session, user } from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { createBlogMediaPicker } from "../../apps/mobile-native/features/operations/management/blog-upload";

const { client, testDb } = await createPostgresTestDb();
let current;
const uploads = [];
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => current }));
mock.module("@/lib/storage", () => ({
  storage: {
    async upload(file, key, type) {
      uploads.push({ key, type, bytes: new Uint8Array(await file.arrayBuffer()) });
      return { key };
    },
    exists: async key => uploads.some(upload => upload.key === key),
    getUrl: key => `/api/storage/file/${key}`,
  },
}));

try {
  const { POST } = await import("../../app/api/blog/upload/route");
  await testDb.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  const identity = role => ({ user: { id: `fixture-${role}`, role }, session: { id: `session-${role}` } });
  for (const role of ["admin", "teacher", "student"]) {
    const actor = identity(role);
    await testDb.insert(user).values({ ...actor.user, name: role, email: `${role}@example.invalid` });
    await testDb.insert(session).values({
      id: actor.session.id, token: `local-token-${role}`, userId: actor.user.id, expiresAt: new Date("2099-01-01T00:00:00Z"),
    });
  }

  const origin = "https://example.invalid";
  const path = "/api/blog/upload";
  const pngBytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const multipart = (type = "image/png", bytes = pngBytes, name = "fixture.png") => {
    const body = new FormData();
    body.append("file", new File([bytes], name, { type }));
    return body;
  };
  const bound = actor => ({
    "x-native-operations-user-id": actor.user.id,
    "x-native-operations-session-id": actor.session.id,
  });
  const call = (headers, body = multipart()) => POST(new Request(origin + path, { method: "POST", headers, body }));
  const admin = identity("admin");
  assert.equal((await call(bound(admin))).status, 401);
  for (const role of ["teacher", "student"]) {
    current = identity(role);
    assert.equal((await call(bound(current))).status, 403);
  }
  current = admin;
  assert.equal((await call({ ...bound(admin), origin: "https://elsewhere.invalid" })).status, 403);
  assert.equal((await call({ ...bound(admin), "x-native-operations-user-id": "other" })).status, 403);
  assert.equal((await call({ ...bound(admin), "x-native-operations-session-id": "stale" })).status, 403);
  assert.equal((await call(bound(admin), multipart("video/mp4", Uint8Array.of(1), "fixture.mp4"))).status, 400);
  assert.equal((await call(bound(admin), multipart("image/png", new Uint8Array(0)))).status, 400);
  assert.equal((await call(bound(admin), multipart("image/png", Uint8Array.of(1, 2, 3)))).status, 400);
  assert.equal((await call(bound(admin), multipart("image/png", new Uint8Array(20 * 1024 * 1024 + 1)))).status, 413);
  const contentType = "multipart/form-data; boundary=fixture";
  let pulls = 0;
  let streamCancelled = false;
  const chunk = new Uint8Array(4 * 1024 * 1024);
  const streamed = () => new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(chunk); },
    cancel() { streamCancelled = true; },
  }, { highWaterMark: 0 });
  const streamingPost = (body, headers = {}) => POST(new Request(origin + path, {
    method: "POST", duplex: "half", headers: { ...bound(admin), "content-type": contentType, ...headers }, body,
  }));
  assert.equal((await streamingPost(streamed(), { "content-length": "99999999" })).status, 413);
  assert.equal(pulls, 0);
  assert.equal((await streamingPost(streamed())).status, 413);
  assert.equal(pulls, 6);
  assert.equal(streamCancelled, true);
  assert.equal(uploads.length, 0);

  let calls = 0;
  const transport = createNativeTransport({ origin, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, origin + path);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("Cookie"), "session=local-only");
    assert.equal(init.headers.has("Content-Type"), false);
    return POST(new Request(url, init));
  } });
  const nativeSession = transport.setSession({ origin, accountId: admin.user.id, sessionId: admin.session.id, readCookie: () => "session=local-only" });
  const target = { route: "/admin/blog/new", draftId: "blog:new", locale: "id" };
  let release = 0;
  const picker = createBlogMediaPicker(nativeSession, {
    async pick(draft) {
      assert.deepEqual(draft.target, target);
      assert.equal(draft.policy.maxBytes, 20 * 1024 * 1024);
      assert.deepEqual(draft.policy.mimeTypes, ["image/jpeg", "image/png", "image/webp", "image/gif"]);
      return { status: "ready", document: { uri: "file:///fixture.png", release: () => release++ } };
    },
    multipart(uri) { assert.equal(uri, "file:///fixture.png"); return multipart(); },
  });
  const success = await picker(target, new AbortController().signal);
  assert.equal(success.status, "uploaded");
  assert.equal(success.url, `/api/storage/file/${uploads[0].key}`);
  assert.deepEqual(uploads[0].bytes, pngBytes);
  assert.equal(release, 1);

  await testDb.update(session).set({ expiresAt: new Date("2000-01-01T00:00:00Z") }).where(eq(session.id, admin.session.id));
  assert.deepEqual(await picker(target, new AbortController().signal), { status: "forbidden" });
  assert.equal(release, 2);
  transport.clearSession();
  assert.deepEqual(await picker(target, new AbortController().signal), { status: "cancelled" });
  assert.equal(calls, 2);
  assert.equal(uploads.length, 1);

  current = identity("teacher");
  assert.equal((await call({}, multipart("video/mp4", Uint8Array.of(1), "fixture.mp4"))).status, 200);
  assert.equal(uploads[1].type, "video/mp4");
  current = admin;
  await testDb.update(session).set({ expiresAt: new Date("2099-01-01T00:00:00Z") }).where(eq(session.id, admin.session.id));
  const bodyHeaders = tag => ({ ...bound(admin), "x-native-blog-upload-purpose": "body", "x-native-blog-draft": tag });
  const mp4 = Uint8Array.of(0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109);
  assert.equal((await call(bodyHeaders("new"), multipart("video/mp4", pngBytes, "wrong.mp4"))).status, 400);
  assert.equal((await call(bodyHeaders("article:unknown"), multipart("video/mp4", mp4, "video.mp4"))).status, 404);
  assert.equal((await call(bodyHeaders("../elsewhere"), multipart("video/mp4", mp4, "video.mp4"))).status, 400);
  const bodyTransport = createNativeTransport({ origin, fetcher: async (url, init) => {
    assert.equal(init.headers.get("x-native-blog-upload-purpose"), "body");
    assert.equal(init.headers.get("x-native-blog-draft"), "new");
    return POST(new Request(url, init));
  } });
  const bodySession = bodyTransport.setSession({ origin, accountId: admin.user.id, sessionId: admin.session.id, readCookie: () => "session=local-only" });
  const bodyPicker = createBlogMediaPicker(bodySession, {
    async pick(draft) {
      assert.deepEqual(draft.target, target);
      assert.deepEqual(draft.policy.mimeTypes, ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
      return { status: "ready", document: { uri: "file:///video.mp4", release: () => release++ } };
    },
    multipart: () => multipart("video/mp4", mp4, "video.mp4"),
  });
  const cancellation = new AbortController();
  const video = await bodyPicker(target, cancellation.signal, "body");
  assert.equal(video.status, "uploaded");
  assert.match(video.url, /^\/api\/storage\/file\/blog\/[a-f0-9]{64}\.mp4$/);
  assert.deepEqual(uploads[2].bytes, mp4);
  assert.deepEqual(await bodyPicker(target, cancellation.signal, "body"), video);
  assert.equal(release, 4);
  assert.equal(uploads.length, 3);
  const encodedBody = Buffer.concat([
    Buffer.from('--fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n'),
    pngBytes,
    Buffer.from("\r\n--fixture--\r\n"),
  ]);
  const revokedDuringRead = new ReadableStream({
    async pull(controller) {
      await testDb.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, admin.user.id));
      controller.enqueue(encodedBody);
      controller.close();
    },
  }, { highWaterMark: 0 });
  assert.equal((await streamingPost(revokedDuringRead)).status, 403);
  assert.equal(uploads.length, 3);
  console.log("Scoped Blog thumbnail, article media and Web upload compatibility checks passed");
} finally {
  await client.close();
}
