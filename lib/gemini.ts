import { zyraLiveProgress } from "./zyra/live-progress";
import { prepareCompatibleText } from "./ai/provider/compatible-text";
import { configuredModelChain } from "@/lib/ai/model-settings-store";
import { googleGatewayClient, prepareGoogleGatewayClient } from "./ai/provider/google-gateway-client";
import type { GoogleGenAI } from "@google/genai";
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
} from "@/lib/ai/provider/model-registry";
import {
  assertGenerationModel,
  normalizeInputParts,
  type ProviderInputPart,
  type ProviderGenerationResult,
  type GeminiGenerateClient,
  type GeminiInteractionsClient,
} from "@/lib/ai/provider/provider-adapter";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { getModelChain, getProviderRoutePlan, providerRouterV2Enabled, type ProviderRouteRequest } from "@/lib/ai-router";
import { ProviderNotDispatchedError, RequestLifecycle, RequestLifecycleError, isConfirmedHttpFailure, providerFailureAllowsFallback } from "@/lib/ai/request-lifecycle";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";

interface ClientPriority {
  client: GoogleGenAI;
  viaGateway: boolean;
}

function getClientsPriority(
  key: typeof geminiKeyPool["keys"][0],
): ClientPriority[] {
  return [{ client: key.client, viaGateway: true }];
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
  singleDispatch?: boolean;
}

function singleDispatchClient(client: GoogleGenAI, viaGateway: boolean): GeminiGenerateClient & GeminiInteractionsClient {
  const headers = viaGateway ? { "cf-aig-max-attempts": "1", "cf-aig-skip-cache": "true" } : {};
  return {
    models: {
      generateContent: ((input: any) => client.models.generateContent({
        ...input,
        config: { ...input.config, httpOptions: { ...input.config?.httpOptions, headers: { ...input.config?.httpOptions?.headers, ...headers }, retryOptions: { attempts: 1 } } },
      })) as GoogleGenAI["models"]["generateContent"],
      generateContentStream: ((input: any) => client.models.generateContentStream({
        ...input,
        config: { ...input.config, httpOptions: { ...input.config?.httpOptions, headers: { ...input.config?.httpOptions?.headers, ...headers }, retryOptions: { attempts: 1 } } },
      })) as GoogleGenAI["models"]["generateContentStream"],
    },
    interactions: {
      create: ((input: any, options: any) => client.interactions.create(input, { ...options, headers: { ...options?.headers, ...headers }, maxRetries: 0 })) as GoogleGenAI["interactions"]["create"],
    },
  };
}

function withoutInteractionRetries(client: GeminiInteractionsClient): GeminiInteractionsClient {
  return { interactions: {
    create: ((params: any, options: any) => client.interactions.create(params, { ...options, maxRetries: 0 })) as GoogleGenAI["interactions"]["create"],
  } };
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

async function prepareProviderThroughControlPlane(input: {
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
  singleDispatch?: boolean;
}): Promise<() => Promise<ProviderGenerationResult>> {
  if (getModelEntry(input.modelId).family === "chat-completions") {
    try { return await prepareCompatibleText(input); } catch (error) { throw new ProviderNotDispatchedError("compatible provider unavailable", error); }
  }
  const key = geminiKeyPool.getKeyByProjectAlias(input.projectAlias);
  if (!key) {
    throw new ProviderNotDispatchedError("selected provider project is not configured");
  }

  const entry = assertGenerationModel(input.modelId);
  normalizeInputParts(input.parts, entry);
  const viaGateway = true;
  const deadlineMs = zyraLiveProgress.getStore() ? Math.max(30_000, entry.deadlineMs) : entry.deadlineMs;
  const headers = buildAiGatewayHeaders({ ...input, deadlineMs });
  let client;
  try {
    client = await prepareGoogleGatewayClient(key.key, zyraRuntimeEnv, deadlineMs, headers, { modelId: input.modelId, preferByokAlias: key.byokAlias });
  } catch (error) { throw new ProviderNotDispatchedError("selected provider alias is unavailable", error); }
  if (!client) {
    throw new ProviderNotDispatchedError("selected provider client is unavailable");
  }

  return async () => {
    const startedAt = Date.now();
    try {
      const providerClient = input.singleDispatch ? singleDispatchClient(client, viaGateway) : client;
      const adapter = entry.family === "interactions"
        ? createGeminiInteractionsAdapter(withoutInteractionRetries(providerClient))
        : createGeminiGenerateAdapter({ models: providerClient.models });
      const result = await adapter.generate({
        modelId: input.modelId,
        parts: input.parts,
        config: input.config,
      });
      geminiKeyPool.markSuccess(key.id, input.modelId);
      await logAiRequest({
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
      await logAiRequest({
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
  };
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
      throw new RequestLifecycleError("ROUTER_INPUT_INVALID", "provider router requires a user");
    }
    const lifecycle = new RequestLifecycle({
      prepareProvider: prepareProviderThroughControlPlane,
      invokeProvider: async (input) => (await prepareProviderThroughControlPlane(input))(),
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
      cachePolicy: params.singleDispatch ? "bypass" : params.cachePolicy,
      cacheKey: params.singleDispatch ? undefined : params.cacheKey,
      cacheTtlSeconds: params.singleDispatch ? undefined : params.cacheTtlSeconds,
      singleDispatch: params.singleDispatch,
    });
    const response = makeCompatibilityResponse(result.result);
    return {
      response,
      modelUsed: result.result.upstreamModel ?? result.modelId,
      viaGateway: result.result.viaGateway ?? false,
      promptTokenCount: result.result.usage?.promptTokens,
      candidatesTokenCount: result.result.usage?.outputTokens,
      projectAlias: result.projectAlias,
      requestId: result.requestId,
      outcome: result.outcome,
    };
  }

  let modelPriority: readonly import("@/lib/ai/provider/model-registry").ModelId[];
  try {
    const defaultPriority = isVisual
      ? getProviderRoutePlan({ ...params.route, multimodal: true, visualMode: true }).models.filter((model) => getModelEntry(model).input.image)
      : getModelChain(params.useCase);
    modelPriority = await configuredModelChain(
      {
        feature: params.feature,
        useCase: params.useCase,
        visual: isVisual,
      },
      defaultPriority as import("@/lib/ai/provider/model-registry").ModelId[],
    );
  } catch (error) {
    throw new ProviderNotDispatchedError("provider model selection failed", error);
  }
  if (modelPriority.length === 0) throw new ProviderNotDispatchedError("No healthy multimodal model is available");
  let lastError: unknown = null;
  let preflightError: unknown = null;
  let providerAttempted = false;
  let allFailuresConfirmed = true;

  for (const model of modelPriority) {
    let entry: ReturnType<typeof assertGenerationModel>;
    try {
      entry = assertGenerationModel(model);
      normalizeInputParts(providerParts, entry);
    } catch (error) {
      preflightError = error;
      continue;
    }
    const maxKeyAttempts = geminiKeyPool.getAllKeys().length;
    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      const key = geminiKeyPool.getBestKey(model);
      if (!key) break;

      const clients = getClientsPriority(key);
      for (const { client, viaGateway } of clients) {
        const clientLabel = viaGateway ? "gateway" : "direct";
        const startedAt = Date.now();
        try {
          const providerClient = params.singleDispatch
            ? singleDispatchClient(
                googleGatewayClient(key.key, zyraRuntimeEnv, entry.deadlineMs, {}, { preferByokAlias: key.byokAlias }),
                viaGateway,
              )
            : client;
          const adapter = entry.family === "interactions"
            ? createGeminiInteractionsAdapter(withoutInteractionRetries(providerClient))
            : createGeminiGenerateAdapter(providerClient);
          const result = await withGeminiRetry(async () => {
            providerAttempted = true;
            try {
              return await adapter.generate({
                modelId: model,
                parts: providerParts,
                config: params.config,
              });
            } catch (error) {
              if (!isConfirmedHttpFailure(error) && !providerFailureAllowsFallback(error)) {
                throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider outcome requires reconciliation", undefined, error);
              }
              throw error;
            }
          }, params.singleDispatch ? 1 : undefined);
          const response = makeCompatibilityResponse(result);
          await logAiRequest({
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
          allFailuresConfirmed &&= isConfirmedHttpFailure(error);
          geminiKeyPool.markFailure(key.id, model, error instanceof Error ? error : new Error("Gemini request failed"));
          await logAiRequest({
            operation: "generateContent",
            model,
            viaGateway,
            latencyMs: Date.now() - startedAt,
            success: false,
            error: error instanceof Error ? error.message : "Gemini request failed",
          });
          console.warn(`Gemini model ${model} via ${clientLabel} (key ${key.id}) failed`);
          if (params.singleDispatch || !allFailuresConfirmed) {
            throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider outcome requires reconciliation", undefined, error);
          }
          if (!providerFailureAllowsFallback(error)) throw error;
        }
      }
    }
  }

  if (providerAttempted || lastError) {
    if (providerAttempted && !allFailuresConfirmed) throw new RequestLifecycleError("PROVIDER_OUTCOME_UNCERTAIN", "provider attempts require reconciliation", undefined, lastError);
    throw lastError instanceof Error && !(providerAttempted && lastError instanceof ProviderNotDispatchedError)
      ? lastError : new Error("Gemini provider attempt failed", { cause: lastError });
  }
  throw new ProviderNotDispatchedError(preflightError ? "provider input or model is unavailable" : "No Gemini key is available", preflightError);
}

export { geminiKeyPool };
