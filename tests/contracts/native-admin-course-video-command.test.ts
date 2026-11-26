import { expect, test } from "bun:test";
import { handleAdminCourseVideoCommand } from "@/lib/native/academic/course-video-command";
import { videoEntryRevision, videoPlaylistRevision } from "@/lib/video/catalog-revisions";
import { createCourseCommandTarget } from "@/apps/mobile-native/features/academic/courses/write-client";

const origin = "https://example.test";
const path = ["admin", "courses", "course", "videos", "playlists", "list"];
const viewer = { user: { id: "admin" }, session: { id: "session" } };
const requestId = "admin-video-delete-request";
const revision = "a".repeat(64);
const consent = { expectedRevision: revision, confirmed: true } as const;

function request(body = consent as unknown, clientOrigin = origin) {
  return new Request(origin, {
    method: "DELETE", headers: { Origin: clientOrigin, "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(body),
  });
}

test("video removal binds the signed-in Admin, route course and parent playlist", async () => {
  const writes: unknown[][] = [];
  const services = {
    session: async () => viewer, hasAdmin: async () => true,
    remove: async (...params: unknown[]) => { writes.push(params); },
  };
  expect((await handleAdminCourseVideoCommand(request(consent, "https://other.test"), path, origin, services)).status).toBe(403);
  expect((await handleAdminCourseVideoCommand(request(), path, origin, { ...services, hasAdmin: async () => false })).status).toBe(403);
  expect((await handleAdminCourseVideoCommand(request(), path, origin, { ...services, session: async () => null })).status).toBe(401);
  expect((await handleAdminCourseVideoCommand(request(), [...path, "videos", "../other"], origin, services)).status).toBe(400);
  expect((await handleAdminCourseVideoCommand(request({ expectedRevision: revision }), path, origin, services)).status).toBe(422);
  expect((await handleAdminCourseVideoCommand(request({ ...consent, mediaKey: "foreign" }), path, origin, services)).status).toBe(422);
  expect(writes).toHaveLength(0);
  expect(await (await handleAdminCourseVideoCommand(request(), [...path, "videos", "v"], origin, services)).json())
    .toEqual({ status: "saved", requestId });
  expect((await handleAdminCourseVideoCommand(request(), path, origin, services)).status).toBe(200);
  expect(writes).toEqual([
    ["course", "list", "v", consent, requestId, viewer],
    ["course", "list", undefined, consent, requestId, viewer],
  ]);
});

test("playlist consent changes when member videos change and is independent of read order", () => {
  const playlist = { id: "list", updatedAt: new Date(0) };
  const first = { id: "first", updatedAt: new Date(1) };
  const second = { id: "second", updatedAt: new Date(2) };
  const changed = { ...second, updatedAt: new Date(3) };
  expect(videoPlaylistRevision(playlist, [first, second])).toBe(videoPlaylistRevision(playlist, [second, first]));
  expect(videoPlaylistRevision(playlist, [first, second])).not.toBe(videoPlaylistRevision(playlist, [first, changed]));
  expect(videoPlaylistRevision(playlist, [first, second])).not.toBe(videoPlaylistRevision(playlist, [first]));
  expect(videoEntryRevision(second)).not.toBe(videoEntryRevision(changed));
});

test("uncertain deletion retries with the original confirmation and request identity", async () => {
  const attempts: unknown[] = [];
  const target = createCourseCommandTarget<typeof consent>(async (path, draft) => {
    attempts.push({ path, draft });
    return new Response(JSON.stringify({ status: "saved", requestId: draft.requestId }), { status: attempts.length === 1 ? 503 : 200 });
  })("course/videos/playlists/list/videos/v", "DELETE");
  const signal = new AbortController().signal;
  expect(await target.submit(consent, requestId, signal)).toEqual({ status: "retry" });
  expect(target.pending()).toEqual({ draft: consent, requestId, confirmed: false });
  expect(await target.submit({ ...consent, expectedRevision: "b".repeat(64) as typeof revision }, requestId, signal)).toEqual({ status: "retry" });
  expect(attempts).toHaveLength(1);
  expect(await target.submit(consent, requestId, signal)).toEqual({ status: "saved" });
  expect(attempts[0]).toEqual(attempts[1]);
  target.acknowledge(requestId);
  expect(target.pending()).toBeNull();
});
