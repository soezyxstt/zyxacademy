import type {
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import {
  assertOrdinaryRoutingAllowed,
  getModelEntry,
  normalizeModelId,
  type ModelRegistryEntry,
} from "@/lib/ai/provider/model-registry";
import {
  classifyProviderError,
  ProviderAdapterError,
  type ProviderRetryClassification,
} from "@/lib/ai/provider/errors";

export type ProviderInputPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly mimeType: string; readonly data: string };

export interface ProviderGenerateRequest {
  readonly modelId: string;
  readonly parts: readonly ProviderInputPart[];
  readonly config?: Readonly<Record<string, unknown>>;
  readonly allowQuarantined?: boolean;
  readonly cacheKey?: string;
  readonly cacheTtlSeconds?: number;
}

export interface ProviderUsage {
  readonly promptTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface ProviderGenerationResult {
  readonly modelId: string;
  readonly text: string;
  readonly finishReason: string;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
  readonly usage?: ProviderUsage;
  readonly retryClassification: ProviderRetryClassification;
  readonly rawResponse?: unknown;
}

export interface GeminiGenerateClient {
  readonly models: Pick<GoogleGenAI["models"], "generateContent">;
}

export interface GeminiInteractionsClient {
  readonly interactions: Pick<GoogleGenAI["interactions"], "create">;
}

export interface GeminiEmbeddingClient {
  readonly models: Pick<GoogleGenAI["models"], "embedContent">;
}

export type GeminiGenerateSdkRequest = GenerateContentParameters;
export type GeminiGenerateSdkResponse = GenerateContentResponse;
export type GeminiEmbedSdkRequest = EmbedContentParameters;
export type GeminiEmbedSdkResponse = EmbedContentResponse;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function decodedBase64Bytes(data: string): number {
  if (data.length === 0 || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "image data must be valid base64",
      retryClassification: "invalid_request",
    });
  }
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

export function normalizeInputParts(
  parts: readonly ProviderInputPart[],
  entry: ModelRegistryEntry,
): ProviderInputPart[] {
  if (parts.length === 0) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "provider input must contain at least one part",
      retryClassification: "invalid_request",
      modelId: entry.id,
    });
  }

  return parts.map((part) => {
    if (part.type === "text") {
      if (part.text.trim().length === 0) {
        throw new ProviderAdapterError({
          code: "INVALID_INPUT",
          message: "text input parts must be non-empty",
          retryClassification: "invalid_request",
          modelId: entry.id,
        });
      }
      return { type: "text", text: part.text };
    }

    if (!entry.input.image) {
      throw new ProviderAdapterError({
        code: "CAPABILITY_REJECTED",
        message: `Gemini model ${entry.id} does not accept image input`,
        retryClassification: "invalid_request",
        modelId: entry.id,
      });
    }

    if (!entry.input.acceptedImageMimeTypes.includes(part.mimeType)) {
      throw new ProviderAdapterError({
        code: "CAPABILITY_REJECTED",
        message: `Gemini model ${entry.id} does not accept ${part.mimeType} image input`,
        retryClassification: "invalid_request",
        modelId: entry.id,
      });
    }

    if (decodedBase64Bytes(part.data) > entry.input.maxInlineImageBytes) {
      throw new ProviderAdapterError({
        code: "CAPABILITY_REJECTED",
        message: `image input exceeds the ${entry.input.maxInlineImageBytes} byte limit`,
        retryClassification: "invalid_request",
        modelId: entry.id,
      });
    }

    return { type: "image", mimeType: part.mimeType, data: part.data };
  });
}

export function assertGenerationModel(modelId: string, allowQuarantined = false): ModelRegistryEntry {
  const entry = allowQuarantined ? getModelEntry(modelId) : assertOrdinaryRoutingAllowed(modelId);
  if (!entry.operations.includes("generate")) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: `Gemini model ${entry.id} does not support generation`,
      retryClassification: "invalid_request",
      modelId: entry.id,
    });
  }
  return entry;
}

export function assertEmbeddingModel(modelId: string): ModelRegistryEntry {
  const entry = getModelEntry(modelId);
  if (entry.id !== "gemini-embedding-2" || !entry.operations.includes("embed") || entry.dimensions !== 768) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "only the approved 768-dimensional Gemini Embedding 2 path is available",
      retryClassification: "invalid_request",
      modelId: entry.id,
    });
  }
  return entry;
}

export async function withProviderDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
  modelId: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderAdapterError({
        code: "REQUEST_TIMEOUT",
        message: `Gemini request exceeded the ${deadlineMs}ms deadline`,
        retryClassification: "timeout",
        modelId,
      }));
    }, deadlineMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    throw error instanceof ProviderAdapterError ? error : classifyProviderError(error, modelId);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function normalizeModelResponse(
  response: GeminiGenerateSdkResponse,
  modelId: string,
  startedAt: number,
): ProviderGenerationResult {
  const candidate = response.candidates?.[0];
  const text = response.text ?? candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (text.trim().length === 0) {
    throw new ProviderAdapterError({
      code: "MALFORMED_RESPONSE",
      message: "Gemini returned no visible text",
      retryClassification: "malformed_response",
      modelId,
    });
  }

  const usage = response.usageMetadata;
  return {
    modelId,
    text,
    finishReason: String(candidate?.finishReason ?? "UNKNOWN"),
    latencyMs: Date.now() - startedAt,
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
    retryClassification: "none",
    rawResponse: response,
  };
}

export function normalizeInteractionResponse(
  response: unknown,
  modelId: string,
  startedAt: number,
): ProviderGenerationResult {
  const value = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const text = typeof value.output_text === "string" ? value.output_text : "";
  if (text.trim().length === 0) {
    throw new ProviderAdapterError({
      code: "MALFORMED_RESPONSE",
      message: "Gemini interaction returned no visible text",
      retryClassification: "malformed_response",
      modelId,
    });
  }

  const usage = value.usage && typeof value.usage === "object" ? value.usage as Record<string, unknown> : undefined;
  return {
    modelId,
    text,
    finishReason: typeof value.status === "string" ? value.status : "COMPLETED",
    latencyMs: Date.now() - startedAt,
    usage: usage
      ? {
          promptTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
          outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
          totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
        }
      : undefined,
    retryClassification: "none",
    rawResponse: response,
  };
}

export function toProviderInputParts(contents: string | readonly ProviderInputPart[]): ProviderInputPart[] {
  if (typeof contents === "string") return [{ type: "text", text: contents }];
  return contents.map((part) => ({ ...part }));
}

export function normalizeProviderModelId(modelId: string): string {
  return normalizeModelId(modelId);
}
