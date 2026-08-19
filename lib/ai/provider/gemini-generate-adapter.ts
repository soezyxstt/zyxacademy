import type { GenerateContentConfig, Part } from "@google/genai";
import {
  assertGenerationModel,
  normalizeInputParts,
  normalizeModelResponse,
  withProviderDeadline,
  type GeminiGenerateClient,
  type ProviderGenerateRequest,
  type ProviderGenerationResult,
} from "@/lib/ai/provider/provider-adapter";
import { classifyProviderError } from "@/lib/ai/provider/errors";
import type { ModelThinkingPolicy } from "@/lib/ai/provider/model-registry";

const LEGACY_CONFIG_KEYS = [
  "temperature",
  "topP",
  "topK",
  "candidateCount",
  "responseMimeType",
  "responseSchema",
  "responseJsonSchema",
  "responseModalities",
  "stopSequences",
  "seed",
  "systemInstruction",
] as const;

function buildLegacyConfig(
  request: ProviderGenerateRequest,
  thinking: ModelThinkingPolicy,
  outputFloor: number,
  signal: AbortSignal,
  deadlineMs: number,
): GenerateContentConfig {
  const source = request.config ?? {};
  const config: Record<string, unknown> = {};
  for (const key of LEGACY_CONFIG_KEYS) {
    if (source[key] !== undefined) config[key] = source[key];
  }

  const configuredOutput = source.maxOutputTokens;
  const requestedOutput = typeof configuredOutput === "number" ? configuredOutput : 0;
  config.maxOutputTokens = Math.max(outputFloor, requestedOutput);

  if (thinking.kind === "level" && thinking.level) {
    config.thinkingConfig = { thinkingLevel: thinking.level };
  }

  config.abortSignal = signal;
  config.httpOptions = { timeout: deadlineMs };
  return config as GenerateContentConfig;
}

function toSdkParts(parts: ReturnType<typeof normalizeInputParts>): Part[] {
  return parts.map((part) => {
    if (part.type === "text") return { text: part.text };
    return { inlineData: { mimeType: part.mimeType, data: part.data } };
  });
}

export function createGeminiGenerateAdapter(client: GeminiGenerateClient) {
  return {
    async generate(request: ProviderGenerateRequest): Promise<ProviderGenerationResult> {
      const entry = assertGenerationModel(request.modelId, request.allowQuarantined === true);
      if (entry.family !== "generate-content") {
        throw new Error(`Gemini model ${entry.id} requires the interactions adapter`);
      }

      const parts = normalizeInputParts(request.parts, entry);
      const startedAt = Date.now();
      try {
        const response = await withProviderDeadline(
          (signal) => client.models.generateContent({
            model: entry.id,
            contents: [{ role: "user", parts: toSdkParts(parts) }],
            config: buildLegacyConfig(request, entry.thinking, entry.outputFloor, signal, entry.deadlineMs),
          }),
          entry.deadlineMs,
          entry.id,
        );
        return normalizeModelResponse(response, entry.id, startedAt);
      } catch (error) {
        throw classifyProviderError(error, entry.id);
      }
    },
  };
}
