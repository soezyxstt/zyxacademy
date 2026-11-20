import { mock } from "bun:test";

mock.module("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("unexpected database access"); } }) }));
mock.module("@/lib/zyra/ops/telemetry", () => ({
  recordZyraOperationalEventSafe: async () => {},
  zyraLatencyBucket: () => "unknown",
  zyraOperationalFingerprint: () => "fixture",
  zyraSizeBucket: () => "unknown",
}));

await import("./ai-model-settings.test");
