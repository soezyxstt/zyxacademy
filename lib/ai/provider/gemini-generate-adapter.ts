import { zyraLiveProgress } from "@/lib/zyra/live-progress";
import { upstreamModelName } from "@/lib/ai/provider/model-registry";
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

/**
 * Constructs the generateContent configuration with thinking level and timeout boundaries.
 */
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
  if (typeof configuredOutput === "number") {
    config.maxOutputTokens = Math.max(outputFloor, configuredOutput);
  }

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

/**
 * Creates an adapter for standard Gemini generateContent SDK models.
 */
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
        const deadlineMs = zyraLiveProgress.getStore() ? Math.max(entry.deadlineMs, 30_000) : entry.deadlineMs;
        const response = await withProviderDeadline(
          async (signal) => {
            const params = {
              model: upstreamModelName(entry.id),
              contents: [{ role: "user", parts: toSdkParts(parts) }],
              config: buildLegacyConfig(request, entry.thinking, entry.outputFloor, signal, deadlineMs),
            };
            const progress = zyraLiveProgress.getStore();
            progress?.("dispatch");
            if (!progress || !client.models.generateContentStream) return client.models.generateContent(params);
            const stream = await client.models.generateContentStream(params);
            let text = "";
            let last;
            for await (const chunk of stream) {
              last = chunk;
              const delta = chunk.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("");
              if (delta) { text += delta; progress("receiving"); }
            }
            const candidate = last?.candidates?.[0];
            if (!last || !candidate?.finishReason) throw new Error("Incomplete Gemini stream");
            progress("checking");
            last.candidates = [{ ...candidate, content: { role: "model", parts: [{ text }] } }];
            return last;
          },
          deadlineMs,
          entry.id,
        );
        return normalizeModelResponse(response, entry.id, startedAt);
      } catch (error) {
        throw classifyProviderError(error, entry.id);
      }
    },
  };
}
