import { describe, expect, test } from "bun:test";
import { retrieveAdminOpsKnowledge } from "@/lib/admin-ops-ai/admin-knowledge-retrieval";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import {
  ADMIN_ACCESS_CLASS,
  ADMIN_DOCUMENT_ENTITY_TYPE,
  ADMIN_KNOWLEDGE_BOUNDS,
  ADMIN_OPS_KNOWLEDGE_NAMESPACE,
  AdminKnowledgeAuthError,
  AdminKnowledgeRetrievalError,
  type AdminKnowledgeChunk,
  type AdminKnowledgeSourceRecord,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";
import {
  CANONICAL_VECTOR_PROFILE,
  parseVersionedVectorId,
} from "@/lib/vectorize/contracts";
import goldenFixtures from "../fixtures/ai/admin-ops-knowledge-golden.json";

function createDeterministicMockEmbeddingAdapter() {
  function embed(text: string): number[] {
    const values = new Array<number>(768).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const charCode = lower.charCodeAt(i);
      const index = (charCode * 31 + i * 17) % 768;
      values[index] += 1;
    }
    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
    return values.map((v) => v / norm);
  }

  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    embed: async (input: { text: string }) => embed(input.text),
    embedDocument: async (title: string, text: string) => embed(`${title} ${text}`),
    embedQuery: async (text: string) => embed(text),
  };
}

describe("Admin Ops Knowledge Pipeline - Authorization & Security", () => {
  const fakeProvider = new FakeCanonicalVectorProvider();
  const mockAdapter = createDeterministicMockEmbeddingAdapter();

  test("strictly rejects non-admin caller roles", async () => {
    const forbiddenRoles = ["student", "tutor", "murid", "user", "guest", ""];

    for (const role of forbiddenRoles) {
      await expect(
        retrieveAdminOpsKnowledge({
          query: "bagaimana sistem otentikasi?",
          callerRole: role,
          vectorProvider: fakeProvider,
          embeddingAdapter: mockAdapter,
        })
      ).rejects.toThrow(AdminKnowledgeAuthError);
    }
  });

  test("allows admin and superadmin roles", async () => {
    const result = await retrieveAdminOpsKnowledge({
      query: "test query",
      callerRole: "admin",
      vectorProvider: fakeProvider,
      embeddingAdapter: mockAdapter,
      mockHydrationCatalog: { sources: [], chunks: [] },
    });

    expect(result.candidateCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

describe("Admin Ops Knowledge Pipeline - Retrieval Flow & Bounds", () => {
  test("queries Vectorize with topK=12 in isolated admin_ops_knowledge namespace", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const mockAdapter = createDeterministicMockEmbeddingAdapter();

    await retrieveAdminOpsKnowledge({
      query: "bagaimana arsitektur database?",
      callerRole: "admin",
      vectorProvider: fakeProvider,
      embeddingAdapter: mockAdapter,
      mockHydrationCatalog: { sources: [], chunks: [] },
    });

    expect(fakeProvider.calls.query).toHaveLength(1);
    const call = fakeProvider.calls.query[0];
    expect(call.namespace).toBe("admin_ops_knowledge");
    expect(call.topK).toBe(ADMIN_KNOWLEDGE_BOUNDS.retrievalCandidateCount);
    expect(call.filter).toEqual({
      accessClass: ADMIN_ACCESS_CLASS,
      status: "active",
    });
  });

  test("hydrates only active chunks with matching source versions", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const mockAdapter = createDeterministicMockEmbeddingAdapter();

    const vectorValues = await mockAdapter.embedDocument("Doc Title", "Content");

    // Seed fake provider with vector
    await fakeProvider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [
        {
          id: "v2:admin_document:doc_arch_c0:1",
          values: vectorValues,
          metadata: {
            namespace: "admin_ops_knowledge",
            entityType: "admin_document",
            entityId: "doc_arch_c0",
            version: 1,
            status: "active",
            accessClass: "admin",
            language: "id",
            profileId: CANONICAL_VECTOR_PROFILE.id,
          },
        },
        {
          id: "v2:admin_document:doc_stale_c0:1",
          values: vectorValues,
          metadata: {
            namespace: "admin_ops_knowledge",
            entityType: "admin_document",
            entityId: "doc_stale_c0",
            version: 1,
            status: "active",
            accessClass: "admin",
            language: "id",
            profileId: CANONICAL_VECTOR_PROFILE.id,
          },
        },
      ],
    });

    const activeSource: AdminKnowledgeSourceRecord = {
      id: "doc:arch",
      sourcePath: "docs/ARCHITECTURE.md",
      sourceType: "doc",
      title: "Architecture",
      version: 1,
      contentHash: "11".repeat(32),
      manifestHash: "22".repeat(32),
      chunkCount: 1,
      status: "active",
    };

    const staleSource: AdminKnowledgeSourceRecord = {
      id: "doc:stale",
      sourcePath: "docs/stale.md",
      sourceType: "doc",
      title: "Stale Doc",
      version: 1,
      contentHash: "33".repeat(32),
      manifestHash: "44".repeat(32),
      chunkCount: 1,
      status: "stale",
    };

    const activeChunk: AdminKnowledgeChunk = {
      id: "v2:admin_document:doc_arch_c0:1",
      sourceId: "doc:arch",
      chunkIndex: 0,
      locator: "docs/ARCHITECTURE.md#arch:0",
      headingHierarchy: ["Architecture"],
      startOffset: 0,
      endOffset: 50,
      content: "Canonical Vectorize architecture content.",
      contentHash: "aa".repeat(32),
      version: 1,
      status: "active",
      vectorId: "v2:admin_document:doc_arch_c0:1",
    };

    const staleChunk: AdminKnowledgeChunk = {
      id: "v2:admin_document:doc_stale_c0:1",
      sourceId: "doc:stale",
      chunkIndex: 0,
      locator: "docs/stale.md#top:0",
      headingHierarchy: ["Stale"],
      startOffset: 0,
      endOffset: 50,
      content: "Stale content.",
      contentHash: "bb".repeat(32),
      version: 1,
      status: "active",
      vectorId: "v2:admin_document:doc_stale_c0:1",
    };

    const result = await retrieveAdminOpsKnowledge({
      query: "architecture",
      callerRole: "admin",
      vectorProvider: fakeProvider,
      embeddingAdapter: mockAdapter,
      mockHydrationCatalog: {
        sources: [activeSource, staleSource],
        chunks: [activeChunk, staleChunk],
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("v2:admin_document:doc_arch_c0:1");
    expect(result.results[0].title).toBe("Architecture");
  });

  test("fails explicitly without silent fallback when Vectorize query fails", async () => {
    const brokenProvider = {
      upsert: async () => ({ count: 0 }),
      delete: async () => ({ count: 0 }),
      list: async () => ({ ids: [], count: 0, isTruncated: false }),
      get: async () => ({ vectors: [] }),
      query: async () => {
        throw new Error("Vectorize connection timeout");
      },
    };
    const mockAdapter = createDeterministicMockEmbeddingAdapter();

    await expect(
      retrieveAdminOpsKnowledge({
        query: "SOP Zyra",
        callerRole: "admin",
        vectorProvider: brokenProvider,
        embeddingAdapter: mockAdapter,
      })
    ).rejects.toThrow(AdminKnowledgeRetrievalError);
  });
});

describe("Admin Ops Knowledge Pipeline - Golden Fixture Retrieval", () => {
  test("matches expected sources and rankings across golden query fixtures", async () => {
    const fakeProvider = new FakeCanonicalVectorProvider();
    const mockAdapter = createDeterministicMockEmbeddingAdapter();

    // Setup knowledge base for golden tests
    const sources: AdminKnowledgeSourceRecord[] = [
      {
        id: "doc:features",
        sourcePath: "docs/features.md",
        sourceType: "doc",
        title: "Product Features and Workflows",
        version: 1,
        contentHash: "10".repeat(32),
        manifestHash: "11".repeat(32),
        chunkCount: 1,
        status: "active",
      },
      {
        id: "projection:db_schema",
        sourcePath: "virtual:schema_projection",
        sourceType: "schema_projection",
        title: "Database Schema Structural Projection",
        version: 1,
        contentHash: "20".repeat(32),
        manifestHash: "21".repeat(32),
        chunkCount: 1,
        status: "active",
      },
      {
        id: "doc:zyra_ops_runbooks",
        sourcePath: "docs/operations/zyra-ops-runbooks.md",
        sourceType: "runbook",
        title: "Zyra AI Operations Runbooks",
        version: 1,
        contentHash: "30".repeat(32),
        manifestHash: "31".repeat(32),
        chunkCount: 1,
        status: "active",
      },
      {
        id: "catalog:admin_routes",
        sourcePath: "virtual:admin_routes_catalog",
        sourceType: "catalog",
        title: "Admin Routes and Sitemap Catalog",
        version: 1,
        contentHash: "40".repeat(32),
        manifestHash: "41".repeat(32),
        chunkCount: 1,
        status: "active",
      },
      {
        id: "doc:bundle_idea_bundle_v3",
        sourcePath: "docs/bundle/idea-bundle-v3.md",
        sourceType: "bundle_contract",
        title: "Idea Bundle V3 Contract",
        version: 1,
        contentHash: "50".repeat(32),
        manifestHash: "51".repeat(32),
        chunkCount: 1,
        status: "active",
      },
    ];

    const chunks: AdminKnowledgeChunk[] = [
      {
        id: "v2:admin_document:doc_features_c0:1",
        sourceId: "doc:features",
        chunkIndex: 0,
        locator: "docs/features.md#pka:0",
        headingHierarchy: ["Tutorial PKA", "Alur Pendaftaran dan Verifikasi Berkas"],
        startOffset: 0,
        endOffset: 200,
        content: "Alur pendaftaran Tutorial PKA gratis melalui upload bukti repost dan verifikasi berkas oleh admin.",
        contentHash: "f1".repeat(32),
        version: 1,
        status: "active",
        vectorId: "v2:admin_document:doc_features_c0:1",
      },
      {
        id: "v2:admin_document:projection_db_schema_c0:1",
        sourceId: "projection:db_schema",
        chunkIndex: 0,
        locator: "virtual:schema_projection#tokens:0",
        headingHierarchy: ["Kelompok Belajar & Token Aktivasi", "enrollment_tokens"],
        startOffset: 0,
        endOffset: 200,
        content: "Tabel enrollment_tokens menyimpan string token Zyx-XXXXXXXX-{capacity}-{courseIds.length}, capacity 1 sampai 5 orang, dan relasi ke groups.",
        contentHash: "f2".repeat(32),
        version: 1,
        status: "active",
        vectorId: "v2:admin_document:projection_db_schema_c0:1",
      },
      {
        id: "v2:admin_document:doc_zyra_ops_runbooks_c0:1",
        sourceId: "doc:zyra_ops_runbooks",
        chunkIndex: 0,
        locator: "docs/operations/zyra-ops-runbooks.md#incident:0",
        headingHierarchy: ["Zyra AI Operations Runbooks", "SOP Penanganan Error Rate Spike"],
        startOffset: 0,
        endOffset: 200,
        content: "SOP mitigasi jika terjadi spike error rate pada Zyra AI: aktifkan circuit breaker, cek Google Gemini API quota, dan periksa token quota coordinator.",
        contentHash: "f3".repeat(32),
        version: 1,
        status: "active",
        vectorId: "v2:admin_document:doc_zyra_ops_runbooks_c0:1",
      },
      {
        id: "v2:admin_document:catalog_admin_routes_c0:1",
        sourceId: "catalog:admin_routes",
        chunkIndex: 0,
        locator: "virtual:admin_routes_catalog#ops:0",
        headingHierarchy: ["Admin Routes and Sitemap", "Sistem & Ops"],
        startOffset: 0,
        endOffset: 200,
        content: "Menu navigasi admin: /admin/ops/flags untuk feature flags, /admin/tokens untuk token aktivasi, dan /admin/ops untuk monitor ops.",
        contentHash: "f4".repeat(32),
        version: 1,
        status: "active",
        vectorId: "v2:admin_document:catalog_admin_routes_c0:1",
      },
      {
        id: "v2:admin_document:doc_bundle_idea_bundle_v3_c0:1",
        sourceId: "doc:bundle_idea_bundle_v3",
        chunkIndex: 0,
        locator: "docs/bundle/idea-bundle-v3.md#contract:0",
        headingHierarchy: ["Idea Bundle V3 Contract", "Aturan Validasi"],
        startOffset: 0,
        endOffset: 200,
        content: "Spesifikasi kontrak Idea Bundle V3 mengatur struktur section hierarchy, idea membership, dan validasi schema semantik.",
        contentHash: "f5".repeat(32),
        version: 1,
        status: "active",
        vectorId: "v2:admin_document:doc_bundle_idea_bundle_v3_c0:1",
      },
    ];

    // Embed and populate vector store using canonical entityId
    for (const chunk of chunks) {
      const vectorValues = await mockAdapter.embedDocument(
        chunk.headingHierarchy.join(" "),
        chunk.content
      );
      const parsedVectorId = parseVersionedVectorId(chunk.vectorId);
      await fakeProvider.upsert({
        profileId: CANONICAL_VECTOR_PROFILE.id,
        vectors: [
          {
            id: chunk.vectorId,
            values: vectorValues,
            metadata: {
              namespace: "admin_ops_knowledge",
              entityType: "admin_document",
              entityId: parsedVectorId.entityId,
              version: chunk.version,
              status: "active",
              accessClass: "admin",
              language: "id",
              profileId: CANONICAL_VECTOR_PROFILE.id,
            },
          },
        ],
      });
    }

    // Run golden test cases
    for (const testCase of goldenFixtures.testCases) {
      const retrieval = await retrieveAdminOpsKnowledge({
        query: testCase.query,
        callerRole: "admin",
        vectorProvider: fakeProvider,
        embeddingAdapter: mockAdapter,
        mockHydrationCatalog: { sources, chunks },
      });

      expect(retrieval.results.length).toBeGreaterThanOrEqual(1);
      const topResult = retrieval.results[0];

      expect(testCase.expectedTopSourcePaths).toContain(topResult.filePath);
      expect(topResult.score).toBeGreaterThanOrEqual(testCase.minExpectedScore);
      expect(topResult.source).toBe("semantic-rag");
      expect(topResult.availability).toBe("available");
    }
  });
});
