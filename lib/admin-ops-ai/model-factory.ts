import { geminiKeyPool, type GeminiKey } from "@/lib/gemini-keys";
import {
  MODEL_IDS,
  modelSupportsAiGateway,
} from "@/lib/ai/provider/model-registry";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import { type GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

// ============================================================================
// 1. Interfaces & Types
// ============================================================================

export interface OpsAiModelStreamChunk {
  type: "text-delta" | "tool-call" | "finish" | "error";
  textDelta?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: Error;
}

export interface OpsAiModelToolDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface OpsAiModelMessage {
  role: "user" | "model" | "assistant" | "tool";
  content?: string;
  parts?: Array<Record<string, unknown>>;
}

export interface OpsAiModelGenerateStreamOptions {
  systemPrompt?: string;
  messages: OpsAiModelMessage[];
  tools?: OpsAiModelToolDeclaration[];
  modelId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type OpsAiModelStreamProvider = (
  options: OpsAiModelGenerateStreamOptions
) => AsyncIterable<OpsAiModelStreamChunk>;

// ============================================================================
// 2. Test Mock Registry
// ============================================================================

let testMockProvider: OpsAiModelStreamProvider | null = null;

export function setOpsAiModelStreamMock(mock: OpsAiModelStreamProvider | null): void {
  testMockProvider = mock;
}

export function getOpsAiModelStreamMock(): OpsAiModelStreamProvider | null {
  return testMockProvider;
}

// ============================================================================
// 3. Provider Boundary: Key Management & Health Tracking
// ============================================================================

export interface ResolvedOpsAiModelKey {
  key: GeminiKey;
  modelId: string;
  viaGateway: boolean;
  client: GoogleGenAI;
}

/**
 * Resolves the best available Gemini key from geminiKeyPool respecting
 * quota, circuit breaker, and health state.
 */
export function getOpsAiModelKey(
  targetModelId: string = MODEL_IDS.stableFlash
): ResolvedOpsAiModelKey {
  const modelId = targetModelId;
  const bestKey = geminiKeyPool.getBestKey(modelId);

  if (!bestKey) {
    const healthyKeys = geminiKeyPool.getHealthyKeys();
    const fallbackKey =
      healthyKeys[0] ||
      geminiKeyPool.getKeyByProjectAlias("zyx-main") ||
      geminiKeyPool.getKeyByProjectAlias("default");

    if (!fallbackKey) {
      throw new ProviderAdapterError({
        code: "PROVIDER_ERROR",
        message: `Tidak ada API key Gemini yang tersedia untuk model ${modelId} (semua key kuota penuh atau circuit breaker OPEN).`,
        retryClassification: "rate_limited",
        modelId,
      });
    }

    const viaGateway = Boolean(
      zyraRuntimeEnv.CF_AI_GATEWAY_URL && modelSupportsAiGateway(modelId)
    );
    const client = viaGateway && fallbackKey.clientGateway
      ? fallbackKey.clientGateway
      : fallbackKey.client;

    return {
      key: fallbackKey,
      modelId,
      viaGateway,
      client,
    };
  }

  const viaGateway = Boolean(
    zyraRuntimeEnv.CF_AI_GATEWAY_URL && modelSupportsAiGateway(modelId)
  );
  const client = viaGateway && bestKey.clientGateway
    ? bestKey.clientGateway
    : bestKey.client;

  return {
    key: bestKey,
    modelId,
    viaGateway,
    client,
  };
}

export function recordModelSuccess(keyId: string, modelId: string): void {
  geminiKeyPool.markSuccess(keyId, modelId);
}

export function recordModelFailure(keyId: string, modelId: string, error: Error): void {
  geminiKeyPool.markFailure(keyId, modelId, error);
}

// ============================================================================
// 4. Model Streaming Generator
// ============================================================================

/**
 * Transforms OpsAi messages and tool declarations into Gemini SDK parameters
 * and streams results via geminiKeyPool.
 */
export async function* streamOpsAiModel(
  options: OpsAiModelGenerateStreamOptions
): AsyncGenerator<OpsAiModelStreamChunk, void, unknown> {
  // If a test mock is configured, use it
  if (testMockProvider) {
    yield* testMockProvider(options);
    return;
  }

  const modelId = options.modelId || MODEL_IDS.stableFlash;
  const { key, client } = getOpsAiModelKey(modelId);

  // 1. Build Gemini contents
  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];

  for (const msg of options.messages) {
    const role = (msg.role === "assistant" || msg.role === "model") ? "model" : "user";
    if (msg.parts && msg.parts.length > 0) {
      contents.push({ role, parts: msg.parts });
    } else if (msg.content) {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  // 2. Build Gemini config with tools
  const config: Record<string, unknown> = {};

  if (options.signal) {
    config.abortSignal = options.signal;
  }
  config.httpOptions = { timeout: options.timeoutMs ?? 60000 };

  if (options.systemPrompt) {
    config.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  if (options.tools && options.tools.length > 0) {
    const functionDeclarations = options.tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      parameters: t.parameters || { type: "object", properties: {} },
    }));
    config.tools = [{ functionDeclarations }];
  }

  // 3. Stream from Gemini client
  try {
    if (options.signal?.aborted) {
      throw new Error("Aborted before starting model request");
    }

    const responseStream = await client.models.generateContentStream({
      model: modelId,
      contents,
      config: config as any,
    });

    if (
      responseStream == null ||
      typeof (responseStream as any)[Symbol.asyncIterator] !== "function"
    ) {
      throw new Error(
        `Gemini generateContentStream returned a non-iterable response (${typeof responseStream}). ` +
        `This may indicate an API version mismatch or a gateway configuration issue.`
      );
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason = "stop";
    let sawFunctionCall = false;

    for await (const chunk of responseStream) {
      if (options.signal?.aborted) {
        throw new Error("Model stream aborted by user");
      }

      // Function-call presence is authoritative for agent-loop continuation.
      // Gemini commonly reports candidate finishReason=STOP even when the
      // candidate content contains functionCall parts, so do not let that STOP
      // overwrite tool-call semantics required by AI SDK ToolLoopAgent.
      const functionCalls = chunk.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        sawFunctionCall = true;
        finishReason = "tool-calls";
        for (const fc of functionCalls) {
          yield {
            type: "tool-call",
            toolCall: {
              id: (fc as any).id || `call-${randomUUID().slice(0, 8)}`,
              name: fc.name || "",
              args: (fc.args as Record<string, unknown>) || {},
            },
          };
        }
      }

      // Check for text delta
      const text = chunk.text;
      if (text) {
        yield {
          type: "text-delta",
          textDelta: text,
        };
      }

      // Capture usage metadata if present
      if (chunk.usageMetadata) {
        promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
        completionTokens = chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
      }

      if (!sawFunctionCall && chunk.candidates && chunk.candidates[0]?.finishReason) {
        finishReason = chunk.candidates[0].finishReason;
      }
    }

    recordModelSuccess(key.id, modelId);

    yield {
      type: "finish",
      finishReason: sawFunctionCall ? "tool-calls" : finishReason,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    recordModelFailure(key.id, modelId, err);
    throw err;
  }
}
