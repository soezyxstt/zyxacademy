import { GoogleGenAI } from "@google/genai";
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

function requiredEnvironmentValue(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw runtimeConfigurationError(`provider runtime configuration is missing ${name}`);
  return value;
}

function providerSlots(environment: RuntimeEnvironment): ReadonlyMap<string, { apiKey: string }> {
  const aliases = getProjectAliases({
    GEMINI_PROJECT_ALIAS_1: environment.GEMINI_PROJECT_ALIAS_1,
    GEMINI_PROJECT_ALIAS_2: environment.GEMINI_PROJECT_ALIAS_2,
    GEMINI_PROJECT_ALIAS_3: environment.GEMINI_PROJECT_ALIAS_3,
    GEMINI_PROJECT_ALIAS_4: environment.GEMINI_PROJECT_ALIAS_4,
  });
  const slots = aliases.map((projectAlias, index) => ({
    projectAlias,
    apiKey: requiredEnvironmentValue(environment, API_KEY_NAMES[index]),
  }));
  return new Map(slots.map((slot) => [slot.projectAlias, { apiKey: slot.apiKey }]));
}

export type ProcessEnvProviderInvokerOptions = {
  readonly environment?: RuntimeEnvironment;
};

export function createProviderInvokerFromEnvironment(
  options: ProcessEnvProviderInvokerOptions = {},
): RequestLifecycleDependencies["invokeProvider"] {
  const environment = options.environment ?? process.env;
  const slots = providerSlots(environment);
  const gatewayUrl = environment.CF_AI_GATEWAY_URL?.trim();
  const gatewayToken = environment.CF_AI_GATEWAY_TOKEN?.trim();

  if (Boolean(gatewayUrl) !== Boolean(gatewayToken)) {
    throw runtimeConfigurationError("AI Gateway URL and token must be configured together");
  }

  return async (input): Promise<ProviderGenerationResult> => {
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
    const viaGateway = Boolean(gatewayUrl && gatewayToken);
    const gatewayHeaders = viaGateway
      ? {
          "cf-aig-authorization": `Bearer ${gatewayToken}`,
          ...buildAiGatewayHeaders({
            requestId: input.requestId,
            userCohort: input.userCohort,
            feature: input.feature,
            routeClass: input.routeClass,
            modelId: input.modelId,
            cachePolicy: input.cachePolicy,
            cacheKey: input.cacheKey,
            cacheTtlSeconds: input.cacheTtlSeconds,
            deadlineMs: entry.deadlineMs,
          }),
        }
      : undefined;

    try {
      const client = new GoogleGenAI({
        apiKey: slot.apiKey,
        httpOptions: {
          ...(gatewayUrl ? { baseUrl: gatewayUrl } : {}),
          ...(gatewayHeaders ? { headers: gatewayHeaders } : {}),
          timeout: entry.deadlineMs,
        },
      });
      const adapter = entry.family === "interactions"
        ? createGeminiInteractionsAdapter({ interactions: client.interactions })
        : createGeminiGenerateAdapter({ models: client.models });
      const result = await adapter.generate({
        modelId: input.modelId,
        parts: input.parts as readonly ProviderInputPart[],
        config: input.config,
      });
      return { ...result, providerRequestId: result.providerRequestId ?? input.requestId };
    } catch (error) {
      throw classifyProviderError(error, input.modelId);
    }
  };
}
