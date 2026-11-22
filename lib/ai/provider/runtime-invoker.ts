import { prepareCompatibleText } from "./compatible-text";
import { prepareGoogleGatewayClient } from "./google-gateway-client";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";
import { classifyProviderError, ProviderAdapterError } from "@/lib/ai/provider/errors";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import { getModelEntry, getProjectAliases } from "@/lib/ai/provider/model-registry";
import type { ProviderGenerationResult, ProviderInputPart } from "@/lib/ai/provider/provider-adapter";
import type { RequestLifecycleDependencies } from "@/lib/ai/request-lifecycle";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const API_KEY_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4",
] as const;

function runtimeConfigurationError(message: string): ProviderAdapterError {
  return new ProviderAdapterError({
    code: "PROVIDER_ERROR",
    message,
    retryClassification: "unknown",
  });
}

function providerSlots(environment: RuntimeEnvironment) {
  const slots = new Map<string, Array<{ key: string; byokAlias: string }>>();
  getProjectAliases(environment).forEach((group, index) => {
    const key = environment[API_KEY_NAMES[index]]?.trim() ?? "";
    const byokAlias = `gemini_${index + 1}`;
    if (key) slots.set(group, [...(slots.get(group) ?? []), { key, byokAlias }]);
  });
  return slots;
}

export type ProcessEnvProviderInvokerOptions = {
  readonly environment?: RuntimeEnvironment;
};

export function createProviderPreparerFromEnvironment(
  options: ProcessEnvProviderInvokerOptions = {},
): NonNullable<RequestLifecycleDependencies["prepareProvider"]> {
  const environment = options.environment ?? process.env;
  let slots: ReturnType<typeof providerSlots> | undefined;
  const gatewayUrl = environment.CF_AI_GATEWAY_URL?.trim();
  const gatewayToken = environment.CF_AI_GATEWAY_TOKEN?.trim();

  if (!gatewayUrl || !gatewayToken) {
    throw runtimeConfigurationError("AI Gateway URL and token must be configured together");
  }

  return async (input) => {
    if (getModelEntry(input.modelId).family === "chat-completions") return prepareCompatibleText(input, environment);
    slots ??= providerSlots(environment);
    const slot = slots.get(input.projectAlias);
    if (!slot) {
      throw new ProviderAdapterError({
        code: "PROVIDER_ERROR",
        message: "selected provider project is not configured",
        retryClassification: "unknown",
        modelId: input.modelId,
      });
    }

    const entry = getModelEntry(input.modelId);
    const viaGateway = true;
    const gatewayHeaders = buildAiGatewayHeaders({ ...input, deadlineMs: entry.deadlineMs });

    const selected = slot[Math.floor(Math.random() * slot.length)];
    const client = await prepareGoogleGatewayClient(selected.key, environment, entry.deadlineMs, gatewayHeaders, {
      modelId: input.modelId,
      preferByokAlias: selected.byokAlias,
    });
    const adapter = entry.family === "interactions"
      ? createGeminiInteractionsAdapter({ interactions: client.interactions })
      : createGeminiGenerateAdapter({ models: client.models });
    return async (): Promise<ProviderGenerationResult> => {
      try {
        const result = await adapter.generate({
          modelId: input.modelId,
          parts: input.parts as readonly ProviderInputPart[],
          config: input.config,
        });
        return { ...result, providerRequestId: result.providerRequestId ?? input.requestId, viaGateway };
      } catch (error) {
        throw classifyProviderError(error, input.modelId);
      }
    };
  };
}

export function createProviderInvokerFromEnvironment(options: ProcessEnvProviderInvokerOptions = {}): RequestLifecycleDependencies["invokeProvider"] {
  const prepare = createProviderPreparerFromEnvironment(options);
  return async input => (await prepare(input))();
}
