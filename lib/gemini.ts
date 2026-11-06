import { configuredModelChain } from "@/lib/ai/model-settings-store";
import { GoogleGenAI } from "@google/genai";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import { logAiRequest } from "@/lib/ai/analytics";
import {
  createGeminiGenerateAdapter,
} from "@/lib/ai/provider/gemini-generate-adapter";
import {
  createGeminiInteractionsAdapter,
} from "@/lib/ai/provider/gemini-interactions-adapter";
import {
  EMBEDDING_PROFILES,
  getModelEntry,
  modelSupportsAiGateway,
} from "@/lib/ai/provider/model-registry";
import {
  type ProviderInputPart,
  type ProviderGenerationResult,
} from "@/lib/ai/provider/provider-adapter";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { getModelChain, getProviderRoutePlan, providerRouterV2Enabled, type ProviderRouteRequest } from "@/lib/ai-router";
import { RequestLifecycle } from "@/lib/ai/request-lifecycle";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";

interface ClientPriority {
  client: GoogleGenAI;
  viaGateway: boolean;
}

function getClientsPriority(
  key: typeof geminiKeyPool["keys"][0],
  allowGateway = true,
): ClientPriority[] {
  const gatewayUrl = zyraRuntimeEnv.CF_AI_GATEWAY_URL;
  const list: ClientPriority[] = [];

  if (allowGateway && gatewayUrl && key.clientGateway) {
    list.push({ client: key.clientGateway, viaGateway: true });
  }

  list.push({ client: key.client, viaGateway: false });
  return list;
}

const EMBEDDING_PROFILE = EMBEDDING_PROFILES["canonical-content-v2"].id;

export async function embedText(text: string): Promise<number[]> {
  const { getCanonicalContentV2EmbeddingAdapter } = await import("@/lib/vectorize/runtime");
  const adapter = await getCanonicalContentV2EmbeddingAdapter();
  if (adapter.profileId !== EMBEDDING_PROFILE) throw new Error("CANONICAL_EMBEDDING_PROFILE_MISMATCH");
  return adapter.embedDocument("", text);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const batchSize = 5;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const batch = await Promise.all(chunk.map((text) => embedText(text)));
    results.push(...batch);
  }
  return results;
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempt++;
      const isTransient =
        error instanceof Error &&
        (error.message.includes("503") || error.message.includes("502") || error.message.includes("504"));
      if (!isTransient || attempt >= maxRetries) throw error;
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export type GeminiContentRole = "user" | "model" | "system";

export interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiContentBlock {
  role?: GeminiContentRole;
  parts: GeminiContentPart[];
}

export interface GenerateContentParams {
  contents: string | GeminiContentBlock[] | GeminiContentPart[];
  config?: any;
  useCase?: string;
  userId?: string;
  requestId?: string;
  feature?: string;
  route?: ProviderRouteRequest;
  cacheStatus?: "miss" | "bypass";
  cachePolicy?: "public_scaffold" | "personalized" | "active_assessment" | "bypass";
  cacheKey?: string;
  cacheTtlSeconds?: number;
}

function toProviderParts(contents: GenerateContentParams["contents"]): ProviderInputPart[] {
  if (typeof contents === "string") return [{ type: "text", text: contents }];

  const parts: ProviderInputPart[] = [];
  for (const block of contents) {
    const blockParts: GeminiContentPart[] = "parts" in block ? block.parts : [block];
    for (const part of blockParts) {
      if (part.text !== undefined) parts.push({ type: "text", text: part.text });
      if (part.inlineData) {
        parts.push({
          type: "image",
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      }
    }
  }
  return parts;
}

function makeCompatibilityResponse(result: {
  text: string;
  rawResponse?: unknown;
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}): any {
  const raw = result.rawResponse && typeof result.rawResponse === "object"
    ? result.rawResponse as Record<string, any>
    : {};
  return {
    ...raw,
    text: result.text,
    usageMetadata: {
      ...(raw.usageMetadata && typeof raw.usageMetadata === "object" ? raw.usageMetadata : {}),
      promptTokenCount: result.usage?.promptTokens ?? 0,
      candidatesTokenCount: result.usage?.outputTokens ?? 0,
      totalTokenCount: result.usage?.totalTokens ?? 0,
    },
  };
}

async function invokeProviderThroughControlPlane(input: {
  requestId: string;
  userCohort: string;
  feature: string;
  routeClass: import("@/lib/ai/provider/model-registry").ModelRouteClass;
  modelId: import("@/lib/ai/provider/model-registry").ModelId;
  projectAlias: string;
  parts: readonly ProviderInputPart[];
  config?: Readonly<Record<string, unknown>>;
  cachePolicy?: GenerateContentParams["cachePolicy"];
  cacheKey?: string;
  cacheTtlSeconds?: number;
}): Promise<ProviderGenerationResult> {
  const key = geminiKeyPool.getKeyByProjectAlias(input.projectAlias);
  if (!key) {
    throw new ProviderAdapterError({
      code: "PROVIDER_ERROR",
      message: "selected provider project is not configured",
      retryClassification: "unknown",
      modelId: input.modelId,
    });
  }

  const entry = getModelEntry(input.modelId);
  const viaGateway = Boolean(
    zyraRuntimeEnv.CF_AI_GATEWAY_URL && modelSupportsAiGateway(input.modelId),
  );
  const client = geminiKeyPool.createRequestClient(input.projectAlias, {
    viaGateway,
    timeoutMs: entry.deadlineMs,
    headers: viaGateway
      ? buildAiGatewayHeaders({
          requestId: input.requestId,
          userCohort: input.userCohort,
          feature: input.feature,
          routeClass: input.routeClass,
          modelId: input.modelId,
          cachePolicy: input.cachePolicy,
          cacheKey: input.cacheKey,
          cacheTtlSeconds: input.cacheTtlSeconds,
          deadlineMs: entry.deadlineMs,
        })
      : undefined,
  });
  if (!client) {
    throw new ProviderAdapterError({
      code: "PROVIDER_ERROR",
      message: "selected provider client is unavailable",
      retryClassification: "unknown",
      modelId: input.modelId,
    });
  }

  const startedAt = Date.now();
  try {
    const adapter = entry.family === "interactions"
      ? createGeminiInteractionsAdapter({ interactions: client.interactions })
      : createGeminiGenerateAdapter({ models: client.models });
    const result = await adapter.generate({
      modelId: input.modelId,
      parts: input.parts,
      config: input.config,
    });
    geminiKeyPool.markSuccess(key.id, input.modelId);
    logAiRequest({
      operation: entry.family === "interactions" ? "interactions" : "generateContent",
      model: input.modelId,
      viaGateway,
      latencyMs: Date.now() - startedAt,
      success: true,
    });
    return {
      ...result,
      providerRequestId: result.providerRequestId ?? input.requestId,
      viaGateway,
    };
  } catch (error) {
    geminiKeyPool.markFailure(key.id, input.modelId, error instanceof Error ? error : new Error("Gemini request failed"));
    const typedError = error instanceof ProviderAdapterError
      ? error
      : new ProviderAdapterError({
          code: "PROVIDER_ERROR",
          message: "Gemini provider request failed",
          retryClassification: "unknown",
          modelId: input.modelId,
          cause: error,
        });
    logAiRequest({
      operation: entry.family === "interactions" ? "interactions" : "generateContent",
      model: input.modelId,
      viaGateway,
      latencyMs: Date.now() - startedAt,
      success: false,
      error: `${typedError.code}:${typedError.httpStatus ?? "none"}:${typedError.retryClassification}`,
    });
    console.warn(
      `[ZyraProvider] request failed code=${typedError.code} status=${typedError.httpStatus ?? "none"} classification=${typedError.retryClassification} model=${input.modelId} family=${entry.family} transport=${viaGateway ? "gateway" : "direct"} request=${input.requestId}`,
    );
    throw error;
  }
}

export async function generateContentWithFallback(
  params: GenerateContentParams,
): Promise<{
  response: any;
  modelUsed: string;
  viaGateway: boolean;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  projectAlias?: string | null;
  requestId?: string;
  outcome?: "provider_success" | "cache_hit";
}> {
  if (process.env.MOCK_GEMINI === "true") {
    const contentsString = typeof params.contents === "string" ? params.contents : JSON.stringify(params.contents);
    let mockText = "";
    if (contentsString.includes("Please explain the following concept:")) {
      mockText = JSON.stringify({
        analogy: "Imagine a car driving down the street at a steady pace...",
        simplification: "Velocity is speed with a specific direction.",
        commonMisconception: "Students often confuse velocity with speed, which does not have a direction.",
      });
    } else if (contentsString.includes("Review the student")) {
      mockText = JSON.stringify({
        detectedMisconception: "The student incorrectly assumed that normal force is always equal to gravity, even on an inclined plane.",
        mathematicalError: "Forgot to multiply by cos(theta) in the force balance equation.",
        socraticGuidance: "1. What direction does the normal force act relative to the surface?\n2. How does the weight component perpendicular to the surface change as the angle increases?",
      });
    } else {
      mockText = JSON.stringify({
        knowledge_objects: [{
          conceptName: "Velocity definition",
          title: "Definition of Velocity",
          content: "Velocity defines the rate of change of position. Measured in meters per second ($m/s$).",
          type: "definition",
          difficulty: "easy",
          bloomLevel: "remember",
          tags: ["velocity"],
          importance: "high",
          metadata: {},
        }],
      });
    }
    return { response: { text: mockText }, modelUsed: "mock-model", viaGateway: false };
  }

  const providerParts = toProviderParts(params.contents);
  const hasImage = providerParts.some((part) => part.type === "image");
  const isVisual = Boolean(hasImage || params.route?.multimodal || params.route?.visualMode);

  if (providerRouterV2Enabled()) {
    if (!params.userId) {
      throw new Error("ZYRA_PROVIDER_ROUTER_USER_ID_REQUIRED");
    }
    try {
      const lifecycle = new RequestLifecycle({
        invokeProvider: invokeProviderThroughControlPlane,
      });
      const result = await lifecycle.execute({
        userId: params.userId,
        idempotencyKey: params.requestId,
        feature: params.feature ?? params.useCase ?? "zyra-provider-request",
        parts: providerParts,
        config: params.config,
        route: params.route,
        useCase: params.useCase,
        cacheStatus: params.cacheStatus,
        cachePolicy: params.cachePolicy,
        cacheKey: params.cacheKey,
        cacheTtlSeconds: params.cacheTtlSeconds,
      });
      const response = makeCompatibilityResponse(result.result);
      return {
        response,
        modelUsed: result.modelId,
        viaGateway: result.result.viaGateway ?? false,
        promptTokenCount: result.result.usage?.promptTokens,
        candidatesTokenCount: result.result.usage?.outputTokens,
        projectAlias: result.projectAlias,
        requestId: result.requestId,
        outcome: result.outcome,
      };
    } catch (lifecycleErr) {
      console.warn("Provider router execution failed, falling back to direct keypool:", lifecycleErr);
    }
  }

  const defaultPriority = isVisual
    ? getProviderRoutePlan({ ...params.route, multimodal: true, visualMode: true }).models.filter((model) => getModelEntry(model).input.image)
    : getModelChain(params.useCase);
  const modelPriority = await configuredModelChain(
    {
      feature: params.feature,
      useCase: params.useCase,
      visual: isVisual,
    },
    defaultPriority as import("@/lib/ai/provider/model-registry").ModelId[],
  );
  if (modelPriority.length === 0) throw new Error("No healthy multimodal model is available");
  let lastError: unknown = null;

  for (const model of modelPriority) {
    const entry = getModelEntry(model);
    const maxKeyAttempts = geminiKeyPool.getAllKeys().length;
    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      const key = geminiKeyPool.getBestKey(model);
      if (!key) break;

      const clients = getClientsPriority(key, modelSupportsAiGateway(model));
      for (const { client, viaGateway } of clients) {
        const clientLabel = viaGateway ? "gateway" : "direct";
        const startedAt = Date.now();
        try {
          const adapter = entry.family === "interactions"
            ? createGeminiInteractionsAdapter(client)
            : createGeminiGenerateAdapter(client);
          const result = await withGeminiRetry(() => adapter.generate({
            modelId: model,
            parts: providerParts,
            config: params.config,
          }));
          const response = makeCompatibilityResponse(result);
          logAiRequest({
            operation: "generateContent",
            model,
            viaGateway,
            latencyMs: Date.now() - startedAt,
            success: true,
          });
          geminiKeyPool.markSuccess(key.id, model);
          return {
            response,
            modelUsed: model,
            viaGateway,
            promptTokenCount: result.usage?.promptTokens,
            candidatesTokenCount: result.usage?.outputTokens,
          };
        } catch (error: unknown) {
          lastError = error;
          geminiKeyPool.markFailure(key.id, model, error instanceof Error ? error : new Error("Gemini request failed"));
          logAiRequest({
            operation: "generateContent",
            model,
            viaGateway,
            latencyMs: Date.now() - startedAt,
            success: false,
            error: error instanceof Error ? error.message : "Gemini request failed",
          });
          console.warn(`Gemini model ${model} via ${clientLabel} (key ${key.id}) failed`);
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Gemini models failed to generate content");
}

export { geminiKeyPool };
