import { expect, test } from "bun:test";
import { applyZyraEvent, courseZyraAvailable, newTurn, readZyraHistory, readZyraReceipt, turnCompletion } from "../../apps/mobile-native/features/student/zyra/conversation";
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
