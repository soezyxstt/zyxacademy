import type { ServerStoredProposal } from "@/lib/admin-ops-ai/proposal-store";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import {
  OPS_AI_TOOL_SECURITY_REGISTRY,
  assertNoModelCallableMutation,
} from "@/lib/admin-ops-ai/contracts";
import {
  assertProvenanceIntegrity,
  buildSemanticRagCitation,
} from "@/lib/admin-ops-ai/citations";

// ============================================================================
// Auth & Header Mocks for Route Invariant Verification
// ============================================================================

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let proposalStore: typeof import("@/lib/admin-ops-ai/proposal-store").proposalStore;
let executeOpsAiTool: typeof import("@/lib/admin-ops-ai/runtime-tools").executeOpsAiTool;
let executeRoutePost: typeof import("@/app/api/admin/ops-ai/execute/route").POST;
let createOpsAiTools: typeof import("@/lib/admin-ops-ai/runtime-tools").createOpsAiTools;

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

const originalAuthorization = await import("@/lib/auth/authorization");
mock.module("@/lib/auth/authorization", () => ({
  ...originalAuthorization,
  hasPeran: async (_userId: string, role: string) => {
    if (role === "admin") return mockHasPeranAdmin;
    return false;
  },
  hasAnyPeran: async () => mockHasPeranAdmin,
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));


// ============================================================================
// Test Suites: Architecture & Security Invariants
// ============================================================================

describe("Admin Ops AI Security Invariants (Architecture Baseline)", () => {
  beforeAll(async () => {
    const fixture = await createPostgresTestDb();
    client = fixture.client;
    const testDb = fixture.testDb;
    const now = new Date();
    const actors = ["admin-1", "admin-2"];
    await testDb.insert(schema.user).values(actors.map((id) => ({ id, name: id, email: `${id}@example.test`, role: "admin", createdAt: now, updatedAt: now })));
    await testDb.insert(schema.pengguna).values(actors.map(id => ({ id, status: "active" as const })));
    await testDb.insert(schema.courses).values(["kalkulus-1", "kalk-1", "fisika-dasar"].map((id) => ({ id, title: id, category: "Test" })));
    mock.module("@/db", () => ({ db: testDb }));
    ({ proposalStore } = await import("@/lib/admin-ops-ai/proposal-store"));
    ({ executeOpsAiTool, createOpsAiTools } = await import("@/lib/admin-ops-ai/runtime-tools"));
    ({ POST: executeRoutePost } = await import("@/app/api/admin/ops-ai/execute/route"));
  }, 60000);

  afterAll(async () => { await client?.close(); });

  beforeEach(() => {
    proposalStore.clear();
    mockSessionUser = null;
    mockHasPeranAdmin = false;
  });

  // ==========================================================================
  // Invariant 1: Model Cannot Obtain Executable Mutation Tool
  // ==========================================================================
  describe("Invariant 1: Zero Direct Mutation for Model-Visible Tools", () => {
    it("guarantees every model-callable tool in the registry strictly disallows mutation", () => {
      for (const [name, toolDef] of Object.entries(OPS_AI_TOOL_SECURITY_REGISTRY)) {
        if (toolDef.isModelCallable) {
          expect(toolDef.allowsMutation).toBe(false);
          expect(toolDef.toolClass).not.toBe("confirmation-executor");
          expect(toolDef.toolClass).not.toBe("autonomous-mutation");
          expect(["read-only", "retrieval", "proposal-only"]).toContain(toolDef.toolClass);
        }
      }
    });

    it("ensures assertNoModelCallableMutation does not throw for current registry", () => {
      expect(() => assertNoModelCallableMutation(OPS_AI_TOOL_SECURITY_REGISTRY)).not.toThrow();
    });

    it("guarantees createOpsAiTools only exposes tools that cannot perform direct mutations", () => {
      const tools = createOpsAiTools({ callerRole: "admin", actorId: "admin-1" });
      // execute_confirmed_proposal must NEVER be in model tools
      expect((tools as any).execute_confirmed_proposal).toBeUndefined();
    });
  });

  // ==========================================================================
  // Invariant 2: Model Cannot Execute Proposal
  // ==========================================================================
  describe("Invariant 2: Proposal Execution is Server-Side Human-Confirmed Only", () => {
    it("ensures execute_confirmed_proposal is not model-callable", () => {
      const execTool = OPS_AI_TOOL_SECURITY_REGISTRY.execute_confirmed_proposal;
      expect(execTool).toBeDefined();
      expect(execTool.isModelCallable).toBe(false);
      expect(execTool.requiresHumanConfirmation).toBe(true);
      expect(execTool.allowsMutation).toBe(true);
    });

    it("rejects invoking execute_confirmed_proposal through executeOpsAiTool directly", async () => {
      expect(
        executeOpsAiTool("execute_confirmed_proposal", { proposalId: "prop-test" })
      ).rejects.toThrow("tidak diizinkan");
    });
  });

  // ==========================================================================
  // Invariant 3: Browser Never Sends Mutation Payload
  // ==========================================================================
  describe("Invariant 3: Browser Mutation Payload Rejection", () => {
    it("strictly rejects or ignores browser-supplied executable payloads", async () => {
      mockSessionUser = { id: "admin-1", role: "admin" };
      mockHasPeranAdmin = true;

      let executedPayload: any = null;
      proposalStore.registerActionExecutor("create_token", async (payload) => {
        executedPayload = payload;
        return { success: true, result: { token: "GEN_123" } };
      });

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Test Proposal",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        actorId: "admin-1",
      });

      // Attacker tries to inject forged capacity and courses in POST body
      const req = new Request("http://localhost/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: storedProposal.id,
          payload: { courseIds: ["hacked-course"], capacity: 99999 },
          params: { courseIds: ["hacked-course"], capacity: 99999 },
        }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(200);
      expect(executedPayload).toEqual({ courseIds: ["kalkulus-1"], capacity: 5 });
      expect(executedPayload.capacity).toBe(5);
    });
  });

  // ==========================================================================
  // Invariant 4: Proposal Replay Prevention & Idempotency
  // ==========================================================================
  describe("Invariant 4: Replay Protection & Idempotent Execution", () => {
    it("guarantees a proposal cannot be executed twice with double mutation", async () => {
      mockSessionUser = { id: "admin-1", role: "admin" };
      mockHasPeranAdmin = true;

      let executionCount = 0;
      proposalStore.registerActionExecutor("create_token", async () => {
        executionCount++;
        return { success: true, result: { token: `TOKEN_${executionCount}` } };
      });

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Replay Test",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalk-1"], capacity: 5 },
        actorId: "admin-1",
      });

      // First execution
      const res1 = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-1",
      });
      expect(res1.success).toBe(true);
      expect(res1.result?.token).toBe("TOKEN_1");
      expect(executionCount).toBe(1);

      // Duplicate execution (e.g. double click or network replay)
      const res2 = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-1",
      });
      expect(res2.success).toBe(true);
      expect(res2.idempotent).toBe(true);
      expect(res2.result?.token).toBe("TOKEN_1");
      expect(executionCount).toBe(1); // Downstream mutation did NOT run again
    });
  });

  // ==========================================================================
  // Invariant 5: Stale and Expired Proposal Rejection
  // ==========================================================================
  describe("Invariant 5: Stale Preconditions & Expiry Rejection", () => {
    it("rejects execution when proposal is expired", async () => {
      mockSessionUser = { id: "admin-1", role: "admin" };
      mockHasPeranAdmin = true;

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Expiry Test",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalk-1"], capacity: 5 },
        actorId: "admin-1",
        ttlMinutes: 10,
      });

      // Execute after TTL expires
      const res = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-1",
        currentTimeMs: storedProposal.expiresAt + 1000,
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe("PROPOSAL_REPLAY_DETECTED");
    });

    it("rejects execution when preconditions are stale", async () => {
      mockSessionUser = { id: "admin-1", role: "admin" };
      mockHasPeranAdmin = true;

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Precondition Test",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalk-1"], capacity: 5 },
        actorId: "admin-1",
        preconditions: {
          version: 1,
          entitySnapshots: [{ entityType: "course", entityId: "kalk-1", fingerprint: "hash_v1" }],
        },
      });

      const res = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-1",
        livePreconditionMatch: false, // Target entity fingerprint has changed in DB
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe("STALE_PRECONDITION");
    });
  });

  // ==========================================================================
  // Invariant 6: Actor Binding & Authorization Enforced
  // ==========================================================================
  describe("Invariant 6: Actor Binding and Role Authorization", () => {
    it("rejects execution if actor is not the administrator who created the proposal", async () => {
      mockSessionUser = { id: "admin-2", role: "admin" };
      mockHasPeranAdmin = true;

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Actor Binding Test",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalk-1"], capacity: 5 },
        actorId: "admin-1", // Created by Admin 1
      });

      // Admin 2 tries to execute Admin 1's proposal
      const res = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-2", // Mismatched actor
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe("FORBIDDEN");
      expect(res.error).toContain("pembuat proposal");
    });

    it("allows execution when actor matches creator", async () => {
      mockSessionUser = { id: "admin-1", role: "admin" };
      mockHasPeranAdmin = true;

      proposalStore.registerActionExecutor("create_token", async () => ({
        success: true,
        result: { token: "MATCH_OK" },
      }));

      const { storedProposal } = await proposalStore.createProposal({
        runId: "run-1",
        stepId: "step-1",
        type: "create_token",
        title: "Actor Match Test",
        description: "Test",
        preview: { summary: "Test", targetEntity: "course-1" },
        payload: { courseIds: ["kalk-1"], capacity: 5 },
        actorId: "admin-1",
      });

      const res = await proposalStore.executeProposal({
        proposalId: storedProposal.id,
        actorId: "admin-1",
      });

      expect(res.success).toBe(true);
    });

    it("rejects unauthenticated and non-admin requests at route boundary", async () => {
      mockSessionUser = null;
      mockHasPeranAdmin = false;

      const req401 = new Request("http://localhost/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-123" }),
      });
      const res401 = await executeRoutePost(req401);
      expect(res401.status).toBe(401);

      mockSessionUser = { id: "student-1", role: "student" };
      mockHasPeranAdmin = false;

      const req403 = new Request("http://localhost/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-123" }),
      });
      const res403 = await executeRoutePost(req403);
      expect(res403.status).toBe(403);
    });
  });

  // ==========================================================================
  // Invariant 7: Citation Provenance Integrity
  // ==========================================================================
  describe("Invariant 7: Citation Provenance Integrity", () => {
    it("strictly forbids non-retrieval tools from forging semantic-rag provenance", () => {
      // Non-retrieval tool claiming semantic-rag must throw
      expect(() => assertProvenanceIntegrity("search_users", "semantic-rag")).toThrow(
        "Security Violation"
      );
      expect(() => assertProvenanceIntegrity("inspect_schema", "semantic-rag")).toThrow(
        "Security Violation"
      );
    });

    it("requires retrieve_admin_knowledge to strictly use semantic-rag provenance", () => {
      expect(() => assertProvenanceIntegrity("retrieve_admin_knowledge", "semantic-rag")).not.toThrow();
      expect(() => assertProvenanceIntegrity("retrieve_admin_knowledge", "database-read")).toThrow(
        "Provenance Violation"
      );
    });
  });
});
