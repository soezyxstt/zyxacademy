import { describe, expect, it } from "bun:test";
import { ProviderAdapterError } from "@/lib/ai/provider/errors";
import { GeminiKeyPool } from "@/lib/gemini-keys";

describe("Gemini key health classification", () => {
  it("does not cool down a healthy key for an invalid request", () => {
    const pool = new GeminiKeyPool();
    const modelId = "gemini-2.5-flash";
    const key = pool.getBestKey(modelId);
    expect(key).toBeDefined();
    if (!key) return;

    pool.markFailure(key.id, modelId, new ProviderAdapterError({
      code: "INVALID_INPUT",
      message: "invalid test request",
      retryClassification: "invalid_request",
      modelId,
    }));

    const diagnostic = pool.getDiagnostics().find(
      (item) => item.keyId === key.id && item.modelId === modelId,
    );
    expect(diagnostic?.failures).toBe(1);
    expect(diagnostic?.consecutiveFailures).toBe(0);
    expect(diagnostic?.cooldownRemainingMs).toBe(0);
    expect(diagnostic?.circuitState).toBe("CLOSED");
  });
});
