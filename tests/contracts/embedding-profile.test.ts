import { describe, expect, it } from "bun:test";
import {
  assertEmbeddingProfileIndex,
  createProfiledEmbeddingAdapter,
  getEmbeddingProfile,
} from "@/lib/ai/provider/embedding-adapter";
import type { GeminiEmbeddingClient } from "@/lib/ai/provider/provider-adapter";

function fakeClient(
  projectId: string,
  action: "success" | "failure" | "wrong-dimension",
  requests: unknown[],
): GeminiEmbeddingClient {
  return {
    models: {
      embedContent: async (request: unknown) => {
        requests.push({ projectId, request });
        if (action === "failure") throw new Error(`${projectId} unavailable`);
        const dimensions = action === "wrong-dimension" ? 767 : 768;
        return { embeddings: [{ values: new Array(dimensions).fill(0.1) }] };
      },
    },
  } as unknown as GeminiEmbeddingClient;
}

describe("Plan 002 embedding profiles", () => {
  it("locks both profiles to Gemini Embedding 2 and 768 dimensions", () => {
    expect(getEmbeddingProfile("canonical-content-v2")).toMatchObject({
      model: "gemini-embedding-2",
      dimensions: 768,
      indexAlias: "zyx-vectors-staging-v2",
    });
    expect(getEmbeddingProfile("zyra-semantic-cache-v1")).toMatchObject({
      model: "gemini-embedding-2",
      dimensions: 768,
      indexAlias: "zyx-zyra-cache-staging",
    });
  });

  it("rejects profile and index mixing", () => {
    expect(() => assertEmbeddingProfileIndex("canonical-content-v2", "zyx-zyra-cache-staging"))
      .toThrow("cannot access index");
  });

  it("retries a same-model project client without changing profile identity", async () => {
    const requests: unknown[] = [];
    const adapter = createProfiledEmbeddingAdapter({
      profileId: "zyra-semantic-cache-v1",
      clients: [
        fakeClient("project-1", "failure", requests),
        fakeClient("project-2", "success", requests),
      ],
    });
    const result = await adapter.embed({ text: "semantic cache query" });
    expect(result.profileId).toBe("zyra-semantic-cache-v1");
    expect(result.modelId).toBe("gemini-embedding-2");
    expect(result.values).toHaveLength(768);
    expect(requests).toHaveLength(2);
    expect((requests[0] as { request: { model: string; config: { outputDimensionality: number } } }).request)
      .toMatchObject({ model: "gemini-embedding-2", config: { outputDimensionality: 768 } });
  });

  it("fails closed on a non-768 result and never falls back to another embedding model", async () => {
    const requests: unknown[] = [];
    const adapter = createProfiledEmbeddingAdapter({
      profileId: "canonical-content-v2",
      clients: [fakeClient("project-1", "wrong-dimension", requests)],
    });
    await expect(adapter.embed({ text: "canonical content" })).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    expect((requests[0] as { request: { model: string } }).request.model).toBe("gemini-embedding-2");
  });
});
