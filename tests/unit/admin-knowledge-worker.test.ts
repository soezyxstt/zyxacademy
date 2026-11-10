import { afterAll, beforeEach, expect, mock, test } from "bun:test";

type Step = { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> };
let handler: (context: { step: Step }) => Promise<unknown>;
let vectorFailure: Error | undefined;
const upsert = mock(async () => {
  if (vectorFailure) throw vectorFailure;
  return { count: 1 };
});
const provider = { upsert };
const adapter = {};
const createProvider = mock(() => provider);
const executeSync = mock(async (options: {
  dryRun: boolean;
  embeddingAdapter: unknown;
  vectorProvider: typeof provider;
}) => {
  expect(options.dryRun).toBe(false);
  expect(options.embeddingAdapter).toBe(adapter);
  expect(options.vectorProvider).toBe(provider);
  await options.vectorProvider.upsert();
  return { sources: { total: 1 }, chunks: { total: 2 }, manifestHash: "fixture-manifest" };
});

mock.module("@/jobs/client", () => ({
  inngest: { createFunction: (_config: unknown, callback: typeof handler) => { handler = callback; return {}; } },
}));
mock.module("@/lib/admin-ops-ai/admin-knowledge-sync", () => ({ executeAdminKnowledgeSync: executeSync }));
mock.module("@/lib/vectorize/runtime", () => ({ getCanonicalContentV2EmbeddingAdapter: async () => adapter }));
mock.module("@/lib/vectorize-client", () => ({ createCanonicalVectorClient: createProvider }));
await import("@/jobs/admin-knowledge");
afterAll(() => mock.restore());
beforeEach(() => {
  vectorFailure = undefined;
  upsert.mockClear();
  createProvider.mockClear();
  executeSync.mockClear();
});
const step: Step = { run: async (_name, callback) => callback() };

test("knowledge worker supplies its canonical vector provider to live synchronization", async () => {
  expect(await handler({ step })).toEqual({
    success: true, sourcesTotal: 1, chunksTotal: 2, manifestHash: "fixture-manifest",
  });
  expect(createProvider).toHaveBeenCalledTimes(1);
  expect(upsert).toHaveBeenCalledTimes(1);
});

test("vector failure rejects the worker instead of returning success", async () => {
  vectorFailure = new Error("synthetic vector provider failure");
  await expect(handler({ step })).rejects.toThrow("synthetic vector provider failure");
  expect(upsert).toHaveBeenCalledTimes(1);
});
