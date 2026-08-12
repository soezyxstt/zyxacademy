import { describe, expect, test } from "bun:test";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import type { GeminiInteractionsClient } from "@/lib/ai/provider/provider-adapter";
import { assertZyraImageRequestBytes } from "@/lib/zyra/images";

describe("Zyra multimodal provider boundary", () => {
  test("assembles text and image parts in one interaction call", async () => {
    const requests: unknown[] = [];
    const client = {
      interactions: {
        create: async (request: unknown) => {
          requests.push(request);
          return { output_text: "typed response", status: "completed" };
        },
      },
    } as unknown as GeminiInteractionsClient;
    await createGeminiInteractionsAdapter(client).generate({
      modelId: "gemini-3.6-flash",
      parts: [
        { type: "text", text: "Jelaskan gambar ini." },
        { type: "image", mimeType: "image/png", data: "aA==" },
      ],
    });
    expect(requests).toHaveLength(1);
    expect((requests[0] as { input: unknown[] }).input).toHaveLength(2);
  });

  test("enforces the serialized request budget before dispatch", () => {
    expect(() => assertZyraImageRequestBytes(15 * 1024 * 1024, 2 * 1024 * 1024)).toThrow("REQUEST_TOO_LARGE");
    expect(() => assertZyraImageRequestBytes(8 * 1024 * 1024, 512)).not.toThrow();
  });
});
