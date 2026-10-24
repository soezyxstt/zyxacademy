import { describe, expect, test } from "bun:test";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";

describe("Zyra Stream Consumer", () => {
  function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  test("yields text-delta and chunk parts correctly", async () => {
    const stream = createMockStream([
      "data: {\"type\":\"text-delta\",\"textDelta\":\"Halo \"}\n\n",
      "data: {\"type\":\"chunk\",\"text\":\"dunia!\"}\n\n",
      "data: [DONE]\n\n",
    ]);

    const parts = [];
    for await (const part of consumeZyraStream(stream)) {
      parts.push(part);
    }

    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Halo " });
    expect(parts[1]).toEqual({ type: "chunk", text: "dunia!" });
    expect(parts[2]).toEqual({ type: "done" });
  });

  test("yields data-sources, data-canvas, and data-session parts correctly", async () => {
    const mockSources = [
      { type: "course_material", id: "mat-1", label: "Slide Bab 1", href: "/courses/mat-1" },
    ];
    const mockCanvasSpec = {
      specVersion: 1 as const,
      rootId: "root",
      elements: {
        root: {
          id: "root",
          type: "container" as const,
          direction: "vertical" as const,
          children: [],
        },
      },
    };

    const stream = createMockStream([
      `data: ${JSON.stringify({ type: "data-sources", sources: mockSources })}\n`,
      `data: ${JSON.stringify({ type: "data-canvas", canvasSpec: mockCanvasSpec })}\n`,
      `data: ${JSON.stringify({ type: "data-session", sessionId: "session-xyz" })}\n`,
      "data: [DONE]\n",
    ]);

    const parts = [];
    for await (const part of consumeZyraStream(stream)) {
      parts.push(part);
    }

    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ type: "data-sources", sources: mockSources });
    expect(parts[1]).toEqual({ type: "data-canvas", canvasSpec: mockCanvasSpec });
    expect(parts[2]).toEqual({ type: "data-session", sessionId: "session-xyz" });
    expect(parts[3]).toEqual({ type: "done" });
  });

  test("yields the server-resolved response language metadata", async () => {
    const stream = createMockStream([
      `data: ${JSON.stringify({ type: "data-response-language", responseLanguage: "en" })}\n`,
      "data: [DONE]\n",
    ]);
    const parts = [];
    for await (const part of consumeZyraStream(stream)) parts.push(part);
    expect(parts).toEqual([
      { type: "data-response-language", responseLanguage: "en" },
      { type: "done" },
    ]);
  });

  test("handles aborted signal gracefully", async () => {
    const stream = createMockStream([
      "data: {\"type\":\"text-delta\",\"textDelta\":\"Part 1\"}\n\n",
      "data: {\"type\":\"text-delta\",\"textDelta\":\"Part 2\"}\n\n",
    ]);

    const controller = new AbortController();
    const parts = [];

    for await (const part of consumeZyraStream(stream, controller.signal)) {
      parts.push(part);
      controller.abort();
    }

    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Part 1" });
  });

  test("ignores invalid or malformed JSON chunks without crashing", async () => {
    const stream = createMockStream([
      "data: not-json\n\n",
      ": comment\n\n",
      "data: {\"type\":\"text-delta\",\"textDelta\":\"Valid\"}\n\n",
      "data: [DONE]\n\n",
    ]);

    const parts = [];
    for await (const part of consumeZyraStream(stream)) {
      parts.push(part);
    }

    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "Valid" });
    expect(parts[1]).toEqual({ type: "done" });
  });
});
