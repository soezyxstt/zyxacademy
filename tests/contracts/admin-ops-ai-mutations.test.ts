import type { ServerStoredProposal, OpsAiMutationAuditRecord } from "@/lib/admin-ops-ai/proposal-store";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  setOpsAiModelStreamMock,
} from "@/lib/admin-ops-ai/model-factory";
import {
  OPS_AI_TOOL_SECURITY_REGISTRY,
  OPS_AI_POLICY_BOUNDS,
  assertNoModelCallableMutation,
  validateOpsAiProposal,
  containsSecretLikePattern,
  type OpsAiActionProposalV2,
  type OpsAiWorkStep,
} from "@/lib/admin-ops-ai/contracts";

// ============================================================================
// Auth & Header Mocks for Next.js Route Testing
// ============================================================================

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let proposalStore: typeof import("@/lib/admin-ops-ai/proposal-store").proposalStore;
let executeOpsAiTool: typeof import("@/lib/admin-ops-ai/runtime-tools").executeOpsAiTool;
let executeRoutePost: typeof import("@/app/api/admin/ops-ai/execute/route").POST;
let createOpsAiTools: typeof import("@/lib/admin-ops-ai/runtime-tools").createOpsAiTools;
let createOpsAiRuntimeResponse: typeof import("@/lib/admin-ops-ai/runtime").createOpsAiRuntimeResponse;
let computeProposalDiffHash: typeof import("@/lib/admin-ops-ai/proposal-store").computeProposalDiffHash;
let VALID_PROPOSAL_TRANSITIONS: typeof import("@/lib/admin-ops-ai/proposal-store").VALID_PROPOSAL_TRANSITIONS;

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
// Helper to parse SSE stream events
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

// ============================================================================
// Test Suites: Checkpoint 5 Mutations & Proposal Hardening
// ============================================================================

describe("Admin Ops AI Mutations - CP5 Server-Stored Proposal & Hardened Executor", () => {
  beforeAll(async () => {
    const fixture = await createPostgresTestDb();
    client = fixture.client;
    const testDb = fixture.testDb;
    const now = new Date();
    const actors = ["admin", "admin-1", "admin-101", "admin-user-42", "user-admin-1", "super-admin-777", "admin-actor-42", "admin-academic-1"];
    await testDb.insert(schema.user).values(actors.map((id) => ({ id, name: id, email: `${id}@example.test`, role: "admin" as const, createdAt: now, updatedAt: now })));
    await testDb.insert(schema.pengguna).values(actors.map(id => ({ id, status: "active" as const })));
    // Preserve the legacy category value used by this fixture.
    await testDb.insert(schema.courses).values(["kalkulus-1", "kalk-1", "fisika-dasar"].map((id) => ({ id, title: id, category: "Test" as typeof schema.courses.$inferInsert.category })));
    mock.module("@/db", () => ({ db: testDb }));
    ({ proposalStore, computeProposalDiffHash, VALID_PROPOSAL_TRANSITIONS } = await import("@/lib/admin-ops-ai/proposal-store"));
    ({ executeOpsAiTool, createOpsAiTools } = await import("@/lib/admin-ops-ai/runtime-tools"));
    ({ createOpsAiRuntimeResponse } = await import("@/lib/admin-ops-ai/runtime"));
    ({ POST: executeRoutePost } = await import("@/app/api/admin/ops-ai/execute/route"));
  }, 60000);

  afterAll(async () => { await client?.close(); });

  beforeEach(() => {
    proposalStore.clear();
    mockSessionUser = null;
    mockHasPeranAdmin = false;
  });

  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  // ==========================================================================
  // Suite 1: Zero Side-Effect Before Admin Confirmation (Proposal Boundary)
  // ==========================================================================
  describe("Suite 1: Zero Side-Effect Before Admin Confirmation", () => {
    it("propose_create_token produces server-stored proposal with opaque ID and non-authoritative preview", async () => {
      let mutationExecuted = false;
      proposalStore.registerActionExecutor("create_token", async () => {
        mutationExecuted = true;
        return { success: true, result: { token: "SHOULD_NOT_EXECUTE" } };
      });

      const toolResult = await executeOpsAiTool("propose_create_token", {
        courseIds: "kalkulus-1, fisika-dasar",
        capacity: "4",
        packageType: "reguler_15",
      });

      // 1. Tool execution result checks
      expect(toolResult.summary).toContain("Proposal pembuatan token telah disiapkan");
      expect(toolResult.proposal).toBeDefined();

      const publicProposal = toolResult.proposal!;
      expect(publicProposal.id).toMatch(/^prop-[0-9a-f-]+$/);
      expect(publicProposal.type).toBe("create_token");
      expect(publicProposal.status).toBe("pending");
      expect(publicProposal.title).toBe("Buat Token Aktivasi Pendaftaran");

      // 2. Browser isolation: raw executable params are NOT present in public proposal
      expect((publicProposal as any).params).toBeUndefined();
      expect((publicProposal as any).payload).toBeUndefined();

      // 3. Preview checks
      expect(publicProposal.preview.summary).toContain("1 token pendaftaran");
      expect(publicProposal.preview.targetEntity).toBe("kalkulus-1, fisika-dasar");
      expect(publicProposal.preview.fields?.length).toBe(3);

      // 4. Server-side authoritative storage check
      const stored = await proposalStore.getProposal(publicProposal.id);
      expect(stored).not.toBeNull();
      expect(stored?.payload).toEqual({
        courseIds: ["kalkulus-1", "fisika-dasar"],
        capacity: 4,
        packageType: "reguler_15",
      });

      // 5. Zero mutation side-effect check: executor was NEVER called
      expect(mutationExecuted).toBe(false);
    });

    it("verifies security classification: propose_create_token is proposal-only and allowsMutation=false", () => {
      const toolDef = OPS_AI_TOOL_SECURITY_REGISTRY["propose_create_token"];
      expect(toolDef).toBeDefined();
      expect(toolDef.toolClass).toBe("proposal-only");
      expect(toolDef.isModelCallable).toBe(true);
      expect(toolDef.allowsMutation).toBe(false);
      expect(toolDef.requiresHumanConfirmation).toBe(true);
      expect(toolDef.requiredRole).toBe("admin");
    });

    it("verifies security classification: execute_confirmed_proposal is not model-callable", () => {
      const executorDef = OPS_AI_TOOL_SECURITY_REGISTRY["execute_confirmed_proposal"];
      expect(executorDef).toBeDefined();
      expect(executorDef.toolClass).toBe("confirmation-executor");
      expect(executorDef.isModelCallable).toBe(false);
      expect(executorDef.allowsMutation).toBe(true);
      expect(executorDef.requiresHumanConfirmation).toBe(true);
    });

    it("associates proposal with actorId passed via toolContext", async () => {
      const toolResult = await executeOpsAiTool(
        "propose_create_token",
        {
          courseIds: "kalkulus-1",
          capacity: "3",
        },
        {
          actorId: "super-admin-777",
          callerRole: "admin",
        }
      );

      expect(toolResult.proposal).toBeDefined();
      const stored = await proposalStore.getProposal(toolResult.proposal!.id);
      expect(stored?.actorId).toBe("super-admin-777");
    });

    it("persists proposal and recovers via getProposal with hermetic fallback", async () => {
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-persist-test",
        stepId: "step-persist-test",
        type: "create_token",
        title: "Persist Test",
        description: "Persist test description",
        preview: { summary: "Persist preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        actorId: "admin-actor-42",
      });

      proposalStore.clearInMemoryCacheOnly();
      const stored = await proposalStore.getProposal(publicProposal.id);
      expect(stored).not.toBeNull();
      expect(stored?.actorId).toBe("admin-actor-42");
      expect(stored?.id).toBe(publicProposal.id);
    });

    it("creates batch_create_chapters proposal with browser parameter isolation", async () => {
      const toolResult = await executeOpsAiTool(
        "propose_batch_create_chapters",
        {
          courseId: "kalkulus-1",
          chapters: [
            { title: "Bab 1 Limit dan Kontinuitas", orderIndex: 1 },
            { title: "Bab 2 Turunan Fungsi", orderIndex: 2 },
          ],
        },
        { actorId: "admin-academic-1", callerRole: "admin" }
      );

      expect(toolResult.summary).toContain("Proposal pembuatan 2 bab materi telah disiapkan");
      expect(toolResult.proposal).toBeDefined();

      const prop = toolResult.proposal!;
      expect(prop.type).toBe("batch_create_chapters");
      expect(prop.status).toBe("pending");
      expect(prop.preview.summary).toContain("Pembuatan 2 bab materi untuk mata kuliah 'kalkulus-1'");
      expect(prop.preview.fields?.some((f) => f.label === "Jumlah Bab" && f.value === "2 bab")).toBe(true);

      // Verify browser isolation: payload not on public proposal
      expect((prop as any).payload).toBeUndefined();

      // Verify stored server payload
      const stored = await proposalStore.getProposal(prop.id);
      expect(stored).not.toBeNull();
      expect((stored?.payload as any)?.courseId).toBe("kalkulus-1");
      expect((stored?.payload as any)?.chapters?.length).toBe(2);
    });

    it("creates bulk_update_materials proposal with browser parameter isolation", async () => {
      const toolResult = await executeOpsAiTool(
        "propose_bulk_update_materials",
        {
          materialIds: ["mat-1", "mat-2"],
          patch: {
            year: 2025,
            subcategory: "modul",
          },
        },
        { actorId: "admin-academic-1", callerRole: "admin" }
      );

      expect(toolResult.summary).toContain("Proposal pembaruan metadata 2 berkas materi telah disiapkan");
      expect(toolResult.proposal).toBeDefined();

      const prop = toolResult.proposal!;
      expect(prop.type).toBe("bulk_update_materials");
      expect(prop.status).toBe("pending");
      expect(prop.preview.summary).toContain("Pembaruan metadata untuk 2 berkas materi");
      expect((prop as any).payload).toBeUndefined();

      const stored = await proposalStore.getProposal(prop.id);
      expect(stored).not.toBeNull();
      expect((stored?.payload as any)?.materialIds).toEqual(["mat-1", "mat-2"]);
      expect((stored?.payload as any)?.patch?.year).toBe(2025);
    });
  });

  // ==========================================================================
  // Suite 2: Execute Endpoint Authorization & Admin Role Enforcement
  // ==========================================================================
  describe("Suite 2: Execute Endpoint Authorization & Admin Role Enforcement", () => {
    it("rejects unauthenticated requests on /api/admin/ops-ai/execute with 401 UNAUTHORIZED", async () => {
      mockSessionUser = null;
      mockHasPeranAdmin = false;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-test-1" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("rejects non-admin role (e.g. student/tutor) on /api/admin/ops-ai/execute with 403 FORBIDDEN", async () => {
      mockSessionUser = { id: "user-student-1", role: "student", email: "student@zyx.edu" };
      mockHasPeranAdmin = false;

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-test-1" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("accepts authenticated admin session on /api/admin/ops-ai/execute", async () => {
      mockSessionUser = { id: "user-admin-1", role: "admin", email: "admin@zyx.edu" };
      mockHasPeranAdmin = true;

      // Create a valid proposal in store
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-auth-test",
        stepId: "step-auth-test",
        type: "create_token",
        title: "Test Proposal",
        description: "Test description",
        preview: { summary: "Test preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 3 },
      });

      // Mock action executor to avoid external calls
      proposalStore.registerActionExecutor("create_token", async () => ({
        success: true,
        result: { token: "Zyx-AUTH-OK-3-1", link: "/register?token=Zyx-AUTH-OK-3-1" },
      }));

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.proposalId).toBe(publicProposal.id);
      expect(json.result.token).toBe("Zyx-AUTH-OK-3-1");
    });

    it("rejects request when session has role admin but hasPeran returns false (strictly forbids role bypass)", async () => {
      // Attacker has role: "admin" in session object (e.g. forged cookie/JWT claim)
      mockSessionUser = { id: "attacker-user-1", role: "admin", email: "attacker@zyx.edu" };
      // But canonical hasPeran check returns false (not in database role table)
      mockHasPeranAdmin = false;

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-bypass-test",
        stepId: "step-bypass-test",
        type: "create_token",
        title: "Bypass Test",
        description: "Bypass test description",
        preview: { summary: "Bypass preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 3 },
      });

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================================================
  // Suite 3: Browser-Supplied Forged Payload Rejection & Server Lookup
  // ==========================================================================
  describe("Suite 3: Browser-Supplied Forged Payload Rejection & Server-Side Lookup", () => {
    beforeEach(() => {
      mockSessionUser = { id: "admin-101", role: "admin" };
      mockHasPeranAdmin = true;
    });

    it("rejects request missing proposalId parameter with 400 INVALID_REQUEST", async () => {
      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    it("rejects non-existent proposal ID with 404 NOT_FOUND", async () => {
      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: "prop-phantom-non-existent" }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.code).toBe("NOT_FOUND");
    });

    it("strictly ignores browser-supplied forged execution parameters and uses server payload", async () => {
      let executedPayload: any = null;
      proposalStore.registerActionExecutor("create_token", async (payload) => {
        executedPayload = payload;
        return { success: true, result: { token: "Zyx-SAFE-TOKEN" } };
      });

      // Legitimate proposal on server: 1 course, capacity 2
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-safe",
        stepId: "step-safe",
        type: "create_token",
        title: "Legitimate Proposal",
        description: "Legitimate description",
        preview: { summary: "Legitimate preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 2, packageType: "reguler_15" },
      });

      // Attacker tries to send altered courseIds and capacity in request body
      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: publicProposal.id,
          // Attacker payload attempts
          courseIds: ["unauthorized-admin-course", "secret-exam"],
          capacity: 999,
          packageType: "vip_unlimited",
        }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(200);

      // Verify server executed authoritative stored payload, completely ignoring attacker parameters
      expect(executedPayload).toEqual({
        courseIds: ["kalkulus-1"],
        capacity: 2,
        packageType: "reguler_15",
      });
    });

    it("rejects legacy client-supplied proposal payload without server-stored proposal", async () => {
      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: {
            id: "legacy-client-prop",
            type: "create_token",
            params: { courseIds: ["kalkulus-1"], capacity: 5 },
          },
        }),
      });

      // Without proposalId, it is rejected
      const res = await executeRoutePost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });
  });

  // ==========================================================================
  // Suite 4: Proposal Expiry (TTL) Enforcement
  // ==========================================================================
  describe("Suite 4: Proposal Expiry (TTL) Enforcement", () => {
    beforeEach(() => {
      mockSessionUser = { id: "admin-101", role: "admin" };
      mockHasPeranAdmin = true;
    });

    it("rejects execution of expired proposal with PROPOSAL_REPLAY_DETECTED", async () => {
      let executorCalled = false;
      proposalStore.registerActionExecutor("create_token", async () => {
        executorCalled = true;
        return { success: true };
      });

      // Create a proposal with negative TTL (already expired)
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-expired-test",
        stepId: "step-expired-test",
        type: "create_token",
        title: "Expired Proposal",
        description: "Expired description",
        preview: { summary: "Expired preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        ttlMinutes: -10, // Expired 10 minutes ago
      });

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("PROPOSAL_REPLAY_DETECTED");
      expect(json.error).toContain("kedaluwarsa");

      // Verify status transitioned to "expired"
      const stored = await proposalStore.getProposal(publicProposal.id);
      expect(stored?.status).toBe("expired");

      // Zero side-effect
      expect(executorCalled).toBe(false);
    });

    it("enforces default TTL policy bounds to 30 minutes", () => {
      expect(OPS_AI_POLICY_BOUNDS.proposalTtlMinutes).toBe(30);
    });
  });

  // ==========================================================================
  // Suite 5: Precondition Snapshot & Stale State Rejection
  // ==========================================================================
  describe("Suite 5: Precondition Snapshot & Stale State Rejection", () => {
    beforeEach(() => {
      mockSessionUser = { id: "admin-101", role: "admin" };
      mockHasPeranAdmin = true;
    });

    it("rejects proposal execution when target state changed (STALE_PRECONDITION) with 409 Conflict", async () => {
      let executorCalled = false;
      proposalStore.registerActionExecutor("create_token", async () => {
        executorCalled = true;
        return { success: true };
      });

      // Register precondition checker that simulates target state mutation
      proposalStore.registerPreconditionChecker("create_token", async () => {
        return false; // Live precondition mismatch
      });

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-stale-test",
        stepId: "step-stale-test",
        type: "create_token",
        title: "Stale State Proposal",
        description: "Stale state description",
        preview: { summary: "Stale state preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        preconditions: {
          version: 1,
          stateFingerprint: "courses:kalkulus-1:active",
        },
      });

      const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res = await executeRoutePost(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("STALE_PRECONDITION");
      expect(json.error).toContain("Target state changed");

      // Proposal status remains pending (not executed)
      const stored = await proposalStore.getProposal(publicProposal.id);
      expect(stored?.status).toBe("pending");

      // Zero side-effect
      expect(executorCalled).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 6: Replay Protection & Idempotent Duplicate Confirmation
  // ==========================================================================
  describe("Suite 6: Replay Protection & Idempotent Duplicate Confirmation", () => {
    beforeEach(() => {
      mockSessionUser = { id: "admin-101", role: "admin" };
      mockHasPeranAdmin = true;
    });

    it("executes proposal on first confirmation and returns idempotent cached result on duplicate confirmation", async () => {
      let executionCount = 0;
      proposalStore.registerActionExecutor("create_token", async (payload) => {
        executionCount++;
        return {
          success: true,
          result: {
            token: `Zyx-TEST-${executionCount}`,
            link: `/register?token=Zyx-TEST-${executionCount}`,
            capacity: (payload as any).capacity,
          },
        };
      });

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-idempotency-test",
        stepId: "step-idempotency-test",
        type: "create_token",
        title: "Idempotent Proposal",
        description: "Idempotent description",
        preview: { summary: "Idempotent preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 4 },
      });

      // 1. First confirmation submission
      const req1 = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res1 = await executeRoutePost(req1);
      expect(res1.status).toBe(200);

      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.result.token).toBe("Zyx-TEST-1");
      expect(executionCount).toBe(1);

      // 2. Second confirmation submission (duplicate confirmation / network retry)
      const req2 = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: publicProposal.id }),
      });

      const res2 = await executeRoutePost(req2);
      expect(res2.status).toBe(200);

      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.idempotent).toBe(true);
      // Returns exactly the same token, executor was NOT called again
      expect(json2.result.token).toBe("Zyx-TEST-1");
      expect(executionCount).toBe(1);
    });

    it("prevents duplicate execution of already executed proposal at store layer", async () => {
      let callCount = 0;
      proposalStore.registerActionExecutor("create_token", async () => {
        callCount++;
        return { success: true, result: { token: "TOKEN-ONCE" } };
      });

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-store-replay",
        stepId: "step-store-replay",
        type: "create_token",
        title: "Store Replay Test",
        description: "Store replay description",
        preview: { summary: "Store replay preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
      });

      const firstExec = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-1",
      });
      expect(firstExec.success).toBe(true);
      expect(callCount).toBe(1);

      const secondExec = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-1",
      });
      expect(secondExec.success).toBe(true);
      expect(secondExec.idempotent).toBe(true);
      expect(secondExec.result?.token).toBe("TOKEN-ONCE");
      // Call count remains strictly 1!
      expect(callCount).toBe(1);
    });
  });

  // ==========================================================================
  // Suite 7: Partial Failure, Error Recovery, and Retry Handling
  // ==========================================================================
  describe("Suite 7: Partial Failure, Error Recovery, and Retry Handling", () => {
    it("transitions proposal to failed status when downstream executor fails", async () => {
      proposalStore.registerActionExecutor("create_token", async () => ({
        success: false,
        error: "Koneksi basis data terputus saat membuat grup.",
      }));

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-fail-test",
        stepId: "step-fail-test",
        type: "create_token",
        title: "Failure Test Proposal",
        description: "Failure test description",
        preview: { summary: "Failure test preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
      });

      const result = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-1",
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("TOOL_EXECUTION_FAILED");
      expect(result.error).toContain("Koneksi basis data terputus");

      const stored = await proposalStore.getProposal(publicProposal.id);
      expect(stored?.status).toBe("failed");
      expect(stored?.failureReason).toContain("Koneksi basis data terputus");
    });

    it("allows retry of a failed proposal after transient failure is resolved", async () => {
      let attempts = 0;
      proposalStore.registerActionExecutor("create_token", async () => {
        attempts++;
        if (attempts === 1) {
          return { success: false, error: "Transient failure" };
        }
        return { success: true, result: { token: "Zyx-RETRY-SUCCESS" } };
      });

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-retry-test",
        stepId: "step-retry-test",
        type: "create_token",
        title: "Retry Test Proposal",
        description: "Retry test description",
        preview: { summary: "Retry test preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
      });

      // First attempt fails
      const first = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-1",
      });
      expect(first.success).toBe(false);

      // Status reset / retry attempt succeeds
      await proposalStore.transitionStatus(publicProposal.id, "pending");
      const retry = await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-1",
      });
      expect(retry.success).toBe(true);
      expect(retry.result?.token).toBe("Zyx-RETRY-SUCCESS");
    });
  });

  // ==========================================================================
  // Suite 8: Audit Trail Record Shape & Minimum PII Specification
  // ==========================================================================
  describe("Suite 8: Audit Trail Record Shape & Minimum PII Specification", () => {
    it("records structured audit trail with minimal PII and zero secrets/prompts", async () => {
      proposalStore.registerActionExecutor("create_token", async () => ({
        success: true,
        result: { token: "Zyx-AUDIT-123" },
      }));

      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-audit-spec",
        stepId: "step-audit-spec",
        type: "create_token",
        title: "Audit Spec Proposal",
        description: "Audit spec description",
        preview: { summary: "Audit spec preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
      });

      await proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: "admin-user-42",
      });

      const auditRecords = proposalStore.getAuditRecords(publicProposal.id);
      expect(auditRecords.length).toBeGreaterThanOrEqual(1);

      const record: OpsAiMutationAuditRecord = auditRecords[auditRecords.length - 1];

      // 1. Mandatory audit fields check
      expect(record.id).toMatch(/^audit-[0-9a-f-]+$/);
      expect(record.actorId).toBe("admin-user-42");
      expect(record.proposalId).toBe(publicProposal.id);
      expect(record.actionType).toBe("create_token");
      expect(record.diffHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.timestamp).toBeGreaterThan(0);
      expect(record.status).toBe("executed");
      expect(record.outcome).toBe("success");

      // 2. Minimum PII & Zero Secrets check
      const recordJson = JSON.stringify(record);
      expect(containsSecretLikePattern(recordJson)).toBe(false);
      expect(recordJson).not.toContain("password");
      expect(recordJson).not.toContain("secret");
      expect(recordJson).not.toContain("fullPrompt");
      expect(recordJson).not.toContain("messages");
    });

    it("computes deterministic SHA-256 diffHash for identical proposal payloads", () => {
      const hash1 = computeProposalDiffHash({
        type: "create_token",
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        preconditions: { version: 1 },
      });

      const hash2 = computeProposalDiffHash({
        type: "create_token",
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
        preconditions: { version: 1 },
      });

      const hash3 = computeProposalDiffHash({
        type: "create_token",
        payload: { courseIds: ["fisika-dasar"], capacity: 3 },
        preconditions: { version: 1 },
      });

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ==========================================================================
  // Suite 9: Proposal Lifecycle State Transition Matrix Invariant
  // ==========================================================================
  describe("Suite 9: Proposal Lifecycle State Transition Matrix Invariant", () => {
    it("strictly follows defined proposal state transitions", () => {
      expect(VALID_PROPOSAL_TRANSITIONS.pending).toEqual(["executing", "cancelled", "expired"]);
      expect(VALID_PROPOSAL_TRANSITIONS.executing).toEqual(["executed", "failed", "pending"]);
      expect(VALID_PROPOSAL_TRANSITIONS.executed).toEqual([]);
      expect(VALID_PROPOSAL_TRANSITIONS.cancelled).toEqual([]);
      expect(VALID_PROPOSAL_TRANSITIONS.expired).toEqual([]);
    });

    it("rejects illegal transitions (e.g. executed -> executing, expired -> executing)", async () => {
      const { publicProposal } = await proposalStore.createProposal({
        runId: "run-trans-test",
        stepId: "step-trans-test",
        type: "create_token",
        title: "Transition Test",
        description: "Transition description",
        preview: { summary: "Transition preview" },
        payload: { courseIds: ["kalkulus-1"], capacity: 5 },
      });

      // pending -> executing (valid)
      await proposalStore.transitionStatus(publicProposal.id, "executing");

      // executing -> executed (valid)
      await proposalStore.transitionStatus(publicProposal.id, "executed");

      // executed -> executing (strictly forbidden)
      expect(
        proposalStore.transitionStatus(publicProposal.id, "executing")
      ).rejects.toThrow("Transisi status proposal tidak valid");
    });

    it("enforces assertNoModelCallableMutation invariant", () => {
      expect(() => assertNoModelCallableMutation()).not.toThrow();
    });
  });

  // ==========================================================================
  // Suite 10: Runtime Stream SSE Emission of Action Proposals
  // ==========================================================================
  describe("Suite 10: Runtime Stream SSE Emission of Action Proposals", () => {
    it("emits data-proposal UI stream part when propose_create_token tool is invoked", async () => {
      let callCount = 0;
      setOpsAiModelStreamMock(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: "tool-call",
            toolCall: {
              id: "call-prop-101",
              name: "propose_create_token",
              args: {
                courseIds: "kalkulus-1, fisika-dasar",
                capacity: "5",
                packageType: "reguler_15",
              },
            },
          };
          yield { type: "finish", finishReason: "tool-calls" };
        } else {
          yield { type: "text-delta", textDelta: "Saya telah menyiapkan proposal pembuatan token." };
          yield { type: "finish", finishReason: "stop" };
        }
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Buatkan token untuk kalkulus 1 dan fisika dasar kuota 5" }],
      });

      const events = await parseSseEvents(response);

      // 1. Verify tool-call part was emitted
      const toolCallPart = events.find((e) => e.type === "tool-call");
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart?.toolName).toBe("propose_create_token");

      // 2. Verify data-proposal part was emitted
      const proposalPart = events.find((e) => e.type === "data-proposal");
      expect(proposalPart).toBeDefined();

      const proposalData = proposalPart?.data as OpsAiActionProposalV2;
      expect(proposalData).toBeDefined();
      expect(proposalData.id).toMatch(/^prop-[0-9a-f-]+$/);
      expect(proposalData.type).toBe("create_token");
      expect(proposalData.status).toBe("pending");
      expect(proposalData.preview.summary).toContain("1 token pendaftaran");

      // 3. Verify proposal validates against schema contract
      const validation = validateOpsAiProposal(proposalData);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 4. Verify work-step for proposal creation transitioned queued -> running -> completed
      const workSteps = events
        .filter((e) => e.type === "data-work-step")
        .map((e) => e.data as OpsAiWorkStep);
      const propSteps = workSteps.filter((s) => s.toolName === "propose_create_token");
      expect(propSteps.length).toBeGreaterThanOrEqual(3);

      const statuses = propSteps.map((s) => s.status);
      expect(statuses).toContain("queued");
      expect(statuses).toContain("running");
      expect(statuses).toContain("completed");
    }, 15000);
  });
});
