import { expect, test } from "bun:test";
import { createLearningFixtureRequest } from "../../packages/native-parity/student/learning/fixtures";
import { emptyPlayground, loadPlaygroundDraft, playgroundStorageKey, restoreLocalPlayground, savePlaygroundDraft } from "../../apps/mobile-native/features/student/learning/playground-draft";
import { createRemotePythonRuntime } from "../../lib/coding/remote-runtime";

const owner = { courseId: "course-a", userId: "student-a", draftKey: "playground:default" };
const signal = new AbortController().signal;

test("the native editor reopens the same learner draft, preserves revisions and isolates other owners and handoffs", async () => {
  const request = createLearningFixtureRequest();
  expect(await loadPlaygroundDraft(request, owner, signal)).toEqual(emptyPlayground);
  const draft = { code: "print(input())", stdin: "2\n3", revision: 0 };
  expect(await savePlaygroundDraft(request, owner, draft, signal)).toEqual({ conflict: false, revision: 1 });
  expect(await loadPlaygroundDraft(request, owner, signal)).toEqual({ ...draft, revision: 1 });
  expect(await savePlaygroundDraft(request, owner, draft, signal)).toEqual({ conflict: true });
  for (const other of [{ ...owner, userId: "student-b" }, { ...owner, courseId: "course-b" }, { ...owner, draftKey: "playground:other" }]) {
    expect(await loadPlaygroundDraft(request, other, signal)).toEqual(emptyPlayground);
  }
  expect(restoreLocalPlayground(JSON.stringify(draft))).toEqual(draft);
  expect(restoreLocalPlayground("null")).toBeNull();
  expect(restoreLocalPlayground(JSON.stringify({ ...draft, revision: -1 }))).toBeNull();
  expect(playgroundStorageKey("a:b", "c")).not.toBe(playgroundStorageKey("a", "b:c"));
});

test("a withdrawn enrollment cannot read or write a playground draft", async () => {
  const request = createLearningFixtureRequest("revoked");
  await expect(loadPlaygroundDraft(request, owner, signal)).rejects.toThrow();
  await expect(savePlaygroundDraft(request, owner, emptyPlayground, signal)).rejects.toThrow();
});

test("terminal uses the supplied signed course request and rejects an unknown socket destination", async () => {
  const requests: string[] = [];
  const runtime = createRemotePythonRuntime("course-a", () => {}, { input() {}, output() {} }, async (path, init) => {
    requests.push(path);
    expect(JSON.parse(String(init.body))).toEqual({ courseId: "course-a" });
    return Response.json({ url: "wss://example.invalid/terminal", ticket: "public.test" });
  });
  const result = await runtime.execute({ code: "print(1)", stdin: "", signal, limits: { timeoutMs: 5000, maxOutputChars: 8000 } });
  expect(result.status).toBe("unavailable");
  expect(requests).toEqual(["/api/coding/terminal"]);
});

test("native terminal starts once, forwards input and bounded output, and closes the ticketed socket", async () => {
  const sent: unknown[] = [];
  const phases: string[] = [];
  const output: string[] = [];
  let closed = false;
  const original = globalThis.WebSocket;
  class TestSocket {
    static OPEN = 1;
    readyState = 1;
    onmessage?: (event: { data: string }) => void;
    constructor(url: string, protocols: string[]) {
      expect(url).toBe("wss://zyx-py-runtime.onrender.com/v1/terminal");
      expect(protocols).toEqual(["zyx-v1", "ticket.fixture.ticket"]);
      queueMicrotask(() => {
        for (const payload of [{ type: "ready" }, { type: "running" }, { type: "output", data: btoa("hello") }, { type: "result", status: "completed" }]) {
          this.onmessage?.({ data: JSON.stringify(payload) });
        }
      });
    }
    send(data: string) { sent.push(JSON.parse(data)); }
    close() { closed = true; }
  }
  try {
    globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
    const runtime = createRemotePythonRuntime(owner.courseId, phase => phases.push(phase), {
      input: send => send("student"), output: text => output.push(text),
    }, async () => Response.json({ url: "wss://zyx-py-runtime.onrender.com/v1/terminal", ticket: "fixture.ticket" }));
    const result = await runtime.execute({ code: "print(input())", stdin: "", signal, limits: { timeoutMs: 5000, maxOutputChars: 4 } });
    expect(phases).toEqual(["loading", "running"]);
    expect(sent).toEqual([{ type: "start", code: "print(input())" }, { type: "input", data: "student\n" }]);
    expect(output).toEqual(["hell"]);
    expect(result).toEqual({ status: "completed", stdout: "hell", stderr: "", truncated: true });
    expect(closed).toBe(true);
    sent.length = 0;
    const practice = createRemotePythonRuntime(owner.courseId, () => {}, { prefillInput: true, input() {}, output() {} },
      async () => Response.json({ url: "wss://zyx-py-runtime.onrender.com/v1/terminal", ticket: "fixture.ticket" }));
    const persisted = restoreLocalPlayground(JSON.stringify({ code: "print(input())", stdin: "2\n3", revision: 1 }))!;
    await practice.execute({ code: persisted.code, stdin: persisted.stdin, signal, limits: { timeoutMs: 5000, maxOutputChars: 100 } });
    expect(sent).toEqual([{ type: "start", code: persisted.code }, { type: "input", data: "2\n3\n" }]);
  } finally {
    globalThis.WebSocket = original;
  }
});
