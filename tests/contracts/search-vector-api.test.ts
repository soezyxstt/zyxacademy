import { describe, expect, it } from "bun:test";
import worker from "../../workers/vector-api/index";
import { embedSearchDocument, embedSearchQuery } from "@/lib/search/service";
import { ROLE_LEVELS } from "@/lib/search/contracts";

process.env.MOCK_GEMINI = "true";

class FakeVectorizeIndex {
  public upsertCalls: Array<Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>> = [];
  public queryCalls: Array<{ vector: number[]; options: { topK: number; returnMetadata?: string; filter?: Record<string, unknown> } }> = [];
  public deleteCalls: string[][] = [];

  async upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>) {
    this.upsertCalls.push(vectors);
    return { count: vectors.length, mutationId: "mock-mutation-id" };
  }

  async query(vector: number[], options: { topK: number; returnMetadata?: "all" | "none" | "indexed"; filter?: Record<string, unknown> }) {
    this.queryCalls.push({ vector, options });
    return {
      matches: [
        {
          id: "doc-1",
          score: 0.95,
          metadata: {
            title: "Kalkulus 1: Turunan",
            category: "Course & Modul",
            entity_type: "course",
            course_id: "course-kalkulus",
            min_role: 1,
          },
        },
      ],
      count: 1,
    };
  }

  async deleteByIds(ids: string[]) {
    this.deleteCalls.push(ids);
    return { count: ids.length, mutationId: "mock-delete-id" };
  }

  async getByIds() {
    return [];
  }
}

describe("Vector Engine & Search API Contracts", () => {
  it("defines correct role levels", () => {
    expect(ROLE_LEVELS.PUBLIC).toBe(0);
    expect(ROLE_LEVELS.STUDENT).toBe(1);
    expect(ROLE_LEVELS.TUTOR).toBe(2);
    expect(ROLE_LEVELS.ADMIN).toBe(3);
  });

  it("embeds query and document using Gemini 768-dim embedding adapter", async () => {
    const queryVector = await embedSearchQuery("kalkulus dasar");
    expect(queryVector.length).toBe(768);

    const docVector = await embedSearchDocument("Bab 1 Turunan", "Penjelasan konsep turunan dan diferensial.");
    expect(docVector.length).toBe(768);
  });

  it("handles /v2/search/upsert via vector-api worker targeting VECTORIZE_SEARCH", async () => {
    const fakeIndex = new FakeVectorizeIndex();
    const env = {
      VECTORIZE_SEARCH: fakeIndex as any,
      SHARED_SECRET: "test-secret",
    };

    const request = new Request("http://localhost/v2/search/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        vectors: [
          {
            id: "search:course:1",
            values: new Array(768).fill(0.1),
            metadata: {
              title: "Fisika Dasar",
              category: "Course & Modul",
              min_role: 0,
            },
          },
        ],
      }),
    });

    const response = await worker.fetch(request, env as any);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(fakeIndex.upsertCalls.length).toBe(1);
  });

  it("handles /v2/search/query with metadata filter for min_role, course_id, and entity_type", async () => {
    const fakeIndex = new FakeVectorizeIndex();
    const env = {
      VECTORIZE_SEARCH: fakeIndex as any,
      SHARED_SECRET: "test-secret",
    };

    const request = new Request("http://localhost/v2/search/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        vector: new Array(768).fill(0.1),
        topK: 15,
        min_role: 1,
        course_id: "course-123",
        entity_type: "quiz",
      }),
    });

    const response = await worker.fetch(request, env as any);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.matches.length).toBe(1);

    expect(fakeIndex.queryCalls.length).toBe(1);
    const queryCall = fakeIndex.queryCalls[0];
    expect(queryCall.options.topK).toBe(15);
    expect(queryCall.options.filter).toEqual({
      min_role: { $lte: 1 },
      course_id: { $eq: "course-123" },
      entity_type: { $eq: "quiz" },
    });
  });

  it("handles /v2/search/delete via vector-api worker targeting VECTORIZE_SEARCH", async () => {
    const fakeIndex = new FakeVectorizeIndex();
    const env = {
      VECTORIZE_SEARCH: fakeIndex as any,
      SHARED_SECRET: "test-secret",
    };

    const request = new Request("http://localhost/v2/search/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        ids: ["search:course:1", "search:materi:2"],
      }),
    });

    const response = await worker.fetch(request, env as any);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(fakeIndex.deleteCalls.length).toBe(1);
    expect(fakeIndex.deleteCalls[0]).toEqual(["search:course:1", "search:materi:2"]);
  });

  it("returns 503 when VECTORIZE_SEARCH is not configured", async () => {
    const env = {
      SHARED_SECRET: "test-secret",
    };

    const request = new Request("http://localhost/v2/search/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        vector: new Array(768).fill(0.1),
      }),
    });

    const response = await worker.fetch(request, env as any);
    expect(response.status).toBe(503);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SEARCH_BINDING_UNAVAILABLE");
  });

  describe("parseSearchQueryString", () => {
    const { parseSearchQueryString } = require("@/lib/search/parser");

    it("identifies non-scoped standard queries", () => {
      const parsed = parseSearchQueryString("kalkulus turunan");
      expect(parsed.isScoped).toBe(false);
      expect(parsed.cleanQuery).toBe("kalkulus turunan");
      expect(parsed.prefixType).toBeUndefined();
    });

    it("parses group: prefix and aliases", () => {
      const res1 = parseSearchQueryString("group:kimia");
      expect(res1.isScoped).toBe(true);
      expect(res1.prefixType).toBe("group");
      expect(res1.cleanQuery).toBe("kimia");
      expect(res1.prefixLabel).toBe("Kelompok Belajar");

      const res2 = parseSearchQueryString("grup: fisika dasar");
      expect(res2.isScoped).toBe(true);
      expect(res2.prefixType).toBe("group");
      expect(res2.cleanQuery).toBe("fisika dasar");

      const res3 = parseSearchQueryString("kelompok:tpb");
      expect(res3.isScoped).toBe(true);
      expect(res3.prefixType).toBe("group");
      expect(res3.cleanQuery).toBe("tpb");
    });

    it("parses meet:, user:, form:, token:, schedule: prefixes", () => {
      const meet = parseSearchQueryString("meet:tutor");
      expect(meet.isScoped).toBe(true);
      expect(meet.prefixType).toBe("meet");
      expect(meet.cleanQuery).toBe("tutor");

      const user = parseSearchQueryString("user:adi@zyxacademy.com");
      expect(user.isScoped).toBe(true);
      expect(user.prefixType).toBe("user");
      expect(user.cleanQuery).toBe("adi@zyxacademy.com");

      const form = parseSearchQueryString("formulir:evaluasi");
      expect(form.isScoped).toBe(true);
      expect(form.prefixType).toBe("form");
      expect(form.cleanQuery).toBe("evaluasi");

      const token = parseSearchQueryString("voucher:ZYX-2026");
      expect(token.isScoped).toBe(true);
      expect(token.prefixType).toBe("token");
      expect(token.cleanQuery).toBe("ZYX-2026");

      const schedule = parseSearchQueryString("jadwal:uts");
      expect(schedule.isScoped).toBe(true);
      expect(schedule.prefixType).toBe("schedule");
      expect(schedule.cleanQuery).toBe("uts");
    });
  });
});
