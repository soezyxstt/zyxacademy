import { createPostgresTestDb } from "../helpers/postgres";
import { user } from "@/db/schema";
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createOpsAiRuntimeStream,
  createOpsAiRuntimeResponse,
  buildOpsAiSystemPrompt,
  DEFAULT_OPS_AI_TOOLS,
} from "@/lib/admin-ops-ai/runtime";
import {
  createOpsAiTools,
  executeOpsAiTool,
  searchAdminKnowledge,
  introspectSchema,
  ADMIN_SITEMAP,
} from "@/lib/admin-ops-ai/runtime-tools";
import {
  getOpsAiModelKey,
  recordModelSuccess,
  recordModelFailure,
  setOpsAiModelStreamMock,
  streamOpsAiModel,
  type OpsAiModelStreamChunk,
} from "@/lib/admin-ops-ai/model-factory";
import {
  OPS_AI_POLICY_BOUNDS,
  OPS_AI_TOOL_SECURITY_REGISTRY,
  validateOpsAiWorkStep,
  validateOpsAiErrorData,
  assertNoModelCallableMutation,
  type OpsAiWorkStep,
  type OpsAiErrorData,
} from "@/lib/admin-ops-ai/contracts";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { FakeCanonicalVectorProvider } from "@/lib/vectorize/fake-adapter";
import { CANONICAL_VECTOR_PROFILE } from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import type { AdminKnowledgeChunk, AdminKnowledgeSourceRecord } from "@/lib/admin-ops-ai/admin-knowledge-contracts";

// Keep database-read tools isolated from deployment credentials and exercise
// their PII projection against a nonempty canonical test result.
const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
await testDb.insert(user).values({ id: "runtime-admin", name: "admin_test", email: "runtime-admin@example.test", role: "admin" });
afterAll(async () => { await client.close(); });

// ============================================================================
// Test Utilities & Helpers
// ============================================================================

/** Helper to read all SSE events from a Response */
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

/** Mock embedding adapter */
function createMockEmbeddingAdapter(): CanonicalContentV2EmbeddingAdapter {
  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    embed: async () => new Array(768).fill(0.01),
    embedDocument: async () => new Array(768).fill(0.01),
    embedQuery: async () => new Array(768).fill(0.01),
  };
}

describe("Admin Ops AI Runtime - CP3 Native Streaming Agent & Contracts", () => {
  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  // ==========================================================================
  // Suite 1: Direct Regex Tool Parser Elimination & Architecture Invariant
  // ==========================================================================
  describe("Suite 1: Regex Tool Parser Elimination & Architecture Invariant", () => {
    it("guarantees route.ts does not contain regex-based tool call parsers or fenced tool_call matches", () => {
      const routePath = join(process.cwd(), "app/api/admin/ops-ai/route.ts");
      const routeCode = readFileSync(routePath, "utf8");

      expect(routeCode).not.toContain("match(/```tool_call");
      expect(routeCode).not.toContain("```tool_call");
      expect(routeCode).not.toContain("toolCallMatch");
      expect(routeCode).not.toContain("NextResponse.json({ message");
    });

    it("guarantees runtime.ts does not use text regex to parse tool calls", () => {
      const runtimePath = join(process.cwd(), "lib/admin-ops-ai/runtime.ts");
      const runtimeCode = readFileSync(runtimePath, "utf8");

      expect(runtimeCode).not.toContain("match(/```tool_call");
      expect(runtimeCode).not.toContain("```tool_call");
    });

    it("verifies createOpsAiRuntimeResponse returns a valid SSE response", async () => {
      setOpsAiModelStreamMock(async function* () {
        yield { type: "text-delta", textDelta: "Halo dari Zyx Ops AI." };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Halo" }],
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
    });
  });

  // ==========================================================================
  // Suite 2: UI Message Stream Response & Incremental Parts Delivery
  // ==========================================================================
  describe("Suite 2: UI Message Stream Response & Incremental Parts Delivery", () => {
    it("delivers incremental text deltas and completes with [DONE]", async () => {
      setOpsAiModelStreamMock(async function* () {
        yield { type: "text-delta", textDelta: "Bagian 1 " };
        yield { type: "text-delta", textDelta: "Bagian 2" };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Jelaskan sistem Zyx" }],
      });

      const events = await parseSseEvents(response);

      const textDeltas = events
        .filter((e) => e.type === "text-delta")
        .map((e) => e.textDelta);
      expect(textDeltas).toEqual(["Bagian 1 ", "Bagian 2"]);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });

    it("validates all emitted data-work-step parts against OpsAiWorkStep contract", async () => {
      setOpsAiModelStreamMock(async function* () {
        yield { type: "text-delta", textDelta: "Jawaban langsung." };
        yield { type: "finish", finishReason: "stop" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Berapa kapasitas kelompok?" }],
      });

      const events = await parseSseEvents(response);
      const workStepEvents = events.filter((e) => e.type === "data-work-step");

      expect(workStepEvents.length).toBeGreaterThanOrEqual(2); // reasoning + synthesis
      for (const event of workStepEvents) {
        const step = event.data as OpsAiWorkStep;
        const validation = validateOpsAiWorkStep(step);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });
  });

  // ==========================================================================
  // Suite 3: Work-Step Lifecycle and Sequential State Invariant
  // ==========================================================================
  describe("Suite 3: Work-Step Lifecycle and Sequential State Invariant", () => {
    it("progresses through queued -> running -> completed states with valid durations", async () => {
      let callCount = 0;
      setOpsAiModelStreamMock(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: "tool-call",
            toolCall: {
              id: "call-inspect-1",
              name: "inspect_schema",
              args: { tableName: "user" },
            },
          };
          yield { type: "finish", finishReason: "tool-calls" };
        } else {
          yield { type: "text-delta", textDelta: "Tabel user ditemukan." };
          yield { type: "finish", finishReason: "stop" };
        }
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Inspeksi tabel user" }],
      });

      const events = await parseSseEvents(response);
      const workStepEvents = events.filter((e) => e.type === "data-work-step");
      const steps = workStepEvents.map((e) => e.data as OpsAiWorkStep);

      // Find steps for inspect_schema
      const toolSteps = steps.filter((s) => s.toolName === "inspect_schema");
      expect(toolSteps.length).toBeGreaterThanOrEqual(3);

      const statuses = toolSteps.map((s) => s.status);
      expect(statuses).toContain("queued");
      expect(statuses).toContain("running");
      expect(statuses).toContain("completed");

      // Verify durationMs on completed step
      const completedStep = toolSteps.find((s) => s.status === "completed");
      expect(completedStep).toBeDefined();
      expect(completedStep?.durationMs).toBeGreaterThanOrEqual(0);
      expect(completedStep?.finishedAt).toBeGreaterThanOrEqual(completedStep?.startedAt || 0);
      expect(completedStep?.stepType).toBe("tool_call");
    });

    it("emits tool-call and tool-result UI stream parts bound to toolCallId", async () => {
      let callCount = 0;
      setOpsAiModelStreamMock(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: "tool-call",
            toolCall: {
              id: "call-metrics-99",
              name: "get_system_metrics",
              args: {},
            },
          };
          yield { type: "finish", finishReason: "tool-calls" };
        } else {
          yield { type: "text-delta", textDelta: "Metrik sistem aktif." };
          yield { type: "finish", finishReason: "stop" };
        }
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Tampilkan metrik sistem" }],
      });

      const events = await parseSseEvents(response);

      const toolCallPart = events.find((e) => e.type === "tool-call");
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart?.toolCallId).toBe("call-metrics-99");
      expect(toolCallPart?.toolName).toBe("get_system_metrics");

      const toolResultPart = events.find((e) => e.type === "tool-result");
      expect(toolResultPart).toBeDefined();
      expect(toolResultPart?.toolCallId).toBe("call-metrics-99");
      expect(toolResultPart?.toolName).toBe("get_system_metrics");
      expect(toolResultPart?.output?.summary).toContain("Metrik sistem");
    });
  });

  // ==========================================================================
  // Suite 4: Bounded Tool Loop and Policy Bounds Enforcement
  // ==========================================================================
  describe("Suite 4: Bounded Tool Loop and Policy Bounds Enforcement", () => {
    it("strictly bounds tool executions at maxConsecutiveToolCalls (3)", async () => {
      let turns = 0;
      setOpsAiModelStreamMock(async function* () {
        turns++;
        yield {
          type: "tool-call",
          toolCall: {
            id: `call-loop-${turns}`,
            name: "get_system_metrics",
            args: {},
          },
        };
        yield { type: "finish", finishReason: "tool-calls" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Terus ambil data" }],
        maxToolSteps: 10,
        maxConsecutiveToolCalls: OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls,
      });

      const events = await parseSseEvents(response);
      const toolResults = events.filter((e) => e.type === "tool-result");

      expect(toolResults.length).toBe(OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls);
      const textParts = events.filter((e) => e.type === "text-delta");
      const combinedText = textParts.map((t) => t.textDelta).join("");
      expect(combinedText).toContain("Batas panggilan tool berturut-turut tercapai");
    });

    it("strictly bounds tool executions at maxToolSteps (5)", async () => {
      let turns = 0;
      setOpsAiModelStreamMock(async function* () {
        turns++;
        yield {
          type: "tool-call",
          toolCall: {
            id: `call-step-${turns}`,
            name: "get_system_metrics",
            args: {},
          },
        };
        yield { type: "finish", finishReason: "tool-calls" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Ambil langkah maksimal" }],
        maxToolSteps: OPS_AI_POLICY_BOUNDS.maxToolSteps,
        maxConsecutiveToolCalls: 10,
      });

      const events = await parseSseEvents(response);
      const toolResults = events.filter((e) => e.type === "tool-result");

      expect(toolResults.length).toBe(OPS_AI_POLICY_BOUNDS.maxToolSteps);
      const textParts = events.filter((e) => e.type === "text-delta");
      const combinedText = textParts.map((t) => t.textDelta).join("");
      expect(combinedText).toContain("Batas maksimum langkah penelusuran tercapai");
    });

    it("rejects request if messages count exceeds maxMessagesHistory (30)", async () => {
      const overflowMessages = Array.from({ length: 31 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Pesan nomor ${i}`,
      }));

      const response = createOpsAiRuntimeResponse({
        messages: overflowMessages,
      });

      const events = await parseSseEvents(response);
      const errorEvent = events.find((e) => e.type === "data-error");

      expect(errorEvent).toBeDefined();
      const errData = errorEvent?.data as OpsAiErrorData;
      expect(errData.code).toBe("CONTEXT_TOO_LARGE");
      expect(validateOpsAiErrorData(errData).valid).toBe(true);
    });

    it("rejects request if a single message exceeds maxMessageCharLength (4000)", async () => {
      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "A".repeat(4001) }],
      });

      const events = await parseSseEvents(response);
      const errorEvent = events.find((e) => e.type === "data-error");

      expect(errorEvent).toBeDefined();
      expect((errorEvent?.data as OpsAiErrorData).code).toBe("CONTEXT_TOO_LARGE");
    });
  });

  // ==========================================================================
  // Suite 5: AbortSignal & Mid-Flight Cancellation Semantics
  // ==========================================================================
  describe("Suite 5: AbortSignal & Mid-Flight Cancellation Semantics", () => {
    it("halts stream execution immediately and marks active step cancelled upon AbortSignal", async () => {
      const abortController = new AbortController();

      setOpsAiModelStreamMock(async function* () {
        yield { type: "text-delta", textDelta: "Mulai memproses..." };
        // Trigger abort during stream
        abortController.abort();
        yield { type: "text-delta", textDelta: "Tidak boleh terkirim" };
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Proses panjang" }],
        abortSignal: abortController.signal,
      });

      const events = await parseSseEvents(response);

      const textDeltas = events
        .filter((e) => e.type === "text-delta")
        .map((e) => e.textDelta);
      expect(textDeltas).not.toContain("Tidak boleh terkirim");

      const errorEvent = events.find((e) => e.type === "data-error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.data as OpsAiErrorData).code).toBe("REQUEST_CANCELLED");
    });
  });

  // ==========================================================================
  // Suite 6: Provider Failure, Retry & Circuit Resilience
  // ==========================================================================
  describe("Suite 6: Provider Failure, Retry & Circuit Resilience", () => {
    it(
      "handles provider failure gracefully, attempts retry, and emits data-error part",
      async () => {
        let attempts = 0;
      setOpsAiModelStreamMock(async function* () {
        attempts++;
        throw new Error("429 RESOURCE_EXHAUSTED Quota exceeded");
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Trigger error" }],
      });

      const events = await parseSseEvents(response);

      // Max retry attempts + 1 initial = 3 total attempts
      expect(attempts).toBe(OPS_AI_POLICY_BOUNDS.maxRetryAttempts + 1);

      const errorEvent = events.find((e) => e.type === "data-error");
      expect(errorEvent).toBeDefined();

      const errData = errorEvent?.data as OpsAiErrorData;
      expect(errData.code).toBe("RATE_LIMITED");
      expect(errData.retryable).toBe(true);
      expect(validateOpsAiErrorData(errData).valid).toBe(true);
    }, { timeout: 10000 });
  });

  // ==========================================================================
  // Suite 7: Native Read-Only Tool Execution & Security Boundaries
  // ==========================================================================
  describe("Suite 7: Native Read-Only Tool Execution & Security Boundaries", () => {
    it("enforces assertNoModelCallableMutation for security registry", () => {
      expect(() => assertNoModelCallableMutation(OPS_AI_TOOL_SECURITY_REGISTRY)).not.toThrow();
    });

    it("executes inspect_schema tool properly for all tables and specific table", async () => {
      const allRes = await executeOpsAiTool("inspect_schema", {});
      expect(allRes.summary).toContain("tabel utama");
      expect((allRes.data as any).tables.length).toBeGreaterThanOrEqual(1);

      const userRes = await executeOpsAiTool("inspect_schema", { tableName: "user" });
      expect(userRes.summary).toContain("tabel 'user'");
      expect((userRes.data as any).tables[0].tableName).toBe("user");
    });

    it("executes get_system_metrics tool properly", async () => {
      const metricsRes = await executeOpsAiTool("get_system_metrics", {});
      expect(metricsRes.summary).toContain("Metrik sistem");
      expect(metricsRes.data).toBeDefined();
    });

    it("executes navigate_admin tool and matches sitemap routes", async () => {
      const tokenNav = await executeOpsAiTool("navigate_admin", { destination: "token" });
      expect(tokenNav.summary).toContain("Token Aktivasi");
      expect((tokenNav.data as any).href).toBe("/admin/tokens");

      const flagsNav = await executeOpsAiTool("navigate_admin", { destination: "flags" });
      expect(flagsNav.summary).toContain("Feature Flags");
      expect((flagsNav.data as any).href).toBe("/admin/ops/flags");
    });

    it("executes search_users tool and enforces PII minimum projection", async () => {
      const searchRes = await executeOpsAiTool("search_users", { query: "admin" });
      expect(searchRes.summary).toBeDefined();
      expect(Array.isArray(searchRes.data)).toBe(true);

      const users = searchRes.data as Array<Record<string, unknown>>;
      expect(users).toHaveLength(1);
      for (const u of users) {
        expect(u.id).toBeDefined();
        expect(u.name).toBeDefined();
        expect(u.role).toBeDefined();
        // Email must be omitted by default to prevent PII exposure
        expect(u.email).toBeUndefined();
        // Sensitive credentials must never leak
        expect(u.password).toBeUndefined();
        expect(u.sessionToken).toBeUndefined();
      }
    });

    it("executes retrieve_admin_knowledge tool with isolated namespace and mock catalog", async () => {
      const fakeProvider = new FakeCanonicalVectorProvider();
      const mockAdapter = createMockEmbeddingAdapter();

      const mockSource: AdminKnowledgeSourceRecord = {
        id: "src-ops-1",
        title: "Runbook SOP Token",
        sourcePath: "docs/ops/token.md",
        sourceType: "runbook",
        version: 1,
        contentHash: "a".repeat(64),
        manifestHash: "b".repeat(64),
        chunkCount: 1,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockChunk: AdminKnowledgeChunk = {
        id: "chunk-1",
        sourceId: "src-ops-1",
        chunkIndex: 0,
        startOffset: 0,
        endOffset: 50,
        contentHash: "chash-1",
        vectorId: "v-chunk-1",
        headingHierarchy: ["SOP Token", "Kapasitas"],
        content: "Kapasitas kelompok aktivasi token maksimal 5 orang.",
        locator: "chunk-1",
        version: 1,
        status: "active",
      };

      const res = await executeOpsAiTool(
        "retrieve_admin_knowledge",
        { query: "token" },
        {
          callerRole: "admin",
          vectorProvider: fakeProvider,
          embeddingAdapter: mockAdapter,
          mockHydrationCatalog: {
            sources: [mockSource],
            chunks: [mockChunk],
          },
        }
      );

      expect(res.summary).toContain("sumber dokumentasi");
    });

    it("strictly rejects non-callable or mutating tools", async () => {
      await expect(
        executeOpsAiTool("execute_confirmed_proposal", { proposalId: "prop-1" })
      ).rejects.toThrow("tidak diizinkan untuk dipanggil oleh model AI");
    });
  });

  // ==========================================================================
  // Suite 8: Provider Boundary Integration with geminiKeyPool
  // ==========================================================================
  describe("Suite 8: Provider Boundary Integration with geminiKeyPool", () => {
    it("resolves model key directly from geminiKeyPool", () => {
      const resolved = getOpsAiModelKey();
      expect(resolved.key).toBeDefined();
      expect(resolved.key.id).toMatch(/^key\d+$/);
      expect(resolved.client).toBeDefined();
    });

    it("tracks success and failure accurately in geminiKeyPool without bypassing boundary", () => {
      const resolved = getOpsAiModelKey();
      const keyId = resolved.key.id;
      const modelId = resolved.modelId;

      const initialStats = geminiKeyPool.getStats().find((s) => s.id === keyId);
      const initialErrors = initialStats?.errorCount || 0;

      // Mark failure
      recordModelFailure(keyId, modelId, new Error("Test provider failure"));
      const afterFailure = geminiKeyPool.getStats().find((s) => s.id === keyId);
      expect((afterFailure?.errorCount || 0)).toBeGreaterThanOrEqual(initialErrors);

      // Mark success
      recordModelSuccess(keyId, modelId);
      const afterSuccess = geminiKeyPool.getStats().find((s) => s.id === keyId);
      expect(afterSuccess?.errorCount).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 9: Multi-Turn Protocol, Gemini Config & Query Sanitization Hardening
  // ==========================================================================
  describe("Suite 9: Multi-Turn Protocol, Gemini Config & Query Sanitization Hardening", () => {
    it("enforces Gemini functionResponse turn structure for multi-turn tool calling", async () => {
      let callCount = 0;
      let recordedSecondTurnMessages: any[] = [];

      setOpsAiModelStreamMock(async function* (options) {
        if (callCount === 0) {
          callCount++;
          yield {
            type: "tool-call",
            toolCall: {
              id: "call-multi-1",
              name: "propose_create_token",
              args: { courseIds: "kalkulus-1", capacity: "3" },
            },
          };
          yield { type: "finish", finishReason: "tool-calls" };
        } else {
          recordedSecondTurnMessages = options.messages;
          yield { type: "text-delta", textDelta: "Proposal berhasil disiapkan." };
          yield { type: "finish", finishReason: "stop" };
        }
      });

      const response = createOpsAiRuntimeResponse({
        messages: [{ role: "user", content: "Buatkan token kalkulus" }],
      });

      await parseSseEvents(response);

      // Verify that in turn 2, the message history conforms to Gemini protocol
      expect(recordedSecondTurnMessages.length).toBeGreaterThanOrEqual(3);

      const modelTurn = recordedSecondTurnMessages[recordedSecondTurnMessages.length - 2];
      const userResponseTurn = recordedSecondTurnMessages[recordedSecondTurnMessages.length - 1];

      // 1. Model turn has role "model" and parts with functionCall
      expect(modelTurn.role).toBe("model");
      expect(modelTurn.parts).toBeDefined();
      expect(modelTurn.parts[0].functionCall).toBeDefined();
      expect(modelTurn.parts[0].functionCall.name).toBe("propose_create_token");

      // 2. User turn has role "user" and parts with functionResponse (NOT string content!)
      expect(userResponseTurn.role).toBe("user");
      expect(userResponseTurn.parts).toBeDefined();
      expect(userResponseTurn.parts[0].functionResponse).toBeDefined();
      expect(userResponseTurn.parts[0].functionResponse.name).toBe("propose_create_token");
      expect(userResponseTurn.parts[0].functionResponse.response).toBeDefined();
      expect(userResponseTurn.content).toBeUndefined();
    });

    it("sanitizes SQL wildcard characters in search_users without throwing", async () => {
      // Querying wildcards like "%" and "_" should be safely escaped
      const resPercent = await executeOpsAiTool("search_users", { query: "%" });
      expect(resPercent).toBeDefined();
      expect(resPercent.summary).toBeDefined();
      expect(Array.isArray(resPercent.data)).toBe(true);
      expect(resPercent.data).toEqual([]);

      const resUnderscore = await executeOpsAiTool("search_users", { query: "admin_test" });
      expect(resUnderscore).toBeDefined();
      expect(Array.isArray(resUnderscore.data)).toBe(true);
      expect(resUnderscore.data).toHaveLength(1);
    });

    it("rejects immediately when abortSignal is already aborted before model request", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const generator = streamOpsAiModel({
        messages: [{ role: "user", content: "Halo" }],
        signal: abortController.signal,
        timeoutMs: 30000,
      });

      expect(generator.next()).rejects.toThrow("Aborted before starting model request");
    });
  });
});
