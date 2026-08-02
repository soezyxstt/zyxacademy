import { describe, expect, it } from "bun:test";
import worker from "../../workers/vector-api/index";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import { createCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import {
  assertCanonicalDimensions,
  assertCanonicalDelete,
  assertCanonicalMetadata,
  assertCanonicalProfile,
  assertCanonicalVector,
  CANONICAL_INDEXED_METADATA_ALLOWLIST,
  CANONICAL_VECTOR_PROFILE,
  createProviderNeutralVectorOutboxUpsert,
  createVersionedVectorId,
  parseVersionedVectorId,
  serializeCanonicalEmbeddingInput,
  VectorizeContractError,
  type CanonicalEmbeddingClient,
  type CanonicalVectorMetadata,
  type CanonicalVectorRecord,
} from "@/lib/vectorize/contracts";

function metadata(overrides: Partial<CanonicalVectorMetadata> = {}): CanonicalVectorMetadata {
  return {
    namespace: "published_articles",
    entityType: "article",
    entityId: "article-1",
    version: 3,
    status: "published",
    accessClass: "public",
    language: "id",
    profileId: CANONICAL_VECTOR_PROFILE.id,
    courseId: "course-1",
    chapterId: "chapter-1",
    ...overrides,
  };
}

function record(overrides: Partial<CanonicalVectorRecord> = {}): CanonicalVectorRecord {
  const vectorMetadata = overrides.metadata ?? metadata();
  return {
    id: createVersionedVectorId(vectorMetadata.entityType, vectorMetadata.entityId, vectorMetadata.version),
    values: new Array(CANONICAL_VECTOR_PROFILE.dimensions).fill(0.25),
    metadata: vectorMetadata,
    ...overrides,
  };
}

class FakeEmbeddingClient implements CanonicalEmbeddingClient {
  public readonly requests: Array<Parameters<CanonicalEmbeddingClient["embedContent"]>[0]> = [];

  constructor(
    public readonly projectId: string,
    private readonly action: "success" | "failure" | "wrong-dimension",
  ) {}

  async embedContent(request: Parameters<CanonicalEmbeddingClient["embedContent"]>[0]) {
    this.requests.push(request);
    if (this.action === "failure") throw new Error(`project ${this.projectId} unavailable`);
    const dimensions = this.action === "wrong-dimension" ? 767 : CANONICAL_VECTOR_PROFILE.dimensions;
    return { embeddings: [{ values: new Array(dimensions).fill(0.1) }] };
  }
}

describe("Plan 012A Vectorize foundation contracts", () => {
  it("locks the canonical profile and the provider metadata index budget", () => {
    expect(CANONICAL_VECTOR_PROFILE).toMatchObject({
      id: "canonical-content-v2",
      model: "gemini-embedding-2",
      dimensions: 768,
      metric: "cosine",
    });
    expect(CANONICAL_INDEXED_METADATA_ALLOWLIST.length).toBeLessThanOrEqual(10);
    expect(CANONICAL_INDEXED_METADATA_ALLOWLIST).toContain("accessClass");
  });

  it("creates and parses versioned vector IDs without provider-specific identifiers", () => {
    const id = createVersionedVectorId("article", "article-1", 3);
    expect(id).toBe("v2:article:article-1:3");
    expect(parseVersionedVectorId(id)).toEqual({ entityType: "article", entityId: "article-1", version: 3 });
  });

  it("rejects mismatched dimensions, profiles, IDs, and metadata fields", () => {
    expect(() => assertCanonicalDimensions(new Array(1024).fill(0), "test vector")).toThrow("DIMENSION_MISMATCH");
    expect(() => assertCanonicalProfile("zyra-cache-v1")).toThrow("PROFILE_MISMATCH");
    expect(() => assertCanonicalVector({ ...record(), id: "v2:article:other:3" })).toThrow("ID_METADATA_MISMATCH");
    expect(() => assertCanonicalMetadata({ ...metadata(), pineconeNamespace: "forbidden" } as never)).toThrow(
      "METADATA_NOT_ALLOWED",
    );
  });

  it("validates every canonical delete ID against the v2 identity format", () => {
    expect(() => assertCanonicalDelete({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      ids: ["v1:article:article-1:3"],
    })).toThrow("INVALID_ID");
    expect(() => assertCanonicalDelete({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      ids: ["v2:article:article-1:3", "not-a-vector-id"],
    })).toThrow("INVALID_ID");
  });

  it("serializes Gemini Embedding 2 task instructions as versioned content", () => {
    expect(serializeCanonicalEmbeddingInput({ purpose: "query", text: "hukum Newton" })).toBe(
      "task: search result | query: hukum Newton",
    );
    expect(serializeCanonicalEmbeddingInput({ purpose: "document", title: "Hukum Newton", text: "F = ma" })).toBe(
      "title: Hukum Newton | text: F = ma",
    );
  });

  it("retries another project key with the same model and exact output dimension", async () => {
    const first = new FakeEmbeddingClient("project-a", "failure");
    const second = new FakeEmbeddingClient("project-b", "success");
    const adapter = createCanonicalContentV2EmbeddingAdapter([first, second]);

    const values = await adapter.embedDocument("Kinematika", "Gerak lurus");

    expect(values).toHaveLength(768);
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
    expect(first.requests[0].model).toBe("gemini-embedding-2");
    expect(second.requests[0].model).toBe("gemini-embedding-2");
    expect(first.requests[0].config.outputDimensionality).toBe(768);
    expect(second.requests[0].config.outputDimensionality).toBe(768);
  });

  it("fails closed on embedding errors without cross-model fallback", async () => {
    const first = new FakeEmbeddingClient("project-a", "failure");
    const second = new FakeEmbeddingClient("project-b", "failure");
    const adapter = createCanonicalContentV2EmbeddingAdapter([first, second]);

    await expect(adapter.embedQuery("hukum Newton")).rejects.toMatchObject({ code: "EMBEDDING_FAILED" });
    expect(first.requests.every((request) => request.model === "gemini-embedding-2")).toBe(true);
    expect(second.requests.every((request) => request.model === "gemini-embedding-2")).toBe(true);
  });

  it("does not accept a wrong-dimension response from a project key", async () => {
    const adapter = createCanonicalContentV2EmbeddingAdapter([
      new FakeEmbeddingClient("project-a", "wrong-dimension"),
      new FakeEmbeddingClient("project-b", "success"),
    ]);

    await expect(adapter.embedQuery("hukum Newton")).rejects.toMatchObject({ code: "DIMENSION_MISMATCH" });
  });

  it("keeps fake provider retrieval isolated by logical namespace and bounded topK", async () => {
    const provider = new FakeCanonicalVectorProvider();
    await provider.upsert({ profileId: CANONICAL_VECTOR_PROFILE.id, vectors: [record()] });
    await provider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [record({
        id: createVersionedVectorId("question", "question-1", 1),
        values: new Array(768).fill(0.9),
        metadata: metadata({ namespace: "published_questions", entityType: "question", entityId: "question-1", version: 1 }),
      })],
    });

    const result = await provider.query({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vector: new Array(768).fill(0.25),
      topK: 1,
      namespace: "published_articles",
    });

    expect(result.count).toBe(1);
    expect(result.matches[0].metadata.namespace).toBe("published_articles");
  });

  it("requires the explicit capability for restricted solution retrieval", async () => {
    const provider = new FakeCanonicalVectorProvider();
    await provider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [record({
        id: createVersionedVectorId("solution", "solution-1", 1),
        metadata: metadata({
          namespace: "published_solutions",
          entityType: "solution",
          entityId: "solution-1",
          version: 1,
          accessClass: "restricted_solution",
        }),
      })],
    });

    await expect(provider.query({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vector: new Array(768).fill(0.25),
      topK: 1,
      namespace: "published_solutions",
    })).rejects.toMatchObject({ code: "CAPABILITY_REQUIRED" });
  });

  it("uses provider-neutral, versioned outbox payloads", () => {
    const payload = createProviderNeutralVectorOutboxUpsert({
      entityType: "article",
      entityId: "article-1",
      version: 3,
      content: "Gerak lurus",
      metadata: {
        namespace: "published_articles",
        status: "published",
        accessClass: "public",
        language: "id",
        courseId: "course-1",
        chapterId: "chapter-1",
      },
    });

    expect(payload.schemaVersion).toBe(2);
    expect(payload.vectorId).toBe("v2:article:article-1:3");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("pinecone");
    expect(payload).not.toHaveProperty("indexName");
  });

  it("enforces strict v2 Worker requests and selects the v2 binding", async () => {
    const vectors = new Map<string, CanonicalVectorRecord>();
    let lastQueryOptions: Record<string, unknown> | undefined;
    const index = {
      async upsert(input: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) {
        input.forEach((vector) => vectors.set(vector.id, vector as unknown as CanonicalVectorRecord));
        return { count: input.length, mutationId: "mutation-1" };
      },
      async query(_vector: number[], options: {
        topK: number;
        namespace?: string;
        returnMetadata?: "all" | "none" | "indexed";
        filter?: Record<string, unknown>;
      }) {
        lastQueryOptions = options;
        return { count: 0, matches: [] };
      },
      async deleteByIds(ids: string[]) {
        ids.forEach((id) => vectors.delete(id));
        return { count: ids.length, mutationId: "mutation-2" };
      },
      async getByIds() {
        return [];
      },
    };
    const env = {
      VECTORIZE: { upsert: async () => ({ count: 0, mutationId: "legacy" }), query: async () => ({ count: 0, matches: [] }), deleteByIds: async () => ({ count: 0, mutationId: "legacy" }), getByIds: async () => [] },
      VECTORIZE_V2: index,
      SHARED_SECRET: "secret",
      RESTRICTED_SOLUTION_CAPABILITY: "read:published_solutions",
    };
    const request = new Request("https://vector.test/v2/upsert", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, vectors: [record()] }),
    });

    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 1 });

    const queryRequest = new Request("https://vector.test/v2/query", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: CANONICAL_VECTOR_PROFILE.id,
        vector: new Array(768).fill(0),
        topK: 1,
        namespace: "published_articles",
        filter: { namespace: { $eq: "published_questions" }, status: { $eq: "published" } },
      }),
    });
    expect((await worker.fetch(queryRequest, env)).status).toBe(200);
    expect(lastQueryOptions?.filter).toEqual({
      namespace: { $eq: "published_articles" },
      status: { $eq: "published" },
    });

    const badRequest = new Request("https://vector.test/v2/query", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, vector: [0], topK: 1, namespace: "published_articles" }),
    });
    expect((await worker.fetch(badRequest, env)).status).toBe(400);

    const restrictedRequest = new Request("https://vector.test/v2/query", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, vector: new Array(768).fill(0), topK: 1, namespace: "published_solutions" }),
    });
    expect((await worker.fetch(restrictedRequest, env)).status).toBe(403);

    const invalidDeleteRequest = new Request("https://vector.test/v2/delete", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: ["legacy-id"] }),
    });
    expect((await worker.fetch(invalidDeleteRequest, env)).status).toBe(400);
  });

  it("returns a bounded, explicit error when the v2 Worker binding is absent", async () => {
    const request = new Request("https://vector.test/v2/upsert", {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, vectors: [record()] }),
    });
    const response = await worker.fetch(request, {
      VECTORIZE: {} as never,
      SHARED_SECRET: "secret",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "V2_BINDING_UNAVAILABLE" } });
  });

  it("exposes contract errors as typed errors", () => {
    expect(new VectorizeContractError("TEST", "message")).toMatchObject({ code: "TEST" });
  });
});
