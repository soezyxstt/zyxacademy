import { describe, expect, test } from "bun:test";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { streamNativeZyra } from "../../apps/mobile-native/network/zyra";

const origin = "https://staging.example.test";
const request = {
  courseId: "statistics",
  question: "Apa itu σ?",
  requestId: "turn:123",
  sessionId: "conversation",
  responseLanguage: "id",
  attachmentIds: ["existing-image-id"],
} as const;
const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8" };

function setup(fetcher: (url: string, init: RequestInit) => Promise<Response>) {
  const transport = createNativeTransport({ origin, fetcher });
  const session = transport.setSession({
    origin,
    accountId: "student",
    sessionId: "student-session",
    readCookie: () => "session=fixture",
  });
  return { transport, session };
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of stream) result.push(event);
  return result;
}

describe("native Zyra streaming adapter", () => {
  test("posts the existing wire envelope and decodes incremental UTF-8 and replacement events", async () => {
    const payload = new TextEncoder().encode('data: {"type":"text-delta","textDelta":"σ"}\n\n' +
      'data: {"type":"text-replace","text":"Simpangan baku."}\n\n' +
      'data: {"type":"data-session","sessionId":"conversation"}\n\n' +
      "data: [DONE]\n\n");
    const split = payload.indexOf(0xcf) + 1;
    let streamClosed = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(payload.subarray(0, split)); },
      pull(controller) { controller.enqueue(payload.subarray(split)); },
      cancel() { streamClosed = true; },
    }, { highWaterMark: 0 });
    let calls = 0;
    const { session } = setup(async (url, init) => {
      expect(url).toBe(origin + "/api/zyra/chat");
      expect(init.method).toBe("POST");
      const headers = new Headers(init.headers);
      expect(headers.get("Cookie")).toBe("session=fixture");
      expect(headers.get("Accept")).toBe("text/event-stream");
      expect(JSON.parse(String(init.body))).toEqual(request);
      calls++;
      return new Response(body, { headers: streamHeaders });
    });
    expect(await collect(streamNativeZyra(session, request))).toEqual([
      { type: "text-delta", textDelta: "σ" },
      { type: "text-replace", text: "Simpangan baku." },
      { type: "data-session", sessionId: "conversation" },
      { type: "done" },
    ]);
    expect(calls).toBe(1);
    expect(streamClosed).toBe(true);
  });

  test("forwards stream errors and marks missing completion independently", async () => {
    let calls = 0;
    const { session } = setup(async () => {
      calls++;
      return new Response('data: {"type":"data-error","data":{"message":"Coba lagi."}}\n\n' +
        (calls === 1 ? "data: [DONE]\n\n" : ""), { headers: streamHeaders });
    });
    const complete = await collect(streamNativeZyra(session, request));
    expect(complete).toEqual([{ type: "data-error", data: { message: "Coba lagi." } }, { type: "done" }]);
    await expect(collect(streamNativeZyra(session, request))).rejects.toMatchObject({ code: "incomplete" });
    expect(calls).toBe(2);
  });

  test("preserves HTTP grant denial and never replays a rejected mutation", async () => {
    let calls = 0;
    const { session } = setup(async () => {
      calls++;
      return Response.json({ error: "Akses belum tersedia." }, { status: 403 });
    });
    await expect(collect(streamNativeZyra(session, request))).rejects.toMatchObject({ code: "http", status: 403 });
    await expect(collect(streamNativeZyra(session, { ...request, requestId: "invalid id" }))).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
  });

  test("cancels a pending read at logout and discards buffered events from the old session", async () => {
    let cancelled = false;
    const { transport, session } = setup(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"text-delta","textDelta":"first"}\n\n' +
          'data: {"type":"text-delta","textDelta":"stale"}\n\n'));
      },
      cancel() { cancelled = true; },
    }), { headers: streamHeaders }));
    const events = streamNativeZyra(session, request);
    expect(await events.next()).toEqual({ done: false, value: { type: "text-delta", textDelta: "first" } });
    transport.clearSession();
    await expect(events.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });

  test("caller cancellation releases a read even when the backend has no more chunks ready", async () => {
    const { session } = setup(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"data-work-step"}\n\n')); },
    }), { headers: streamHeaders }));
    const cancel = new AbortController();
    const events = streamNativeZyra(session, request, cancel.signal);
    expect(await events.next()).toEqual({ done: false, value: { type: "data-work-step" } });
    const read = events.next();
    cancel.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(session.isCurrent()).toBe(true);
  });
});
