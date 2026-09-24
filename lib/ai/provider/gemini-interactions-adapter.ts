import type { Interactions } from "@google/genai";
import {
  assertGenerationModel,
  normalizeInputParts,
  normalizeInteractionResponse,
  withProviderDeadline,
  type GeminiInteractionsClient,
  type ProviderGenerateRequest,
  type ProviderGenerationResult,
} from "@/lib/ai/provider/provider-adapter";
import { classifyProviderError } from "@/lib/ai/provider/errors";

type InteractionImageMimeType = NonNullable<Interactions.ImageContent["mime_type"]>;
type InteractionResponseModality = NonNullable<
  Interactions.CreateModelInteractionParamsNonStreaming["response_modalities"]
>[number];

const INTERACTION_IMAGE_MIME_TYPES = new Set<InteractionImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

const INTERACTION_RESPONSE_MODALITIES = new Set<InteractionResponseModality>([
  "text",
  "image",
  "audio",
  "video",
  "document",
]);

function toInteractionImageMimeType(mimeType: string): InteractionImageMimeType {
  if (INTERACTION_IMAGE_MIME_TYPES.has(mimeType as InteractionImageMimeType)) {
    return mimeType as InteractionImageMimeType;
  }
  throw new Error(`Unsupported Gemini interaction image MIME type: ${mimeType}`);
}

function toInteractionResponseModalities(value: unknown): InteractionResponseModality[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const modalities = value.filter(
    (item): item is InteractionResponseModality =>
      typeof item === "string" &&
      INTERACTION_RESPONSE_MODALITIES.has(item as InteractionResponseModality),
  );
  return modalities.length > 0 ? modalities : undefined;
}

function toInteractionInput(parts: ReturnType<typeof normalizeInputParts>): Interactions.Content[] {
  return parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    return { type: "image", data: part.data, mime_type: toInteractionImageMimeType(part.mimeType) };
  });
}

/**
 * Creates an adapter for Gemini Interactions API models.
 */
export function createGeminiInteractionsAdapter(client: GeminiInteractionsClient) {
  return {
    async generate(request: ProviderGenerateRequest): Promise<ProviderGenerationResult> {
      const entry = assertGenerationModel(request.modelId, request.allowQuarantined === true);
      if (entry.family !== "interactions") {
        throw new Error(`Gemini model ${entry.id} requires the generate-content adapter`);
      }

      const parts = normalizeInputParts(request.parts, entry);
      const source = request.config ?? {};
      const configuredOutput = source.maxOutputTokens;
      const requestedOutput = typeof configuredOutput === "number" ? Math.max(entry.outputFloor, configuredOutput) : undefined;
      const responseModalities = toInteractionResponseModalities(source.responseModalities);
      const input: Interactions.CreateModelInteractionParamsNonStreaming = {
        model: entry.id,
        input: toInteractionInput(parts),
        stream: false,
        generation_config: {
          ...(typeof requestedOutput === "number" ? { max_output_tokens: requestedOutput } : {}),
          ...(entry.thinking.kind === "level" && entry.thinking.level
            ? { thinking_level: entry.thinking.level }
            : {}),
        },
        ...(typeof source.systemInstruction === "string"
          ? { system_instruction: source.systemInstruction }
          : {}),
        ...(responseModalities
          ? { response_modalities: responseModalities }
          : {}),
      };

      const startedAt = Date.now();
      try {
        const response = await withProviderDeadline(
          (signal) => client.interactions.create(input, {
            timeout: entry.deadlineMs,
            signal,
          }),
          entry.deadlineMs,
          entry.id,
        );
        return normalizeInteractionResponse(response, entry.id, startedAt);
      } catch (error) {
        throw classifyProviderError(error, entry.id);
      }
    },
  };
}
