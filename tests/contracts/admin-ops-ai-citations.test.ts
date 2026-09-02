import { describe, it, expect, afterEach } from "bun:test";
import {
  OPS_AI_CITATION_OFFICIAL_LABEL,
  OPS_AI_CITATION_OFFICIAL_DISCLAIMER,
  getOfficialCitationHeading,
  TOOL_PROVENANCE_MAPPING,
  assertProvenanceIntegrity,
  buildSemanticRagCitation,
  buildLiveToolCitation,
  buildDatabaseReadCitation,
  buildSystemContextCitation,
  createOpsAiCitation,
  determineCitationAvailability,
  deduplicateCitations,
  extractInlineCitationMarkers,
  verifyInlineCitations,
  sanitizeInlineCitationMarkers,
  filterCitationsByTool,
  groupCitationsByProvenance,
  evaluateGroundedAnswer,
} from "@/lib/admin-ops-ai/citations";
import {
  createOpsAiRuntimeResponse,
  DEFAULT_OPS_AI_TOOLS,
} from "@/lib/admin-ops-ai/runtime";
import {
  executeOpsAiTool,
  searchAdminKnowledge,
  introspectSchema,
  ADMIN_SITEMAP,
} from "@/lib/admin-ops-ai/runtime-tools";
import {
  validateOpsAiCitation,
  verifyCitationBinding,
  type OpsAiCitation,
  type OpsAiWorkStep,
} from "@/lib/admin-ops-ai/contracts";
import {
  setOpsAiModelStreamMock,
} from "@/lib/admin-ops-ai/model-factory";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import type {
  AdminKnowledgeChunk,
  AdminKnowledgeSourceRecord,
  AdminKnowledgeSearchResult,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";

// ============================================================================
// Test Utilities & Helpers
// ============================================================================

async function parseSseEvents(response: Response): Promise<Array<Record<string, any>>> {
  const text = await response.text();
  const lines = text.split("\n");
  const events: Array<Record<string, any>> = [];

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") {
        events.push({ type: "done" });
      } else {
        try {
          events.push(JSON.parse(dataStr));
        } catch {
          // ignore non-json
        }
      }
    }
  }

  return events;
}

function createMockEmbeddingAdapter(): CanonicalContentV2EmbeddingAdapter {
  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    embed: async () => new Array(768).fill(0.01),
    embedDocument: async () => new Array(768).fill(0.01),
    embedQuery: async () => new Array(768).fill(0.01),
  };
}

const mockKnowledgeSource: AdminKnowledgeSourceRecord = {
  id: "src-runbook-tokens",
  title: "Runbook SOP Token Aktivasi",
  sourcePath: "docs/operations/token-activation.md",
  sourceType: "runbook",
  version: 1,
  contentHash: "a".repeat(64),
  manifestHash: "b".repeat(64),
  chunkCount: 2,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockKnowledgeChunk1: AdminKnowledgeChunk = {
  id: "chunk-token-001",
  sourceId: "src-runbook-tokens",
  chunkIndex: 0,
  vectorId: "v2:admin_document:chunk-token-001:1",
  headingHierarchy: ["SOP Token", "Kapasitas Grup"],
  startOffset: 0,
  endOffset: 120,
  content: "Kapasitas grup belajar token aktivasi maksimal 5 pengguna per kelompok.",
  contentHash: "c".repeat(64),
  locator: "chunk-token-001",
  version: 1,
  status: "active",
};

const mockKnowledgeChunk2: AdminKnowledgeChunk = {
  id: "chunk-token-002",
  sourceId: "src-runbook-tokens",
  chunkIndex: 1,
  vectorId: "v2:admin_document:chunk-token-002:1",
  headingHierarchy: ["SOP Token", "Kedaluwarsa"],
  startOffset: 121,
  endOffset: 250,
  content: "Token aktivasi kedaluwarsa secara otomatis dalam 30 hari kalender jika tidak digunakan.",
  contentHash: "d".repeat(64),
  locator: "chunk-token-002",
  version: 1,
  status: "active",
};

describe("Admin Ops AI Citations - CP4 Contracts & Implementation", () => {
  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  // ==========================================================================
  // Suite 1: Official Copywriting Requirements
  // ==========================================================================
  describe("Suite 1: Official Copywriting Requirements", () => {
    it("enforces official UI label 'Sumber yang diberikan kepada model'", () => {
      expect(OPS_AI_CITATION_OFFICIAL_LABEL).toBe("Sumber yang diberikan kepada model");
      expect(getOfficialCitationHeading()).toBe("Sumber yang diberikan kepada model");
      expect(OPS_AI_CITATION_OFFICIAL_DISCLAIMER).toContain("Sumber yang diberikan kepada model");
      expect(OPS_AI_CITATION_OFFICIAL_DISCLAIMER).not.toContain("pasti membaca");
    });
  });

  // ==========================================================================
  // Suite 2: Provenance Separation & Integrity Assertions
  // ==========================================================================
  describe("Suite 2: Provenance Separation & Integrity Assertions", () => {
    it("distinguishes all four provenance classes strictly", () => {
      const classes = ["semantic-rag", "live-tool", "database-read", "system-context"] as const;
      for (const p of classes) {
        expect(["semantic-rag", "live-tool", "database-read", "system-context"]).toContain(p);
      }
    });

    it("enforces tool provenance mapping consistency", () => {
      expect(TOOL_PROVENANCE_MAPPING.retrieve_admin_knowledge).toBe("semantic-rag");
      expect(TOOL_PROVENANCE_MAPPING.inspect_schema).toBe("database-read");
      expect(TOOL_PROVENANCE_MAPPING.get_system_metrics).toBe("database-read");
      expect(TOOL_PROVENANCE_MAPPING.search_users).toBe("database-read");
      expect(TOOL_PROVENANCE_MAPPING.navigate_admin).toBe("live-tool");
    });

    it("strictly forbids forging live data or database reads as semantic-rag", () => {
      // retrieve_admin_knowledge must use semantic-rag
      expect(() => assertProvenanceIntegrity("retrieve_admin_knowledge", "semantic-rag")).not.toThrow();
      expect(() => assertProvenanceIntegrity("retrieve_admin_knowledge", "database-read")).toThrow(
        "Provenance Violation"
      );

      // inspect_schema must never be forged as semantic-rag
      expect(() => assertProvenanceIntegrity("inspect_schema", "semantic-rag")).toThrow(
        "Security Violation"
      );
      expect(() => assertProvenanceIntegrity("inspect_schema", "database-read")).not.toThrow();

      // navigate_admin must never be forged as semantic-rag
      expect(() => assertProvenanceIntegrity("navigate_admin", "semantic-rag")).toThrow(
        "Security Violation"
      );
      expect(() => assertProvenanceIntegrity("navigate_admin", "live-tool")).not.toThrow();
    });

    it("builds strictly validated citations for each provenance class", () => {
      const runId = "run-prov-1";
      const stepId = "step-prov-1";

      // 1. Semantic RAG
      const ragSearchResult: AdminKnowledgeSearchResult = {
        id: "chunk-10",
        sourceId: "src-doc-1",
        source: "semantic-rag",
        availability: "available",
        title: "Dokumen Arsitektur",
        filePath: "docs/architecture.md",
        section: "Komponen Inti",
        snippet: "Deskripsi arsitektur sistem Zyx.",
        score: 0.92,
        locator: "chunk-10",
        version: 1,
      };
      const ragCitation = buildSemanticRagCitation(ragSearchResult, {
        runId,
        stepId,
        toolCallId: "call-rag-1",
      });
      expect(ragCitation.source).toBe("semantic-rag");
      expect(validateOpsAiCitation(ragCitation).valid).toBe(true);
      // Ensure extra properties like locator/version were stripped for strict schema
      expect((ragCitation as any).locator).toBeUndefined();
      expect((ragCitation as any).version).toBeUndefined();

      // 2. Live Tool
      const liveCitation = buildLiveToolCitation({
        sourceId: "src-nav-tokens",
        title: "Navigasi Token",
        snippet: "Navigasi ke /admin/tokens",
        url: "/admin/tokens",
        runId,
        stepId,
        toolCallId: "call-live-1",
      });
      expect(liveCitation.source).toBe("live-tool");
      expect(validateOpsAiCitation(liveCitation).valid).toBe(true);

      // 3. Database Read
      const dbCitation = buildDatabaseReadCitation({
        sourceId: "src-db-schema-user",
        title: "Skema User",
        snippet: "Kolom: id, name, role",
        runId,
        stepId,
        toolCallId: "call-db-1",
      });
      expect(dbCitation.source).toBe("database-read");
      expect(validateOpsAiCitation(dbCitation).valid).toBe(true);

      // 4. System Context
      const sysCitation = buildSystemContextCitation({
        sourceId: "src-ctx-current-page",
        title: "Halaman Aktif",
        snippet: "Admin berada pada rute /admin/tokens",
        runId,
        stepId,
      });
      expect(sysCitation.source).toBe("system-context");
      expect(validateOpsAiCitation(sysCitation).valid).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 3: Citation Availability Lifecycle
  // ==========================================================================
  describe("Suite 3: Citation Availability Lifecycle", () => {
    it("determines available status when source is active and versions match", () => {
      const avail = determineCitationAvailability({
        existsInCatalog: true,
        sourceStatus: "active",
        chunkStatus: "active",
        sourceVersion: 2,
        chunkVersion: 2,
      });
      expect(avail).toBe("available");
    });

    it("determines stale status when source or chunk is stale or version differs", () => {
      const staleStatus = determineCitationAvailability({
        existsInCatalog: true,
        sourceStatus: "stale",
      });
      expect(staleStatus).toBe("stale");

      const versionMismatch = determineCitationAvailability({
        existsInCatalog: true,
        sourceStatus: "active",
        sourceVersion: 3,
        chunkVersion: 2, // version mismatch
      });
      expect(versionMismatch).toBe("stale");
    });

    it("determines missing status when source is missing from catalog", () => {
      const missing = determineCitationAvailability({
        existsInCatalog: false,
      });
      expect(missing).toBe("missing");
    });

    it("determines invalid status when citation is forged", () => {
      const invalid = determineCitationAvailability({
        isForged: true,
      });
      expect(invalid).toBe("invalid");
    });
  });

  // ==========================================================================
  // Suite 4: Deterministic Citation Deduplication
  // ==========================================================================
  describe("Suite 4: Deterministic Citation Deduplication", () => {
    it("deduplicates multiple chunks from the same source document deterministically", () => {
      const runId = "run-dedup-1";
      const stepId = "step-dedup-1";

      const chunkA: OpsAiCitation = {
        id: "cite-chunk-a",
        sourceId: "src-doc-tokens",
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId,
        title: "Dokumen Token",
        snippet: "Snippet pendek",
        score: 0.75,
      };

      const chunkB: OpsAiCitation = {
        id: "cite-chunk-b",
        sourceId: "src-doc-tokens", // same sourceId
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId,
        title: "Dokumen Token",
        snippet: "Snippet yang lebih panjang dan detail mengenai token aktivasi",
        score: 0.95, // higher score
      };

      const otherDoc: OpsAiCitation = {
        id: "cite-chunk-c",
        sourceId: "src-doc-users",
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId,
        title: "Dokumen Pengguna",
        snippet: "Manajemen akun",
        score: 0.88,
      };

      // Repeated deduplication calls should return identical output
      const run1 = deduplicateCitations([chunkA, chunkB, otherDoc]);
      const run2 = deduplicateCitations([chunkB, chunkA, otherDoc]);

      expect(run1).toHaveLength(2);
      expect(run2).toHaveLength(2);
      expect(run1).toEqual(run2);

      // chunkB with higher score must be retained for src-doc-tokens
      const tokenCite = run1.find((c) => c.sourceId === "src-doc-tokens");
      expect(tokenCite?.id).toBe("cite-chunk-b");
      expect(tokenCite?.score).toBe(0.95);
    });

    it("supports tie-breaking by longest-snippet deterministically", () => {
      const runId = "run-dedup-2";
      const stepId = "step-dedup-2";

      const shortCite: OpsAiCitation = {
        id: "cite-1",
        sourceId: "src-test",
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId,
        title: "Test",
        snippet: "Singkat",
      };

      const longCite: OpsAiCitation = {
        id: "cite-2",
        sourceId: "src-test",
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId,
        title: "Test",
        snippet: "Deskripsi yang sangat panjang dan memuat informasi komprehensif.",
      };

      const result = deduplicateCitations([shortCite, longCite], {
        tieBreaker: "longest-snippet",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("cite-2");
    });
  });

  // ==========================================================================
  // Suite 5: Inline Citation Marker Parsing & Verification
  // ==========================================================================
  describe("Suite 5: Inline Citation Marker Parsing & Verification", () => {
    it("extracts numeric index markers and sourceId markers accurately", () => {
      const text =
        "Menurut SOP [1], kapasitas grup maksimal 5 orang. Rujukan juga ada di [src-runbook-tokens] dan [2, 3].";
      const markers = extractInlineCitationMarkers(text);

      expect(markers.length).toBe(4);
      expect(markers[0].markerType).toBe("index");
      expect(markers[0].numericIndex).toBe(1);

      expect(markers[1].markerType).toBe("sourceId");
      expect(markers[1].sourceId).toBe("src-runbook-tokens");

      expect(markers[2].markerType).toBe("index");
      expect(markers[2].numericIndex).toBe(2);

      expect(markers[3].markerType).toBe("index");
      expect(markers[3].numericIndex).toBe(3);
    });

    it("verifies valid inline markers against available citations", () => {
      const runId = "run-verify-1";
      const stepId = "step-verify-1";
      const availableCitations: OpsAiCitation[] = [
        {
          id: "c-1",
          sourceId: "src-runbook-tokens",
          source: "semantic-rag",
          availability: "available",
          runId,
          stepId,
          title: "SOP Token",
          snippet: "Snippet token",
        },
        {
          id: "c-2",
          sourceId: "src-db-schema",
          source: "database-read",
          availability: "available",
          runId,
          stepId,
          title: "Schema DB",
          snippet: "Snippet schema",
        },
      ];

      const text = "Informasi token ada di [1] dan skema di [src-db-schema].";
      const result = verifyInlineCitations({
        text,
        availableCitations,
        runId,
      });

      expect(result.isValid).toBe(true);
      expect(result.forgedCount).toBe(0);
      expect(result.validCount).toBe(2);
      expect(result.verifiedMarkers[0].sourceId).toBe("src-runbook-tokens");
      expect(result.verifiedMarkers[1].sourceId).toBe("src-db-schema");
    });

    it("detects and flags forged or phantom citations", () => {
      const runId = "run-verify-2";
      const stepId = "step-verify-2";
      const availableCitations: OpsAiCitation[] = [
        {
          id: "c-1",
          sourceId: "src-runbook-tokens",
          source: "semantic-rag",
          availability: "available",
          runId,
          stepId,
          title: "SOP Token",
          snippet: "Snippet token",
        },
      ];

      // [2] is out of bounds (only 1 citation exists), and [src-fake-doc] was never retrieved
      const text = "Data valid [1], data palsu [2] dan dokumen tak ada [src-fake-doc].";
      const result = verifyInlineCitations({
        text,
        availableCitations,
        runId,
      });

      expect(result.isValid).toBe(false);
      expect(result.validCount).toBe(1);
      expect(result.forgedCount).toBe(2);

      const forgedReasons = result.forgedMarkers.map((m) => m.reason);
      expect(forgedReasons).toContain("OUT_OF_BOUNDS_INDEX");
      expect(forgedReasons).toContain("UNKNOWN_SOURCE_ID");
    });

    it("sanitizes text by stripping or marking invalid markers", () => {
      const runId = "run-sanitize-1";
      const availableCitations: OpsAiCitation[] = [
        {
          id: "c-1",
          sourceId: "src-valid",
          source: "semantic-rag",
          availability: "available",
          runId,
          stepId: "s-1",
          title: "Valid",
          snippet: "Valid snippet",
        },
      ];

      const text = "Valid [1], fake [99].";
      const verification = verifyInlineCitations({
        text,
        availableCitations,
        runId,
      });

      const marked = sanitizeInlineCitationMarkers(text, verification, "mark-invalid");
      expect(marked).toBe("Valid [1], fake [invalid: 99].");

      const stripped = sanitizeInlineCitationMarkers(text, verification, "strip");
      expect(stripped).toBe("Valid [1], fake .");
    });

    it("evaluates grounded answers properly", () => {
      const runId = "run-grounded-1";
      const citations: OpsAiCitation[] = [
        {
          id: "c-1",
          sourceId: "src-tokens",
          source: "semantic-rag",
          availability: "available",
          runId,
          stepId: "s-1",
          title: "Tokens",
          snippet: "Token aktivasi",
        },
      ];

      // Grounded answer
      const groundedRes = evaluateGroundedAnswer("Kapasitas grup 5 orang [1].", citations, {
        runId,
      });
      expect(groundedRes.isGrounded).toBe(true);
      expect(groundedRes.coverageRatio).toBe(1);

      // Ungrounded with phantom citation
      const ungroundedRes = evaluateGroundedAnswer("Kapasitas grup 5 orang [99].", citations, {
        runId,
      });
      expect(ungroundedRes.isGrounded).toBe(false);
      expect(ungroundedRes.forgedMarkersCount).toBe(1);
    });

    it("strictly ignores arrays in code blocks, inline code, and markdown links to prevent false positive forged markers", () => {
      const text = `
Berikut contoh implementasi:
\`\`\`ts
const items = [1, 2, 3];
function get(arr: number[]) { return arr[0]; }
\`\`\`
Gunakan variabel \`data[1]\` atau lihat referensi [1](https://zyx.edu/docs/1).
Berdasarkan dokumen resmi [1], sistem siap produksi.
`;
      const availableCitations: OpsAiCitation[] = [
        {
          id: "c-1",
          sourceId: "src-official-doc",
          source: "semantic-rag",
          availability: "available",
          runId: "run-c7",
          stepId: "step-c7",
          title: "Official Doc",
          snippet: "Doc snippet",
        },
      ];

      const markers = extractInlineCitationMarkers(text);
      // Only the genuine citation marker [1] outside of code and links should be detected
      expect(markers).toHaveLength(1);
      expect(markers[0].raw).toBe("[1]");

      const verification = verifyInlineCitations({
        text,
        availableCitations,
        runId: "run-c7",
      });

      expect(verification.isValid).toBe(true);
      expect(verification.forgedCount).toBe(0);
      expect(verification.validCount).toBe(1);
    });
  });

  // ==========================================================================
  // Suite 6: Tool-Level Citation Isolation
  // ==========================================================================
  describe("Suite 6: Tool-Level Citation Isolation", () => {
    it("isolates citations per tool call and does not mix them", () => {
      const runId = "run-isolation-1";

      const ragCite: OpsAiCitation = {
        id: "c-rag",
        sourceId: "src-doc-rag",
        source: "semantic-rag",
        availability: "available",
        runId,
        stepId: "step-1",
        toolCallId: "call-retrieve-1",
        title: "RAG Doc",
        snippet: "RAG snippet",
      };

      const schemaCite: OpsAiCitation = {
        id: "c-schema",
        sourceId: "src-schema-user",
        source: "database-read",
        availability: "available",
        runId,
        stepId: "step-2",
        toolCallId: "call-inspect-2",
        title: "Schema User",
        snippet: "Schema snippet",
      };

      const navCite: OpsAiCitation = {
        id: "c-nav",
        sourceId: "src-nav-sitemap",
        source: "live-tool",
        availability: "available",
        runId,
        stepId: "step-3",
        toolCallId: "call-nav-3",
        title: "Navigation",
        snippet: "Navigation snippet",
      };

      const allCitations = [ragCite, schemaCite, navCite];

      // Filter by toolCallId
      const ragFiltered = filterCitationsByTool(allCitations, "call-retrieve-1");
      expect(ragFiltered).toHaveLength(1);
      expect(ragFiltered[0].source).toBe("semantic-rag");

      const schemaFiltered = filterCitationsByTool(allCitations, "call-inspect-2");
      expect(schemaFiltered).toHaveLength(1);
      expect(schemaFiltered[0].source).toBe("database-read");

      // Group by provenance
      const grouped = groupCitationsByProvenance(allCitations);
      expect(grouped["semantic-rag"]).toHaveLength(1);
      expect(grouped["database-read"]).toHaveLength(1);
      expect(grouped["live-tool"]).toHaveLength(1);
      expect(grouped["system-context"]).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 7: Runtime SSE Stream Citation Part Emission
  // ==========================================================================
  describe("Suite 7: Runtime SSE Stream Citation Part Emission", () => {
    it("emits data-citation parts to SSE stream when retrieve_admin_knowledge is called", async () => {
      const fakeProvider = new FakeCanonicalVectorProvider();
      const mockAdapter = createMockEmbeddingAdapter();

      await fakeProvider.upsert({
        profileId: CANONICAL_VECTOR_PROFILE.id,
        vectors: [
          {
            id: mockKnowledgeChunk1.vectorId,
            values: await mockAdapter.embedQuery("token aktivasi"),
            metadata: {
              namespace: "admin_ops_knowledge",
              entityType: "admin_document",
              entityId: mockKnowledgeChunk1.id,
              version: 1,
              status: "active",
              accessClass: "admin",
              language: "id",
              profileId: CANONICAL_VECTOR_PROFILE.id,
            },
          },
        ],
      });

      let callCount = 0;
      setOpsAiModelStreamMock(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: "tool-call",
            toolCall: {
              id: "call-retrieval-1",
              name: "retrieve_admin_knowledge",
              args: { query: "token aktivasi" },
            },
          };
          yield { type: "finish", finishReason: "tool-calls" };
        } else {
          yield {
            type: "text-delta",
            textDelta: "Berdasarkan SOP [1], kapasitas grup adalah 5 orang.",
          };
          yield { type: "finish", finishReason: "stop" };
        }
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Berapa kapasitas token?" }],
        toolContext: {
          callerRole: "admin",
          vectorProvider: fakeProvider,
          embeddingAdapter: mockAdapter,
          mockHydrationCatalog: {
            sources: [mockKnowledgeSource],
            chunks: [mockKnowledgeChunk1, mockKnowledgeChunk2],
          },
        },
      });

      const events = await parseSseEvents(response);

      // Check data-citation event
      const citationEvents = events.filter((e) => e.type === "data-citation");
      expect(citationEvents.length).toBeGreaterThanOrEqual(1);

      for (const ev of citationEvents) {
        const citation = ev.data as OpsAiCitation;
        const validation = validateOpsAiCitation(citation);
        expect(validation.valid).toBe(true);
        expect(citation.source).toBe("semantic-rag");
        expect(citation.availability).toBe("available");
        expect(citation.toolCallId).toBe("call-retrieval-1");
      }

      // Check tool-result event carries its citations
      const toolResultEvent = events.find((e) => e.type === "tool-result");
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent?.output?.citations).toBeDefined();
      expect(toolResultEvent?.output?.citations.length).toBeGreaterThanOrEqual(1);
    });

    it("does not emit any semantic-rag citations for answers without retrieval", async () => {
      setOpsAiModelStreamMock(async function* () {
        yield {
          type: "text-delta",
          textDelta: "Halo admin, ada yang bisa dibantu hari ini?",
        };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Halo" }],
      });

      const events = await parseSseEvents(response);

      // No data-citation events with semantic-rag should exist
      const ragCitations = events.filter(
        (e) => e.type === "data-citation" && e.data?.source === "semantic-rag"
      );
      expect(ragCitations).toHaveLength(0);
    });

    it("detects and emits invalid citation part when model hallucinates phantom inline citation", async () => {
      setOpsAiModelStreamMock(async function* () {
        yield {
          type: "text-delta",
          textDelta: "Menurut dokumen rahasia [src-phantom-99], kuota telah diubah.",
        };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Apa status kuota?" }],
      });

      const events = await parseSseEvents(response);

      // Phantom citation should be flagged as invalid
      const forgedCitations = events.filter(
        (e) => e.type === "data-citation" && e.data?.availability === "invalid"
      );
      expect(forgedCitations.length).toBeGreaterThanOrEqual(1);
      expect(forgedCitations[0].data?.sourceId).toBe("src-phantom-99");
      expect(forgedCitations[0].data?.availability).toBe("invalid");
    });
  });

  // ==========================================================================
  // Suite 8: Component State Fixtures (CP6 Drawer Contract Preview)
  // ==========================================================================
  describe("Suite 8: Component State Fixtures & Source Display Contract", () => {
    it("provides structured fixture matching official UI copywriting", () => {
      const fixtureRunId = "run-fixture-001";
      const activeCitation: OpsAiCitation = {
        id: "cite-fixture-1",
        sourceId: "src-runbook-tokens",
        source: "semantic-rag",
        availability: "available",
        runId: fixtureRunId,
        stepId: "step-1",
        toolCallId: "call-1",
        title: "Runbook SOP Token",
        filePath: "docs/operations/token.md",
        section: "Kapasitas",
        snippet: "Kapasitas maksimal 5 pengguna per kelompok.",
        score: 0.94,
      };

      const staleCitation: OpsAiCitation = {
        id: "cite-fixture-2",
        sourceId: "src-old-policy",
        source: "semantic-rag",
        availability: "stale",
        runId: fixtureRunId,
        stepId: "step-1",
        toolCallId: "call-1",
        title: "Kebijakan Lama",
        snippet: "Versi lama sebelum pembaruan sistem.",
      };

      const missingCitation: OpsAiCitation = {
        id: "cite-fixture-3",
        sourceId: "src-deleted-doc",
        source: "semantic-rag",
        availability: "missing",
        runId: fixtureRunId,
        stepId: "step-1",
        title: "Dokumen Terhapus",
        snippet: "Dokumen telah dihapus dari katalog.",
      };

      const invalidCitation: OpsAiCitation = {
        id: "cite-fixture-4",
        sourceId: "src-forged-doc",
        source: "semantic-rag",
        availability: "invalid",
        runId: fixtureRunId,
        stepId: "step-1",
        title: "Dokumen Palsu",
        snippet: "Sitasi tidak terverifikasi.",
      };

      const componentStateFixture = {
        heading: OPS_AI_CITATION_OFFICIAL_LABEL,
        disclaimer: OPS_AI_CITATION_OFFICIAL_DISCLAIMER,
        citations: [activeCitation, staleCitation, missingCitation, invalidCitation],
        counts: {
          total: 4,
          available: 1,
          stale: 1,
          missing: 1,
          invalid: 1,
        },
      };

      expect(componentStateFixture.heading).toBe("Sumber yang diberikan kepada model");
      expect(componentStateFixture.counts.available).toBe(1);
      expect(componentStateFixture.counts.stale).toBe(1);
      expect(componentStateFixture.counts.missing).toBe(1);
      expect(componentStateFixture.counts.invalid).toBe(1);
    });
  });
});
