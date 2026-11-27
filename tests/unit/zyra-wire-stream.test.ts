import { describe, expect, test } from "bun:test";
import { readZyraStream } from "@/packages/zyra/stream";

const encoder = new TextEncoder();

function streamFromChunks(chunks: Iterable<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const events = [];
  for await (const event of readZyraStream(body, signal)) events.push(event);
  return events;
}

describe("Zyra wire stream", () => {
  test("reads multibyte Unicode and replacement events across single-byte chunks", async () => {
    const text = "data: {\"type\":\"text-delta\",\"textDelta\":\"Café π 🌱\"}\r\n\r\n"
      + "data: {\"type\":\"text-replace\",\"text\":\"Café 会 🌱\"}\n\n"
      + "data: [DONE]\n\n"
      + "data: {\"type\":\"text-delta\",\"textDelta\":\"late\"}\n";
    const bytes = encoder.encode(text);
    const body = streamFromChunks([...bytes].map((byte) => Uint8Array.of(byte)));

    expect(await collect(body)).toEqual([
      { type: "text-delta", textDelta: "Café π 🌱" },
      { type: "text-replace", text: "Café 会 🌱" },
      { type: "done" },
    ]);
    expect(body.locked).toBe(false);
  });

  test("replaces malformed UTF-8 and skips malformed data lines", async () => {
    const body = streamFromChunks([
      encoder.encode(": keep-alive\n"),
      encoder.encode("data: not-json\ndata: null\ndata: {\"type\":42}\n"),
      encoder.encode("data: {\"type\":\"chunk\",\"text\":\""),
      Uint8Array.of(0xc3),
      encoder.encode("\"}\n"),
    ]);

    expect(await collect(body)).toEqual([{ type: "chunk", text: "\uFFFD" }]);
  });

  test("keeps complete events and discards the incomplete last line at EOF", async () => {
    const body = streamFromChunks([
      encoder.encode("data: {\"type\":\"text-delta\",\"textDelta\":\"partial\"}\n\n"),
      encoder.encode("data: [DONE]"),
    ]);

    expect(await collect(body)).toEqual([{ type: "text-delta", textDelta: "partial" }]);
    expect(body.locked).toBe(false);
  });

  test("skips reads when cancellation precedes consumption", async () => {
    const body = streamFromChunks([encoder.encode("data: [DONE]\n")]);
    const abort = new AbortController();
    abort.abort();

    expect(await collect(body, abort.signal)).toEqual([]);
    expect(body.locked).toBe(false);
  });

  test("interrupts a pending read even while the source is cleaning up", async () => {
    const abort = new AbortController();
    const reason = new Error("request cancelled");
    let cancelledWith: unknown;
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const body = new ReadableStream<Uint8Array>({
      cancel(value) {
        cancelledWith = value;
        return cleanup;
      },
    });

    const pendingRead = readZyraStream(body, abort.signal).next();
    expect(body.locked).toBe(true);
    try {
      abort.abort(reason);
      await expect(pendingRead).rejects.toBe(reason);
      expect(body.locked).toBe(false);
      expect(cancelledWith).toBe(reason);
    } finally {
      finishCleanup();
    }
  }, 1000);

  test("discards a queued event when abort and read completion race", async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
      cancel() { throw new Error("transport already closed"); },
    });
    const abort = new AbortController();
    const pendingRead = readZyraStream(body, abort.signal).next();

    source.enqueue(encoder.encode("data: [DONE]\n"));
    abort.abort();

    await expect(pendingRead).rejects.toMatchObject({ name: "AbortError" });
    expect(body.locked).toBe(false);
  });

  test("preserves stream failures so the caller can handle a dropped connection", async () => {
    const failure = new Error("connection lost");
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(failure); },
    });

    await expect(collect(body)).rejects.toBe(failure);
    expect(body.locked).toBe(false);
  });
});
