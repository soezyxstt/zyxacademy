export const CACHE_PROFILE_ID = "zyra-semantic-cache-v1" as const;
export const CACHE_INDEX_NAME = "zyx-zyra-cache-staging" as const;
export const CACHE_DIMENSIONS = 768 as const;

const forbiddenKeyPattern = /^(?:user|student|learner|profile|mastery|history|session|attempt|answer|selected|chat|offset|token|secret|auth|api[_-]?key)(?:id|name|email|score|level|value|history|profile|answer|option|index)?$/i;
const forbiddenTextPattern = /\b(?:student|learner|user)[_-]?(?:id|name|email)\b|\bmastery(?:[_ -](?:score|level|value))?\b|\b(?:selected|correct)[_-]?(?:answer|option|index)\b/i;

export function validateCacheKey(value: unknown): value is string {
  return typeof value === "string" && /^zyra:exact:v1:[a-f0-9]{64}$/i.test(value);
}

export function assertProfileFreeCachePayload(value: unknown): void {
  const visit = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof current === "string") {
      if (forbiddenTextPattern.test(current)) throw new Error(`profile-free cache text rejected at ${path}`);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenKeyPattern.test(key)) throw new Error(`profile-free cache field rejected at ${path}`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, "$cachePayload");
}

export function validateCachePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    assertProfileFreeCachePayload(value);
    return true;
  } catch {
    return false;
  }
}

export type SemanticCacheMetadata = {
  readonly cacheEntryId: string;
  readonly embeddingProfile: typeof CACHE_PROFILE_ID;
  readonly courseId: string;
  readonly ideaVersionHash: string;
  readonly policyVersion: string;
  readonly language: string;
  readonly routeClass: string;
  readonly assessmentMode: string;
  readonly contentHash: string;
  readonly responseSchemaVersion: string;
};

const semanticKeys = new Set([
  "cacheEntryId",
  "embeddingProfile",
  "courseId",
  "ideaVersionHash",
  "policyVersion",
  "language",
  "routeClass",
  "assessmentMode",
  "contentHash",
  "responseSchemaVersion",
]);

export function validateSemanticMetadata(value: unknown): value is SemanticCacheMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => semanticKeys.has(key))) return false;
  return record.embeddingProfile === CACHE_PROFILE_ID
    && typeof record.cacheEntryId === "string"
    && /^zyra:entry:v1:[A-Za-z0-9._:-]{1,160}$/.test(record.cacheEntryId)
    && typeof record.courseId === "string"
    && typeof record.ideaVersionHash === "string"
    && typeof record.policyVersion === "string"
    && typeof record.language === "string"
    && typeof record.routeClass === "string"
    && typeof record.assessmentMode === "string"
    && typeof record.contentHash === "string"
    && /^[a-f0-9]{64}$/i.test(record.contentHash)
    && typeof record.responseSchemaVersion === "string";
}

export function semanticMetadataMatchesScope(
  metadata: SemanticCacheMetadata,
  scope: Omit<SemanticCacheMetadata, "cacheEntryId">,
): boolean {
  return metadata.embeddingProfile === CACHE_PROFILE_ID
    && metadata.courseId === scope.courseId
    && metadata.ideaVersionHash === scope.ideaVersionHash
    && metadata.policyVersion === scope.policyVersion
    && metadata.language === scope.language
    && metadata.routeClass === scope.routeClass
    && metadata.assessmentMode === scope.assessmentMode
    && metadata.contentHash === scope.contentHash
    && metadata.responseSchemaVersion === scope.responseSchemaVersion;
}

export function validateSemanticVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === CACHE_DIMENSIONS && value.every((item) => typeof item === "number" && Number.isFinite(item));
}
