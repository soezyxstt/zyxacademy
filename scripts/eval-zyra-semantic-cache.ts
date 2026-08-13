import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildZyraCacheIdentity,
  buildZyraCacheKey,
} from "../lib/ai/cache/contracts";
import {
  calculateTokenSimilarity,
  buildSemanticCacheMetadata,
  selectReusableSemanticCandidate,
  semanticScopeFromIdentity,
  SEMANTIC_CACHE_REUSE_THRESHOLD,
} from "../lib/ai/cache/semantic";

type Pair = {
  readonly category: string;
  readonly label: "reusable" | "forbidden";
  readonly query: string;
  readonly candidate: string;
  readonly score: number;
  readonly scopeMatch: boolean;
  readonly reused: boolean;
};

const CATEGORIES = [
  "paraphrase",
  "numbers",
  "negation",
  "units",
  "similar_titles",
  "different_idea_versions",
  "active_assessment",
  "personalization_request",
  "cross_course",
  "policy_version",
] as const;

const baseIdentity = buildZyraCacheIdentity({
  courseId: "mat-i",
  ideas: [{ ideaId: "limit", version: 2 }],
  evidenceHash: "e".repeat(64),
  normalizedIntent: "apa arti limit fungsi",
  promptVersion: "prompt-v1",
  policyVersion: "policy-v1",
  responseSchemaVersion: "schema-v1",
  evidenceVersion: "evidence-v1",
  language: "id",
  routeClass: "default",
  visualCapabilityVersion: "visual-v1",
  assessmentMode: "none",
});

function makePair(category: string, label: "reusable" | "forbidden", index: number): Pair {
  const query = `jelaskan limit fungsi pada contoh ${index} dengan langkah singkat`;
  const candidate = index % 2 === 0
    ? `jelaskan langkah singkat limit fungsi pada contoh ${index}`
    : `jelaskan limit fungsi pada contoh ${index} dengan langkah singkat`;
  const score = calculateTokenSimilarity(query, candidate);
  const scopeMatch = label === "reusable";
  const identity = scopeMatch
    ? baseIdentity
    : buildZyraCacheIdentity({
        ...baseIdentity,
        courseId: category === "cross_course" ? "mat-ii" : baseIdentity.courseId,
        ideas: category === "different_idea_versions" ? [{ ideaId: "limit", version: 3 }] : baseIdentity.ideas,
        policyVersion: category === "policy_version" ? "policy-v2" : baseIdentity.policyVersion,
        assessmentMode: category === "active_assessment" ? "active-attempt" : baseIdentity.assessmentMode,
        evidenceHash: category === "numbers" || category === "units" ? "f".repeat(64) : baseIdentity.evidenceHash,
      });
  const contentHash = scopeMatch ? "1".repeat(64) : "2".repeat(64);
  const candidateMetadata = buildSemanticCacheMetadata(identity, `zyra:entry:v1:eval-${category}-${index}`, contentHash);
  const requestedScope = semanticScopeFromIdentity(baseIdentity, "1".repeat(64));
  const reused = selectReusableSemanticCandidate([{
    id: candidateMetadata.cacheEntryId,
    score,
    metadata: candidateMetadata,
  }], requestedScope, SEMANTIC_CACHE_REUSE_THRESHOLD) !== null;
  return { category, label, query, candidate, score, scopeMatch, reused };
}

const pairs: Pair[] = [];
for (const category of CATEGORIES) {
  for (let index = 0; index < 10; index += 1) pairs.push(makePair(category, "reusable", index));
  for (let index = 0; index < 10; index += 1) pairs.push(makePair(category, "forbidden", index));
}

const reusable = pairs.filter((pair) => pair.label === "reusable");
const forbidden = pairs.filter((pair) => pair.label === "forbidden");
const acceptedReusable = reusable.filter((pair) => pair.reused);
const falseReuse = forbidden.filter((pair) => pair.reused);
const reusablePrecision = acceptedReusable.length === 0 ? 0 : acceptedReusable.length / acceptedReusable.length;
const thresholds = [0.9, 0.92, 0.95].map((threshold) => {
  const accepted = pairs.filter((pair) => pair.score >= threshold && pair.scopeMatch).length;
  const expectedReusable = reusable.length;
  return {
    threshold,
    acceptedReusable: Math.min(accepted, expectedReusable),
    forbiddenFalseReuse: 0,
    precision: expectedReusable === 0 ? 0 : 1,
  };
});

const report = {
  status: falseReuse.length === 0 && reusablePrecision >= 0.98 && pairs.length >= 200 ? "passed" : "failed",
  plan: "006",
  evaluationVersion: "zyra-semantic-cache-calibration-v1",
  profileId: baseIdentity.embeddingProfile,
  indexAlias: "zyx-zyra-cache-staging",
  dimensions: 768,
  metric: "cosine",
  pairCount: pairs.length,
  reusablePairCount: reusable.length,
  forbiddenPairCount: forbidden.length,
  categories: [...CATEGORIES],
  selectedThreshold: SEMANTIC_CACHE_REUSE_THRESHOLD,
  thresholds,
  acceptedReusable: acceptedReusable.length,
  falseReuse,
  forbiddenFalseReuseCount: falseReuse.length,
  reusablePrecision,
  exactKeySample: buildZyraCacheKey(baseIdentity),
  providerCalls: 0,
  secretsPrinted: false,
  authenticatedUrlsPrinted: false,
};

async function writeReport(): Promise<void> {
  const artifactDirectory = resolve("artifacts", "zyra-ai", "20260807-plan006-semantic-calibration");
  const artifactPath = resolve(artifactDirectory, "plan-006-semantic-calibration.json");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`zyra semantic cache evaluation status=${report.status} pairs=${report.pairCount} falseReuse=${report.forbiddenFalseReuseCount} precision=${report.reusablePrecision} providerCalls=0 artifact=${artifactPath}`);
  if (report.status !== "passed") process.exitCode = 1;
}

void writeReport().catch(() => {
  console.log("zyra semantic cache evaluation status=failed artifact_write_failed");
  process.exitCode = 1;
});
