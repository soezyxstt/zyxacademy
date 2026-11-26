import type { FunctionPlotCanvas } from "../../../../../lib/zyra/canvas/contracts";
import type { NativeResponse, NativeSessionTransport } from "../../../network/transport";
import type { ZyraConversation } from "./conversation";

export const courseZyraPlotFixture: FunctionPlotCanvas = {
  version: "zyra-learning-canvas-v1",
  type: "function_plot",
  title: "Parabola",
  purpose: "Explore how the coefficient changes the graph.",
  altText: "A parabola opening up or down depending on the coefficient.",
  claimRefs: [],
  variables: [{ id: "a", label: "Coefficient", min: -2, max: 2, defaultValue: 1 }],
  controls: [{ variableId: "a", label: "Coefficient", min: -2, max: 2, step: 0.5, presets: [-2, 1, 2] }],
  domain: { min: -2, max: 2, sampleCount: 101 },
  series: [{ id: "parabola", label: "f(x)", expression: "a*x^2", lineStyle: "solid", role: "primary" }],
  fallback: {
    summary: "Values for the original function.",
    columns: [{ id: "x", label: "x" }, { id: "y", label: "f(x)" }],
    rows: [["-2", "4"], ["0", "0"], ["2", "4"]],
  },
};

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
        { id: `${request.requestId}-zyra`, role: "ai", content: answer, canvasSpec: courseZyraPlotFixture });
      const events = [{ type: "data-session", sessionId: history.sessionId },
        { type: "text-delta", textDelta: lost ? "A partial reply." : answer },
        { type: "data-canvas", canvasSpec: courseZyraPlotFixture }];
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
