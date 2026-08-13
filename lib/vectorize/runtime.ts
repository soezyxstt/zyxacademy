import {
  CANONICAL_VECTOR_PROFILE,
  serializeCanonicalEmbeddingInput,
  type CanonicalEmbeddingInput,
} from "@/lib/vectorize/contracts";
import {
  createCanonicalContentV2EmbeddingAdapter,
  createGoogleGenAiEmbeddingClient,
  type CanonicalContentV2EmbeddingAdapter,
} from "@/lib/vectorize/embedding";

function deterministicEmbedding(input: CanonicalEmbeddingInput): number[] {
  const text = serializeCanonicalEmbeddingInput(input);
  const values = new Array<number>(CANONICAL_VECTOR_PROFILE.dimensions);
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  let norm = 0;
  for (let index = 0; index < values.length; index += 1) {
    state = (Math.imul(state ^ (index + 1), 1103515245) + 12345) >>> 0;
    const value = (state / 0xffffffff) * 2 - 1;
    values[index] = value;
    norm += value * value;
  }
  const divisor = Math.sqrt(norm) || 1;
  return values.map((value) => value / divisor);
}

const deterministicAdapter: CanonicalContentV2EmbeddingAdapter = {
  profileId: CANONICAL_VECTOR_PROFILE.id,
  embed: async (input) => deterministicEmbedding(input),
  embedDocument: async (title, text) => deterministicEmbedding({ purpose: "document", title, text }),
  embedQuery: async (text) => deterministicEmbedding({ purpose: "query", text }),
};

/**
 * Creates the canonical embedding adapter without importing environment-bound
 * Gemini state in contract tests. Mock mode is deterministic and never calls
 * a provider; staging and production use Gemini Embedding 2 only.
 */
export async function getCanonicalContentV2EmbeddingAdapter(): Promise<CanonicalContentV2EmbeddingAdapter> {
  if (process.env.MOCK_GEMINI === "true") return deterministicAdapter;

  const { geminiKeyPool } = await import("@/lib/gemini-keys");
  const clients = geminiKeyPool.getAllKeys().map((key) =>
    createGoogleGenAiEmbeddingClient({
      projectId: key.id,
      client: key.clientGateway ?? key.client,
    }),
  );
  return createCanonicalContentV2EmbeddingAdapter(clients);
}
