import { expect, mock, test } from "bun:test";
import { createAdminDiscussionClient } from "../../apps/mobile-native/features/operations/management/discussion-client";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import type { TutorDiscussionWorkspaceServices } from "../../lib/native/academic/handle-tutor-discussion-workspace";
import type { TutorSupportServices } from "../../lib/native/academic/handle-tutor-support";
import { handleAdminDiscussions } from "../../lib/native/handle-admin-discussions";

const origin = "https://staging.zyxacademy.com";
const path = "/api/native/operations/management/discussions";
const signed = { "x-native-operations-user-id": "admin-a", "x-native-operations-session-id": "session-a" };
const requestId = "native-request-001";

function fixture() {
  const unused = async (): Promise<never> => { throw new Error("Never authorize Tutor work from this Admin route"); };
  const actor = mock(async () => ({ id: "admin-a", sessionId: "session-a" }));
  const allowed = mock(async () => true);
  const discussions = mock<TutorSupportServices["discussions"]>(async () => ({ items: [], nextCursor: null }));
  const answer = mock<TutorSupportServices["answer"]>(async () => ({ ok: true, value: { threadId: "thread-a", messageId: "answer-a" } }));
  const create = mock<TutorDiscussionWorkspaceServices["create"]>(async () => ({ ok: true, value: { threadId: "thread-b", messageId: "question-a" } }));
  const catalog = mock<TutorDiscussionWorkspaceServices["catalog"]>(async () => ({ items: [], nextCursor: null }));
  const shared = { session: unused, hasTutor: unused, authorizeCourse: unused };
  return {
    actor, allowed,
    threads: { ...shared, discussions, answer, discussion: unused, schedule: unused, materials: unused, videos: unused, live: unused },
    workspace: { ...shared, catalog, create, channelMentions: unused, forwardChannels: unused, forwardTargets: unused,
      message: unused, forward: unused, mute: unused },
  };
}

function call(services: ReturnType<typeof fixture>, { parts = [], query = "", headers = signed, body }: {
  parts?: string[]; query?: string; headers?: Record<string, string>; body?: unknown;
} = {}) {
  return handleAdminDiscussions(new Request(origin + path + query, body === undefined ? { headers } : {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId, ...headers },
    body: JSON.stringify(body),
  }), parts, origin, services);
}

test("Admin channel reads bind the exact account and live session without a Tutor assignment check", async () => {
  const services = fixture();
  expect((await call(services, { headers: { ...signed, "x-native-operations-user-id": "other" } })).status).toBe(403);
  expect((await call(services, { headers: { ...signed, "x-native-operations-session-id": "retired" } })).status).toBe(403);
  expect(services.allowed).not.toHaveBeenCalled();
  services.allowed.mockResolvedValueOnce(false); // A non-Admin (including an assigned Tutor) cannot enter.
  expect((await call(services)).status).toBe(403);
  expect(services.threads.discussions).not.toHaveBeenCalled();
  const result = await call(services, { query: "?channel=course-channel&status=open" });
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(services.threads.discussions).toHaveBeenCalledWith("admin-a", undefined, "", undefined, { channelId: "course-channel", status: "open" });
  expect((await call(services, { parts: ["courses", "course-id", "workspace"] })).status).toBe(404);
  expect((await call(services, { parts: ["workspace"], query: "?view=catalog" })).status).toBe(200);
  expect(services.workspace.catalog).toHaveBeenCalledWith("admin-a", undefined, "", undefined);
});

test("Admin discussion writes recheck authority after decoding and preserve message request identity", async () => {
  const services = fixture();
  const input = { threadId: "thread-a", requestId, body: "Contextual reply", replyTo: "first-message" };
  expect((await call(services, { body: input, headers: { ...signed, Origin: "https://other.invalid" } })).status).toBe(403);
  expect((await call(services, { body: { ...input, requestId: "incorrect" } })).status).toBe(400);
  services.allowed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await call(services, { body: input })).status).toBe(403);
  expect(services.threads.answer).not.toHaveBeenCalled();
  expect((await call(services, { body: input })).status).toBe(200);
  expect(services.threads.answer).toHaveBeenCalledWith("admin-a", undefined, "thread-a",
    { requestId, body: "Contextual reply", replyTo: "first-message" });

  const create = { action: "create", requestId, input: { channelId: "global", title: "Question", body: "Explain this." } };
  services.allowed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await call(services, { parts: ["workspace"], body: create })).status).toBe(403);
  expect(services.workspace.create).not.toHaveBeenCalled();
  expect((await call(services, { parts: ["workspace"], body: create })).status).toBe(200);
  expect(services.workspace.create).toHaveBeenCalledWith("admin-a", undefined, create);
});

test("the Expo Admin client sends only bound Admin URLs and reuses an uncertain answer identity", async () => {
  const roles = new Set<string>();
  const sent: string[] = [];
  let writes = 0;
  const transport = createNativeTransport({ origin, fetcher: async (url, init) => {
    const headers = new Headers(init.headers);
    expect(headers.get("x-native-operations-user-id")).toBe("admin-a");
    expect(headers.get("x-native-operations-session-id")).toBe("session-a");
    if (init.method === "POST") {
      expect(url).toBe(origin + path);
      expect(headers.get("origin")).toBe(origin);
      expect(headers.get("idempotency-key")).toBe(requestId);
      sent.push(String(init.body));
      writes += 1;
      return writes === 1 ? Response.json({ error: "unknown" }, { status: 503 }) :
        Response.json({ ok: true, value: { threadId: "thread-a", messageId: "answer-a" } });
    }
    expect(url).toBe(origin + path + "/workspace?view=catalog&search=");
    return Response.json({ items: [], nextCursor: null });
  } });
  const session = transport.setSession({ origin, accountId: "admin-a", sessionId: "session-a", readCookie: () => "cookie=fixture",
    canStartRequest: (_method, role) => { if (role) roles.add(role); return role === "admin"; } });
  const service = createAdminDiscussionClient(session, "id");
  const { signal } = new AbortController();
  const draft = { requestId, body: "A contextual reply.", replyTo: "first-message" };
  await expect(service.answer!(undefined, "thread-a", draft, signal)).rejects.toMatchObject({ status: 503 });
  expect(service.pendingAnswer!("thread-a")).toEqual(draft);
  await expect(service.answer!(undefined, "thread-a", draft, signal)).resolves.toMatchObject({ ok: true });
  expect(sent[0]).toBe(sent[1]);
  expect(service.pendingAnswer!("thread-a")).toBeUndefined();
  expect(await service.discussionWorkspace!.catalog(undefined, "", undefined, signal)).toEqual({ items: [], nextCursor: null });
  await expect(service.discussions("not-an-admin-transport-route", "", undefined, signal)).rejects.toThrow("Invalid discussion route");
  expect([...roles]).toEqual(["admin"]);
});
