import {
  assertCanonicalDimensions,
  CANONICAL_VECTOR_PROFILE,
  serializeCanonicalEmbeddingInput,
  VectorizeContractError,
} from "@/lib/vectorize/contracts";

export const WORKER_VECTOR_EMBEDDING_BATCH_SIZE = 50;
const ATTEMPT_INTERVAL_MS = 5_000;
const HTTP_TIMEOUT_MS = 60_000;
const REQUEST_DOCUMENTS = 25;
const PROJECT_DOCUMENTS_PER_MINUTE = 75;
const QUOTA_WINDOW_MS = 60_000;
const MAX_PROJECT_ATTEMPTS = 3;

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
  const quotas = clients.map(() => ({ disabled: false, cooldownUntil: 0, reservations: [] as Array<{ at: number; count: number }> }));

  // Gemini counts individual documents, while the shared gateway counts HTTP requests.
  function reserveAttempt(count: number, attempts: number[]): Promise<number | undefined> {
    const turn = pacing.then(async () => {
      for (;;) {
        const now = clock.now();
        const order = [preferredIndex, ...clients.map((_, index) => index).filter(index => index !== preferredIndex)]
          .filter(index => !quotas[index].disabled && attempts[index] < MAX_PROJECT_ATTEMPTS);
        if (!order.length) return undefined;
        const readyAt = order.map(index => {
          const quota = quotas[index];
          quota.reservations = quota.reservations.filter(item => item.at + QUOTA_WINDOW_MS > now);
          let reserved = quota.reservations.reduce((sum, item) => sum + item.count, 0);
          let available = Math.max(now, quota.cooldownUntil, nextAttemptAt);
          for (const item of quota.reservations) {
            if (reserved + count <= PROJECT_DOCUMENTS_PER_MINUTE) break;
            reserved -= item.count;
            available = Math.max(available, item.at + QUOTA_WINDOW_MS);
          }
          return { index, available };
        });
        const ready = readyAt.find(item => item.available <= now);
        if (!ready) {
          await clock.sleep(Math.min(...readyAt.map(item => item.available)) - now);
          continue;
        }
        quotas[ready.index].reservations.push({ at: now, count });
        attempts[ready.index]++;
        nextAttemptAt = now + ATTEMPT_INTERVAL_MS;
        return ready.index;
      }
    });
    pacing = turn.then(() => undefined, () => undefined);
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
    const result: number[][] = [];
    for (let offset = 0; offset < request.contents.length; offset += REQUEST_DOCUMENTS) {
      const contents = request.contents.slice(offset, offset + REQUEST_DOCUMENTS);
      const attempts = clients.map(() => 0);
      const failures: string[] = [];
      let completed = false;
      for (let index = await reserveAttempt(contents.length, attempts); index !== undefined; index = await reserveAttempt(contents.length, attempts)) {
        const client = clients[index];
        try {
          const response = await client.embedContent({ ...request, contents });
          if (response.embeddings?.length !== contents.length) {
            throw new VectorizeContractError(
              "EMBEDDING_COUNT_MISMATCH",
              `expected ${contents.length} embeddings, received ${response.embeddings?.length ?? 0}`,
            );
          }
          const vectors = response.embeddings.map((embedding, position) => {
            if (!embedding.values) throw new VectorizeContractError("EMPTY_EMBEDDING", `embedding ${position} has no values`);
            assertCanonicalDimensions(embedding.values, `Gemini project ${client.projectId} embedding ${position}`);
            return embedding.values;
          });
          preferredIndex = index;
          result.push(...vectors);
          completed = true;
          break;
        } catch (error) {
          // Malformed responses cannot be paired with outbox rows safely. Stop without a partial result.
          if (error instanceof VectorizeContractError) throw error;
          const rawStatus = error && typeof error === "object" && "status" in error ? error.status : undefined;
          const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) ? rawStatus : undefined;
          if (status === 401 || status === 402 || status === 403) quotas[index].disabled = true;
          if (status === 429) quotas[index].cooldownUntil = Math.max(quotas[index].cooldownUntil, clock.now() + QUOTA_WINDOW_MS);
          else attempts[index] = MAX_PROJECT_ATTEMPTS;
          failures.push(`${client.projectId}: ${status === undefined ? "transport failure" : `HTTP ${status}`}`);
        }
      }
      if (!completed) {
        throw new VectorizeContractError(
          "EMBEDDING_FAILED",
          `${CANONICAL_VECTOR_PROFILE.model} failed for configured project clients (${failures.join("; ") || "no enabled clients"})`,
        );
      }
    }
    return result;
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
