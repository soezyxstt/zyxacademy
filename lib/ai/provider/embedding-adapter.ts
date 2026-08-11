import type { EmbedContentParameters } from "@google/genai";
import {
  EMBEDDING_PROFILES,
  type EmbeddingProfile,
  type EmbeddingProfileId,
} from "@/lib/ai/provider/model-registry";
import {
  assertEmbeddingModel,
  withProviderDeadline,
  type GeminiEmbeddingClient,
} from "@/lib/ai/provider/provider-adapter";
import { classifyProviderError, ProviderAdapterError } from "@/lib/ai/provider/errors";

export interface ProfiledEmbeddingInput {
  readonly text: string;
  readonly title?: string;
}
export interface ProfiledEmbeddingResult {
  readonly profileId: EmbeddingProfileId;
  readonly modelId: "gemini-embedding-2";
  readonly dimensions: 768;
  readonly values: number[];
}

export interface ProfiledEmbeddingAdapter {
  readonly profile: EmbeddingProfile;
  embed(input: ProfiledEmbeddingInput): Promise<ProfiledEmbeddingResult>;
}

export function getEmbeddingProfile(profileId: string): EmbeddingProfile {
  if (!(profileId in EMBEDDING_PROFILES)) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: `unknown embedding profile ${profileId}`,
      retryClassification: "invalid_request",
    });
  }
  return EMBEDDING_PROFILES[profileId as EmbeddingProfileId];
}

export function assertEmbeddingProfileIndex(profileId: string, indexAlias: string): void {
  const profile = getEmbeddingProfile(profileId);
  if (profile.indexAlias !== indexAlias) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: `embedding profile ${profile.id} cannot access index ${indexAlias}`,
      retryClassification: "invalid_request",
    });
  }
}

function serializeProfileInput(profile: EmbeddingProfile, input: ProfiledEmbeddingInput): string {
  if (input.text.trim().length === 0) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "embedding text must be non-empty",
      retryClassification: "invalid_request",
    });
  }

  const title = input.title?.trim() || "none";
  const purpose = input.title ? "document" : "query";
  return `${profile.taskInstructionVersion} | ${purpose} | title: ${title} | text: ${input.text}`;
}

function makeRequest(profile: EmbeddingProfile, input: ProfiledEmbeddingInput, signal: AbortSignal): EmbedContentParameters {
  const contents = serializeProfileInput(profile, input);
  return {
    model: profile.model,
    contents,
    config: {
      taskType: input.title ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      title: input.title?.trim() || undefined,
      outputDimensionality: profile.dimensions,
      abortSignal: signal,
      httpOptions: { timeout: 15_000 },
    },
  };
}

function assertDimensions(values: readonly number[], profile: EmbeddingProfile, projectId: string): number[] {
  if (values.length !== profile.dimensions) {
    throw new ProviderAdapterError({
      code: "MALFORMED_RESPONSE",
      message: `${profile.id} from ${projectId} must contain exactly ${profile.dimensions} values`,
      retryClassification: "malformed_response",
    });
  }
  if (!values.every((value) => Number.isFinite(value))) {
    throw new ProviderAdapterError({
      code: "MALFORMED_RESPONSE",
      message: `${profile.id} contains a non-finite vector value`,
      retryClassification: "malformed_response",
    });
  }
  return [...values];
}

export function createProfiledEmbeddingAdapter(input: {
  readonly profileId: EmbeddingProfileId;
  readonly clients: readonly GeminiEmbeddingClient[];
}): ProfiledEmbeddingAdapter {
  const profile = getEmbeddingProfile(input.profileId);
  assertEmbeddingModel(profile.model);
  if (input.clients.length === 0) {
    throw new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "at least one Gemini project client is required for embeddings",
      retryClassification: "invalid_request",
      modelId: profile.model,
    });
  }

  return {
    profile,
    async embed(requestInput): Promise<ProfiledEmbeddingResult> {
      const failures: string[] = [];
      for (const client of input.clients) {
        try {
          const response = await withProviderDeadline(
            (signal) => client.models.embedContent(makeRequest(profile, requestInput, signal)),
            15_000,
            profile.model,
          );
          const values = response.embeddings?.[0]?.values;
          if (!values) {
            throw new ProviderAdapterError({
              code: "MALFORMED_RESPONSE",
              message: `${profile.id} returned no vector values`,
              retryClassification: "malformed_response",
              modelId: profile.model,
            });
          }
          return {
            profileId: profile.id,
            modelId: profile.model,
            dimensions: profile.dimensions,
            values: assertDimensions(values, profile, "Gemini project"),
          };
        } catch (error) {
          const typed = classifyProviderError(error, profile.model);
          if (typed.code === "MALFORMED_RESPONSE" && typed.message.includes("must contain exactly")) throw typed;
          failures.push(typed.retryClassification);
        }
      }

      throw new ProviderAdapterError({
        code: "PROVIDER_ERROR",
        message: `${profile.id} failed for all configured Gemini project clients`,
        retryClassification: failures.includes("rate_limited") ? "rate_limited" : "transient",
        modelId: profile.model,
      });
    },
  };
}
