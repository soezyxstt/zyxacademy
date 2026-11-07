import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { getOpsAiModelKey, setOpsAiModelStreamMock } from "@/lib/admin-ops-ai/model-factory";
import { ZyxLanguageModel } from "@/lib/admin-ops-ai/zyx-language-model-adapter";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
import {
  MODEL_FEATURE_CATALOG,
  compatibleModelChain,
  defaultEditableModels,
  generateContentSelectableModels,
  modelFeature,
  modelSettingSchema,
  runtimeDefaultModels,
  selectableModels,
  selectableModelsForFeature,
} from "@/lib/ai/model-settings";
import {
  buildFeatureModelSettingViews,
  configuredModelChain,
  setModelSettingsReaderForTests,
  type StoredModelSettingRow,
} from "@/lib/ai/model-settings-store";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import { MODEL_IDS, ROUTE_POLICY, type ModelId } from "@/lib/ai/provider/model-registry";
import type { ProviderGenerationResult } from "@/lib/ai/provider/provider-adapter";
import { RequestLifecycle, type RequestLifecycleDependencies } from "@/lib/ai/request-lifecycle";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import * as zyraOperationalEvents from "@/lib/zyra/ops/telemetry";

describe("AI Model Settings Catalog, Validation, Chain Resolution, and Ops Fallback Safety", () => {
  beforeEach(() => {
    setModelSettingsReaderForTests(null);
    setOpsAiModelStreamMock(null);
  });

  afterEach(() => {
    setModelSettingsReaderForTests(null);
    setOpsAiModelStreamMock(null);
  });

  it("does not bypass model capacity or cooldown when no eligible key remains", () => {
    const bestKey = spyOn(geminiKeyPool, "getBestKey").mockReturnValue(null);
    const healthyKeys = spyOn(geminiKeyPool, "getHealthyKeys");
    try {
      expect(() => getOpsAiModelKey(MODEL_IDS.stableFlash)).toThrow("Tidak ada kapasitas");
      expect(healthyKeys).not.toHaveBeenCalled();
    } finally {
      bestKey.mockRestore();
      healthyKeys.mockRestore();
    }
  });

  it("exposes verified ordinary generation models and restricts quarantined, embedding, and nonexistent models", () => {
    expect(selectableModels).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemma-4-31b-it",
    ]);
    expect(selectableModels).not.toContain("gemini-3-flash-preview" as ModelId);
    expect(selectableModels).not.toContain("gemma-4-26b-a4b-it" as ModelId);
    expect(selectableModels).not.toContain("gemini-embedding-2" as ModelId);
    expect(selectableModels).not.toContain("gemini-embedding-001" as ModelId);

    expect(generateContentSelectableModels).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemma-4-31b-it",
    ]);
    expect(selectableModelsForFeature("admin-ops-ai")).toEqual(generateContentSelectableModels);
    expect(selectableModelsForFeature("zyra")).toEqual(selectableModels);
    expect(selectableModelsForFeature("playground")).toEqual(selectableModels);

    for (const item of MODEL_FEATURE_CATALOG) {
      expect(item.editableDefaultModels.length).toBe(3);
      expect(new Set(item.editableDefaultModels).size).toBe(3);
      expect(item.runtimeDefaultModels.length).toBeGreaterThanOrEqual(1);
      expect(item.label).not.toMatch(/[\u2013\u2014]/);
      expect(item.description).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("validates 3 distinct models and enforces generate-content restriction on admin-ops-ai", () => {
    const validZyra = modelSettingSchema.safeParse({
      feature: "zyra",
      models: [
        MODEL_IDS.premiumPedagogy,
        MODEL_IDS.default,
        MODEL_IDS.stableFlash,
      ],
    });
    expect(validZyra.success).toBe(true);

    const duplicateModels = modelSettingSchema.safeParse({
      feature: "zyra",
      models: [MODEL_IDS.default, MODEL_IDS.default, MODEL_IDS.stableFlash],
    });
    expect(duplicateModels.success).toBe(false);

    const wrongLength = modelSettingSchema.safeParse({
      feature: "zyra",
      models: [MODEL_IDS.default, MODEL_IDS.stableFlash],
    });
    expect(wrongLength.success).toBe(false);

    const fabricatedModel = modelSettingSchema.safeParse({
      feature: "zyra",
      models: ["gemini-3.8-flash", MODEL_IDS.default, MODEL_IDS.stableFlash],
    });
    expect(fabricatedModel.success).toBe(false);

    const quarantinedModel = modelSettingSchema.safeParse({
      feature: "zyra",
      models: ["gemini-3-flash-preview", MODEL_IDS.default, MODEL_IDS.stableFlash],
    });
    expect(quarantinedModel.success).toBe(false);

    const invalidOpsAiInteractions = modelSettingSchema.safeParse({
      feature: "admin-ops-ai",
      models: [
        MODEL_IDS.premiumPedagogy,
        MODEL_IDS.stableFlash,
        MODEL_IDS.default,
      ],
    });
    expect(invalidOpsAiInteractions.success).toBe(false);

    const validOpsAi = modelSettingSchema.safeParse({
      feature: "admin-ops-ai",
      models: [
        MODEL_IDS.stableFlash,
        MODEL_IDS.default,
        MODEL_IDS.emergencyText,
      ],
    });
    expect(validOpsAi.success).toBe(true);
  });

  it("maps feature and useCase identifiers accurately across Zyra, Playground, Ops AI, and background stages", () => {
    expect(modelFeature("playground", "grounded-rag")).toBe("playground");
    expect(modelFeature("playground", "ZYRA_PEDAGOGY_V3")).toBe("playground");
    expect(modelFeature(undefined, "ZYRA_PEDAGOGY_V3")).toBe("zyra");
    expect(modelFeature(undefined, "grounded-rag")).toBe("zyra");
    expect(modelFeature(undefined, "ungrounded-tutor")).toBe("zyra");
    expect(modelFeature(undefined, "ungrounded-tutor-gemma")).toBe("zyra");
    expect(modelFeature("zyra-pedagogy", undefined)).toBe("zyra");
    expect(modelFeature("zyra-provider-request", undefined)).toBeUndefined();
    expect(modelFeature("zyra-provider-request", "blog-summary")).toBe("blog-summary");
    expect(modelFeature("admin-quiz-insights", "admin-quiz-insights")).toBe("admin-quiz-insights");
    expect(modelFeature(undefined, "weak-concept-guidance-gemma")).toBe("weak-concept-guidance");
    expect(modelFeature("admin-ops-ai", undefined)).toBe("admin-ops-ai");
    expect(modelFeature("plan005-test", undefined)).toBeUndefined();
  });

  it("preserves exact caller default chains when unconfigured and applies visual compatibility safely when configured", async () => {
    const store = new Map<string, StoredModelSettingRow>();
    setModelSettingsReaderForTests(async (feature) => store.get(feature) ?? null);

    // Unconfigured: preserves exact 4-model, 3-model, and 1-model defaults
    expect(
      await configuredModelChain({ feature: "zyra" }, ROUTE_POLICY.default),
    ).toEqual(ROUTE_POLICY.default);
    expect(
      await configuredModelChain({ feature: "mistake-feedback" }, ROUTE_POLICY.premiumPedagogy),
    ).toEqual(ROUTE_POLICY.premiumPedagogy);
    expect(
      await configuredModelChain({ feature: "admin-ops-ai" }, [MODEL_IDS.stableFlash]),
    ).toEqual([MODEL_IDS.stableFlash]);
    expect(runtimeDefaultModels("zyra")).toEqual(ROUTE_POLICY.default);
    expect(defaultEditableModels("admin-ops-ai")).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.fallbackFlashLite,
    ]);

    // Configured Zyra with one image-capable model in second slot:
    store.set("zyra", {
      feature: "zyra",
      models: [
        MODEL_IDS.premiumPedagogy,
        MODEL_IDS.stableFlash,
        MODEL_IDS.fallbackFlashLite,
      ],
      updatedBy: "admin-1",
      updatedAt: new Date("2026-11-05T10:00:00Z"),
    });

    expect(
      await configuredModelChain({ feature: "zyra", visual: false }, ROUTE_POLICY.default),
    ).toEqual([
      MODEL_IDS.premiumPedagogy,
      MODEL_IDS.stableFlash,
      MODEL_IDS.fallbackFlashLite,
    ]);

    // Visual request keeps admin-prioritized stableFlash first and appends remaining visual fallback (gemini-3.6-flash)
    expect(
      await configuredModelChain({ feature: "zyra", visual: true }, ROUTE_POLICY.premiumVisual),
    ).toEqual([MODEL_IDS.stableFlash, MODEL_IDS.premiumVisual]);

    // Configured Playground with three text-only models still falls back to ROUTE_POLICY.premiumVisual on image turns
    store.set("playground", {
      feature: "playground",
      models: [
        MODEL_IDS.premiumPedagogy,
        MODEL_IDS.default,
        MODEL_IDS.emergencyText,
      ],
      updatedBy: "admin-1",
      updatedAt: new Date("2026-11-05T10:05:00Z"),
    });

    expect(
      await configuredModelChain({ feature: "playground", visual: true }, ROUTE_POLICY.premiumVisual),
    ).toEqual([MODEL_IDS.premiumVisual, MODEL_IDS.stableFlash]);

    expect(
      compatibleModelChain(
        [MODEL_IDS.premiumPedagogy, MODEL_IDS.stableFlash, MODEL_IDS.default],
        { requireGenerateContent: true },
      ),
    ).toEqual([MODEL_IDS.stableFlash, MODEL_IDS.default]);

    const views = buildFeatureModelSettingViews([...store.values()]);
    const zyraView = views.find((v) => v.feature === "zyra");
    const chapterView = views.find((v) => v.feature === "chapter-summary");
    expect(zyraView?.isCustom).toBe(true);
    expect(chapterView?.isCustom).toBe(false);
  });

  it("integrates custom 3-model chains into RequestLifecycle and switches to fallback on retryable provider failure", async () => {
    setModelSettingsReaderForTests(async (feature) => {
      if (feature === "playground") {
        return {
          feature: "playground",
          models: [
            MODEL_IDS.stableFlash,
            MODEL_IDS.fallbackFlashLite,
            MODEL_IDS.emergencyText,
          ],
          updatedBy: "admin-1",
          updatedAt: new Date("2026-11-05T11:00:00Z"),
        };
      }
      return null;
    });

    const attemptedModels: string[] = [];
    const allowance = {
      reserve: async () => ({
        accepted: true as const,
        idempotent: false,
        lease: {
          id: "aal-playground",
          userId: "student-1",
          peran: "murid" as const,
          feature: "playground",
          appDay: "2026-11-05",
          units: 1,
          premium: false,
          status: "reserved" as const,
          controlPlaneLeaseId: null,
          createdAt: new Date(1),
          expiresAt: new Date(2),
        },
        remaining: { providerTurns: 18, totalInteractions: 58, premiumTurns: 2 },
      }),
      recordCacheHit: async () => {
        throw new Error("unexpected cache hit");
      },
      attachControlPlaneLease: async () => true,
      markDispatched: async () => ({ leaseId: "aal-playground", status: "dispatched" as const, changed: true }),
      commit: async () => ({ leaseId: "aal-playground", status: "committed" as const, changed: true }),
      refund: async () => ({ leaseId: "aal-playground", status: "refunded" as const, changed: true }),
    } as unknown as RequestLifecycleDependencies["allowance"];

    const controlPlane = {
      reserve: async (input: { modelId: string; routeClass: string }) => ({
        status: "reserved" as const,
        lease: {
          leaseId: `cp-${input.modelId}`,
          idempotencyKey: `req:${input.modelId}`,
          role: "murid" as const,
          feature: "playground",
          routeClass: input.routeClass,
          modelId: input.modelId,
          projectAlias: "gemini-project-1",
          state: "reserved",
          providerDay: "2026-11-05",
          appDay: "2026-11-05",
          cacheStatus: "miss" as const,
          createdAtMs: 1,
          expiresAtMs: 2,
          terminalAtMs: null,
          providerOutcomeCode: null,
        },
      }),
      dispatch: async () => ({ status: "updated" as const, lease: {} as never }),
      commit: async () => ({ status: "updated" as const, lease: {} as never }),
      refund: async () => ({ status: "updated" as const, lease: {} as never }),
    } as unknown as ControlPlaneClient;

    const lifecycle = new RequestLifecycle({
      allowance,
      controlPlane,
      invokeProvider: async ({ modelId }): Promise<ProviderGenerationResult> => {
        attemptedModels.push(modelId);
        if (modelId === MODEL_IDS.stableFlash) {
          throw new ProviderAdapterError({
            code: "PROVIDER_ERROR",
            message: "503 service unavailable",
            retryClassification: "transient",
          });
        }
        return {
          modelId,
          text: "Perbaikan kode berhasil.",
          finishReason: "STOP",
          latencyMs: 25,
          providerRequestId: "prov-2",
          retryClassification: "none",
        };
      },
    });

    const outcome = await lifecycle.execute({
      userId: "student-1",
      feature: "playground",
      useCase: "grounded-rag",
      parts: [{ type: "text", text: "Mengapa loop ini infinite?" }],
    });

    expect(outcome.outcome).toBe("provider_success");
    expect(outcome.modelId).toBe(MODEL_IDS.fallbackFlashLite);
    expect(attemptedModels).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.fallbackFlashLite,
    ]);
  });

  it("walks configured 3-model Ops AI fallback chain before output and records the actual winning model", async () => {
    setModelSettingsReaderForTests(async (feature) => {
      if (feature === "admin-ops-ai") {
        return {
          feature: "admin-ops-ai",
          models: [
            MODEL_IDS.stableFlash,
            MODEL_IDS.default,
            MODEL_IDS.emergencyText,
          ],
          updatedBy: "admin-ops-1",
          updatedAt: new Date("2026-11-05T12:00:00Z"),
        };
      }
      return null;
    });

    const reserveSpy = spyOn(UsageBudgetService, "reserve").mockResolvedValueOnce({
      accepted: true,
      idempotent: false,
      lease: {
        id: "lease-ops-fallback-1",
        userId: "admin-ops-1",
        peran: "admin",
        feature: "admin-ops-ai",
        appDay: "2026-11-05",
        units: 1,
        premium: false,
        status: "reserved",
        controlPlaneLeaseId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
      remaining: { providerTurns: null, totalInteractions: 299, premiumTurns: null },
    });
    const commitSpy = spyOn(UsageBudgetService, "commit").mockResolvedValueOnce({
      id: "lease-ops-fallback-1",
      status: "committed",
    } as never);
    const telemetrySpy = spyOn(
      zyraOperationalEvents,
      "recordZyraOperationalEventSafe",
    ).mockResolvedValue();

    const calledModels: string[] = [];
    setOpsAiModelStreamMock(async function* (opts) {
      calledModels.push(opts.modelId || "");
      if (opts.modelId === MODEL_IDS.stableFlash) {
        throw new Error("503 Service Unavailable on primary model");
      }
      if (opts.modelId === MODEL_IDS.default) {
        throw new Error("429 Resource Exhausted on fallback 1");
      }
      yield {
        type: "text-delta",
        textDelta: "Respons dari model cadangan kedua.",
      };
      yield {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 40, completionTokens: 12, totalTokens: 52 },
      };
    });

    const model = new ZyxLanguageModel({
      actorId: "admin-ops-1",
      feature: "admin-ops-ai",
    });

    const streamResult = await model.doStream({
      prompt: [
        { role: "user", content: [{ type: "text", text: "Cek ringkasan kuota." }] },
      ],
    });

    const reader = streamResult.stream.getReader();
    let output = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "text-delta") {
        output += value.delta;
      }
    }

    expect(output).toBe("Respons dari model cadangan kedua.");
    expect(calledModels).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.emergencyText,
    ]);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy.mock.calls[0]?.[1]?.model).toBe(MODEL_IDS.emergencyText);

    const recordedModels = telemetrySpy.mock.calls.map(
      (call) => (call[0] as { modelClass?: string }).modelClass,
    );
    expect(recordedModels).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.emergencyText,
    ]);

    reserveSpy.mockRestore();
    commitSpy.mockRestore();
    telemetrySpy.mockRestore();
  });

  it("never retries or falls back in Ops AI after partial text-delta, tool-call, or caller abort", async () => {
    setModelSettingsReaderForTests(async () => ({
      feature: "admin-ops-ai",
      models: [
        MODEL_IDS.stableFlash,
        MODEL_IDS.default,
        MODEL_IDS.emergencyText,
      ],
      updatedBy: "admin-ops-1",
      updatedAt: new Date("2026-11-05T12:10:00Z"),
    }));

    const reserveSpy = spyOn(UsageBudgetService, "reserve").mockResolvedValue({
      accepted: true,
      idempotent: false,
      lease: {
        id: "lease-ops-no-retry",
        userId: "admin-ops-1",
        peran: "admin",
        feature: "admin-ops-ai",
        appDay: "2026-11-05",
        units: 1,
        premium: false,
        status: "reserved",
        controlPlaneLeaseId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
      remaining: { providerTurns: null, totalInteractions: 299, premiumTurns: null },
    });
    const refundSpy = spyOn(UsageBudgetService, "refund").mockResolvedValue({
      leaseId: "lease-ops-no-retry",
      status: "refunded",
      changed: true,
    });
    const telemetrySpy = spyOn(
      zyraOperationalEvents,
      "recordZyraOperationalEventSafe",
    ).mockResolvedValue();

    // Case A: error after partial text-delta must NOT invoke fallback model
    const textAttemptedModels: string[] = [];
    setOpsAiModelStreamMock(async function* (opts) {
      textAttemptedModels.push(opts.modelId || "");
      yield { type: "text-delta", textDelta: "Sebagian teks sudah tampil..." };
      throw new Error("503 mid-stream failure after visible text");
    });

    const textModel = new ZyxLanguageModel({
      actorId: "admin-ops-1",
      feature: "admin-ops-ai",
    });
    const textStream = await textModel.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Tes parsial." }] }],
    });
    const textReader = textStream.stream.getReader();
    await textReader.read(); // stream-start
    await textReader.read(); // text-start
    await textReader.read(); // text-delta
    await expect(textReader.read()).rejects.toThrow("503 mid-stream failure");
    expect(textAttemptedModels).toEqual([MODEL_IDS.stableFlash]);

    // Case B: error after tool-call must NOT invoke fallback model
    const toolAttemptedModels: string[] = [];
    setOpsAiModelStreamMock(async function* (opts) {
      toolAttemptedModels.push(opts.modelId || "");
      yield {
        type: "tool-call",
        toolCall: {
          id: "call-1",
          name: "inspect_schema",
          args: {},
        },
      };
      throw new Error("503 failure after tool call");
    });

    const toolModel = new ZyxLanguageModel({
      actorId: "admin-ops-1",
      feature: "admin-ops-ai",
    });
    const toolStream = await toolModel.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Periksa skema." }] }],
    });
    const toolReader = toolStream.stream.getReader();
    await toolReader.read(); // stream-start
    await toolReader.read(); // tool-call
    await expect(toolReader.read()).rejects.toThrow("503 failure after tool call");
    expect(toolAttemptedModels).toEqual([MODEL_IDS.stableFlash]);

    // Case C: caller abort before any output must NOT walk fallback models
    const abortAttemptedModels: string[] = [];
    const abortController = new AbortController();
    setOpsAiModelStreamMock(async function* (opts) {
      abortAttemptedModels.push(opts.modelId || "");
      abortController.abort();
      throw new Error("Caller cancelled request");
    });

    const abortedModel = new ZyxLanguageModel({
      actorId: "admin-ops-1",
      feature: "admin-ops-ai",
    });
    const abortedStream = await abortedModel.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Batalkan." }] }],
      abortSignal: abortController.signal,
    });
    const abortedReader = abortedStream.stream.getReader();
    await abortedReader.read(); // stream-start
    await expect(abortedReader.read()).rejects.toThrow();
    expect(abortAttemptedModels).toEqual([MODEL_IDS.stableFlash]);

    reserveSpy.mockRestore();
    refundSpy.mockRestore();
    telemetrySpy.mockRestore();
  });
});
