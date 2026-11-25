import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { discussionWorkspaceReads } from "@/components/discussions/discussion-adapter";

const code = ts.transpileModule(readFileSync("app/api/discussions/workspace/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function setup(sessionId: string | null = "viewer") {
  const calls: unknown[][] = [];
  const invoke = (name: string) => async (actorId: string, ...args: unknown[]) => {
    calls.push([name, actorId, ...args]);
    if (args[0] === "denied") throw new Error("DISCUSSION_UNAVAILABLE");
    return { view: name };
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/auth-session": { getAuthSession: async () => sessionId ? { user: { id: sessionId } } : null },
    "@/lib/discussions/service": {
      getThread: invoke("thread"),
      listThreadsAcrossChannels: invoke("threads"),
      listChannelMetadataPage: invoke("catalog"),
      listChannelMetadata: invoke("channels"),
    },
  };
  const exports: Record<string, (request: Request) => Promise<Response>> = {};
  runInNewContext(code, { exports, Error, URL, Response, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(name);
    return dependencies[name];
  } });
  return { calls, request: (path: string, init?: RequestInit) => {
    const request = new Request(new URL(path, "https://test.example"), init);
    return exports[request.method](request);
  } };
}

test("workspace reads carry the viewer, filters and cursor, and use POST for reads that can write", async () => {
  const context = setup();
  const originalFetch = globalThis.fetch;
  const responses: Response[] = [];
  globalThis.fetch = Object.assign(async (path: string | URL | Request, init?: RequestInit) => {
    expect(init?.cache).toBe("no-store");
    const url = new URL(String(path), "https://test.example");
    expect(url.pathname).toBe("/api/discussions/workspace");
    const response = await context.request(url.href, init);
    responses.push(response);
    return response;
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  try {
    const reads = discussionWorkspaceReads("viewer");
    await Promise.all([
      reads.getThread("thread-a", undefined, "message-b"),
      reads.listThreadsAcrossChannels({ channelId: "course-channel", search: "a + b", status: "resolved", cursor: "cursor" }),
      reads.getChannelsByIds(["channel-a", "channel-b"]),
      reads.listChannelsPage({ kinds: ["course", "global"] }),
    ]);
    expect(context.calls).toEqual([
      ["thread", "viewer", "thread-a", undefined, "message-b"],
      ["threads", "viewer", { channelId: "course-channel", search: "a + b", status: "resolved", cursor: "cursor" }],
      ["channels", "viewer", ["channel-a", "channel-b"]],
      ["catalog", "viewer", { courseId: undefined, search: undefined, kind: undefined, kinds: ["course", "global"], limit: 20, cursor: undefined }],
    ]);
    expect(responses.every(response => response.headers.get("cache-control") === "private, no-store")).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workspace rejects absent or switched accounts before loading data", async () => {
  const path = "/api/discussions/workspace?view=threads";
  const init = { headers: { "x-student-id": "viewer" } };
  const absent = setup(null);
  const switched = setup("another-viewer");
  expect((await absent.request(path, init)).status).toBe(401);
  expect((await switched.request(path, init)).status).toBe(409);
  expect(absent.calls).toEqual([]);
  expect(switched.calls).toEqual([]);
});

test("GET does not record observations and denied thread details are hidden", async () => {
  const context = setup();
  const path = "/api/discussions/workspace?view=thread&threadId=denied";
  const headers = { "x-student-id": "viewer" };
  expect((await context.request(path, { headers })).status).toBe(405);
  expect(context.calls).toEqual([]);
  const denied = await context.request(path, { method: "POST", headers });
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({ error: "unavailable" });
});
