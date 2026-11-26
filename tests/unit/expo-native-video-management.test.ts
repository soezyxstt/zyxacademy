import { expect, test } from "bun:test";
import { handleVideoManagement } from "@/lib/native/academic/video-management-handler";
import { videoManagerAccount, videoManagerSession, videoManagementPath, type ManagedVideoCommand, type VideoManagementCatalog } from "@/packages/course-video/management";
import { createNativeTransport } from "@/apps/mobile-native/network/transport";
import { submitManagedVideo } from "@/apps/mobile-native/features/course-video/management-client";

const origin = "https://zyx.example";
const input = { role: "tutor", courseId: "course-a" };
const viewer = { user: { id: "actor-a" }, session: { id: "session-a" } };
const key = "eeb5cf68-64c5-49d0-abae-dcd833eaf72e";
const expectedRevision = "a".repeat(64);
const command: ManagedVideoCommand = { action: "new-video", fields: { title: "New", description: null,
  playlistId: "playlist-a", chapterId: null, source: { kind: "youtube", video: "dQw4w9WgXcQ" } } };
const headers = {
  [videoManagerAccount]: viewer.user.id, [videoManagerSession]: viewer.session.id, Origin: origin,
  "Content-Type": "application/json", "Idempotency-Key": key,
};

function post(body: unknown, overrides = {}) {
  return new Request(origin + "/api/native/course-videos/tutor/course-a", {
    method: "POST", body: JSON.stringify(body), headers: { ...headers, ...overrides },
  });
}
const read: VideoManagementCatalog = { courseId: input.courseId, title: "Course", playlists: [], chapters: [] };

test("course video commands gate Origin, exact session, and explicit destructive confirmation", async () => {
  const writes: unknown[] = [];
  const services = {
    session: async () => viewer, read: async () => read,
    write: async (scope: unknown, command: unknown, key: string) => { writes.push({ scope, command, key }); return { id: "saved-id" }; },
  };
  expect((await handleVideoManagement(post(command, { Origin: "https://elsewhere.example" }), input, origin, services)).status).toBe(403);
  expect((await handleVideoManagement(post(command, { [videoManagerSession]: "replacement" }), input, origin, services)).status).toBe(409);
  expect((await handleVideoManagement(post({ action: "delete-playlist", id: "playlist-a", expectedRevision }), input, origin, services)).status).toBe(422);
  expect((await handleVideoManagement(post(command), { ...input, role: "murid" }, origin, services)).status).toBe(404);
  expect(writes).toHaveLength(0);
  const response = await handleVideoManagement(post(command), input, origin, services);
  expect(await response.json()).toEqual({ id: "saved-id", requestId: key });
  expect(writes).toEqual([{ scope: { ...input, viewer }, command, key }]);
});

test("metadata changes cannot set direct storage keys or a missing existing video source", async () => {
  let writes = 0;
  const services = {
    session: async () => viewer, read: async () => read,
    write: async () => { writes++; return { id: "saved-id" }; },
  };
  if (command.action !== "new-video") throw new Error("Wrong fixture");
  expect((await handleVideoManagement(post({ ...command, fields: { ...command.fields, source: { kind: "keep" } } }), input, origin, services)).status).toBe(422);
  expect((await handleVideoManagement(post({ ...command, fields: { ...command.fields, videoUrl: "courses/other/videos/file.mp4" } }), input, origin, services)).status).toBe(422);
  expect(writes).toBe(0);
  expect(videoManagementPath("admin", "../outside")).toBeNull();
});

test("client publishes only a matching receipt and preserves the Tutor write role", async () => {
  let receivedRole: unknown;
  const identity = { origin, accountId: viewer.user.id, sessionId: viewer.session.id,
    readCookie: () => "fixture=1", canStartRequest: (_: string, role?: string) => { receivedRole = role; return true; } };
  let matching = false;
  const session = createNativeTransport({ origin, async fetcher(url, init) {
    expect(url).toBe(origin + "/api/native/course-videos/tutor/course-a");
    const sent = new Headers(init.headers);
    expect(sent.get(videoManagerSession)).toBe(viewer.session.id);
    expect(sent.get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(String(init.body))).toEqual(command);
    return Response.json({ requestId: matching ? key : "other", id: "saved-id" });
  } }).setSession(identity);
  const signal = new AbortController().signal;
  const attempt = { requestId: key, command };
  await expect(submitManagedVideo(session, "tutor", "course-a", attempt, signal)).rejects.toMatchObject({ status: 503 });
  matching = true;
  expect(await submitManagedVideo(session, "tutor", "course-a", attempt, signal)).toEqual({ id: "saved-id", requestId: key });
  expect(receivedRole).toBe("tutor");
});
