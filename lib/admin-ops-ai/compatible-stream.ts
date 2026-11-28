import { logAiRequest } from "@/lib/ai/analytics";
import { randomUUID } from "node:crypto";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";
import { compatibleSettings, selectGatewayCredential } from "@/lib/ai/provider/compatible-text";
import { generationAliasOutcome, withGatewayAlias } from "@/lib/ai/provider/alias-health";
import type { OpsAiModelStreamChunk } from "./model-factory";

function isTrailingChunkParseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; message?: unknown; cause?: unknown };
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  if (
    name === "AI_TypeValidationError" ||
    name === "TypeValidationError" ||
    name === "AI_JSONParseError" ||
    name === "JSONParseError" ||
    name === "ZodError" ||
    name === "SyntaxError"
  ) {
    return true;
  }
  if (
    /type validation failed|json parsing failed|unexpected end of json|unexpected token|invalid_type|invalid json/i.test(
      message
    )
  ) {
    return true;
  }
  if (err.cause && err.cause !== error) {
    return isTrailingChunkParseError(err.cause);
  }
  return false;
}

function formatStreamErrorDetail(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function* consumeCompatibleOpsStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
  meta: {
    model: string;
    startedAt: number;
    onLogSuccess?: (latencyMs: number) => Promise<void>;
  }
): AsyncGenerator<OpsAiModelStreamChunk> {
  const reader = stream.getReader();
  const logSuccess =
    meta.onLogSuccess ??
    (async (latencyMs: number) => {
      await logAiRequest({
        model: meta.model,
        operation: "chatCompletions",
        viaGateway: true,
        latencyMs,
        success: true,
      });
    });

  let sawText = false;
  let sawToolCalls = false;
  let sawFinish = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.type === "error") {
        console.warn("[OpsAi Compatible Stream Error]:", {
          model: meta.model,
          sawText,
          sawToolCalls,
          error: value.error,
        });
        if ((sawText || sawToolCalls) && isTrailingChunkParseError(value.error)) {
          break;
        }
        throw new Error(
          `Gateway streaming gagal: ${formatStreamErrorDetail(value.error)}`,
          { cause: value.error }
        );
      }

      if (value.type === "text-delta") {
        if (value.delta) sawText = true;
        yield { type: "text-delta", textDelta: value.delta };
      }

      if (value.type === "tool-call") {
        sawToolCalls = true;
        const parsedArgs =
          typeof value.input === "string" && value.input.trim()
            ? (JSON.parse(value.input) as Record<string, unknown>)
            : {};
        yield {
          type: "tool-call",
          toolCall: {
            id: value.toolCallId,
            name: value.toolName,
            args: parsedArgs,
          },
        };
      }

      if (value.type === "finish") {
        sawFinish = true;
        await logSuccess(Date.now() - meta.startedAt).catch(() => {});
        const promptTokens = value.usage?.inputTokens?.total ?? 0;
        const completionTokens = value.usage?.outputTokens?.total ?? 0;
        const finishReason =
          value.finishReason?.unified ?? (sawToolCalls ? "tool-calls" : "stop");
        yield {
          type: "finish",
          finishReason,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        };
      }
    }

    if (!sawFinish && (sawText || sawToolCalls)) {
      console.warn(
        "[OpsAi Compatible Stream] Stream ended without finish event after emitting output; synthesizing finish.",
        { model: meta.model, sawText, sawToolCalls }
      );
      await logSuccess(Date.now() - meta.startedAt).catch(() => {});
      yield {
        type: "finish",
        finishReason: sawToolCalls ? "tool-calls" : "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* streamCompatibleOpsModel(id: string, options: LanguageModelV3CallOptions, timeoutMs: number): AsyncGenerator<OpsAiModelStreamChunk> {
  const settings = compatibleSettings(process.env, id);
  if (!settings) throw new Error("Gateway streaming belum tersedia.");
  const alias = await selectGatewayCredential(settings, process.env);
  const headers = buildAiGatewayHeaders({ requestId: randomUUID(), userCohort: "admin", feature: "admin-ops-ai", routeClass: "default", modelId: id, deadlineMs: timeoutMs });
  const provider = createOpenAICompatible({
    name: "zyxgateway",
    baseURL: settings.url.replace(/\/chat\/completions$/, ""),
    headers: { ...headers, "cf-aig-authorization": "Bearer " + settings.token, "cf-aig-byok-alias": alias, "cf-aig-no-wholesale": "true" },
    fetch: Object.assign((...args: Parameters<typeof fetch>) => {
      const [url, init] = args;
      return withGatewayAlias(process.env, settings.url, alias,
        () => fetch(url, { ...init, redirect: "error" }), generationAliasOutcome, true);
    }, { preconnect: fetch.preconnect }),
  });
  const deadline = AbortSignal.timeout(timeoutMs);
  const startedAt = Date.now();
  const result = await provider.chatModel(settings.model).doStream({
    ...options,
    abortSignal: options.abortSignal ? AbortSignal.any([options.abortSignal, deadline]) : deadline,
    ...(options.tools?.length && /^(?:gpt-5\.[1-9]|gpt-6)/.test(settings.model) ? {
      providerOptions: { ...options.providerOptions, zyxgateway: { ...options.providerOptions?.zyxgateway, reasoningEffort: "none" } },
    } : {}),
  });
  yield* consumeCompatibleOpsStream(result.stream, {
    model: settings.model,
    startedAt,
  });
}
