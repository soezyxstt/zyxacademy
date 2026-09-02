import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createOpsAiRuntimeResponse,
} from "@/lib/admin-ops-ai/runtime";
import {
  setOpsAiModelStreamMock,
} from "@/lib/admin-ops-ai/model-factory";
import {
  executeOpsAiTool,
} from "@/lib/admin-ops-ai/runtime-tools";
import {
  proposalStore,
} from "@/lib/admin-ops-ai/proposal-store";
import {
  OpsAiCitationSchema,
  OpsAiActionProposalV2Schema,
} from "@/lib/admin-ops-ai/contracts";
import type {
  AdminKnowledgeChunk,
  AdminKnowledgeSourceRecord,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import {
  CANONICAL_VECTOR_PROFILE,
  createVersionedVectorId,
} from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";

// ============================================================================
// Auth & Header Mocks for Next.js Route Testing
// ============================================================================

let mockSessionUser: { id: string; role?: string; name?: string; email?: string } | null = null;
let mockHasPeranAdmin = false;

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => {
        if (!mockSessionUser) return null;
        return { user: mockSessionUser };
      },
    },
  },
}));

mock.module("@/lib/auth/authorization", () => ({
  hasPeran: async (_userId: string, role: string) => {
    if (role === "admin") return mockHasPeranAdmin;
    return false;
  },
  hasAnyPeran: async () => mockHasPeranAdmin,
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { POST as executeRoutePost } from "@/app/api/admin/ops-ai/execute/route";

function createFakeEmbeddingAdapter(): CanonicalContentV2EmbeddingAdapter {
  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    async embed(_input: unknown): Promise<number[]> {
      const text = typeof _input === "string" ? _input : JSON.stringify(_input);
      const vec = new Array(768).fill(0.01);
      vec[0] = text.length % 100 / 100;
      return vec;
    },
    async embedDocument(title: string, text: string): Promise<number[]> {
      const vec = new Array(768).fill(0.01);
      vec[0] = (title.length + text.length) % 100 / 100;
      return vec;
    },
    async embedQuery(text: string): Promise<number[]> {
      const vec = new Array(768).fill(0.01);
      vec[0] = text.length % 100 / 100;
      return vec;
    },
  };
}

// ============================================================================
// Integration Test Suite: OPS-AI-V2-CP7-INTEGRATION
// ============================================================================

describe("Admin Ops AI v2: End-to-End Integration Tests (OPS-AI-V2-CP7-INTEGRATION)", () => {
  let vectorProvider: FakeCanonicalVectorProvider;
  let embeddingAdapter: CanonicalContentV2EmbeddingAdapter;
  let mockSource: AdminKnowledgeSourceRecord;
  let mockChunk: AdminKnowledgeChunk;

  beforeEach(async () => {
    mockSessionUser = null;
    mockHasPeranAdmin = false;
    proposalStore.clear();

    vectorProvider = new FakeCanonicalVectorProvider();
    embeddingAdapter = createFakeEmbeddingAdapter();

    // Register hermetic precondition checker & action executor for create_token
    proposalStore.registerPreconditionChecker("create_token", async () => true);
    proposalStore.registerActionExecutor("create_token", async (payload) => {
      const { courseIds, capacity, packageType = "reguler_15" } = payload;
      return {
        success: true,
        result: {
          token: `Zyx-INT-${randomUUID().slice(0, 8).toUpperCase()}`,
          courses: courseIds,
          capacity,
          packageType,
          message: "Token aktivasi kelompok berhasil dibuat.",
        },
      };
    });

    mockSource = {
      id: "src-runbook-tokens",
      sourcePath: "docs/operations/zyra-ops-runbooks.md",
      sourceType: "runbook",
      title: "SOP Operasional Token Aktivasi Zyx",
      version: 1,
      contentHash: "a".repeat(64),
      manifestHash: "b".repeat(64),
      chunkCount: 1,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockChunk = {
      id: "chunk-tokens-1",
      sourceId: mockSource.id,
      chunkIndex: 0,
      startOffset: 0,
      endOffset: 200,
      contentHash: "c".repeat(64),
      vectorId: createVersionedVectorId("admin_document", "src-runbook-tokens", 1),
      headingHierarchy: ["SOP Token", "Kapasitas Kuota"],
      content: "Batas kapasitas kuota token aktivasi kelompok adalah 1 sampai 5 murid. Pembuatan token membutuhkan persetujuan aksi terstruktur.",
      locator: "docs/operations/zyra-ops-runbooks.md#kapasitas-kuota",
      version: 1,
      status: "active",
    };

    await vectorProvider.upsert({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vectors: [
        {
          id: mockChunk.vectorId,
          values: new Array(768).fill(0.05),
          metadata: {
            namespace: "admin_ops_knowledge",
            entityType: "admin_document",
            entityId: mockSource.id,
            version: 1,
            status: "active",
            accessClass: "admin",
            language: "id",
            profileId: CANONICAL_VECTOR_PROFILE.id,
            contentHash: mockChunk.contentHash,
          },
        },
      ],
    });
  });

  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  // ==========================================================================
  // Flow 1: Knowledge-Grounded Query & Citation Card Contract
  // ==========================================================================
  describe("Flow 1: Knowledge-Grounded Query & Verified Citations", () => {
    it("retrieves knowledge chunks, executes tool safely, and produces valid citation contract", async () => {
      const toolResult = await executeOpsAiTool(
        "retrieve_admin_knowledge",
        { query: "Batas kuota kapasitas token kelompok" },
        {
          actorId: "admin-super-1",
          callerRole: "admin",
          vectorProvider,
          embeddingAdapter,
          mockHydrationCatalog: {
            sources: [mockSource],
            chunks: [mockChunk],
          },
        }
      );

      expect(toolResult.summary).toContain("Ditemukan 1 sumber dokumentasi relevan");
      expect(toolResult.citations).toBeDefined();
      expect(toolResult.citations!.length).toBeGreaterThan(0);

      const citation = toolResult.citations![0];
      const parsedCitation = OpsAiCitationSchema.safeParse(citation);
      expect(parsedCitation.success).toBe(true);
      expect(citation.source).toBe("semantic-rag");
      expect(citation.availability).toBe("available");
      expect(citation.title).toBe("SOP Operasional Token Aktivasi Zyx");
      expect(citation.snippet).toContain("Batas kapasitas kuota token");
      expect(citation.filePath).toContain("docs/operations/zyra-ops-runbooks.md");
    });

    it("verifies runtime response stream outputs SSE format cleanly without raw prompt leaks", async () => {
      // Mock model stream to respond cleanly
      setOpsAiModelStreamMock(async function* () {
        yield {
          type: "text-delta",
          textDelta: "Berdasarkan SOP Zyx Academy, kuota kelompok berkisar antara 1 hingga 5 murid.",
        };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [
          {
            role: "user",
            content: "Bagaimana SOP pembuatan token kelompok di Zyx Academy?",
          },
        ],
      });

      expect(response).toBeDefined();
      expect(response.headers.get("Content-Type")).toContain("text/event-stream");

      const text = await response.text();
      // Verifies SSE text streaming contains text delta and no secret leaks
      expect(text).toContain("Berdasarkan SOP Zyx Academy");
      expect(text).not.toContain("apiKey");
      expect(text).not.toContain("GEMINI_API_KEY");
    });
  });

  // ==========================================================================
  // Flow 2: Structured Proposal Creation & Two-Phase Mutation Execution
  // ==========================================================================
  describe("Flow 2: Proposal Lifecycle & Tamper-Proof Execution", () => {
    it("creates structured proposal in server store and executes via /api/admin/ops-ai/execute", async () => {
      // Step 1: Tool propose_create_token generates validated proposal in store
      const toolResult = await executeOpsAiTool(
        "propose_create_token",
        {
          courseIds: "kalkulus-1, fisika-dasar",
          capacity: "5",
          packageType: "reguler_15",
        },
        {
          callerRole: "admin",
          actorId: "admin-operator-1",
        }
      );

      expect(toolResult.proposal).toBeDefined();
      const proposal = toolResult.proposal!;

      // Validate proposal schema
      const parsedProposal = OpsAiActionProposalV2Schema.safeParse(proposal);
      expect(parsedProposal.success).toBe(true);
      expect(proposal.type).toBe("create_token");
      expect(proposal.status).toBe("pending");
      expect(proposal.preview.summary).toContain("kalkulus-1");

      // Verify server proposal store has the proposal
      const stored = await proposalStore.getProposal(proposal.id);
      expect(stored).toBeDefined();
      expect(stored!.status).toBe("pending");

      // Step 2: Execute via HTTP endpoint /api/admin/ops-ai/execute with authenticated admin
      mockSessionUser = { id: "admin-operator-1", role: "admin", email: "operator@zyx.edu" };
      mockHasPeranAdmin = true;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Strict invariant: only proposalId sent!
        body: JSON.stringify({ proposalId: proposal.id }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.proposalId).toBe(proposal.id);
      expect(data.result).toBeDefined();
      expect(data.result.token).toBeDefined();
      expect(data.result.token).toContain("Zyx-INT-");

      // Verify proposal state transitioned to 'executed' in store
      const executedProposal = await proposalStore.getProposal(proposal.id);
      expect(executedProposal!.status).toBe("executed");
      expect(executedProposal!.executedAt).toBeDefined();
    });

    it("enforces idempotency: re-executing already executed proposal returns previous result safely", async () => {
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-idem-1",
        stepId: "step-idem-1",
        type: "create_token",
        title: "Pembuatan Token Ulang",
        description: "Uji idempotensi eksekusi",
        payload: { courseIds: ["kalkulus-1"], capacity: 3, packageType: "reguler_15" },
        preview: { summary: "Pembuatan token kalkulus-1 kuota 3" },
        preconditions: { version: 1, stateFingerprint: "courses:kalkulus-1:active" },
        actorId: "admin-idempotent-1",
      });

      const firstExec = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-idempotent-1",
        idempotencyKey: "idem-key-123",
      });
      expect(firstExec.success).toBe(true);

      // Re-execution with same idempotency key returns idempotent cached success
      const secondExec = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-idempotent-1",
        idempotencyKey: "idem-key-123",
      });
      expect(secondExec.success).toBe(true);
      expect(secondExec.idempotent).toBe(true);
      expect(secondExec.result).toEqual(firstExec.result);
    });
  });

  // ==========================================================================
  // Flow 3: Tampering Prevention & Strict RBAC Enforcement
  // ==========================================================================
  describe("Flow 3: Security Boundaries, RBAC, & Anti-Tampering", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      mockSessionUser = null;
      mockHasPeranAdmin = false;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-unauth-test" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("rejects non-admin role (e.g. murid or tutor) with 403 Forbidden", async () => {
      mockSessionUser = { id: "murid-user-1", role: "murid", email: "student@zyx.edu" };
      mockHasPeranAdmin = false;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-student-tamper" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("rejects forged parameters: server relies exclusively on server-stored data", async () => {
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-tamper-1",
        stepId: "step-tamper-1",
        type: "create_token",
        title: "Proposal Asli",
        description: "Kapasitas 1",
        payload: { courseIds: ["kalkulus-1"], capacity: 1, packageType: "reguler_15" },
        preview: { summary: "Kapasitas 1" },
        preconditions: { version: 1, stateFingerprint: "courses:kalkulus-1:active" },
        actorId: "admin-auth-1",
      });

      mockSessionUser = { id: "admin-auth-1", role: "admin", email: "admin@zyx.edu" };
      mockHasPeranAdmin = true;

      // Attacker sends forged payload parameters in request body
      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: publicProposal.id,
          payload: { capacity: 9999, courseIds: ["semua-mata-kuliah"] },
          params: { capacity: 9999 },
        }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      const executed = await proposalStore.getProposal(publicProposal.id);
      // Stored payload capacity remains 1; forged parameter 9999 is completely ignored
      expect((executed!.payload as any).capacity).toBe(1);
    });

    it("returns 404 when executing nonexistent proposal", async () => {
      mockSessionUser = { id: "admin-user", role: "admin" };
      mockHasPeranAdmin = true;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "nonexistent-prop-xyz" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================================================
  // Flow 4: Brand Invariants & Typography Compliance
  // ==========================================================================
  describe("Flow 4: Brand Invariants & Typography Compliance", () => {
    it("strictly uses 'Zyx' brand capitalization and contains zero em-dashes or en-dashes", async () => {
      const toolResult = await executeOpsAiTool(
        "propose_create_token",
        { courseIds: "kalkulus-1", capacity: "3" },
        { actorId: "admin-brand-1", callerRole: "admin" }
      );

      const jsonStr = JSON.stringify(toolResult);
      // Invariant: No em-dash (—) or en-dash (–)
      expect(jsonStr).not.toContain("—");
      expect(jsonStr).not.toContain("–");

      // Invariant: Strictly Zyx, never ZYX (except generated token codes like ZYX-ABCD)
      expect(jsonStr).not.toContain("ZYX ");
      expect(toolResult.proposal!.title).toBe("Buat Token Aktivasi Pendaftaran");
    });
  });
});
