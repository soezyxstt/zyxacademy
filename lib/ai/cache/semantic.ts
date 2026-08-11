import {
  ZYRA_CACHE_DIMENSIONS,
  ZYRA_CACHE_EMBEDDING_PROFILE,
  type CacheIdeaVersion,
  type CanonicalCacheIdentity,
  type ZyraCacheIdentityInput,
  buildZyraCacheIdentity,
} from "./contracts";

export type SemanticCacheMetadata = {
  readonly cacheEntryId: string;
  readonly embeddingProfile: typeof ZYRA_CACHE_EMBEDDING_PROFILE;
  readonly courseId: string;
  readonly ideaVersionHash: string;
  readonly policyVersion: string;
  readonly language: string;
  readonly routeClass: string;
  readonly assessmentMode: string;
  readonly contentHash: string;
  readonly responseSchemaVersion: string;
};

export type SemanticCacheCandidate = {
  readonly id: string;
  readonly score: number;
  readonly metadata: SemanticCacheMetadata;
};

export type SemanticCacheScope = Pick<SemanticCacheMetadata, "courseId" | "ideaVersionHash" | "policyVersion" | "language" | "routeClass" | "assessmentMode" | "contentHash" | "responseSchemaVersion" | "embeddingProfile">;

export const SEMANTIC_CACHE_REUSE_THRESHOLD = 0.9 as const;

function stableIdeaVersionHash(ideas: readonly CacheIdeaVersion[]): string {
  return ideas.map((idea) => `${idea.ideaId}:${idea.version}`).sort().join("|");
}
export function buildSemanticCacheMetadata(
  identityInput: ZyraCacheIdentityInput,
  cacheEntryId: string,
  contentHash: string,
): SemanticCacheMetadata {
  const identity = buildZyraCacheIdentity(identityInput);
  if (!/^zyra:entry:v1:[A-Za-z0-9._:-]{1,160}$/.test(cacheEntryId)) throw new Error("cache entry ID is not safe");
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new Error("contentHash must be a SHA-256 hex string");
  return {
    cacheEntryId,
    embeddingProfile: ZYRA_CACHE_EMBEDDING_PROFILE,
    courseId: identity.courseId,
    ideaVersionHash: stableIdeaVersionHash(identity.ideas),
    policyVersion: identity.policyVersion,
    language: identity.language,
    routeClass: identity.routeClass,
    assessmentMode: identity.assessmentMode,
    contentHash: contentHash.toLowerCase(),
    responseSchemaVersion: identity.responseSchemaVersion,
  };
}

export function assertSemanticVector(values: readonly number[]): void {
  if (values.length !== ZYRA_CACHE_DIMENSIONS || !values.every((value) => Number.isFinite(value))) {
    throw new Error(`semantic cache vectors must contain ${ZYRA_CACHE_DIMENSIONS} finite values`);
  }
}

export function semanticScopeMatches(candidate: SemanticCacheMetadata, requested: SemanticCacheScope): boolean {
  return candidate.embeddingProfile === ZYRA_CACHE_EMBEDDING_PROFILE
    && candidate.courseId === requested.courseId
    && candidate.ideaVersionHash === requested.ideaVersionHash
    && candidate.policyVersion === requested.policyVersion
    && candidate.language === requested.language
    && candidate.routeClass === requested.routeClass
    && candidate.assessmentMode === requested.assessmentMode
    && candidate.contentHash === requested.contentHash
    && candidate.responseSchemaVersion === requested.responseSchemaVersion;
}

export function selectReusableSemanticCandidate(
  candidates: readonly SemanticCacheCandidate[],
  requested: SemanticCacheScope,
  threshold = SEMANTIC_CACHE_REUSE_THRESHOLD,
): SemanticCacheCandidate | null {
  return [...candidates]
    .filter((candidate) => candidate.score >= threshold && semanticScopeMatches(candidate.metadata, requested))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0] ?? null;
}

export function calculateTokenSimilarity(left: string, right: string): number {
  const tokenize = (value: string): Set<string> => new Set(
    value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[a-z]+|\d+(?:\.\d+)?%?|[+\-=<>≤≥]|\bnot\b|\btidak\b/g) ?? [],
  );
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function semanticScopeFromIdentity(identity: CanonicalCacheIdentity, contentHash: string): SemanticCacheScope {
  return {
    courseId: identity.courseId,
    ideaVersionHash: stableIdeaVersionHash(identity.ideas),
    policyVersion: identity.policyVersion,
    language: identity.language,
    routeClass: identity.routeClass,
    assessmentMode: identity.assessmentMode,
    contentHash,
    responseSchemaVersion: identity.responseSchemaVersion,
    embeddingProfile: identity.embeddingProfile,
  };
}
