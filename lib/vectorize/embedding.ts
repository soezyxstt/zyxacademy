import {
  assertCanonicalDimensions,
  CANONICAL_VECTOR_PROFILE,
  type CanonicalEmbeddingClient,
  type CanonicalEmbeddingClientRequest,
  type CanonicalEmbeddingInput,
  serializeCanonicalEmbeddingInput,
  VectorizeContractError,
} from "@/lib/vectorize/contracts";

export interface CanonicalContentV2EmbeddingAdapter {
  readonly profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  embed(input: CanonicalEmbeddingInput): Promise<number[]>;
  embedDocument(title: string, text: string): Promise<number[]>;
  embedQuery(text: string): Promise<number[]>;
}

function makeRequest(input: CanonicalEmbeddingInput): CanonicalEmbeddingClientRequest {
  return {
    model: CANONICAL_VECTOR_PROFILE.model,
    contents: serializeCanonicalEmbeddingInput(input),
    config: {
      outputDimensionality: CANONICAL_VECTOR_PROFILE.dimensions,
    },
  };
}

/**
 * Builds the only embedding adapter allowed to produce canonical-content-v2.
 * Project clients are tried in order, but every attempt uses the same model
 * and output dimension. There is intentionally no model fallback.
 */
export function createCanonicalContentV2EmbeddingAdapter(
  clients: readonly CanonicalEmbeddingClient[],
): CanonicalContentV2EmbeddingAdapter {
  if (clients.length === 0) {
    throw new VectorizeContractError("NO_EMBEDDING_CLIENTS", "at least one Gemini project client is required");
  }

  async function embed(input: CanonicalEmbeddingInput): Promise<number[]> {
    const request = makeRequest(input);
    const failures: string[] = [];

    for (const client of clients) {
      try {
        const response = await client.embedContent(request);
        const values = response.embeddings?.[0]?.values;
        if (!values) {
          throw new VectorizeContractError("EMPTY_EMBEDDING", "Gemini returned no embedding values");
        }
        assertCanonicalDimensions(values, `Gemini project ${client.projectId} embedding`);
        return values;
      } catch (error) {
        if (error instanceof VectorizeContractError && error.code === "DIMENSION_MISMATCH") {
          throw error;
        }
        failures.push(`${client.projectId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new VectorizeContractError(
      "EMBEDDING_FAILED",
      `gemini-embedding-2 failed for all configured project clients (${failures.join("; ")})`,
    );
  }

  return {
    profileId: CANONICAL_VECTOR_PROFILE.id,
    embed,
    embedDocument: (title, text) => embed({ purpose: "document", title, text }),
    embedQuery: (text) => embed({ purpose: "query", text }),
  };
}

/**
 * Small transport adapter for @google/genai clients. Keeping this conversion
 * separate makes the profile adapter testable with fake project clients and
 * avoids importing environment-bound Gemini key-pool state in contract tests.
 */
export function createGoogleGenAiEmbeddingClient(input: {
  projectId: string;
  client: {
    models: {
      embedContent(request: CanonicalEmbeddingClientRequest): Promise<{
        embeddings?: Array<{ values?: number[] }>;
      }>;
    };
  };
}): CanonicalEmbeddingClient {
  return {
    projectId: input.projectId,
    embedContent: (request) => input.client.models.embedContent(request),
  };
}
