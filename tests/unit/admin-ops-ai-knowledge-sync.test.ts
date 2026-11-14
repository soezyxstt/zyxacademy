import { describe, expect, test } from "bun:test";
import {
  computeAdminKnowledgeSyncPlan,
  executeAdminKnowledgeSync,
  type AdminKnowledgeCatalogStore,
} from "@/lib/admin-ops-ai/admin-knowledge-sync";
import { chunkAdminKnowledgeSource } from "@/lib/admin-ops-ai/admin-knowledge-chunker";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import type {
  AdminKnowledgeChunk,
  AdminKnowledgeSourceRecord,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";
import type { CuratedSourceContent } from "@/lib/admin-ops-ai/admin-knowledge-sources";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";

function createInMemoryCatalogStore(): {
  store: AdminKnowledgeCatalogStore;
  sources: AdminKnowledgeSourceRecord[];
  chunks: AdminKnowledgeChunk[];
} {
  const sources: AdminKnowledgeSourceRecord[] = [];
  const chunks: AdminKnowledgeChunk[] = [];

  const store: AdminKnowledgeCatalogStore = {
    upsertSource: async (source: AdminKnowledgeSourceRecord) => {
      const idx = sources.findIndex((s) => s.id === source.id);
      if (idx >= 0) sources[idx] = source;
      else sources.push(source);
    },
    upsertChunks: async (newChunks: AdminKnowledgeChunk[]) => {
      for (const chunk of newChunks) {
        if (!sources.some(source => source.id === chunk.sourceId)) throw new Error("Knowledge source FK missing");
        const idx = chunks.findIndex((c) => c.id === chunk.id);
        if (idx >= 0) chunks[idx] = chunk;
        else chunks.push(chunk);
      }
    },
    markSourceStale: async (sourceId: string) => {
      const source = sources.find((s) => s.id === sourceId);
      if (source) source.status = "stale";
    },
    markChunksStale: async (chunkIds: string[]) => {
      for (const id of chunkIds) {
        const chunk = chunks.find((c) => c.id === id);
        if (chunk) chunk.status = "stale";
      }
    },
    listSources: async () => sources,
    listChunksForSource: async (sourceId: string) =>
      chunks.filter((c) => c.sourceId === sourceId),
  };

  return { store, sources, chunks };
}

describe("Admin Ops Knowledge Pipeline - Sync Diff Planner", () => {
  const sourceA: CuratedSourceContent = {
    id: "doc:architecture",
    sourcePath: "docs/ARCHITECTURE.md",
    sourceType: "doc",
    title: "Architecture and System Boundaries",
    rawContent: "# Architecture\n\nCloudflare Vectorize 768d is canonical.",
    normalizedContent: "# Architecture\n\nCloudflare Vectorize 768d is canonical.",
    contentHash: "a1".repeat(32),
    isVirtual: false,
  };

  const sourceB: CuratedSourceContent = {
    id: "doc:features",
    sourcePath: "docs/features.md",
    sourceType: "doc",
    title: "Features and Workflows",
    rawContent: "# Features\n\nTutorial PKA campaign is active.",
    normalizedContent: "# Features\n\nTutorial PKA campaign is active.",
    contentHash: "b2".repeat(32),
    isVirtual: false,
  };

  const manifestA = chunkAdminKnowledgeSource(sourceA);
  const manifestB = chunkAdminKnowledgeSource(sourceB);

  test("computes fresh sync plan when database is empty", () => {
    const plan = computeAdminKnowledgeSyncPlan([], [], [manifestA, manifestB]);

    expect(plan.sourcesToInsert).toEqual(["doc:architecture", "doc:features"]);
    expect(plan.sourcesToUpdate).toHaveLength(0);
    expect(plan.sourcesToRetain).toHaveLength(0);
    expect(plan.sourcesToArchive).toHaveLength(0);

    const totalChunks = manifestA.chunkCount + manifestB.chunkCount;
    expect(plan.chunksToUpsert).toHaveLength(totalChunks);
    expect(plan.chunkIdsToDelete).toHaveLength(0);

    const upsertOps = plan.operations.filter((op) => op.action === "upsert");
    expect(upsertOps).toHaveLength(totalChunks);
  });

  test("computes retain plan when sources and manifests match exactly", () => {
    const existingSources: AdminKnowledgeSourceRecord[] = [
      {
        id: manifestA.sourceId,
        sourcePath: manifestA.sourcePath,
        sourceType: "doc",
        title: "Architecture and System Boundaries",
        version: manifestA.version,
        contentHash: manifestA.contentHash,
        manifestHash: manifestA.manifestHash,
        chunkCount: manifestA.chunkCount,
        status: "active",
      },
    ];
    const existingChunks: AdminKnowledgeChunk[] = [...manifestA.chunks];

    const plan = computeAdminKnowledgeSyncPlan(
      existingSources,
      existingChunks,
      [manifestA]
    );

    expect(plan.sourcesToInsert).toHaveLength(0);
    expect(plan.sourcesToUpdate).toHaveLength(0);
    expect(plan.sourcesToRetain).toEqual(["doc:architecture"]);
    expect(plan.chunksToUpsert).toHaveLength(0);
    expect(plan.chunkIdsToDelete).toHaveLength(0);
    expect(plan.chunkIdsToRetain).toHaveLength(manifestA.chunkCount);
  });

  test("computes update and deletes orphan chunks when source content changes", () => {
    const oldSourceRecord: AdminKnowledgeSourceRecord = {
      id: manifestA.sourceId,
      sourcePath: manifestA.sourcePath,
      sourceType: "doc",
      title: "Architecture and System Boundaries",
      version: 1,
      contentHash: "old-hash-value".padEnd(64, "0"),
      manifestHash: "old-manifest-hash".padEnd(64, "0"),
      chunkCount: 2,
      status: "active",
    };

    const obsoleteChunk: AdminKnowledgeChunk = {
      id: "v2:admin_document:doc_architecture_c99:1",
      sourceId: "doc:architecture",
      chunkIndex: 99,
      locator: "docs/ARCHITECTURE.md#obsolete:99",
      headingHierarchy: ["Obsolete Section"],
      startOffset: 0,
      endOffset: 50,
      content: "Obsolete content that was deleted.",
      contentHash: "c3".repeat(32),
      version: 1,
      status: "active",
      vectorId: "v2:admin_document:doc_architecture_c99:1",
    };

    const plan = computeAdminKnowledgeSyncPlan(
      [oldSourceRecord],
      [obsoleteChunk],
      [manifestA]
    );

    expect(plan.sourcesToUpdate).toEqual(["doc:architecture"]);
    expect(plan.chunksToUpsert).toHaveLength(manifestA.chunkCount);
    expect(plan.chunkIdsToDelete).toContain("v2:admin_document:doc_architecture_c99:1");

    const deleteOps = plan.operations.filter((op) => op.action === "delete");
    expect(deleteOps).toHaveLength(1);
    expect(deleteOps[0].chunkId).toBe("v2:admin_document:doc_architecture_c99:1");
  });

  test("archives removed sources and deletes all their vectors", () => {
    const existingRemovedSource: AdminKnowledgeSourceRecord = {
      id: "doc:retired_feature",
      sourcePath: "docs/retired.md",
      sourceType: "doc",
      title: "Retired Feature",
      version: 1,
      contentHash: "d4".repeat(32),
      manifestHash: "e5".repeat(32),
      chunkCount: 1,
      status: "active",
    };

    const removedChunk: AdminKnowledgeChunk = {
      id: "v2:admin_document:doc_retired_feature_c0:1",
      sourceId: "doc:retired_feature",
      chunkIndex: 0,
      locator: "docs/retired.md#top:0",
      headingHierarchy: ["Retired"],
      startOffset: 0,
      endOffset: 30,
      content: "Retired content.",
      contentHash: "f6".repeat(32),
      version: 1,
      status: "active",
      vectorId: "v2:admin_document:doc_retired_feature_c0:1",
    };

    const plan = computeAdminKnowledgeSyncPlan(
      [existingRemovedSource],
      [removedChunk],
      [manifestA]
    );

    expect(plan.sourcesToArchive).toEqual(["doc:retired_feature"]);
    expect(plan.chunkIdsToDelete).toContain("v2:admin_document:doc_retired_feature_c0:1");

    const deleteOp = plan.operations.find(
      (op) => op.chunkId === "v2:admin_document:doc_retired_feature_c0:1"
    );
    expect(deleteOp).toBeDefined();
    expect(deleteOp?.action).toBe("delete");
  });
});

describe("Admin Ops Knowledge Pipeline - Sync Execution with Hermetic Store", () => {
  const retrySources: CuratedSourceContent[] = [{
    id: "doc:retry", sourcePath: "docs/retry.md", sourceType: "doc", title: "Retry",
    rawContent: "# Retry\n\nKnowledge sync fixture.", normalizedContent: "# Retry\n\nKnowledge sync fixture.",
    contentHash: "a1".repeat(32), isVirtual: false,
  }];
  const retryAdapter = {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    embed: async () => new Array(768).fill(0.2),
    embedDocument: async () => new Array(768).fill(0.2),
    embedQuery: async () => new Array(768).fill(0.2),
  };

  test("optional worker embedder batches at most 50 documents and preserves vector positions", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const { store, sources } = createInMemoryCatalogStore();
    const customSources = Array.from({ length: 51 }, (_, index) => ({
      ...retrySources[0], id: `doc:batch-${index}`, sourcePath: `docs/batch-${index}.md`,
      normalizedContent: `# Batch ${index}\n\nCanonical document ${index}.`,
    }));
    const batches: Array<readonly { title: string; content: string }[]> = [];
    const result = await executeAdminKnowledgeSync({
      customSources, catalogStore: store, vectorProvider: fakeProvider,
      embeddingAdapter: { ...retryAdapter, embedDocument: async () => { throw new Error("single adapter must not run"); } },
      embedDocuments: async (documents) => {
        batches.push(documents);
        return documents.map((_, index) => new Array(768).fill(index / 100));
      },
    });
    expect(batches.map(batch => batch.length)).toEqual([50, 1]);
    expect(fakeProvider.calls.upsert.map(call => call.vectors.length)).toEqual([50, 1]);
    expect(result.chunks.upserted).toBe(51);
    expect(sources).toHaveLength(51);
    expect(fakeProvider.calls.upsert[0].vectors[1].values[0]).toBe(0.01);
    expect(batches[0][1]).toEqual({ title: "docs/batch-1.md#batch-1:0", content: "# Batch 1\n\nCanonical document 1." });
  });

  test("malformed batch embedding responses cannot advance catalog hashes", async () => {
    for (const response of [[], [new Array(767).fill(0.2)]]) {
      const fakeProvider = new FakeCanonicalVectorProvider();
      const { store, sources, chunks } = createInMemoryCatalogStore();
      await expect(executeAdminKnowledgeSync({
        customSources: retrySources, catalogStore: store, vectorProvider: fakeProvider,
        embedDocuments: async () => response,
      })).rejects.toThrow();
      expect(fakeProvider.calls.upsert).toHaveLength(0);
      expect(sources).toHaveLength(0);
      expect(chunks).toHaveLength(0);
    }
  });

  test("vector failure leaves the catalog retryable and missing retained vectors are repaired by exact ID", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const { store, sources, chunks } = createInMemoryCatalogStore();
    const upsert = fakeProvider.upsert.bind(fakeProvider);
    fakeProvider.upsert = async () => { throw new Error("synthetic upsert failure"); };
    const options = { customSources: retrySources, catalogStore: store, vectorProvider: fakeProvider, embeddingAdapter: retryAdapter };

    await expect(executeAdminKnowledgeSync(options)).rejects.toThrow("synthetic upsert failure");
    expect(sources).toHaveLength(0);
    expect(chunks).toHaveLength(0);

    fakeProvider.upsert = upsert;
    const retried = await executeAdminKnowledgeSync(options);
    expect(retried.chunks.upserted).toBeGreaterThan(0);
    expect(sources).toHaveLength(1);
    expect(fakeProvider.listRecords().length).toBe(chunks.length);

    const missingId = chunks[0].vectorId;
    await fakeProvider.delete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: [missingId] });
    const repaired = await executeAdminKnowledgeSync(options);
    expect(fakeProvider.calls.get.at(-1)?.ids).toEqual(chunks.map(chunk => chunk.vectorId));
    expect(repaired.chunks.upserted).toBe(1);
    expect(repaired.operations.find(operation => operation.vectorId === missingId)?.action).toBe("upsert");
    expect(fakeProvider.calls.upsert.at(-1)?.vectors.map(vector => vector.id)).toEqual([missingId]);
    expect(fakeProvider.getRecord(missingId)).toBeDefined();

    const retained = await executeAdminKnowledgeSync(options);
    expect(retained.chunks.upserted).toBe(0);
    expect(retained.chunks.unchanged).toBe(chunks.length);

    chunks.splice(0, 1);
    const catalogRepaired = await executeAdminKnowledgeSync(options);
    expect(catalogRepaired.chunks.upserted).toBe(1);
    expect(chunks.length).toBe(fakeProvider.listRecords().length);
  });

  test("failed vector deletion does not archive catalog records before a successful retry", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const { store, sources, chunks } = createInMemoryCatalogStore();
    const options = { catalogStore: store, vectorProvider: fakeProvider, embeddingAdapter: retryAdapter };
    await executeAdminKnowledgeSync({ ...options, customSources: retrySources });
    chunks[0].id = "catalog-row-with-distinct-vector-id";
    const remove = fakeProvider.delete.bind(fakeProvider);
    fakeProvider.delete = async () => { throw new Error("synthetic delete failure"); };

    await expect(executeAdminKnowledgeSync({ ...options, customSources: [] })).rejects.toThrow("synthetic delete failure");
    expect(sources[0].status).toBe("active");
    expect(chunks[0].status).toBe("active");

    fakeProvider.delete = remove;
    const markChunksStale = store.markChunksStale;
    store.markChunksStale = async () => { throw new Error("synthetic catalog failure"); };
    await expect(executeAdminKnowledgeSync({ ...options, customSources: [] })).rejects.toThrow("synthetic catalog failure");
    expect(sources[0].status).toBe("active");
    expect(chunks[0].status).toBe("active");
    store.markChunksStale = markChunksStale;
    const retried = await executeAdminKnowledgeSync({ ...options, customSources: [] });
    expect(retried.sources.deleted).toBe(1);
    expect(fakeProvider.calls.delete.at(-1)?.ids).toEqual([chunks[0].vectorId]);
    expect(fakeProvider.listRecords()).toHaveLength(0);
    expect(sources[0].status).toBe("stale");
    expect(chunks[0].status).toBe("stale");
  });

  test("executes dry-run sync without vector provider calls", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const { store } = createInMemoryCatalogStore();
    const mockAdapter = {
      profileId: CANONICAL_VECTOR_PROFILE.id,
      embed: async () => new Array(768).fill(0.1),
      embedDocument: async () => new Array(768).fill(0.1),
      embedQuery: async () => new Array(768).fill(0.1),
    };

    const customSources: CuratedSourceContent[] = [
      {
        id: "doc:architecture",
        sourcePath: "docs/ARCHITECTURE.md",
        sourceType: "doc",
        title: "Architecture",
        rawContent: "# Architecture\n\nVectorize 768d canonical store.",
        normalizedContent: "# Architecture\n\nVectorize 768d canonical store.",
        contentHash: "a1".repeat(32),
        isVirtual: false,
      },
    ];

    const result = await executeAdminKnowledgeSync({
      dryRun: true,
      customSources,
      catalogStore: store,
      vectorProvider: fakeProvider,
      embeddingAdapter: mockAdapter,
    });

    expect(result.sources.total).toBe(1);
    expect(result.sources.inserted).toBe(1);
    expect(result.chunks.upserted).toBeGreaterThanOrEqual(1);
    expect(fakeProvider.calls.upsert).toHaveLength(0);
  });

  test("executes live sync upserting vectors into admin_ops_knowledge with matching entityId", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const { store } = createInMemoryCatalogStore();
    const mockAdapter = {
      profileId: CANONICAL_VECTOR_PROFILE.id,
      embed: async () => new Array(768).fill(0.2),
      embedDocument: async () => new Array(768).fill(0.2),
      embedQuery: async () => new Array(768).fill(0.2),
    };

    const customSources: CuratedSourceContent[] = [
      {
        id: "doc:architecture",
        sourcePath: "docs/ARCHITECTURE.md",
        sourceType: "doc",
        title: "Architecture",
        rawContent: "# Architecture\n\nVectorize 768d canonical store.",
        normalizedContent: "# Architecture\n\nVectorize 768d canonical store.",
        contentHash: "a1".repeat(32),
        isVirtual: false,
      },
    ];

    const result = await executeAdminKnowledgeSync({
      dryRun: false,
      customSources,
      catalogStore: store,
      vectorProvider: fakeProvider,
      embeddingAdapter: mockAdapter,
    });

    expect(result.sources.inserted).toBe(1);
    expect(fakeProvider.calls.upsert).toHaveLength(1);
    const upsertedRecord = fakeProvider.calls.upsert[0].vectors[0];
    expect(upsertedRecord.metadata.namespace).toBe("admin_ops_knowledge");
    expect(upsertedRecord.metadata.entityType).toBe("admin_document");
    expect(upsertedRecord.metadata.entityId).toBe("doc_architecture_c0");
    expect(upsertedRecord.metadata.accessClass).toBe("admin");
  });
});
