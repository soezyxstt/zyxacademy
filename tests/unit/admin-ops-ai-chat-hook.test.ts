import { describe, it, expect } from "bun:test";
import { consumeOpsAiStream, type OpsAiStreamPart } from "@/components/admin/ops-ai/use-ops-ai-chat";

describe("useOpsAiChat - Stream Consumer & Typed Message Parts (Tahap 4A)", () => {
  it("consumes text-delta and data-work-step SSE events cleanly", async () => {
    const encoder = new TextEncoder();
    const rawChunks = [
      'data: {"type":"text-delta","textDelta":"Halo dari "}\n\n',
      'data: {"type":"text-delta","textDelta":"Zyx Ops AI."}\n\n',
      'data: {"type":"data-work-step","id":"s-1","data":{"stepId":"step-1","status":"running"}}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of rawChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const parts: OpsAiStreamPart[] = [];
    for await (const part of consumeOpsAiStream(stream)) {
      parts.push(part);
    }

    expect(parts.length).toBe(4);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Halo dari " });
    expect(parts[1]).toEqual({ type: "text-delta", textDelta: "Zyx Ops AI." });
    expect(parts[2].type).toBe("data-work-step");
    expect((parts[2] as any).data.stepId).toBe("step-1");
    expect(parts[3]).toEqual({ type: "done" });
  });

  it("handles fragmented SSE lines across chunk boundaries", async () => {
    const encoder = new TextEncoder();
    // Simulate TCP fragment splitting a single JSON event into multiple packets
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text-'));
        controller.enqueue(encoder.encode('delta","textDelta":"Pesan terpotong"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    const parts: OpsAiStreamPart[] = [];
    for await (const part of consumeOpsAiStream(stream)) {
      parts.push(part);
    }

    expect(parts.length).toBe(2);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Pesan terpotong" });
    expect(parts[1]).toEqual({ type: "done" });
  });

  it("terminates stream reading early when AbortSignal triggers", async () => {
    const encoder = new TextEncoder();
    const abortController = new AbortController();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Bagian 1"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Bagian 2"}\n\n'));
        controller.close();
      },
    });

    const parts: OpsAiStreamPart[] = [];
    for await (const part of consumeOpsAiStream(stream, abortController.signal)) {
      parts.push(part);
      if (part.type === "text-delta") {
        abortController.abort();
      }
    }

    expect(parts.length).toBe(1);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Bagian 1" });
  });

  it("handles pre-aborted signal by returning immediately without reading", async () => {
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    abortController.abort();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Tidak terbaca"}\n\n'));
        controller.close();
      },
    });

    const parts: OpsAiStreamPart[] = [];
    for await (const part of consumeOpsAiStream(stream, abortController.signal)) {
      parts.push(part);
    }

    expect(parts.length).toBe(0);
  });
});
