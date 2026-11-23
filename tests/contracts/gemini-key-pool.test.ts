import { describe, expect, it, spyOn } from "bun:test";
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

it("recovers a project-scoped key when its circuit cooldown expires", () => {
  const pool = new GeminiKeyPool();
  const alias = pool.getAllKeys()[0].projectAlias;
  const now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  try {
    for (const key of pool.getAllKeys().filter(key => key.projectAlias === alias)) {
      for (let attempt = 0; attempt < 3; attempt++) pool.markFailure(key.id, "gemini-2.5-flash", new Error("unavailable"));
    }
    expect(pool.getKeyByProjectAlias(alias)).toBeNull();
    clock.mockReturnValue(now + 300_001);
    expect(pool.getKeyByProjectAlias(alias)?.projectAlias).toBe(alias);
  } finally {
    clock.mockRestore();
  }
});

it("recovers a rate-limited (429) key after 60 seconds instead of five minutes", () => {
  const pool = new GeminiKeyPool();
  const alias = pool.getAllKeys()[0].projectAlias;
  const now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  try {
    for (const key of pool.getAllKeys().filter(key => key.projectAlias === alias)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        pool.markFailure(key.id, "gemini-2.5-flash", new ProviderAdapterError({
          code: "PROVIDER_RATE_LIMITED",
          message: "429 RESOURCE_EXHAUSTED",
          retryClassification: "rate_limited",
          modelId: "gemini-2.5-flash",
          httpStatus: 429,
        }));
      }
    }
    expect(pool.getKeyByProjectAlias(alias)).toBeNull();
    clock.mockReturnValue(now + 60_001);
    expect(pool.getKeyByProjectAlias(alias)?.projectAlias).toBe(alias);
  } finally {
    clock.mockRestore();
  }
});
