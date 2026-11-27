import { expect, test } from "bun:test";
import { aiModelBreakdown, formatAiLatency } from "../../lib/ai/model-breakdown";

test("model share, success and latency use every recent request and the same sample denominator", () => {
  expect(aiModelBreakdown([
    { model: "model-a", success: true, latencyMs: 100 },
    { model: "model-a", success: false, latencyMs: 2100 },
    { model: "", success: false, latencyMs: 200 },
    { model: "unknown", success: false, latencyMs: 400 },
    { model: "model-b", success: true, latencyMs: 0 },
  ])).toEqual([
    { model: "model-a", count: 2, sharePct: 40, successRatePct: 50, avgLatencyMs: 1100 },
    { model: "unknown", count: 2, sharePct: 40, successRatePct: 0, avgLatencyMs: 300 },
    { model: "model-b", count: 1, sharePct: 20, successRatePct: 100, avgLatencyMs: 0 },
  ]);
  expect(aiModelBreakdown([])).toEqual([]);
  expect([formatAiLatency(1100), formatAiLatency(300.4), formatAiLatency(0)]).toEqual(["1.1s", "300ms", "0ms"]);
});
