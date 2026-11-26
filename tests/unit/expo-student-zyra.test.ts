import { expect, test } from "bun:test";
import { applyZyraEvent, courseZyraAvailable, courseZyraContextForPath, newTurn, readZyraHistory, readZyraReceipt, turnCompletion } from "../../apps/mobile-native/features/student/zyra/conversation";
import { deleteZyraImage, readZyraImage, uploadZyraImage } from "../../apps/mobile-native/features/student/zyra/images";
import { createNativeTransport, NativeRequestNotDispatched } from "../../apps/mobile-native/network/transport";
import { NativeZyraStreamError, streamNativeZyra } from "../../apps/mobile-native/network/zyra";

const origin = "https://staging.zyxacademy.com";
const request = { courseId: "calculus", requestId: "receipt-1", question: "What is the limit?", persistHistory: true } as const;

function sessionFor(fetcher: (path: string, init: RequestInit) => Promise<Response>) {
  const transport = createNativeTransport({ origin, fetcher });
  return transport.setSession({ origin, accountId: "signed-student", sessionId: "verified-session", readCookie: () => "cookie=fixture" });
}

test("a native turn binds the account and settles after a durable receipt even if the terminator is lost", async () => {
  let writes = 0;
  const session = sessionFor(async (path, init) => {
    writes++;
    expect(path).toBe(origin + "/api/zyra/chat");
    expect(new Headers(init.headers).get("x-student-id")).toBe("signed-student");
    expect(JSON.parse(String(init.body))).toEqual(request);
    const events = [{ type: "text-delta", textDelta: "Partial" }, { type: "text-replace", text: "Complete $x^2$." },
      { type: "data-session", sessionId: "owned-conversation" }, { type: "data-history", saved: true }];
    return new Response(events.map(event => "data: " + JSON.stringify(event) + "\n\n").join(""), { headers: { "Content-Type": "text/event-stream" } });
  });
  let result = newTurn(request);
  let failure: unknown;
  try {
    for await (const event of streamNativeZyra(session, request)) result = applyZyraEvent(result, event);
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "incomplete" });
  expect(result.response).toBe("Complete $x^2$.");
  expect(turnCompletion(result, false, failure)).toBe("saved");
  expect(writes).toBe(1);
});

test("history and receipts are bound to the account, course and conversation", async () => {
  const queries: string[] = [];
  const history = { sessionId: "my-conversation", messages: [{ id: "m", role: "ai", content: "A stored answer." }] };
  const session = sessionFor(async (path, init) => {
    const query = new URL(path).searchParams;
    expect(query.get("courseId")).toBe("calculus");
    expect(new Headers(init.headers).get("x-student-id")).toBe("signed-student");
    queries.push(query.toString());
    return Response.json(query.has("sessionId") ? { history, tier: "standard", sessions: [] }
      : query.get("requestId") === request.requestId ? { saved: true, history } : { saved: false });
  });
  const { signal } = new AbortController();
  expect((await readZyraHistory(session, "calculus", signal, "my-conversation")).history).toMatchObject(history);
  expect(await readZyraReceipt(session, "calculus", "receipt-1", signal)).toMatchObject(history);
  expect(await readZyraReceipt(session, "calculus", "missing", signal)).toBeNull();
  expect(queries).toEqual(["view=history&courseId=calculus&sessionId=my-conversation",
    "view=receipt&courseId=calculus&requestId=receipt-1", "view=receipt&courseId=calculus&requestId=missing"]);
});

test("interruption stays uncertain and rejected writes can retry the same request", () => {
  const turn = newTurn(request);
  expect(turnCompletion(turn, false, new NativeRequestNotDispatched())).toBe("retry");
  expect(turnCompletion(turn, false, new NativeZyraStreamError("http", 403))).toBe("access");
  expect(turnCompletion(turn, false, new NativeZyraStreamError("http", 503))).toBe("uncertain");
  expect(turnCompletion(turn, false, Object.assign(new Error(), { name: "AbortError" }))).toBe("uncertain");
  expect(turnCompletion(applyZyraEvent(turn, { type: "data-error" }), true)).toBe("uncertain");
  expect(turn.request).toBe(request);
  expect(courseZyraAvailable("/courses/calculus/material/quiz")).toBe(true);
  expect(courseZyraAvailable("/courses/calculus/quiz/1")).toBe(false);
  expect(courseZyraAvailable("/courses/calculus/live/host")).toBe(false);
  expect(courseZyraAvailable("/dashboard")).toBe(false);
});

test("context is bounded to the explicit reader or Playground route", () => {
  const selection = { kind: "selection", snippet: `  ${"x".repeat(1400)}  ` } as const;
  expect(courseZyraContextForPath("/courses/calculus/material/limits", selection)).toEqual({ kind: "selection", snippet: "x".repeat(1200) });
  expect(courseZyraContextForPath("/courses/calculus/material", selection)).toBeNull();
  const code = { kind: "playground", code: "print(2)", stdin: "", execution: null, intent: "review" } as const;
  expect(courseZyraContextForPath("/courses/calculus/playground", code)).toBe(code);
  expect(courseZyraContextForPath("/courses/calculus/quiz/1", code)).toBeNull();
});

test("Zyra photos stay bound to the verified account and exact owned conversation", async () => {
  const id = "8dbfeaa2-1d47-4a6a-92bf-a5e2ce4c8220";
  const pathname = `/api/zyra/attachments/${id}?courseId=calculus&sessionId=conversation`;
  const calls: string[] = [];
  const session = sessionFor(async (href, init) => {
    const url = new URL(href);
    calls.push(init.method + " " + url.pathname + url.search);
    expect(new Headers(init.headers).get("x-student-id")).toBe("signed-student");
    if (init.method === "POST") {
      const form = init.body as FormData;
      expect(form.get("courseId")).toBe("calculus");
      expect(form.get("sessionId")).toBe("conversation");
      return Response.json({ id, sessionId: "conversation", expiresAt: "2030-01-01T00:00:00Z", byteSize: 2, width: 1, height: 1,
        mimeType: "image/png" }, { status: 201 });
    }
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } });
  });
  const { signal } = new AbortController();
  const upload = await uploadZyraImage(session, "calculus", "conversation", { uri: "file:///fixture/photo.png", name: "photo.png", mimeType: "image/png" }, signal);
  expect(upload).toMatchObject({ id, sessionId: "conversation" });
  expect(await readZyraImage(session, "calculus", "conversation", id, signal)).toBe("data:image/png;base64,AQI=");
  await deleteZyraImage(session, "calculus", upload, signal);
  expect(calls).toEqual(["POST /api/zyra/attachments", `GET ${pathname}`, `DELETE ${pathname}`]);
});
