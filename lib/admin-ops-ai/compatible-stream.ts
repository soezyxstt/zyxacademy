import { logAiRequest } from "@/lib/ai/analytics";
import { randomUUID } from "node:crypto";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";
import { compatibleSettings, selectGatewayCredential } from "@/lib/ai/provider/compatible-text";
import { generationAliasOutcome, withGatewayAlias } from "@/lib/ai/provider/alias-health";
import type { OpsAiModelStreamChunk } from "./model-factory";

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
    ...(options.tools?.length && /^gpt-6/.test(settings.model) ? {
      providerOptions: { ...options.providerOptions, zyxgateway: { ...options.providerOptions?.zyxgateway, reasoningEffort: "none" } },
    } : {}),
  });
  const reader = result.stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "error") throw new Error("Gateway streaming gagal.");
      if (value.type === "text-delta") yield { type: "text-delta", textDelta: value.delta };
      if (value.type === "tool-call") yield { type: "tool-call", toolCall: {
        id: value.toolCallId, name: value.toolName, args: JSON.parse(value.input),
      } };
      if (value.type === "finish") {
        await logAiRequest({ model: settings.model, operation: "chatCompletions", viaGateway: true, latencyMs: Date.now() - startedAt, success: true });
        const promptTokens = value.usage.inputTokens.total ?? 0;
        const completionTokens = value.usage.outputTokens.total ?? 0;
        yield { type: "finish", finishReason: value.finishReason.unified, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
