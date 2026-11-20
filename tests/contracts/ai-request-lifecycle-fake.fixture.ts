import { mock } from "bun:test";

mock.module("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("unexpected database access"); } }) }));
mock.module("@/lib/ai/model-settings-store", () => ({ configuredModelChain: async (_input: unknown, defaults: string[]) => defaults }));
mock.module("@/lib/zyra/ops/telemetry", () => ({
  recordZyraOperationalEventSafe: async () => {},
  zyraLatencyBucket: () => "unknown",
  zyraOperationalFingerprint: () => "fixture",
  zyraSizeBucket: () => "unknown",
}));

await import("./ai-request-lifecycle.test");
