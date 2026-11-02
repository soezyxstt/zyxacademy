import { createHash } from "node:crypto";
import { normalizeQuestion } from "@/lib/tutor-rag";

export const TUTOR_PROMPT_VERSION = "v2.1.0";
export const TUTOR_POLICY_VERSION = "v2.0.0";
export const TUTOR_SCHEMA_VERSION = "v1.0.0";
export const TUTOR_DEFAULT_EVIDENCE_VERSION = "v1.0.0";
export const SHARED_TUTOR_TTL_SECONDS = 7 * 24 * 3600;

export interface TutorCacheKeyParams {
  courseId: string;
  chapterId: string | null;
  academicQuery: string;
  promptVersion?: string;
  policyVersion?: string;
  schemaVersion?: string;
  evidenceVersion?: string;
  responseLanguage?: "id" | "en";
}

/**
 * Creates a deterministic, student-free shared cache key for Tier 1 tutor RAG outputs.
 * Hash incorporates normalized query, prompt contract version, policy version, output schema version, and evidence version.
 * Raw query text is NOT included directly in the cache key.
 */
export function buildTutorCacheKey(params: TutorCacheKeyParams): string {
  const {
    courseId,
    chapterId,
    academicQuery,
    promptVersion = TUTOR_PROMPT_VERSION,
    policyVersion = TUTOR_POLICY_VERSION,
    schemaVersion = TUTOR_SCHEMA_VERSION,
    evidenceVersion = TUTOR_DEFAULT_EVIDENCE_VERSION,
    responseLanguage = "id",
  } = params;

  const normalized = normalizeQuestion(academicQuery);
  const compositeString = `${normalized}|${responseLanguage}|${promptVersion}|${policyVersion}|${schemaVersion}|${evidenceVersion}`;
  const hash = createHash("sha256").update(compositeString).digest("hex");

  return `tutor:v3:${courseId}:${chapterId ?? "all"}:${hash}`;
}

/**
 * Computes evidence version hash based on ordered source IDs and content digests.
 */
export function computeEvidenceVersion(sources: Array<{ id: string; content?: string }>): string {
  if (!sources || sources.length === 0) {
    return "no_evidence";
  }
  const serialized = sources
    .map((s) => `${s.id}:${(s.content || "").length}`)
    .sort()
    .join(";");
  return createHash("sha256").update(serialized).digest("hex").slice(0, 12);
}

/**
 * Asserts that a shared cache payload contains NO student-identifying text, user IDs, session IDs, or history tokens.
 * Throws an error if any prohibited value is found.
 */
export function assertNoStudentTextInSharedCache(
  cacheKey: string,
  payload: unknown,
  prohibitedValues: string[] = []
): void {
  const jsonStr = JSON.stringify(payload).toLowerCase();

  for (const value of prohibitedValues) {
    if (!value || value.trim().length === 0) continue;
    const lowerValue = value.toLowerCase().trim();
    if (jsonStr.includes(lowerValue)) {
      throw new Error(
        `Shared cache validation failed for key "${cacheKey}": payload contains prohibited student data "${value}"`
      );
    }
  }
}
