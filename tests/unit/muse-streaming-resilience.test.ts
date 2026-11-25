import { describe, expect, it } from "bun:test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { readChatCompletion } from "@/lib/ai/provider/chat-stream";
import { consumeCompatibleOpsStream } from "@/lib/admin-ops-ai/compatible-stream";
import type { OpsAiModelStreamChunk } from "@/lib/admin-ops-ai/model-factory";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const payload = frames.join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

function v3Stream(parts: Array<Record<string, unknown>>): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part as unknown as LanguageModelV3StreamPart);
      }
      controller.close();
    },
  });
}

async function collectChunks(gen: AsyncGenerator<OpsAiModelStreamChunk>): Promise<OpsAiModelStreamChunk[]> {
  const out: OpsAiModelStreamChunk[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe("readChatCompletion (Meta Muse SSE resilience)", () => {
  it("completes with finish_reason stop when [DONE] arrives after content without finish_reason", async () => {
    const deltas: string[] = [];
    const response = sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Halo " } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "dunia." } }] })}\n\n`,
      `data: [DONE]\n\n`,
    ]);

    const result = await readChatCompletion(response, (delta) => deltas.push(delta));
    expect(deltas).toEqual(["Halo ", "dunia."]);
    expect(result.choices[0].message.content).toBe("Halo dunia.");
    expect(result.choices[0].finish_reason).toBe("stop");
  });

  it("ignores empty SSE frames and malformed trailing frames after content", async () => {
    const deltas: string[] = [];
    const response = sseResponse([
      `data: \n\n`,
      `data:   \n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Jawaban lengkap." } }] })}\n\n`,
      `data: {truncated-trailing-json\n\n`,
      `data: [DONE]\n\n`,
    ]);

    const result = await readChatCompletion(response, (delta) => deltas.push(delta));
    expect(deltas).toEqual(["Jawaban lengkap."]);
    expect(result.choices[0].message.content).toBe("Jawaban lengkap.");
    expect(result.choices[0].finish_reason).toBe("stop");
  });

  it("throws Incomplete provider stream when stream ends without content or finish_reason", async () => {
    const response = sseResponse([`data: [DONE]\n\n`]);
    await expect(readChatCompletion(response, () => {})).rejects.toThrow("Incomplete provider stream");
  });

  it("throws when malformed JSON arrives before any content", async () => {
    const response = sseResponse([`data: {invalid-json\n\n`]);
    await expect(readChatCompletion(response, () => {})).rejects.toThrow();
  });
});

describe("consumeCompatibleOpsStream (Meta Muse AI SDK V3 resilience)", () => {
  it("synthesizes finish when a trailing TypeValidationError arrives after text-delta", async () => {
    let logged = false;
    const validationError = Object.assign(new Error("Type validation failed on trailing chunk"), {
      name: "AI_TypeValidationError",
    });
    const stream = v3Stream([
      { type: "text-delta", id: "t1", delta: "Halo admin." },
      { type: "error", error: validationError },
    ]);

    const chunks = await collectChunks(
      consumeCompatibleOpsStream(stream, {
        model: "muse-spark-1.3",
        startedAt: Date.now(),
        onLogSuccess: async () => {
          logged = true;
        },
      })
    );

    expect(logged).toBe(true);
    expect(chunks).toEqual([
      { type: "text-delta", textDelta: "Halo admin." },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ]);
  });

  it("throws a descriptive error when an error chunk arrives before any visible output", async () => {
    const providerErr = new Error("upstream 502 bad gateway");
    const stream = v3Stream([{ type: "error", error: providerErr }]);

    await expect(
      collectChunks(
        consumeCompatibleOpsStream(stream, {
          model: "muse-spark-1.3",
          startedAt: Date.now(),
          onLogSuccess: async () => {},
        })
      )
    ).rejects.toThrow("Gateway streaming gagal: upstream 502 bad gateway");
  });

  it("parses zero-arg tool calls with empty input string without SyntaxError", async () => {
    let logged = false;
    const stream = v3Stream([
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "discover_admin_operations",
        input: "",
      },
    ]);

    const chunks = await collectChunks(
      consumeCompatibleOpsStream(stream, {
        model: "muse-spark-1.3",
        startedAt: Date.now(),
        onLogSuccess: async () => {
          logged = true;
        },
      })
    );

    expect(logged).toBe(true);
    expect(chunks).toEqual([
      {
        type: "tool-call",
        toolCall: {
          id: "call-1",
          name: "discover_admin_operations",
          args: {},
        },
      },
      {
        type: "finish",
        finishReason: "tool-calls",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ]);
  });

  it("handles missing usage and finishReason fields on finish chunk safely", async () => {
    const stream = v3Stream([
      { type: "text-delta", id: "t1", delta: "Selesai." },
      { type: "finish", usage: undefined, finishReason: undefined },
    ]);

    const chunks = await collectChunks(
      consumeCompatibleOpsStream(stream, {
        model: "muse-spark-1.3",
        startedAt: Date.now(),
        onLogSuccess: async () => {},
      })
    );

    expect(chunks).toEqual([
      { type: "text-delta", textDelta: "Selesai." },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ]);
  });

  it("synthesizes finish when stream closes after text-delta without a finish event", async () => {
    let logged = false;
    const stream = v3Stream([
      { type: "text-delta", id: "t1", delta: "Respons selesai tanpa finish." },
    ]);

    const chunks = await collectChunks(
      consumeCompatibleOpsStream(stream, {
        model: "muse-spark-1.3",
        startedAt: Date.now(),
        onLogSuccess: async () => {
          logged = true;
        },
      })
    );

    expect(logged).toBe(true);
    expect(chunks).toEqual([
      { type: "text-delta", textDelta: "Respons selesai tanpa finish." },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ]);
  });
});
