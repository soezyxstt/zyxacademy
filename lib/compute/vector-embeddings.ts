import {
  assertCanonicalDimensions,
  CANONICAL_VECTOR_PROFILE,
  serializeCanonicalEmbeddingInput,
  VectorizeContractError,
} from "@/lib/vectorize/contracts";

export const WORKER_VECTOR_EMBEDDING_BATCH_SIZE = 50;
const ATTEMPT_INTERVAL_MS = 5_000;
const HTTP_TIMEOUT_MS = 60_000;

export interface WorkerVectorDocument {
  title: string;
  content: string;
}

interface WorkerEmbeddingRequest {
  model: typeof CANONICAL_VECTOR_PROFILE.model;
  contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
  config: { outputDimensionality: typeof CANONICAL_VECTOR_PROFILE.dimensions };
}

export interface WorkerVectorEmbeddingClient {
  projectId: string;
  embedContent(request: WorkerEmbeddingRequest): Promise<{
    embeddings?: Array<{ values?: number[] }>;
  }>;
}

/** Worker-only batching; the web and Zyra embedding adapter keep their existing behavior. */
export function createWorkerVectorEmbedder(
  clients: readonly WorkerVectorEmbeddingClient[],
  clock: { now(): number; sleep(ms: number): Promise<void> } = {
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
): (documents: readonly WorkerVectorDocument[]) => Promise<number[][]> {
  if (!clients.length) {
    throw new VectorizeContractError("NO_EMBEDDING_CLIENTS", "at least one Gemini project client is required");
  }

  let preferredIndex = 0;
  let nextAttemptAt = 0;
  let pacing = Promise.resolve();

  // Serialize attempt starts, including project failover, leaving gateway capacity for web traffic.
  function paceAttempt(): Promise<void> {
    const turn = pacing.then(async () => {
      const delay = nextAttemptAt - clock.now();
      if (delay > 0) await clock.sleep(delay);
      nextAttemptAt = clock.now() + ATTEMPT_INTERVAL_MS;
    });
    pacing = turn.catch(() => undefined);
    return turn;
  }

  return async (documents) => {
    if (!documents.length) return [];
    if (documents.length > WORKER_VECTOR_EMBEDDING_BATCH_SIZE) {
      throw new VectorizeContractError("INVALID_EMBEDDING_BATCH", "worker embedding batch cannot exceed 50 documents");
    }
    const request: WorkerEmbeddingRequest = {
      model: CANONICAL_VECTOR_PROFILE.model,
      // A list of raw strings aggregates into one embedding on Gemini Embedding 2.
      // Separate Content objects retain one response entry per input document.
      contents: documents.map(({ title, content }) => ({
        role: "user",
        parts: [{ text: serializeCanonicalEmbeddingInput({ purpose: "document", title, text: content }) }],
      })),
      config: { outputDimensionality: CANONICAL_VECTOR_PROFILE.dimensions },
    };
    const failures: string[] = [];
    const order = [preferredIndex, ...clients.map((_, index) => index).filter((index) => index !== preferredIndex)];

    for (const index of order) {
      const client = clients[index];
      await paceAttempt();
      try {
        const response = await client.embedContent(request);
        if (response.embeddings?.length !== documents.length) {
          throw new VectorizeContractError(
            "EMBEDDING_COUNT_MISMATCH",
            `expected ${documents.length} embeddings, received ${response.embeddings?.length ?? 0}`,
          );
        }
        const vectors = response.embeddings.map((embedding, position) => {
          if (!embedding.values) {
            throw new VectorizeContractError("EMPTY_EMBEDDING", `embedding ${position} has no values`);
          }
          assertCanonicalDimensions(embedding.values, `Gemini project ${client.projectId} embedding ${position}`);
          return embedding.values;
        });
        preferredIndex = index;
        return vectors;
      } catch (error) {
        // Malformed responses cannot be paired with outbox rows safely. Stop without a partial result.
        if (error instanceof VectorizeContractError) throw error;
        failures.push(`${client.projectId}: transport failure`);
      }
    }
    throw new VectorizeContractError(
      "EMBEDDING_FAILED",
      `${CANONICAL_VECTOR_PROFILE.model} failed for all configured project clients (${failures.join("; ")})`,
    );
  };
}

let runtimeEmbedder: Promise<ReturnType<typeof createWorkerVectorEmbedder>> | undefined;

export async function embedWorkerVectorDocuments(documents: readonly WorkerVectorDocument[]): Promise<number[][]> {
  if (!documents.length) return [];
  runtimeEmbedder ??= import("@/lib/gemini-keys").then(({ geminiKeyPool }) => {
    const clients = geminiKeyPool.getAllKeys().map((key): WorkerVectorEmbeddingClient => {
      const client = geminiKeyPool.createRequestClient(key.projectAlias, {
        viaGateway: Boolean(key.clientGateway),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (!client) {
        throw new VectorizeContractError("NO_EMBEDDING_CLIENTS", `Gemini project ${key.id} is unavailable`);
      }
      return { projectId: key.id, embedContent: (request) => client.models.embedContent(request) };
    });
    return createWorkerVectorEmbedder(clients);
  });
  return (await runtimeEmbedder)(documents);
}
