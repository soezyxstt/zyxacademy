import { beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const calls: { reservations: any[]; dispatches: string[]; providers: any[]; commits: string[] } = {
  reservations: [], dispatches: [], providers: [], commits: [],
};
let providerText = '{"answer":"Perhatikan konsepnya."}';

mock.module("@/lib/usage-budget-service", () => ({
  FREE_ALLOWANCE_IDEMPOTENCY_PREFIX: "zyra-free:",
  UsageBudgetService: {
    isAllowanceEnabled: () => true,
    reserve: async (input: any) => {
      calls.reservations.push(input);
      return { accepted: true, idempotent: false, lease: { id: "lease-1", status: "reserved" } };
    },
    markDispatched: async (id: string) => { calls.dispatches.push(id); return { leaseId: id, status: "dispatched", changed: true }; },
    commit: async (id: string) => { calls.commits.push(id); return { leaseId: id, status: "committed", changed: true }; },
    refund: async () => { throw new Error("unexpected refund"); },
  },
}));
mock.module("@/lib/ai-router", () => ({ providerRouterV2Enabled: () => false }));
mock.module("@/lib/ai/request-lifecycle", () => ({ RequestLifecycleError: class extends Error {}, ProviderNotDispatchedError: class extends Error {}, isConfirmedHttpFailure: () => false }));
mock.module("@/lib/gemini", () => ({
  generateContentWithFallback: async (input: any) => {
    calls.providers.push(input);
    return { response: { text: providerText }, modelUsed: "fake-model" };
  },
}));
mock.module("@/lib/ai/provenance", () => ({
  hashSanitizedInput: () => "hash", hashEvidence: () => "hash", recordGenerationTrace: async () => "trace",
}));

const { PromptExecutor } = await import("@/lib/prompt-executor");

function run() {
  return PromptExecutor.run({
    userId: "student-1", feature: "discussion-tutor", useCase: "ungrounded-tutor",
    idempotencyKey: "zyra-free:discussion:request-1", cachePolicy: "bypass", maxAttempts: 1,
    variables: { prompt: "Pertanyaan" }, schema: z.object({ answer: z.string() }).strict(),
    prompt: { version: "discussion-tutor/1", systemInstruction: "Return JSON", userPrompt: ({ prompt }) => prompt },
  });
}

beforeEach(() => {
  calls.reservations.length = 0;
  calls.dispatches.length = 0;
  calls.providers.length = 0;
  calls.commits.length = 0;
  providerText = '{"answer":"Perhatikan konsepnya."}';
});

describe("discussion arguments against the real PromptExecutor", () => {
  it("reserves the invoking actor and stable free key exactly once", async () => {
    expect((await run()).success).toBe(true);
    expect(calls.reservations).toHaveLength(1);
    expect(calls.reservations[0]).toMatchObject({ userId: "student-1", idempotencyKey: "zyra-free:discussion:request-1", feature: "discussion-tutor" });
    expect(calls.dispatches).toEqual(["lease-1"]);
    expect(calls.providers).toHaveLength(1);
    expect(calls.providers[0]).toMatchObject({ userId: "student-1", requestId: "zyra-free:discussion:request-1", cachePolicy: "bypass" });
    expect(calls.commits).toEqual(["lease-1"]);
  });

  it("does not start structured-output repair when maxAttempts is one", async () => {
    providerText = "not-json";
    expect((await run()).outcome).toBe("rejected");
    expect(calls.providers).toHaveLength(1);
    expect(calls.commits).toEqual(["lease-1"]);
  });
});
