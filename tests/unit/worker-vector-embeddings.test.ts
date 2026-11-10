import { describe, expect, it } from "bun:test";
import {
  createWorkerVectorEmbedder,
  type WorkerVectorEmbeddingClient,
} from "@/lib/compute/vector-embeddings";
import { CANONICAL_VECTOR_PROFILE, serializeCanonicalEmbeddingInput } from "@/lib/vectorize/contracts";

const documents = [
  { title: "Limits", content: "A limit describes local behavior." },
  { title: "Derivatives", content: "A derivative describes a rate." },
];
const vector = (value: number) => Array.from({ length: 768 }, () => value);

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => { time += ms; },
  };
}

describe("worker vector batch embeddings", () => {
  it("uses separate canonical Content objects and preserves response positions", async () => {
    const requests: Parameters<WorkerVectorEmbeddingClient["embedContent"]>[0][] = [];
    const embed = createWorkerVectorEmbedder([{
      projectId: "first",
      embedContent: async (request) => {
        requests.push(request);
        return { embeddings: [{ values: vector(1) }, { values: vector(2) }] };
      },
    }], fakeClock());

    const result = await embed(documents);
    expect(requests).toEqual([{
      model: CANONICAL_VECTOR_PROFILE.model,
      contents: documents.map(({ title, content }) => ({
        role: "user",
        parts: [{ text: serializeCanonicalEmbeddingInput({ purpose: "document", title, text: content }) }],
      })),
      config: { outputDimensionality: 768 },
    }]);
    expect(result).toEqual([vector(1), vector(2)]);
  });

  it("rejects missing or aggregated responses without returning partial vectors", async () => {
    for (const response of [{}, { embeddings: [{ values: vector(1) }] }]) {
      const embed = createWorkerVectorEmbedder([{
        projectId: "first", embedContent: async () => response,
      }], fakeClock());
      await expect(embed(documents)).rejects.toThrow("EMBEDDING_COUNT_MISMATCH");
    }
  });

  it("rejects absent, non-finite, or noncanonical vector dimensions before any fallback", async () => {
    for (const invalid of [undefined, [1, 2], vector(Number.NaN)]) {
      let fallbackCalls = 0;
      const embed = createWorkerVectorEmbedder([
        {
          projectId: "first",
          embedContent: async () => ({ embeddings: [{ values: vector(1) }, { values: invalid }] }),
        },
        {
          projectId: "fallback",
          embedContent: async () => {
            fallbackCalls++;
            return { embeddings: [{ values: vector(1) }, { values: vector(2) }] };
          },
        },
      ], fakeClock());
      await expect(embed(documents)).rejects.toThrow();
      expect(fallbackCalls).toBe(0);
    }
  });

  it("fails over projects with the same model and prefers the last successful project", async () => {
    const clock = fakeClock();
    const calls: Array<{ id: string; at: number; model: string }> = [];
    const embed = createWorkerVectorEmbedder([
      {
        projectId: "first",
        embedContent: async (request) => {
          calls.push({ id: "first", at: clock.now(), model: request.model });
          throw new Error("provider unavailable");
        },
      },
      {
        projectId: "second",
        embedContent: async (request) => {
          calls.push({ id: "second", at: clock.now(), model: request.model });
          return { embeddings: [{ values: vector(2) }] };
        },
      },
    ], clock);

    await embed(documents.slice(0, 1));
    await embed(documents.slice(0, 1));
    expect(calls).toEqual([
      { id: "first", at: 0, model: CANONICAL_VECTOR_PROFILE.model },
      { id: "second", at: 5_000, model: CANONICAL_VECTOR_PROFILE.model },
      { id: "second", at: 10_000, model: CANONICAL_VECTOR_PROFILE.model },
    ]);
  });

  it("paces concurrent batches to at most 12 HTTP attempt starts per minute", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const embed = createWorkerVectorEmbedder([{
      projectId: "first",
      embedContent: async () => {
        starts.push(clock.now());
        return { embeddings: [{ values: vector(1) }] };
      },
    }], clock);
    await Promise.all(Array.from({ length: 13 }, () => embed(documents.slice(0, 1))));
    expect(starts).toEqual(Array.from({ length: 13 }, (_, index) => index * 5_000));
    for (const start of starts) {
      expect(starts.filter((value) => value >= start && value < start + 60_000).length).toBeLessThanOrEqual(12);
    }
  });

  it("splits concurrent 50-document calls and reserves at most 75 documents per rolling minute", async () => {
    const clock = fakeClock();
    const calls: Array<{ at: number; count: number }> = [];
    const input = Array.from({ length: 100 }, (_, index) => ({ title: `Document ${index}`, content: `Document ${index}` }));
    const embed = createWorkerVectorEmbedder([{
      projectId: "first",
      embedContent: async request => {
        calls.push({ at: clock.now(), count: request.contents.length });
        return { embeddings: request.contents.map(content => ({ values: vector(Number(content.parts[0].text.match(/Document (\d+)$/)![1])) })) };
      },
    }], clock);
    const results = await Promise.all([embed(input.slice(0, 50)), embed(input.slice(50))]);
    expect(results.flat().map(values => values[0])).toEqual(Array.from({ length: 100 }, (_, index) => index));
    expect(calls.map(call => call.count)).toEqual([25, 25, 25, 25]);
    expect(calls.at(-1)!.at - calls[0].at).toBeGreaterThanOrEqual(60_000);
    for (const call of calls) {
      expect(calls.filter(item => item.at >= call.at && item.at < call.at + 60_000)
        .reduce((sum, item) => sum + item.count, 0)).toBeLessThanOrEqual(75);
    }
  });

  it("uses another ready project when the preferred project has reserved its document quota", async () => {
    const clock = fakeClock();
    const calls: Array<{ project: string; at: number; count: number }> = [];
    const clients = ["first", "second"].map(project => ({
      projectId: project,
      embedContent: async (request: Parameters<WorkerVectorEmbeddingClient["embedContent"]>[0]) => {
        calls.push({ project, at: clock.now(), count: request.contents.length });
        return { embeddings: request.contents.map(() => ({ values: vector(1) })) };
      },
    }));
    const embed = createWorkerVectorEmbedder(clients, clock);
    const input = Array.from({ length: 50 }, () => documents[0]);
    await embed(input);
    await embed(input);
    await embed(documents.slice(0, 1));
    expect(calls.map(call => call.project)).toEqual(["first", "first", "first", "second", "second"]);
    expect(clock.now()).toBe(20_000);
    for (const project of ["first", "second"]) {
      expect(calls.filter(call => call.project === project).reduce((sum, call) => sum + call.count, 0)).toBeLessThanOrEqual(75);
    }
  });

  it("disables 401, 402 and 403 clients for subsequent calls in the process", async () => {
    for (const status of [401, 402, 403]) {
      let blockedCalls = 0, healthyCalls = 0;
      const embed = createWorkerVectorEmbedder([
        { projectId: "blocked", embedContent: async () => { blockedCalls++; throw Object.assign(new Error("private credential detail"), { status }); } },
        { projectId: "healthy", embedContent: async request => { healthyCalls++; return { embeddings: request.contents.map(() => ({ values: vector(1) })) }; } },
      ], fakeClock());
      const input = Array.from({ length: 50 }, () => documents[0]);
      await embed(input);
      await embed(input);
      expect(blockedCalls).toBe(1);
      expect(healthyCalls).toBe(4);
    }
  });

  it("backs off 429 for a full minute and stops after three attempts without exposing SDK details", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const embed = createWorkerVectorEmbedder([{
      projectId: "limited", embedContent: async () => {
        starts.push(clock.now());
        throw Object.assign(new Error("https://provider.test?key=private-test-token"), { status: 429 });
      },
    }], clock);
    try {
      await embed(documents);
      throw new Error("Expected quota failure");
    } catch (error) {
      expect(String(error)).toContain("EMBEDDING_FAILED");
      expect(String(error)).toContain("limited: HTTP 429");
      expect(String(error)).not.toContain("private-test-token");
    }
    expect(starts).toEqual([0, 60_000, 120_000]);
  });

  it("skips a cooling-down project while another project can accept the request", async () => {
    const clock = fakeClock();
    const starts: Array<{ project: string; at: number }> = [];
    const embed = createWorkerVectorEmbedder([
      { projectId: "limited", embedContent: async () => {
        starts.push({ project: "limited", at: clock.now() });
        throw Object.assign(new Error("quota"), { status: 429 });
      } },
      { projectId: "healthy", embedContent: async request => {
        starts.push({ project: "healthy", at: clock.now() });
        return { embeddings: request.contents.map(() => ({ values: vector(1) })) };
      } },
    ], clock);
    await embed(documents);
    await embed(documents);
    expect(starts).toEqual([{ project: "limited", at: 0 }, { project: "healthy", at: 5_000 }, { project: "healthy", at: 10_000 }]);
  });

  it("skips empty batches and rejects oversized batches or blank content before spending quota", async () => {
    let calls = 0;
    const embed = createWorkerVectorEmbedder([{
      projectId: "first",
      embedContent: async () => { calls++; return {}; },
    }], fakeClock());
    expect(await embed([])).toEqual([]);
    await expect(embed(Array.from({ length: 51 }, () => documents[0]))).rejects.toThrow("INVALID_EMBEDDING_BATCH");
    await expect(embed([{ title: "blank", content: " " }])).rejects.toThrow("INVALID_EMBEDDING_INPUT");
    expect(calls).toBe(0);
  });

  it("returns a failure when every project fails", async () => {
    const embed = createWorkerVectorEmbedder([{
      projectId: "first", embedContent: async () => { throw new Error("https://provider.test?key=private-test-token"); },
    }], fakeClock());
    await expect(embed(documents)).rejects.toThrow("EMBEDDING_FAILED");
    await expect(embed(documents)).rejects.toThrow("first: transport failure");
    await expect(embed(documents)).rejects.not.toThrow("private-test-token");
  });
});
