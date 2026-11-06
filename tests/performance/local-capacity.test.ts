import { describe, expect, test } from "bun:test";
import { ownedRss, validateLimits } from "../../scripts/performance/local-capacity";
import { validateLoopbackBaseUrl } from "../../scripts/performance/staging-env-loader";

describe("local capacity guardrails", () => {
  test("rejects remote targets and malformed budgets", () => {
    expect(() => validateLoopbackBaseUrl("https://example.com")).toThrow();
    expect(() => validateLimits(-1, 1000, 2000, 1)).toThrow();
    expect(() => validateLimits(9, 1000, 2000, 1)).toThrow();
    expect(() => validateLimits(1, 1000, 500, 1)).toThrow();
    expect(() => validateLimits(1, 1000, 2000, 0)).toThrow();
  });
  test("reports unavailable process accounting as null", () => {
    expect(ownedRss(-1)).toBeNull();
  });
});

describe("bounded database probes", () => {
  test("destroys a hung connection on timeout and ends the client", async () => {
    const { withBoundedReadOnlyClient } = await import("../../scripts/performance/staging-env-loader");
    let destroyed = 0;
    let ended = 0;
    const client = {
      connection: { stream: { destroy: () => { destroyed++; } } },
      connect: () => new Promise<void>(() => {}),
      end: async () => { ended++; },
    };
    await expect(withBoundedReadOnlyClient(async () => 1, {
      timeoutMs: 10,
      clientFactory: () => client as never,
    })).rejects.toThrow("DB_PROBE_ABORTED");
    expect(destroyed).toBeGreaterThan(0);
    expect(ended).toBe(1);
  });

  test("aborting a hung query destroys its transport", async () => {
    const { withBoundedReadOnlyClient } = await import("../../scripts/performance/staging-env-loader");
    const controller = new AbortController();
    let destroyed = 0;
    let ended = 0;
    const client = {
      connection: { stream: { destroy: () => { destroyed++; } } },
      connect: async () => {},
      end: async () => { ended++; },
    };
    const pending = withBoundedReadOnlyClient(() => new Promise<never>(() => {}), {
      signal: controller.signal,
      clientFactory: () => client as never,
    });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow("DB_PROBE_ABORTED");
    expect(destroyed).toBeGreaterThan(0);
    expect(ended).toBe(1);
  });
});
