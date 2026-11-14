import { expect, test } from "bun:test";
import worker, { physicalVectorId } from "../../workers/vector-api/index";
import { CANONICAL_VECTOR_PROFILE, createVersionedVectorId, type CanonicalVectorRecord } from "../../lib/vectorize/contracts";

test("physical IDs retain 64 bytes and use deterministic full SHA256 above the limit", async () => {
  expect(await physicalVectorId("a".repeat(64))).toBe("a".repeat(64));
  const encoded = await physicalVectorId("a".repeat(65));
  expect(encoded).toMatch(/^h:[A-Za-z0-9_-]{43}$/);
  expect(await physicalVectorId("a".repeat(65))).toBe(encoded);
  expect(await physicalVectorId("a".repeat(64) + "b")).not.toBe(encoded);
  expect(await physicalVectorId("é".repeat(33))).toMatch(/^h:/);
});

test("long canonical identities round trip through every canonical provider route", async () => {
  const rows = new Map<string, CanonicalVectorRecord>();
  const index = {
    async upsert(vectors: CanonicalVectorRecord[]) { for (const vector of vectors) { expect(new TextEncoder().encode(vector.id).length).toBeLessThanOrEqual(64); rows.set(vector.id, vector); } return { count: vectors.length, mutationId: "upsert" }; },
    async getByIds(ids: string[]) { return ids.flatMap(id => rows.has(id) ? [rows.get(id)!] : []); },
    async deleteByIds(ids: string[]) { for (const id of ids) rows.delete(id); return { count: ids.length, mutationId: "delete" }; },
    async query() { return { matches: [...rows.values()].map(({ id, metadata }) => ({ id, metadata, score: 1 })), count: rows.size }; },
    async list(options: { cursor?: string; prefix?: string }) {
      expect(options.prefix).toBeUndefined();
      const values = [...rows.keys()];
      const page = options.cursor ? values.slice(1) : values.slice(0, 1);
      return { vectors: page.map(id => ({ id })), count: page.length, totalCount: rows.size, isTruncated: !options.cursor, nextCursor: options.cursor ? undefined : "next" };
    },
  };
  const env: Parameters<typeof worker.fetch>[1] = { SHARED_SECRET: "fixture", VECTORIZE_V2: index as unknown as NonNullable<Parameters<typeof worker.fetch>[1]["VECTORIZE_V2"]> };
  async function call(path: string, body: object) {
    const response = await worker.fetch(new Request(`https://fixture${path}`, { method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" }, body: JSON.stringify({ profileId: CANONICAL_VECTOR_PROFILE.id, ...body }) }), env);
    return { status: response.status, body: await response.json() as any };
  }
  const entityId = "article-with-a-long-identity-" + "文 /:".repeat(20);
  const logical = createVersionedVectorId("article", entityId, 1);
  const metadata = { namespace: "published_articles" as const, entityType: "article" as const, entityId, version: 1, status: "published" as const, accessClass: "enrolled" as const, language: "id", profileId: CANONICAL_VECTOR_PROFILE.id };
  const short = createVersionedVectorId("idea", "short", 1);
  expect((await call("/v2/upsert", { vectors: [{ id: short, values: Array(768).fill(0.2), metadata: { ...metadata, namespace: "canonical_ideas", entityType: "idea", entityId: "short" } }, { id: logical, values: Array(768).fill(0.3), metadata }] })).status).toBe(200);
  expect(rows.has(short)).toBe(true);
  expect(rows.has(logical)).toBe(false);
  expect((await call("/v2/get", { ids: [logical] })).body.vectors[0].id).toBe(logical);
  expect((await call("/v2/query", { vector: Array(768).fill(0.3), topK: 2, namespace: "published_articles" })).body.matches.map((item: { id: string }) => item.id)).toEqual([short, logical]);
  const first = (await call("/v2/list", { prefix: "v2:article:", limit: 1 })).body;
  expect(first.ids).toEqual([]);
  expect(first.isTruncated).toBe(true);
  expect(first.totalCount).toBeUndefined();
  const second = (await call("/v2/list", { prefix: "v2:article:", cursor: first.nextCursor, limit: 1 })).body;
  expect(second.ids).toEqual([logical]);
  const stored = rows.get(await physicalVectorId(logical))!;
  stored.metadata = { ...stored.metadata, entityId: "wrong" };
  expect((await call("/v2/get", { ids: [logical] })).status).toBe(400);
  stored.metadata = metadata;
  expect((await call("/v2/delete", { ids: [logical] })).status).toBe(200);
  expect((await call("/v2/get", { ids: [logical] })).body.vectors).toEqual([]);
  expect(rows.has(short)).toBe(true);
});
