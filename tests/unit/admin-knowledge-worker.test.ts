import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Step = { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> };
let handler: (context: { step: Step }) => Promise<unknown>;
let vectorFailure: Error | undefined;
const upsert = mock(async () => {
  if (vectorFailure) throw vectorFailure;
  return { count: 1 };
});
const provider = { upsert };
const embedDocuments = mock(async () => []);
const createProvider = mock(() => provider);
const executeSync = mock(async (options: {
  dryRun: boolean;
  baseDir?: string;
  embedDocuments: unknown;
  vectorProvider: typeof provider;
}) => {
  expect(options.dryRun).toBe(false);
  expect(options.embedDocuments).toBe(embedDocuments);
  expect(options.vectorProvider).toBe(provider);
  await options.vectorProvider.upsert();
  return { sources: { total: 1 }, chunks: { total: 2 }, manifestHash: "fixture-manifest" };
});

mock.module("@/jobs/client", () => ({
  inngest: { createFunction: (_config: unknown, callback: typeof handler) => { handler = callback; return {}; } },
}));
mock.module("@/lib/admin-ops-ai/admin-knowledge-sync", () => ({ executeAdminKnowledgeSync: executeSync }));
mock.module("@/lib/compute/vector-embeddings", () => ({ embedWorkerVectorDocuments: embedDocuments }));
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

test("Neon loads curated assets beside its module even when cwd points elsewhere", async () => {
  const previousRuntime = process.env.ZYX_COMPUTE_RUNTIME;
  const cwd = spyOn(process, "cwd").mockReturnValue(resolve("artifacts", "unrelated-host-directory"));
  try {
    process.env.ZYX_COMPUTE_RUNTIME = "neon";
    await handler({ step });
    const expectedRoot = dirname(fileURLToPath(new URL("../../jobs/admin-knowledge.ts", import.meta.url)));
    expect(executeSync.mock.calls[0][0].baseDir).toBe(expectedRoot);
    expect(executeSync.mock.calls[0][0].baseDir).not.toBe(process.cwd());

    executeSync.mockClear();
    delete process.env.ZYX_COMPUTE_RUNTIME;
    await handler({ step });
    expect(executeSync.mock.calls[0][0].baseDir).toBeUndefined();
  } finally {
    cwd.mockRestore();
    if (previousRuntime === undefined) delete process.env.ZYX_COMPUTE_RUNTIME;
    else process.env.ZYX_COMPUTE_RUNTIME = previousRuntime;
  }
});
