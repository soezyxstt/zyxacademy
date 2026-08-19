import { describe, expect, it } from "bun:test";
import {
  createBenchmarkAccessBoundary,
  evaluateBenchmark,
  projectAuthoringReferences,
  scanForHoldoutLeaks,
} from "@/lib/asesmen/benchmark-policy";

describe("Benchmark and holdout policy", () => {
  const references = [
    { id: "allowed-1", checksum: "allowed-hash", datasetKey: "train", visibility: "allowed" as const, semanticSimilarity: 0.2 },
    { id: "holdout-1", checksum: "holdout-hash", datasetKey: "eval", visibility: "holdout" as const, semanticSimilarity: 0.95, content: "HOLDOUT_CANARY" },
  ];

  it("rejects exact duplicates and holdout threshold matches", () => {
    expect(evaluateBenchmark({ version: "2026.08", exactHashReject: true, holdoutSimilarityThreshold: 0.9 }, "allowed-hash", references).status).toBe("rejected");
    expect(evaluateBenchmark({ version: "2026.08", exactHashReject: true, holdoutSimilarityThreshold: 0.9 }, "new-hash", references).status).toBe("rejected");
  });

  it("fails closed when a similarity policy is absent", () => {
    const result = evaluateBenchmark({ version: "2026.08", exactHashReject: true }, "new-hash", references);
    expect(result.status).toBe("needs_review");
    expect(result.violations).toContain("HOLDOUT_SIMILARITY_POLICY_ABSENT");
  });

  it("does not project holdout content into authoring references", () => {
    const projected = projectAuthoringReferences(references);
    expect(projected).toEqual([{ id: "allowed-1", checksum: "allowed-hash", datasetKey: "train", visibility: "allowed" }]);
    expect(scanForHoldoutLeaks(projected, ["HOLDOUT_CANARY"])).toEqual([]);

    const boundary = createBenchmarkAccessBoundary(references);
    expect(boundary.listAuthoringReferences()).toEqual(projected);
    expect(boundary.getBenchmarkContent("holdout-1")).toBe("HOLDOUT_CANARY");
  });
});
