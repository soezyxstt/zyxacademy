import { describe, it, expect, beforeEach, beforeAll, afterEach, spyOn } from "bun:test";
import {
  proposalStore,
  type ServerStoredProposal,
} from "@/lib/admin-ops-ai/proposal-store";
import {
  ZyxLanguageModel,
} from "@/lib/admin-ops-ai/zyx-language-model-adapter";
import {
  setOpsAiModelStreamMock,
  type OpsAiModelStreamChunk,
} from "@/lib/admin-ops-ai/model-factory";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { db } from "@/db";
import { user, courses, pengguna, zyraProposals } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Admin Ops AI Lifecycle and Mutation Boundary Integration Tests", () => {
  let testAdminId: string;
  let testCourseId: string;

  beforeAll(async () => {
    const [existingCourse] = await db.select({ id: courses.id }).from(courses).limit(1);
    testCourseId = existingCourse?.id ?? "calc-1";
    if (!existingCourse) await db.insert(courses).values({ id: testCourseId, title: "Lifecycle fixture", category: "Test" });

    const [existing] = await db.select({ id: user.id }).from(user).limit(1);
    if (existing) {
      testAdminId = existing.id;
    } else {
      testAdminId = "test-admin-actor";
      await db.insert(user).values({
        id: testAdminId,
        name: "Test Admin Actor",
        email: "test-admin-actor@zyx.local",
        role: "admin",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await db.insert(pengguna).values({ id: testAdminId, status: "active" }).onConflictDoNothing();
  });

  beforeEach(() => {
    proposalStore.clear();
    setOpsAiModelStreamMock(null);
  });

  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  // ==========================================================================
  // Test 1: Concurrent Proposal Execute (Atomic Race-Condition Protection)
  // ==========================================================================
  it("Test 1: concurrent proposal execute guarantees exactly 1 atomic execution and rejects race", async () => {
    let executionCount = 0;

    proposalStore.registerPreconditionChecker("create_token", () => true);
    proposalStore.registerActionExecutor("create_token", async () => {
      executionCount++;
      // Simulate asynchronous execution window
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        success: true,
        result: { token: "Zyx-CONCURRENT-SUCCESS" },
      };
    });

    const { publicProposal } = await proposalStore.createProposal({
      runId: "run-concurrent-001",
      stepId: "step-concurrent-001",
      type: "create_token",
      title: "Buat Token Konkuren",
      description: "Pengujian eksekusi proposal secara paralel",
      preview: {
        summary: "Buat token kelas paralel",
        affectedEntities: [testCourseId],
      },
      payload: { courseIds: [testCourseId], capacity: 10 },
      actorId: testAdminId,
    });

    // Fire two concurrent execution requests on the exact same proposal
    const [res1, res2] = await Promise.all([
      proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: testAdminId,
      }),
      proposalStore.executeProposal({
        proposalId: publicProposal.id,
        actorId: testAdminId,
      }),
    ]);

    // Exactly one call must succeed, and the other must be rejected
    const successes = [res1, res2].filter((r) => r.success);
    const rejections = [res1, res2].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    // The rejected request must indicate invalid state transition
    expect(rejections[0].errorCode).toBe("INVALID_REQUEST");

    // The underlying action executor must be invoked exactly once
    expect(executionCount).toBe(1);

    // Final proposal state must be executed
    const finalStored = await proposalStore.getProposal(publicProposal.id);
    expect(finalStored?.status).toBe("executed");
  });

  // ==========================================================================
  // Test 2: Real Persisted Reload from Database
  // ==========================================================================
  it("Test 2: real persisted reload restores proposal from zyra_proposals and executes successfully", async () => {
    let actionExecuted = false;

    proposalStore.registerPreconditionChecker("create_token", () => true);
    proposalStore.registerActionExecutor("create_token", async (payload: any) => {
      actionExecuted = true;
      return {
        success: true,
        result: { token: `Zyx-RELOADED-${payload.capacity}` },
      };
    });

    // 1. Create proposal and persist to DB
    const { publicProposal } = await proposalStore.createProposal({
      runId: "run-reload-001",
      stepId: "step-reload-001",
      type: "create_token",
      title: "Buat Token Persisten",
      description: "Pengujian reload proposal dari tabel zyra_proposals",
      preview: {
        summary: "Buat token ujian dari DB",
        affectedEntities: [testCourseId],
      },
      payload: { courseIds: [testCourseId], capacity: 25 },
      actorId: testAdminId,
    });

    // 2. Wipe in-memory proposal map to simulate server restart / cache loss
    proposalStore.clearInMemoryCacheOnly();

    // 3. Reload proposal via getProposal: must fetch from DB zyraProposals
    const reloaded = await proposalStore.getProposal(publicProposal.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.id).toBe(publicProposal.id);
    expect(reloaded?.status).toBe("pending");
    expect(reloaded?.actorId).toBe(testAdminId);
    expect((reloaded?.payload as any)?.capacity).toBe(25);

    // 4. Verify DB row reflects the initial mapped status
    const [dbRowBefore] = await db
      .select()
      .from(zyraProposals)
      .where(eq(zyraProposals.id, publicProposal.id))
      .limit(1);

    expect(dbRowBefore).toBeDefined();
    expect(dbRowBefore.status).toBe("draft");

    // 5. Execute the reloaded proposal
    const execResult = await proposalStore.executeProposal({
      proposalId: publicProposal.id,
      actorId: testAdminId,
    });

    expect(execResult.success).toBe(true);
    expect(actionExecuted).toBe(true);
    expect((execResult.result as any)?.token).toBe("Zyx-RELOADED-25");

    // 6. Verify DB row status transitioned to applied (executed)
    const [dbRowAfter] = await db
      .select()
      .from(zyraProposals)
      .where(eq(zyraProposals.id, publicProposal.id))
      .limit(1);

    expect(dbRowAfter).toBeDefined();
    expect(dbRowAfter.status).toBe("applied");
  });

  // ==========================================================================
  // Test 3: Provider Lifecycle Traversal (Allowance Reservation & Commit)
  // ==========================================================================
  it("Test 3: Ops AI turn traverses allowance reservation, dispatch, and commit with token usage", async () => {
    const mockAllowanceId = "lease-test-3";
    const reserveSpy = spyOn(UsageBudgetService, "reserve").mockResolvedValueOnce({
      accepted: true,
      idempotent: false,
      lease: {
        id: mockAllowanceId,
        userId: "admin-user-003",
        peran: "admin",
        feature: "admin-ops-ai",
        appDay: "2026-09-09",
        units: 1,
        premium: false,
        status: "reserved",
        controlPlaneLeaseId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 120000),
      },
      remaining: {
        providerTurns: null,
        totalInteractions: 299,
        premiumTurns: null,
      },
    });

    const commitSpy = spyOn(UsageBudgetService, "commit").mockResolvedValueOnce({
      id: mockAllowanceId,
      status: "committed",
    } as any);

    // Mock Ops AI model stream generator
    setOpsAiModelStreamMock(async function* () {
      yield {
        type: "text-delta",
        textDelta: "Analisis beban server selesai.",
      };
      yield {
        type: "finish",
        finishReason: "stop",
        usage: {
          promptTokens: 120,
          completionTokens: 45,
          totalTokens: 165,
        },
      };
    });

    const model = new ZyxLanguageModel({
      actorId: "admin-user-003",
      feature: "admin-ops-ai",
    });

    const streamResult = await model.doStream({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Periksa status antrean sistem." }],
        },
      ],
    });

    // Consume the stream to trigger finish
    const reader = streamResult.stream.getReader();
    let accumulatedText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "text-delta") {
        accumulatedText += value.delta;
      }
    }

    expect(accumulatedText).toBe("Analisis beban server selesai.");
    expect(reserveSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledTimes(1);

    const commitArgs = commitSpy.mock.calls[0];
    expect(commitArgs[0]).toBe(mockAllowanceId);
    expect(commitArgs[1]?.inputTokens).toBe(120);
    expect(commitArgs[1]?.outputTokens).toBe(45);

    reserveSpy.mockRestore();
    commitSpy.mockRestore();
  });

  // ==========================================================================
  // Test 4: Stream Cancellation (Mid-turn abort triggers refund and no dangling leases)
  // ==========================================================================
  it("Test 4: stream cancellation mid-turn triggers allowance refund and leaves no dangling mutation", async () => {
    const mockAllowanceId = "lease-test-4";
    const reserveSpy = spyOn(UsageBudgetService, "reserve").mockResolvedValueOnce({
      accepted: true,
      idempotent: false,
      lease: {
        id: mockAllowanceId,
        userId: "admin-user-004",
        peran: "admin",
        feature: "admin-ops-ai",
        appDay: "2026-09-09",
        units: 1,
        premium: false,
        status: "reserved",
        controlPlaneLeaseId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 120000),
      },
      remaining: {
        providerTurns: null,
        totalInteractions: 299,
        premiumTurns: null,
      },
    });

    const refundSpy = spyOn(UsageBudgetService, "refund").mockResolvedValueOnce({
      leaseId: mockAllowanceId,
      status: "refunded",
      changed: true,
    });

    const abortController = new AbortController();

    // Mock Ops AI model stream generator that yields multiple chunks
    setOpsAiModelStreamMock(async function* (opts) {
      yield {
        type: "text-delta",
        textDelta: "Mulai membaca ringkasan...",
      };
      // Check abort signal between chunks
      if (opts.signal?.aborted) {
        throw new Error("Model stream aborted by user");
      }
      yield {
        type: "text-delta",
        textDelta: "Bagian ini seharusnya tidak terkirim.",
      };
    });

    const model = new ZyxLanguageModel({
      actorId: "admin-user-004",
      feature: "admin-ops-ai",
    });

    const streamResult = await model.doStream({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Keluarkan laporan komprehensif." }],
        },
      ],
      abortSignal: abortController.signal,
    });

    const reader = streamResult.stream.getReader();

    // Read first chunk
    const firstChunk = await reader.read();
    expect(firstChunk.done).toBe(false);

    // Abort stream mid-execution
    abortController.abort();

    // Subsequent read should fail or close with error
    try {
      await reader.read();
    } catch {
      // Expected stream error upon abort
    }

    // Verify refund was dispatched for the cancelled turn
    expect(refundSpy).toHaveBeenCalled();
    const refundArgs = refundSpy.mock.calls[0];
    expect(refundArgs[0]).toBe(mockAllowanceId);

    // Verify no proposals were left in executing or applied state
    const allProposals = await db
      .select()
      .from(zyraProposals)
      .where(eq(zyraProposals.actorId, "admin-user-004"));

    expect(allProposals.length).toBe(0);

    reserveSpy.mockRestore();
    refundSpy.mockRestore();
  });
});
