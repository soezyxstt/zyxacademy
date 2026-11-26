import type { NativeResponse, NativeSessionTransport } from "../../../network/transport";
import type { ZyraConversation } from "./conversation";

/** Isolated device transport for the composer, stream and receipt flow. */
export function createCourseZyraFixture(): NativeSessionTransport {
  const scope = { origin: "https://zyra-fixture.invalid", accountId: "fixture-student", sessionId: "fixture-session" };
  const session = new AbortController();
  const history: ZyraConversation = { sessionId: "fixture-conversation", sessionTitle: "Limits", messages: [] };
  const receipts = new Set<string>();

  function reply(value: unknown, body: ReadableStream<Uint8Array> | null = null): NativeResponse {
    return { ok: true, status: 200, body, headers: new Headers({ "Content-Type": body ? "text/event-stream" : "application/json" }),
      json: async () => value, text: async () => JSON.stringify(value), arrayBuffer: async () => new ArrayBuffer(0),
      dispose: () => { if (body && !body.locked) void body.cancel().catch(() => {}); } };
  }

  return {
    scope, signal: session.signal, isCurrent: () => !session.signal.aborted, assertCurrent: () => {},
    async request(path, init) {
      const url = new URL(path, scope.origin);
      if (url.pathname === "/api/native/student/zyra") {
        if (url.searchParams.get("view") === "receipt") {
          return reply(receipts.has(url.searchParams.get("requestId") ?? "") ? { saved: true, history } : { saved: false });
        }
        return reply({ tier: "standard", sessions: receipts.size ? [{ id: history.sessionId, title: history.sessionTitle }] : [],
          history: receipts.size ? history : null });
      }
      const request = JSON.parse(String(init?.body));
      const lost = receipts.size > 0;
      const answer = lost ? "A saved reply about continuity." : "The limit is $x^2$.";
      receipts.add(request.requestId);
      history.messages.push({ id: `${request.requestId}-student`, role: "student", content: request.question },
        { id: `${request.requestId}-zyra`, role: "ai", content: answer });
      const events = [{ type: "data-session", sessionId: history.sessionId },
        { type: "text-delta", textDelta: lost ? "A partial reply." : answer }];
      const stream = new ReadableStream<Uint8Array>({ start(controller) {
        const codec = new TextEncoder();
        for (const item of events) controller.enqueue(codec.encode(`data: ${JSON.stringify(item)}\n\n`));
        if (!lost) controller.enqueue(codec.encode('data: {"type":"data-history","saved":true}\n\ndata: [DONE]\n\n'));
        controller.close();
      } });
      return reply(null, stream);
    },
  };
}
