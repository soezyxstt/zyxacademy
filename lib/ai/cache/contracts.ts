import { createHash } from "node:crypto";
import { z } from "zod";
import { CanvasSpecSchema } from "@/lib/zyra/canvas";

export const ZYRA_CACHE_SCHEMA_VERSION = "zyra-cache-scaffold-v1" as const;
export const ZYRA_CACHE_POLICY_VERSION = "zyra-cache-policy-v1" as const;
export const ZYRA_CACHE_EMBEDDING_PROFILE = "zyra-semantic-cache-v1" as const;
export const ZYRA_CACHE_INDEX_NAME = "zyx-zyra-cache-staging" as const;
export const ZYRA_CACHE_DIMENSIONS = 768 as const;
export const ZYRA_CACHE_METRIC = "cosine" as const;
export const ZYRA_CACHE_MIN_TTL_SECONDS = 60 as const;
export const ZYRA_CACHE_MAX_TTL_SECONDS = 60 * 60 * 24 * 30;

export type CacheIdeaVersion = {
  readonly ideaId: string;
  readonly version: number;
};

export type ZyraCacheIdentityInput = {
  readonly courseId: string;
  readonly ideas: readonly CacheIdeaVersion[];
  readonly evidenceHash: string;
  readonly normalizedIntent: string;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly responseSchemaVersion: string;
  readonly evidenceVersion: string;
  readonly language: string;
  readonly routeClass: string;
  readonly visualCapabilityVersion: string;
  readonly assessmentMode: string;
  readonly embeddingProfile?: string;
};

export type CanonicalCacheIdentity = Omit<ZyraCacheIdentityInput, "ideas"> & {
  readonly ideas: readonly CacheIdeaVersion[];
  readonly embeddingProfile: typeof ZYRA_CACHE_EMBEDDING_PROFILE;
};

export type CacheTtlClass = "stable_evidence" | "policy_sensitive" | "short_lived";

const claimSchema = z.object({
  ideaId: z.string().min(1).max(200),
  ideaVersion: z.number().int().positive(),
  claimHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

const validationSchema = z.object({
  status: z.enum(["grounded", "partial", "abstain"]),
  evidenceVersion: z.string().min(1).max(120),
  claimCount: z.number().int().nonnegative(),
}).strict();

const cacheMetadataSchema = z.object({
  personalizationAllowed: z.literal(false),
  courseId: z.string().min(1).max(160),
  ideaVersions: z.array(z.object({
    ideaId: z.string().min(1).max(200),
    version: z.number().int().positive(),
  }).strict()).max(64),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/i),
  promptVersion: z.string().min(1).max(120),
  policyVersion: z.string().min(1).max(120),
  responseSchemaVersion: z.string().min(1).max(120),
  evidenceVersion: z.string().min(1).max(120),
  language: z.string().min(2).max(20),
  routeClass: z.string().min(1).max(80),
  visualCapabilityVersion: z.string().min(1).max(120),
  assessmentMode: z.string().min(1).max(80),
  embeddingProfile: z.literal(ZYRA_CACHE_EMBEDDING_PROFILE),
  cacheKey: z.string().regex(/^zyra:exact:v1:[a-f0-9]{64}$/),
}).strict();

export const sharedScaffoldSchema = z.object({
  explanation: z.string().min(1).max(120_000),
  claims: z.array(claimSchema).max(64),
  sourceRefs: z.array(z.object({
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(240),
    label: z.string().min(1).max(400),
    href: z.string().min(1).max(800),
  }).strict()).max(64).optional(),
  teachingMove: z.string().min(1).max(120),
  visualSpec: z.record(z.string(), z.unknown()).optional(),
  canvasSpec: CanvasSpecSchema.nullable().optional(),
  examples: z.array(z.string().min(1).max(4_000)).max(12),
  validation: validationSchema,
  cacheMetadata: cacheMetadataSchema,
}).strict();

export type SharedScaffold = z.infer<typeof sharedScaffoldSchema>;

const forbiddenKeyPattern = /^(?:user|student|learner|profile|mastery|history|session|attempt|answer|selected|chat|offset|token|secret|auth|api[_-]?key)(?:id|name|email|score|level|value|history|profile|answer|option|index)?$/i;
const forbiddenValuePattern = /\b(?:student|learner|user)[_-]?(?:id|name|email)\b|\bmastery(?:[_ -](?:score|level|value))?\b|\b(?:chat|session|attempt)[_-]?(?:history|id)?\b|\b(?:correct|selected)[_-]?(?:answer|option|index)\b/i;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPlainString(value: string, field: string): void {
  if (value.trim().length === 0 || value.length > 512 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error(`invalid cache identity field: ${field}`);
  }
}

export function normalizeCacheIntent(value: string): string {
  assertPlainString(value, "normalizedIntent");
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function normalizeCacheLanguage(value: string): string {
  assertPlainString(value, "language");
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const aliases: Record<string, string> = {
    id: "id",
    "id-id": "id",
    indonesian: "id",
    "bahasa indonesia": "id",
    en: "en",
    "en-us": "en",
    english: "en",
  };
  return aliases[normalized] ?? normalized;
}

export function canonicalizeCacheIdentity(input: ZyraCacheIdentityInput): CanonicalCacheIdentity {
  const fields: Array<[string, string]> = [
    ["courseId", input.courseId],
    ["evidenceHash", input.evidenceHash],
    ["normalizedIntent", normalizeCacheIntent(input.normalizedIntent)],
    ["promptVersion", input.promptVersion],
    ["policyVersion", input.policyVersion],
    ["responseSchemaVersion", input.responseSchemaVersion],
    ["evidenceVersion", input.evidenceVersion],
    ["language", normalizeCacheLanguage(input.language)],
    ["routeClass", input.routeClass],
    ["visualCapabilityVersion", input.visualCapabilityVersion],
    ["assessmentMode", input.assessmentMode],
  ];
  for (const [field, value] of fields) assertPlainString(value, field);
  if (!/^[a-f0-9]{64}$/i.test(input.evidenceHash)) throw new Error("evidenceHash must be a SHA-256 hex string");
  const ideas = [...input.ideas]
    .map((idea) => {
      assertPlainString(idea.ideaId, "ideaId");
      if (!Number.isInteger(idea.version) || idea.version < 1) throw new Error("Idea version must be positive");
      return { ideaId: idea.ideaId, version: idea.version };
    })
    .sort((left, right) => left.ideaId.localeCompare(right.ideaId) || left.version - right.version);
  return {
    courseId: input.courseId,
    ideas,
    evidenceHash: input.evidenceHash.toLowerCase(),
    normalizedIntent: normalizeCacheIntent(input.normalizedIntent),
    promptVersion: input.promptVersion,
    policyVersion: input.policyVersion,
    responseSchemaVersion: input.responseSchemaVersion,
    evidenceVersion: input.evidenceVersion,
    language: normalizeCacheLanguage(input.language),
    routeClass: input.routeClass,
    visualCapabilityVersion: input.visualCapabilityVersion,
    assessmentMode: input.assessmentMode,
    embeddingProfile: ZYRA_CACHE_EMBEDDING_PROFILE,
  };
}

export function buildZyraCacheKey(input: ZyraCacheIdentityInput): string {
  const canonical = canonicalizeCacheIdentity(input);
  return `zyra:exact:v1:${sha256(stableSerialize(canonical))}`;
}

export function buildZyraCacheIdentity(input: ZyraCacheIdentityInput): CanonicalCacheIdentity & { readonly cacheKey: string } {
  const canonical = canonicalizeCacheIdentity(input);
  return { ...canonical, cacheKey: buildZyraCacheKey(canonical) };
}

export function buildSharedScaffoldMetadata(input: ZyraCacheIdentityInput) {
  const identity = buildZyraCacheIdentity(input);
  return {
    personalizationAllowed: false as const,
    courseId: identity.courseId,
    ideaVersions: identity.ideas.map((idea) => ({ ideaId: idea.ideaId, version: idea.version })),
    evidenceHash: identity.evidenceHash,
    promptVersion: identity.promptVersion,
    policyVersion: identity.policyVersion,
    responseSchemaVersion: identity.responseSchemaVersion,
    evidenceVersion: identity.evidenceVersion,
    language: identity.language,
    routeClass: identity.routeClass,
    visualCapabilityVersion: identity.visualCapabilityVersion,
    assessmentMode: identity.assessmentMode,
    embeddingProfile: identity.embeddingProfile,
    cacheKey: identity.cacheKey,
  };
}

export function validateSharedScaffold(value: unknown): SharedScaffold {
  const parsed = sharedScaffoldSchema.parse(value);
  assertProfileFreeSharedPayload(parsed);
  if (parsed.validation.claimCount !== parsed.claims.length) {
    throw new Error("scaffold claim count does not match claims");
  }
  return parsed;
}

export function assertProfileFreeSharedPayload(value: unknown): void {
  const visit = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof current === "string") {
      if (forbiddenValuePattern.test(current)) throw new Error(`learner data is not allowed at ${path}`);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenKeyPattern.test(key)) throw new Error(`learner field ${key} is not allowed at ${path}`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, "$sharedScaffold");
}

export function buildSharedScaffoldHash(scaffold: SharedScaffold): string {
  const validated = validateSharedScaffold(scaffold);
  return sha256(stableSerialize(validated));
}

export function boundedCacheTtlSeconds(cacheClass: CacheTtlClass): number {
  const proposed = cacheClass === "stable_evidence"
    ? ZYRA_CACHE_MAX_TTL_SECONDS
    : cacheClass === "policy_sensitive"
      ? 60 * 60 * 24
      : 60 * 15;
  return Math.min(ZYRA_CACHE_MAX_TTL_SECONDS, Math.max(ZYRA_CACHE_MIN_TTL_SECONDS, proposed));
}
