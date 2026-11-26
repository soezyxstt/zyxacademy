import { expect, test } from "bun:test";
import { handleTutorDiscussionWorkspace, type TutorDiscussionWorkspaceServices } from "../../../../lib/native/academic/handle-tutor-discussion-workspace";
import { createTutorDiscussionWorkspace } from "../../../../apps/mobile-native/features/academic/tutor/discussion-workspace-client";
import { tutorDiscussionWorkspacePath, type TutorQuestionAttempt } from "../../../academic/tutor-discussion-workspace";

const scope = ["courses", "course", "discussions", "workspace"];
const origin = "https://example.test";
const url = origin + tutorDiscussionWorkspacePath("course");
const channel = { id: "channel", kind: "course" as const, title: "Biologi", courseId: "course", muted: false };
const created = { threadId: "thread", messageId: "message" };
const draft: TutorQuestionAttempt = { action: "create", requestId: "request", input: {
  channelId: channel.id, title: "Biologi sel", body: "@Nadia @Zyra Bahas sel", mentionIds: ["nadia"],
  mentionHandles: ["Nadia"], askZyra: true, attachmentIds: ["photo"], } };

function services(overrides: Partial<TutorDiscussionWorkspaceServices> = {}): TutorDiscussionWorkspaceServices {
  return {
    async session() { return { user: { id: "tutor" } }; }, async hasTutor() { return true; },
    async authorizeCourse(_id, course) { if (course !== "course") throw new Error("TUTOR_ACCESS_DENIED"); },
    async catalog() { return { items: [channel], nextCursor: null }; },
    async channelMentions() { return [{ id: "nadia", name: "Nadia" }]; },
    async create() { return { ok: true, value: created }; }, async mute() {},
    async forwardChannels() { return { items: [channel], nextCursor: null }; },
    async forwardTargets() { return { items: [{ id: "dest", channelId: channel.id, title: "Diskusi tujuan" }], nextCursor: null }; },
    async message() {},
    async forward() { return { ok: true, value: { ...created, threadId: "dest" } }; },
    ...overrides,
  };
}
const post = (body: object, headers: Record<string, string> = {}) => new Request(url, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": "request", ...headers },
  body: JSON.stringify(body),
});

test("Tutor catalog, participant discovery and writes use the authorized course and current session", async () => {
  const seen: unknown[] = [];
  const server = services({
    async catalog(...input) { seen.push(input); return { items: [channel], nextCursor: null }; },
    async channelMentions(...input) { seen.push(input); return [{ id: "nadia", name: "Nadia" }]; },
    async create(...input) { seen.push(input); return { ok: true, value: created }; },
    async mute(...input) { seen.push(input); },
  });
  const get = (query: string) => handleTutorDiscussionWorkspace(new Request(url + "?" + query), scope, origin, server);
  expect((await get("view=channel-mentions&channel=channel&search=N")).status).toBe(400);
  expect((await handleTutorDiscussionWorkspace(post(draft, { Origin: "https://external.test" }), scope, origin, server)).status).toBe(403);
  expect((await handleTutorDiscussionWorkspace(post(draft), ["courses", "other", "discussions", "workspace"], origin, server)).status).toBe(403);
  expect((await handleTutorDiscussionWorkspace(post(draft), scope, origin, { ...server, hasTutor: async () => false })).status).toBe(403);
  expect((await handleTutorDiscussionWorkspace(post({ ...draft, input: { ...draft.input, body: "@nadia only" } }), scope, origin, server)).status).toBe(400);
  expect((await handleTutorDiscussionWorkspace(post({ ...draft, requestId: "wrong-id" }), scope, origin, server)).status).toBe(400);
  expect(seen).toEqual([]);
  const page = await get("view=catalog&search=Biologi");
  expect(page.headers.get("cache-control")).toBe("private, no-store");
  expect(await page.json()).toEqual({ items: [channel], nextCursor: null });
  expect(await (await get("view=channel-mentions&channel=channel&search=Na")).json()).toEqual([{ id: "nadia", name: "Nadia" }]);
  expect(await (await handleTutorDiscussionWorkspace(post(draft), scope, origin, server)).json()).toEqual({ ok: true, value: created });
  expect(await (await handleTutorDiscussionWorkspace(post({ action: "mute", requestId: "request", channelId: "channel", muted: true }), scope, origin, server)).json()).toEqual({ ok: true });
  expect(seen).toEqual([["tutor", "course", "Biologi", undefined], ["tutor", "course", "channel", "Na"],
    ["tutor", "course", draft], ["tutor", "course", "channel", true]]);
});

test("Tutor question retry preserves the chosen channel, title, recipients and request ID", async () => {
  const sent: unknown[] = [];
  const client = createTutorDiscussionWorkspace({
    origin, accountId: "tutor", locale: "id",
    async get(path) {
      expect(path).toBe(tutorDiscussionWorkspacePath("course") + "?view=catalog&search=Bio");
      return Response.json({ items: [channel], nextCursor: null });
    },
    async command(path, command) {
      expect(path).toBe(tutorDiscussionWorkspacePath("course"));
      sent.push(command);
      if (sent.length === 1) throw new Error("lost");
      return Response.json({ ok: true, value: created });
    },
  })!;
  const signal = new AbortController().signal;
  expect(await client.catalog("course", "Bio", undefined, signal)).toEqual({ items: [channel], nextCursor: null });
  await expect(client.create("course", draft, signal)).rejects.toThrow("lost");
  expect(client.pendingQuestion("channel")).toEqual(draft);
  expect(await client.create("course", { ...draft, input: { ...draft.input, askZyra: false } }, signal)).toEqual({ ok: false, error: "unknown" });
  expect(sent).toHaveLength(1);
  expect(await client.create("course", client.pendingQuestion("channel")!, signal)).toEqual({ ok: true, value: created });
  expect(sent[1]).toEqual(sent[0]);
  expect(client.pendingQuestion("channel")).toBeUndefined();
});

test("message actions and forwarding preserve their exact source and authorize discovery", async () => {
  const calls: unknown[] = [];
  const server = services({
    async forwardChannels(...input) { calls.push(input); return { items: [channel], nextCursor: null }; },
    async forwardTargets(...input) { calls.push(input); return { items: [{ id: "dest", channelId: "channel", title: "Target" }], nextCursor: null }; },
    async message(...input) { calls.push(input); },
    async forward(...input) { calls.push(input); return { ok: true, value: { threadId: "dest", messageId: "forwarded" } }; },
  });
  const read = (query: string) => handleTutorDiscussionWorkspace(new Request(url + "?" + query), scope, origin, server);
  const base = { requestId: "request", threadId: "thread", messageId: "source" };
  const write = (body: object) => handleTutorDiscussionWorkspace(post(body), scope, origin, server);
  expect((await read("view=forward-targets&message=source&channel=channel")).status).toBe(400);
  expect((await write({ action: "edit", ...base, body: "body", revision: 0 })).status).toBe(400);
  expect((await write({ action: "report", ...base, reason: "\u0000" })).status).toBe(400);
  expect((await write({ action: "moderate", ...base, status: "dismissed" })).status).toBe(400);
  expect(calls).toEqual([]);
  expect((await read("view=forward-channels&thread=thread&message=source")).status).toBe(200);
  expect((await read("view=forward-targets&thread=thread&message=source&channel=channel")).status).toBe(200);
  for (const input of [
    { action: "edit", ...base, body: "Edited", revision: 1 },
    { action: "delete", ...base },
    { action: "report", ...base, reason: "Reason" },
  ]) expect(await (await write(input)).json()).toEqual({ ok: true });
  const forward = { action: "forward", ...base, destinationId: "dest" };
  expect(await (await write(forward)).json()).toEqual({ ok: true, value: { threadId: "dest", messageId: "forwarded" } });
  expect(calls[1]).toEqual(["tutor", "course", { threadId: "thread", messageId: "source" }, "channel", "", undefined]);
  expect(calls[5]).toEqual(["tutor", "course", forward]);
});

test("forward retry locks the destination and rejects receipts naming another thread", async () => {
  const sent: unknown[] = [];
  const client = createTutorDiscussionWorkspace({
    origin, accountId: "tutor", locale: "id",
    async get() { return Response.json({}); },
    async command(path, command) {
      expect(path).toBe(tutorDiscussionWorkspacePath(undefined));
      sent.push(command);
      return Response.json({ ok: true, value: { threadId: sent.length === 1 ? "another-thread" : "dest", messageId: "new" } });
    },
  })!;
  const forward = { action: "forward", requestId: "send", threadId: "thread", messageId: "source", destinationId: "dest" } as const;
  const signal = new AbortController().signal;
  await expect(client.forward(undefined, forward, signal)).rejects.toMatchObject({ status: 502 });
  expect(client.pendingForward(forward)).toEqual(forward);
  expect(await client.forward(undefined, { ...forward, destinationId: "outside" }, signal)).toEqual({ ok: false, error: "unknown" });
  expect(sent).toHaveLength(1);
  expect(await client.forward(undefined, { ...forward, requestId: "different" }, signal)).toMatchObject({ ok: true, value: { threadId: "dest" } });
  expect(sent[1]).toEqual(sent[0]);
  expect(client.pendingForward(forward)).toBeUndefined();
});
