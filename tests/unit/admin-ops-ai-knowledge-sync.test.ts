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
