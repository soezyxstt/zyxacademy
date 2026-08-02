import { z } from "zod";

export const benchmarkVisibilitySchema = z.enum(["allowed", "holdout"]);
export type BenchmarkVisibility = z.infer<typeof benchmarkVisibilitySchema>;

export const benchmarkPolicySchema = z.object({
  version: z.string().min(1),
  exactHashReject: z.boolean().default(true),
  allowedSimilarityThreshold: z.number().finite().min(0).max(1).optional(),
  holdoutSimilarityThreshold: z.number().finite().min(0).max(1).optional(),
});
export type BenchmarkPolicy = z.infer<typeof benchmarkPolicySchema>;

export interface BenchmarkReference {
  id: string;
  checksum: string;
  datasetKey: string;
  visibility: BenchmarkVisibility;
  semanticSimilarity?: number;
  content?: unknown;
}

export interface BenchmarkAssessment {
  status: "publish" | "needs_review" | "rejected";
  policyVersion: string;
  exactDuplicate: boolean;
  holdoutMatch: boolean;
  violations: string[];
}

export interface AuthoringBenchmarkReference {
  id: string;
  checksum: string;
  datasetKey: string;
  visibility: "allowed";
}

export interface BenchmarkAccessBoundary {
  listAuthoringReferences(): AuthoringBenchmarkReference[];
  listBenchmarkReferences(): BenchmarkReference[];
  getBenchmarkContent(referenceId: string): unknown;
}

function thresholdMatch(score: number | undefined, threshold: number | undefined): boolean {
  return score !== undefined && threshold !== undefined && score >= threshold;
}

/**
 * Applies the versioned policy at the publication boundary. A missing
 * threshold is intentionally fail-closed and never becomes an auto-publish.
 */
export function evaluateBenchmark(
  policyInput: BenchmarkPolicy,
  candidateChecksum: string,
  references: readonly BenchmarkReference[],
): BenchmarkAssessment {
  const policy = benchmarkPolicySchema.parse(policyInput);
  const exactDuplicate = policy.exactHashReject && references.some((reference) => reference.checksum === candidateChecksum);
  const holdoutReferences = references.filter((reference) => reference.visibility === "holdout");
  const allowedReferences = references.filter((reference) => reference.visibility === "allowed");
  const holdoutMatch = holdoutReferences.some((reference) =>
    thresholdMatch(reference.semanticSimilarity, policy.holdoutSimilarityThreshold),
  );
  const violations: string[] = [];
  if (exactDuplicate) violations.push("EXACT_HASH_DUPLICATE");
  if (holdoutMatch) violations.push("HOLDOUT_SIMILARITY_MATCH");

  const hasAllowedSimilarity = allowedReferences.some((reference) => reference.semanticSimilarity !== undefined);
  const hasHoldoutSimilarity = holdoutReferences.some((reference) => reference.semanticSimilarity !== undefined);
  if (hasAllowedSimilarity && policy.allowedSimilarityThreshold === undefined) {
    violations.push("ALLOWED_SIMILARITY_POLICY_ABSENT");
  }
  if (hasHoldoutSimilarity && policy.holdoutSimilarityThreshold === undefined) {
    violations.push("HOLDOUT_SIMILARITY_POLICY_ABSENT");
  }
  if (allowedReferences.some((reference) => thresholdMatch(reference.semanticSimilarity, policy.allowedSimilarityThreshold))) {
    violations.push("ALLOWED_SIMILARITY_REVIEW");
  }

  const status = exactDuplicate || holdoutMatch
    ? "rejected"
    : violations.length > 0
      ? "needs_review"
      : "publish";
  return {
    status,
    policyVersion: policy.version,
    exactDuplicate,
    holdoutMatch,
    violations,
  };
}

export function projectAuthoringReferences(
  references: readonly BenchmarkReference[],
): AuthoringBenchmarkReference[] {
  return references
    .filter((reference) => reference.visibility === "allowed")
    .map(({ id, checksum, datasetKey }) => ({ id, checksum, datasetKey, visibility: "allowed" as const }));
}

function containsNeedle(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => containsNeedle(item, needle));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => containsNeedle(item, needle));
  }
  return false;
}

export function scanForHoldoutLeaks(payload: unknown, canaries: readonly string[]): string[] {
  return canaries.filter((canary) => canary.length > 0 && containsNeedle(payload, canary));
}

export function createBenchmarkAccessBoundary(
  references: readonly BenchmarkReference[],
): BenchmarkAccessBoundary {
  const ownedReferences = references.map((reference) => ({ ...reference }));
  return {
    listAuthoringReferences: () => projectAuthoringReferences(ownedReferences),
    listBenchmarkReferences: () => ownedReferences.map((reference) => ({ ...reference })),
    getBenchmarkContent: (referenceId: string) => {
      const reference = ownedReferences.find((candidate) => candidate.id === referenceId);
      if (!reference || reference.visibility !== "holdout") {
        throw new Error("Benchmark content is restricted to holdout references");
      }
      return reference.content;
    },
  };
}

export function assertNoHoldoutLeak(payload: unknown, canaries: readonly string[]): void {
  const leaks = scanForHoldoutLeaks(payload, canaries);
  if (leaks.length > 0) throw new Error(`Holdout content leak detected: ${leaks.join(", ")}`);
}
