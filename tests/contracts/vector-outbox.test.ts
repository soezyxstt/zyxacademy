import { describe, expect, it } from "bun:test";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import { canonicalOutboxPayload } from "@/lib/vectorize/outbox";
import {
  assertProviderNeutralVectorOutbox,
  CANONICAL_VECTOR_PROFILE,
  createProviderNeutralVectorOutboxDelete,
  parseVersionedVectorId,
  createVersionedVectorId,
} from "@/lib/vectorize/contracts";

const row = {
  id: "queue-1",
  koId: "idea-1",
  action: "upsert" as const,
  namespace: "learning",
  courseId: "mat-i",
  payload: {
    id: "idea-1",
    title: "Hukum Newton",
    text: "Gaya sama dengan massa dikali percepatan.",
    metadata: { entityId: "idea-1", version: 2, chapterId: "bab-1", status: "published" },
  },
};

describe("Plan 012 provider-neutral vector outbox", () => {
  it("creates a canonical payload without provider-specific fields", () => {
    const payload = canonicalOutboxPayload(row);
    assertProviderNeutralVectorOutbox(payload);
    if (payload.operation !== "upsert") throw new Error("expected an upsert payload");
    expect(payload.vectorId).toBe("v2:idea:idea-1:2");
    expect(payload.operation).toBe("upsert");
    expect(payload.metadata).toMatchObject({
      namespace: "canonical_ideas",
      courseId: "mat-i",
      chapterId: "bab-1",
      profileId: CANONICAL_VECTOR_PROFILE.id,
      contentHash: expect.any(String),
    });
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("pinecone");
  });

  it("keeps retries idempotent and supports exact paginated reconciliation", async () => {
    const provider = new FakeCanonicalVectorProvider();
    const first = canonicalOutboxPayload(row);
    const second = canonicalOutboxPayload({
      ...row,
      id: "queue-2",
      koId: "idea-2",
      payload: { ...row.payload, id: "idea-2", metadata: { entityId: "idea-2", version: 1 } },
    });
    if (first.operation !== "upsert" || second.operation !== "upsert") throw new Error("expected upsert payloads");
    await provider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [{ id: first.vectorId, values: new Array(768).fill(0.1), metadata: first.metadata }],
    });
    await provider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [{ id: first.vectorId, values: new Array(768).fill(0.1), metadata: first.metadata }],
    });
    await provider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [{ id: second.vectorId, values: new Array(768).fill(0.2), metadata: second.metadata }],
    });

    const firstPage = await provider.list({ profileId: CANONICAL_VECTOR_PROFILE.id, limit: 1 });
    const secondPage = await provider.list({ profileId: CANONICAL_VECTOR_PROFILE.id, limit: 1, cursor: firstPage.nextCursor });
    expect(firstPage.ids).toHaveLength(1);
    expect(secondPage.ids).toHaveLength(1);
    expect(new Set([...firstPage.ids, ...secondPage.ids])).toEqual(new Set([first.vectorId, second.vectorId]));

    const hydrated = await provider.get({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: [first.vectorId, second.vectorId] });
    expect(hydrated.vectors).toHaveLength(2);

    const deletion = createProviderNeutralVectorOutboxDelete({ entityType: "idea", entityId: "idea-1", version: 2 });
    await provider.delete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: [deletion.vectorId] });
    expect((await provider.list({ profileId: CANONICAL_VECTOR_PROFILE.id })).ids).toEqual([second.vectorId]);
  });

  it("rejects a stale or malformed vector identity before provider mutation", () => {
    const legacyId = "idea:with-colon";
    const encodedId = createVersionedVectorId("idea", legacyId, 1);
    expect(encodedId).toBe("v2:idea:idea%3Awith-colon:1");
    expect(parseVersionedVectorId(encodedId)).toEqual({ entityType: "idea", entityId: legacyId, version: 1 });
    expect(() => assertProviderNeutralVectorOutbox({
      schemaVersion: 2,
      operation: "upsert",
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectorId: "v2:idea:idea-1:1",
      entityType: "idea",
      entityId: "idea-1",
      version: 1,
      content: "content",
      metadata: {
        namespace: "canonical_ideas",
        entityType: "idea",
        entityId: "idea-1",
        version: 1,
        status: "published",
        accessClass: "enrolled",
        language: "id",
        profileId: CANONICAL_VECTOR_PROFILE.id,
        pineconeNamespace: "forbidden",
      },
    } as never)).toThrow("METADATA_NOT_ALLOWED");
  });
});
