import { describe, expect, it } from "bun:test";
import worker from "./index";

type Vector = {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string | number | boolean | string[] | number[]>;
};

class FakeIndex {
  upsertCalls: Vector[][] = [];
  queryCalls: Array<{ vector: number[]; options: Record<string, unknown> }> = [];
  deleteCalls: string[][] = [];

  async upsert(vectors: Vector[]) {
    this.upsertCalls.push(vectors);
    return { count: vectors.length, mutationId: "mutation-upsert" };
  }

  async query(vector: number[], options: Record<string, unknown>) {
    this.queryCalls.push({ vector, options });
    return { matches: [], count: 0 };
  }

  async deleteByIds(ids: string[]) {
    this.deleteCalls.push(ids);
    return { count: ids.length, mutationId: "mutation-delete" };
  }

  async getByIds() {
    return [];
  }
}

function request(path: string, body: unknown): Request {
  return new Request(`https://vector.test${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("vector-api binding routing", () => {
  it("uses the production VECTORIZE binding for legacy routes", async () => {
    const index = new FakeIndex();
    const env = { VECTORIZE: index, SHARED_SECRET: "secret" };

    const upsert = await worker.fetch(request("/upsert", {
      vectors: [{ id: "legacy-1", values: [0.1, 0.2], namespace: "course" }],
    }), env as any);
    expect(upsert.status).toBe(200);
    expect(await upsert.json()).toMatchObject({ ok: true, count: 1 });

    const query = await worker.fetch(request("/query", {
      vector: [0.1, 0.2],
      topK: 3,
      namespace: "course",
      filter: { status: "published" },
    }), env as any);
    expect(query.status).toBe(200);
    expect(index.queryCalls[0]).toMatchObject({
      vector: [0.1, 0.2],
      options: { topK: 3, namespace: "course", filter: { status: "published" }, returnMetadata: "all" },
    });

    const deletion = await worker.fetch(request("/delete", { ids: ["legacy-1"] }), env as any);
    expect(deletion.status).toBe(200);
    expect(await deletion.json()).toMatchObject({ ok: true, count: 1 });
    expect(index.upsertCalls).toHaveLength(1);
    expect(index.deleteCalls).toEqual([["legacy-1"]]);
  });

  it("uses VECTORIZE_V2 for the staging canonical path", async () => {
    const index = new FakeIndex();
    const env = { VECTORIZE_V2: index, SHARED_SECRET: "secret" };
    const response = await worker.fetch(request("/v2/upsert", {
      profileId: "canonical-content-v2",
      vectors: [{
        id: "v2:idea:idea-1:1",
        values: new Array(768).fill(0),
        metadata: {
          namespace: "canonical_ideas",
          entityType: "idea",
          entityId: "idea-1",
          version: 1,
          status: "published",
          accessClass: "public",
          language: "id",
          profileId: "canonical-content-v2",
        },
      }],
    }), env as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 1 });
    expect(index.upsertCalls).toHaveLength(1);
  });

  it("uses VECTORIZE_SEARCH for the staging search path", async () => {
    const index = new FakeIndex();
    const env = { VECTORIZE_SEARCH: index, SHARED_SECRET: "secret" };
    const response = await worker.fetch(request("/v2/search/query", {
      vector: new Array(768).fill(0),
      topK: 5,
      course_id: "course-1",
    }), env as any);

    expect(response.status).toBe(200);
    expect(index.queryCalls[0].options).toEqual({
      topK: 5,
      returnMetadata: "all",
      filter: { course_id: { $eq: "course-1" } },
    });
  });

  it("fails closed when the canonical v2 binding is missing", async () => {
    const legacyIndex = new FakeIndex();
    const response = await worker.fetch(request("/v2/upsert", {
      profileId: "canonical-content-v2",
      vectors: [{
        id: "v2:idea:idea-1:1",
        values: new Array(768).fill(0),
        metadata: {
          namespace: "canonical_ideas",
          entityType: "idea",
          entityId: "idea-1",
          version: 1,
          status: "published",
          accessClass: "public",
          language: "id",
          profileId: "canonical-content-v2",
        },
      }],
    }), { VECTORIZE: legacyIndex, SHARED_SECRET: "secret" } as any);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "V2_BINDING_UNAVAILABLE" },
    });
    expect(legacyIndex.upsertCalls).toHaveLength(0);
  });
});
