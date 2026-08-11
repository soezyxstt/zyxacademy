import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildSharedScaffoldMetadata, buildZyraCacheKey } from "../../lib/ai/cache/contracts";
import { buildSemanticCacheMetadata, semanticScopeFromIdentity } from "../../lib/ai/cache/semantic";
import { buildZyraCacheIdentity } from "../../lib/ai/cache/contracts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_MAX_PROVIDER_REQUESTS = 20;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeRunId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(value);
}

function artifactPath(runId: string): string {
  return resolve("artifacts", "zyra-ai", runId, "plan-006-cache-smoke.json");
}

async function writeArtifact(runId: string, value: JsonRecord): Promise<string> {
  const path = artifactPath(runId);
  await mkdir(resolve("artifacts", "zyra-ai", runId), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

function targetGuardFailures(): string[] {
  const failures: string[] = [];
  const value = process.env.ZYRA_CONTROL_PLANE_URL?.trim();
  const productionPattern = /(^|[/:._-])(prod|production|live)(?=$|[/:._-])/i;
  let parsed: URL;
  try {
    parsed = new URL(value ?? "");
  } catch {
    return ["ZYRA_CONTROL_PLANE_URL_STAGING_TARGET_INVALID"];
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.includes("staging") || productionPattern.test(parsed.hostname)) {
    failures.push("ZYRA_CONTROL_PLANE_URL_STAGING_TARGET_INVALID");
  }
  if (process.env.ZYX_ENVIRONMENT !== "staging") failures.push("ZYX_ENVIRONMENT_STAGING_REQUIRED");
  if (process.env.ALLOW_STAGING_MUTATION !== "1") failures.push("ALLOW_STAGING_MUTATION_REQUIRED");
  if (!process.env.ZYRA_CONTROL_PLANE_TOKEN?.trim()) failures.push("ZYRA_CONTROL_PLANE_TOKEN_REQUIRED");
  return failures;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const runId = argValue("--run-id") ?? `plan006-cache-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const maxText = argValue("--max-provider-requests") ?? String(DEFAULT_MAX_PROVIDER_REQUESTS);
  const maxProviderRequests = Number(maxText);
  if (!safeRunId(runId)) throw new Error("invalid run ID");
  if (!Number.isInteger(maxProviderRequests) || maxProviderRequests < 1 || maxProviderRequests > DEFAULT_MAX_PROVIDER_REQUESTS) {
    throw new Error(`max-provider-requests must be between 1 and ${DEFAULT_MAX_PROVIDER_REQUESTS}`);
  }

  const guardFailures = targetGuardFailures();
  if (guardFailures.length > 0) {
    const path = await writeArtifact(runId, {
      status: "blocked",
      plan: "006",
      phase: "staging_cache_smoke",
      blocker: "STAGING_CACHE_PREREQUISITES_MISSING",
      guardFailures,
      maxProviderRequests,
      providerCalls: 0,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    });
    console.log(`zyra cache smoke status=blocked providerCalls=0 artifact=${path}`);
    process.exitCode = 1;
    return;
  }

  const baseUrl = new URL(process.env.ZYRA_CONTROL_PLANE_URL as string);
  const token = process.env.ZYRA_CONTROL_PLANE_TOKEN as string;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const request = async (path: string, init: RequestInit = {}): Promise<{ status: number; body: JsonRecord | null }> => {
    const response = await fetch(new URL(path, baseUrl), { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const body = await response.json().catch(() => null) as JsonRecord | null;
    return { status: response.status, body };
  };

  const evidenceHash = sha(runId);
  const contentHash = sha(`${runId}:content`);
  const identity = buildZyraCacheIdentity({
    courseId: "mat-i",
    ideas: [{ ideaId: "limit", version: 2 }],
    evidenceHash,
    normalizedIntent: "jelaskan limit fungsi secara singkat",
    promptVersion: "prompt-v1",
    policyVersion: "policy-v1",
    responseSchemaVersion: "schema-v1",
    evidenceVersion: "evidence-v1",
    language: "id",
    routeClass: "default",
    visualCapabilityVersion: "visual-v1",
    assessmentMode: "none",
  });
  const cacheKey = buildZyraCacheKey(identity);
  const entryKey = `zyra:entry:v1:${runId}`;
  const payload = {
    explanation: "Staging-only shared scaffold for cache verification.",
    claims: [{ ideaId: "limit", ideaVersion: 2, claimHash: sha("staging-claim") }],
    teachingMove: "worked_example",
    examples: ["Gunakan nilai dari dua arah."],
    validation: { status: "grounded", evidenceVersion: "evidence-v1", claimCount: 1 },
    cacheMetadata: buildSharedScaffoldMetadata(identity),
  };
  const vector = Array.from({ length: 768 }, (_, index) => (index + 1) / 768);
  const metadata = buildSemanticCacheMetadata(identity, entryKey, contentHash);
  const scope = semanticScopeFromIdentity(identity, contentHash);

  const initialGet = await request(`/cache/get?key=${encodeURIComponent(cacheKey)}`);
  const acquireOne = async (index: number): Promise<{ status: number; body: JsonRecord | null }> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await request("/cache/flight/acquire", {
        method: "POST",
        body: JSON.stringify({ cacheKey, leaderId: `${runId}-follower-${index}`, leaseMs: 10_000 }),
      });
      if (![429, 500, 502, 503, 504].includes(result.status) || attempt === 2) return result;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100 * (attempt + 1)));
    }
    return { status: 599, body: null };
  };
  const acquisitions = await Promise.all(Array.from({ length: 50 }, (_, index) => acquireOne(index)));
  const leaderBody = acquisitions.find((result) => result.body?.status === "leader")?.body;
  const leaderCount = acquisitions.filter((result) => result.body?.status === "leader").length;
  const followerCount = acquisitions.filter((result) => result.body?.status === "follower").length;
  const leaderFlightId = typeof leaderBody?.flightId === "string" ? leaderBody.flightId : undefined;
  let stored: { status: number; body: JsonRecord | null } = { status: 0, body: null };
  if (leaderFlightId) {
    stored = await request("/cache/put", { method: "POST", body: JSON.stringify({ key: cacheKey, payload, ttlSeconds: 900 }) });
    await request("/cache/flight/complete", { method: "POST", body: JSON.stringify({ cacheKey, flightId: leaderFlightId, resultKey: entryKey }) });
  }
  const exactHit = await request(`/cache/get?key=${encodeURIComponent(cacheKey)}`);
  const semanticUpsert = await request("/cache/semantic/upsert", { method: "POST", body: JSON.stringify({ id: entryKey, values: vector, metadata }) });
  let semanticQuery = await request("/cache/semantic/query", { method: "POST", body: JSON.stringify({ vector, topK: 50, scope }) });
  for (let attempt = 0; attempt < 20 && (!(semanticQuery.body?.matches) || (semanticQuery.body.matches as unknown[]).length === 0); attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    semanticQuery = await request("/cache/semantic/query", { method: "POST", body: JSON.stringify({ vector, topK: 50, scope }) });
  }
  const versionBumpIdentity = buildZyraCacheIdentity({ ...identity, evidenceVersion: "evidence-v2", evidenceHash: sha(`${runId}:version-bump`) });
  const versionBump = await request(`/cache/get?key=${encodeURIComponent(buildZyraCacheKey(versionBumpIdentity))}`);
  const rollback = await request(`/cache/get?key=${encodeURIComponent(cacheKey)}`);
  const diagnostics = await request("/cache/diagnostics");
  const writeBudget = Array.isArray(diagnostics.body?.writeBudget) ? diagnostics.body.writeBudget as Array<{ claimed_count?: number }> : [];
  const maxClaimed = Math.max(0, ...writeBudget.map((row) => typeof row.claimed_count === "number" ? row.claimed_count : 0));
  const semanticMatches = Array.isArray(semanticQuery.body?.matches) ? semanticQuery.body.matches.length : 0;
  const semanticRawMatchCount = typeof semanticQuery.body?.rawMatchCount === "number" ? semanticQuery.body.rawMatchCount : 0;
  const semanticRejectedMetadataCount = typeof semanticQuery.body?.rejectedMetadataCount === "number" ? semanticQuery.body.rejectedMetadataCount : 0;
  const semanticInvalidMetadataCount = typeof semanticQuery.body?.invalidMetadataCount === "number" ? semanticQuery.body.invalidMetadataCount : 0;
  const semanticScopeMismatchCount = typeof semanticQuery.body?.scopeMismatchCount === "number" ? semanticQuery.body.scopeMismatchCount : 0;
  const passed = initialGet.status === 200 && initialGet.body?.status === "miss"
    && leaderCount === 1 && followerCount === 49
    && stored.status === 200 && stored.body?.status === "stored"
    && exactHit.status === 200 && exactHit.body?.status === "hit"
    && semanticUpsert.status === 200 && semanticMatches >= 1
    && versionBump.status === 200 && versionBump.body?.status === "miss"
    && rollback.status === 200 && rollback.body?.status === "hit"
    && maxClaimed <= 900;
  const artifact = {
    status: passed ? "passed" : "partial",
    plan: "006",
    phase: "staging_cache_smoke",
    cacheKeyHashOnly: sha(cacheKey),
    entryKey,
    profileId: "zyra-semantic-cache-v1",
    indexAlias: "zyx-zyra-cache-staging",
    dimensions: 768,
    metric: "cosine",
    initialMiss: initialGet.body?.status === "miss",
    singleFlight: { requests: 50, leaders: leaderCount, followers: followerCount },
    singleFlightHttpStatuses: acquisitions.reduce<Record<string, number>>((counts, result) => {
      const key = String(result.status);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    kvWrite: { status: stored.body?.status ?? "unknown", claimedWritesObserved: maxClaimed },
    exactHit: exactHit.body?.status === "hit",
    semanticUpsert: { status: semanticUpsert.body?.status ?? "unknown", httpStatus: semanticUpsert.status, matches: semanticMatches, rawMatchCount: semanticRawMatchCount, rejectedMetadataCount: semanticRejectedMetadataCount, invalidMetadataCount: semanticInvalidMetadataCount, scopeMismatchCount: semanticScopeMismatchCount, scopeMismatchFields: semanticQuery.body?.scopeMismatchFields ?? {}, filterMode: semanticQuery.body?.filterMode ?? "unknown", queryHttpStatus: semanticQuery.status },
    versionBumpMiss: versionBump.body?.status === "miss",
    rollbackHit: rollback.body?.status === "hit",
    cacheProviderUnits: 0,
    providerCalls: 0,
    syntheticLeaderProviderCalls: 1,
    maxProviderRequests,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  const path = await writeArtifact(runId, artifact);
  console.log(`zyra cache smoke status=${artifact.status} leaders=${leaderCount} followers=${followerCount} semanticMatches=${semanticMatches} providerCalls=0 artifact=${path}`);
  if (!passed) process.exitCode = 1;
}

void main().catch(() => {
  console.log("zyra cache smoke status=blocked providerCalls=0");
  process.exitCode = 1;
});
