import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "bun:test";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import {
  withProviderDeadline,
  type GeminiGenerateClient,
  type GeminiInteractionsClient,
} from "@/lib/ai/provider/provider-adapter";

function compileOnlySdkSurface(client: GoogleGenAI): void {
  void client.models.generateContent({ model: "gemini-3.1-flash-lite", contents: "compile-only" });
  void client.models.embedContent({
    model: "gemini-embedding-2",
    contents: "compile-only",
    config: { outputDimensionality: 768, abortSignal: new AbortController().signal },
  });
  void client.interactions.create({
    model: "gemini-3.5-flash",
    input: "compile-only",
    stream: false,
    generation_config: { thinking_level: "high", max_output_tokens: 1_024 },
  }, { timeout: 1_000, signal: new AbortController().signal });
}

describe("Plan 002 Gemini provider adapters", () => {
  it("keeps the installed SDK surface compile-checked", () => {
    expect(typeof compileOnlySdkSurface).toBe("function");
  });

  it("builds the legacy request with a visible output floor", async () => {
    const requests: unknown[] = [];
    const client = {
      models: {
        generateContent: async (request: unknown) => {
          requests.push(request);
          return { text: "ready", candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } };
        },
      },
    } as unknown as GeminiGenerateClient;

    const result = await createGeminiGenerateAdapter(client).generate({
      modelId: "models/gemini-2.5-flash",
      parts: [{ type: "text", text: "hello" }],
      config: { maxOutputTokens: 1, thinkingBudget: 0, temperature: 0.2 },
    });

    const request = requests[0] as { model: string; config: Record<string, unknown> };
    expect(request.model).toBe("gemini-2.5-flash");
    expect(request.config.maxOutputTokens).toBe(512);
    expect(request.config.temperature).toBe(0.2);
    expect(request.config.thinkingBudget).toBeUndefined();
    expect(result.text).toBe("ready");
    expect(result.retryClassification).toBe("none");
  });

  it("rejects image input for text-only legacy models", async () => {
    const client = { models: { generateContent: async () => ({ text: "unused" }) } } as unknown as GeminiGenerateClient;
    await expect(createGeminiGenerateAdapter(client).generate({
      modelId: "gemini-2.5-flash",
      parts: [{ type: "image", mimeType: "image/png", data: "aA==" }],
    })).rejects.toMatchObject({ code: "CAPABILITY_REJECTED" });
  });

  it("uses interactions and thinking_level without deprecated sampling fields", async () => {
    const requests: unknown[] = [];
    const options: unknown[] = [];
    const client = {
      interactions: {
        create: async (request: unknown, requestOptions: unknown) => {
          requests.push(request);
          options.push(requestOptions);
          return { output_text: "premium ready", status: "completed", usage: { input_tokens: 2, output_tokens: 5 } };
        },
      },
    } as unknown as GeminiInteractionsClient;

    const result = await createGeminiInteractionsAdapter(client).generate({
      modelId: "gemini-3.6-flash",
      parts: [
        { type: "text", text: "describe" },
        { type: "image", mimeType: "image/png", data: "aA==" },
      ],
      config: { temperature: 0.2, topP: 0.7, thinkingBudget: 0, maxOutputTokens: 1 },
    });

    const request = requests[0] as { model: string; generation_config: Record<string, unknown> };
    expect(request.model).toBe("gemini-3.6-flash");
    expect(request.generation_config.thinking_level).toBe("medium");
    expect(request.generation_config.max_output_tokens).toBe(1_024);
    expect(request.generation_config.temperature).toBeUndefined();
    expect(request.generation_config.top_p).toBeUndefined();
    expect(request.generation_config.thinkingBudget).toBeUndefined();
    expect(options[0]).toMatchObject({ timeout: 15_000 });
    expect(result.text).toBe("premium ready");
  });

  it("returns a typed timeout classification", async () => {
    await expect(withProviderDeadline(() => new Promise<never>(() => undefined), 5, "gemini-3.1-flash-lite"))
      .rejects.toMatchObject({ code: "REQUEST_TIMEOUT", retryClassification: "timeout" });
  });

  it("does not allow ordinary routing to select a quarantined model", async () => {
    const client = { models: { generateContent: async () => ({ text: "unused" }) } } as unknown as GeminiGenerateClient;
    await expect(createGeminiGenerateAdapter(client).generate({
      modelId: "gemini-3.5-flash-lite",
      parts: [{ type: "text", text: "hello" }],
    })).rejects.toBeInstanceOf(ProviderAdapterError);
  });
});
