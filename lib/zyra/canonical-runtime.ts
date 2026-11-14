import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  ide,
  pendaftaranMurid,
  pembahasanSoal,
  potonganSumber,
  soal,
  soalItbReferensi,
  sumberMateri,
} from "@/db/schema";
import {
  evaluateAssessmentAssistancePolicy,
  type ActivityKind,
  type AnswerReleaseState,
  type AttemptState,
  type MatchState,
} from "@/lib/assessment-assistance-policy";
import { vectorStore } from "@/lib/vector-store";
import {
  CANONICAL_VECTOR_PROFILE,
  createVersionedVectorId,
  parseVersionedVectorId,
  type CanonicalAccessClass,
  type CanonicalEntityType,
  type CanonicalNamespace,
  type CanonicalStatus,
  type CanonicalVectorMetadata,
} from "@/lib/vectorize/contracts";
import type { TutorSource } from "@/lib/tutor-rag";
import { redactQuestionAnswerKeys } from "@/lib/asesmen/question-options";
import { hasChapterScopeWithin } from "@/lib/student/course-access";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { hasLegacyPrivateFormativeEnvelope } from "@/lib/materials/legacy-article-public";
import { articleIndexableMarkdown } from "@/lib/articles/structured-read-model";
import { canonicalVectorContent } from "@/lib/vectorize/content";

export const CANONICAL_RUNTIME_REASON_CODES = [
  "INVALID_VECTOR_ID",
  "PROFILE_MISMATCH",
  "VECTOR_METADATA_MISMATCH",
  "NAMESPACE_ENTITY_MISMATCH",
  "COURSE_SCOPE_MISMATCH",
  "CHAPTER_SCOPE_MISMATCH",
  "NOT_ENROLLED",
  "MISSING_CURRENT_ROW",
  "VERSION_MISMATCH",
  "STATUS_NOT_PUBLISHED",
  "STALE_OR_SUPERSEDED",
  "CONTENT_HASH_MISMATCH",
  "CAPABILITY_REQUIRED",
  "ACTIVE_ATTEMPT_ANSWER_DENIED",
  "UNRESOLVED_COURSE_SCOPE",
  "CANONICAL_RUNTIME_UNAVAILABLE",
  "PRIVATE_ARTICLE_PAYLOAD",
] as const;

export type CanonicalRuntimeReasonCode = (typeof CANONICAL_RUNTIME_REASON_CODES)[number];

export interface CanonicalRuntimeCandidate {
  id: string;
  score: number;
  metadata: CanonicalVectorMetadata;
}

export type CanonicalRuntimeAccessTier = "free" | "standard";

export interface CanonicalHydrationRecord {
  namespace: CanonicalNamespace;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  status: CanonicalStatus;
  accessClass: CanonicalAccessClass;
  courseId?: string;
  chapterId?: string;
  title: string;
  content: string;
  safeContent?: string;
  contentHash: string;
  href: string;
}

export interface CanonicalRuntimeRequest {
  studentId?: string;
  courseId: string;
  chapterId?: string | null;
  isEnrolled: boolean;
  /** The server-resolved allowance lane. Free is always chapter-scoped. */
  accessTier?: CanonicalRuntimeAccessTier;
  /** First-two-chapter scope from the central course access resolver. */
  freeChapterIds?: readonly string[];
  /** Compatibility alias for older tutor adapters. */
  allowedChapterIds?: readonly string[];
  activityKind?: ActivityKind;
  attemptState?: AttemptState;
  answerReleaseState?: AnswerReleaseState;
  matchState?: MatchState;
  capability?: "read:published_solutions";
}

export interface CanonicalRejectedCandidate {
  id: string;
  reasonCode: CanonicalRuntimeReasonCode;
}

export interface CanonicalRuntimeSource extends TutorSource {
  content: string;
  version: number;
  entityType: CanonicalEntityType;
  score: number;
}

export interface CanonicalHydrationResult {
  sources: CanonicalRuntimeSource[];
  rejected: CanonicalRejectedCandidate[];
  failure?: {
    reasonCode: "CANONICAL_RUNTIME_UNAVAILABLE";
    operation: "rehydrate" | "retrieve";
  };
}

export async function runCanonicalRuntimeFailClosed(
  operation: "rehydrate" | "retrieve",
  action: () => Promise<CanonicalHydrationResult>,
): Promise<CanonicalHydrationResult> {
  try {
    return await action();
  } catch {
    console.error(JSON.stringify({
      event: "zyra_canonical_runtime_failed_closed",
      code: "CANONICAL_RUNTIME_UNAVAILABLE",
      operation,
    }));
    return {
      sources: [],
      rejected: [],
      failure: { reasonCode: "CANONICAL_RUNTIME_UNAVAILABLE", operation },
    };
  }
}

const NAMESPACE_BY_ENTITY: Record<CanonicalEntityType, CanonicalNamespace> = {
  idea: "canonical_ideas",
  article: "published_articles",
  source_material: "source_materials",
  question_reference: "itb_question_references",
  question: "published_questions",
  solution: "published_solutions",
  admin_document: "admin_ops_knowledge",
};

const SOURCE_TYPE_BY_ENTITY: Record<CanonicalEntityType, TutorSource["type"]> = {
  idea: "ko",
  article: "chapter",
  source_material: "chapter",
  question_reference: "past_exam",
  question: "practice_question",
  solution: "past_exam",
  admin_document: "chapter",
};

function hashContent(content: string): string {
  return createHash("sha256").update(canonicalVectorContent(content), "utf8").digest("hex");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function contentWithFormula(statement: string, explanation: string, latex: string | null): string {
  return [statement, explanation, latex ? `Formula: ${latex}` : ""].filter(Boolean).join("\n\n");
}

function canonicalStatus(value: string): CanonicalStatus {
  if (value === "published" || value === "active" || value === "superseded" || value === "retired" || value === "needs_review") {
    return value;
  }
  return "needs_review";
}

function safeQuestionText(snapshot: unknown, fallback: string): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const value = snapshot as Record<string, unknown>;
    for (const key of ["questionMarkdown", "question", "prompt", "text"]) {
      const candidate = textValue(value[key]).trim();
      if (candidate) return candidate;
    }
  }
  return fallback;
}

function isAnswerBearingDenied(request: CanonicalRuntimeRequest): boolean {
  const policy = evaluateAssessmentAssistancePolicy({
    activityKind: request.activityKind ?? "study",
    attemptState: request.attemptState ?? "none",
    answerReleaseState: request.answerReleaseState ?? "hidden",
    matchState: request.matchState ?? "none",
  });
  return !policy.allowDirectAnswerReveal;
}

function isFreeRequest(request: CanonicalRuntimeRequest): boolean {
  return request.accessTier === "free";
}

function freeChapterIdsFor(request: CanonicalRuntimeRequest): readonly string[] {
  return request.freeChapterIds ?? request.allowedChapterIds ?? [];
}

/**
 * Free Zyra may only use hydrated records that resolve to one of the first
 * two chapters returned by the central course access policy. The database
 * record is authoritative during rehydration, while an explicitly present
 * vector chapter is checked as an additional consistency guard.
 */
function hasFreeChapterScope(
  candidate: CanonicalRuntimeCandidate,
  record: CanonicalHydrationRecord,
  request: CanonicalRuntimeRequest,
): boolean {
  if (!isFreeRequest(request)) return true;

  // The first-two-chapter allowance is course scoped as well. A record or
  // vector without an explicit course relation must fail closed, even when
  // its chapter id happens to match the Free chapter set.
  if (record.courseId !== request.courseId || candidate.metadata.courseId !== request.courseId) {
    return false;
  }

  const allowedChapterIds = freeChapterIdsFor(request);
  if (!hasChapterScopeWithin([record.chapterId], allowedChapterIds)) return false;

  if (Object.prototype.hasOwnProperty.call(candidate.metadata, "chapterId")) {
    return hasChapterScopeWithin([candidate.metadata.chapterId], allowedChapterIds);
  }
  return true;
}

function reject(
  rejected: CanonicalRejectedCandidate[],
  id: string,
  reasonCode: CanonicalRuntimeReasonCode,
): void {
  rejected.push({ id, reasonCode });
}

function validCandidateShape(candidate: CanonicalRuntimeCandidate): CanonicalRuntimeReasonCode | null {
  let parsed: ReturnType<typeof parseVersionedVectorId>;
  try {
    parsed = parseVersionedVectorId(candidate.id);
  } catch {
    return "INVALID_VECTOR_ID";
  }
  const metadata = candidate.metadata;
  if (metadata.profileId !== CANONICAL_VECTOR_PROFILE.id) return "PROFILE_MISMATCH";
  if (
    parsed.entityType !== metadata.entityType ||
    parsed.entityId !== metadata.entityId ||
    parsed.version !== metadata.version
  ) {
    return "VECTOR_METADATA_MISMATCH";
  }
  if (NAMESPACE_BY_ENTITY[metadata.entityType] !== metadata.namespace) return "NAMESPACE_ENTITY_MISMATCH";
  return null;
}

function statusIsCurrent(record: CanonicalHydrationRecord): boolean {
  if (record.entityType === "source_material" || record.entityType === "question_reference") {
    return record.status === "active";
  }
  return record.status === "published";
}

function sourceFromRecord(
  candidate: CanonicalRuntimeCandidate,
  record: CanonicalHydrationRecord,
  request: CanonicalRuntimeRequest,
): CanonicalRuntimeSource {
  const answerBearing = record.entityType === "solution";
  const safeContent = answerBearing && isAnswerBearingDenied(request)
    ? ""
    : record.safeContent ?? record.content;
  return {
    type: SOURCE_TYPE_BY_ENTITY[record.entityType],
    id: candidate.id,
    label: record.title,
    href: record.href,
    content: safeContent,
    version: record.version,
    entityType: record.entityType,
    score: candidate.score,
  };
}

export function hydrateCanonicalCandidates(
  candidates: readonly CanonicalRuntimeCandidate[],
  records: readonly CanonicalHydrationRecord[],
  request: CanonicalRuntimeRequest,
): CanonicalHydrationResult {
  const byIdentity = new Map(records.map((record) => [`${record.entityType}:${record.entityId}`, record]));
  const sources: CanonicalRuntimeSource[] = [];
  const rejected: CanonicalRejectedCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    const shapeError = validCandidateShape(candidate);
    if (shapeError) {
      reject(rejected, candidate.id, shapeError);
      continue;
    }

    const record = byIdentity.get(`${candidate.metadata.entityType}:${candidate.metadata.entityId}`);
    if (!record) {
      reject(rejected, candidate.id, "MISSING_CURRENT_ROW");
      continue;
    }
    if (record.version !== candidate.metadata.version) {
      reject(rejected, candidate.id, "VERSION_MISMATCH");
      continue;
    }
    if (record.status !== candidate.metadata.status || !statusIsCurrent(record)) {
      reject(rejected, candidate.id, record.status === "superseded" ? "STALE_OR_SUPERSEDED" : "STATUS_NOT_PUBLISHED");
      continue;
    }
    if (record.courseId && record.courseId !== request.courseId) {
      reject(rejected, candidate.id, "COURSE_SCOPE_MISMATCH");
      continue;
    }
    if (candidate.metadata.courseId && candidate.metadata.courseId !== request.courseId) {
      reject(rejected, candidate.id, "COURSE_SCOPE_MISMATCH");
      continue;
    }
    if (request.chapterId && record.chapterId !== request.chapterId) {
      reject(rejected, candidate.id, "CHAPTER_SCOPE_MISMATCH");
      continue;
    }
    if (isFreeRequest(request) && !hasFreeChapterScope(candidate, record, request)) {
      reject(rejected, candidate.id, "CHAPTER_SCOPE_MISMATCH");
      continue;
    }
    if (isFreeRequest(request) && record.entityType === "solution") {
      reject(rejected, candidate.id, "ACTIVE_ATTEMPT_ANSWER_DENIED");
      continue;
    }
    if (isFreeRequest(request) && record.accessClass !== "public" && record.accessClass !== "enrolled") {
      reject(
        rejected,
        candidate.id,
        record.accessClass === "restricted_solution"
          ? "ACTIVE_ATTEMPT_ANSWER_DENIED"
          : "NOT_ENROLLED",
      );
      continue;
    }
    if (isFreeRequest(request) && record.accessClass !== candidate.metadata.accessClass) {
      reject(rejected, candidate.id, "VECTOR_METADATA_MISMATCH");
      continue;
    }
    if (record.accessClass === "enrolled" && !request.isEnrolled && !isFreeRequest(request)) {
      reject(rejected, candidate.id, "NOT_ENROLLED");
      continue;
    }
    if (record.accessClass === "restricted_solution") {
      if (request.capability !== "read:published_solutions") {
        reject(rejected, candidate.id, "CAPABILITY_REQUIRED");
        continue;
      }
      if (isAnswerBearingDenied(request)) {
        reject(rejected, candidate.id, "ACTIVE_ATTEMPT_ANSWER_DENIED");
        continue;
      }
    }
    if (candidate.metadata.contentHash && candidate.metadata.contentHash !== record.contentHash) {
      reject(rejected, candidate.id, "CONTENT_HASH_MISMATCH");
      continue;
    }
    if (record.entityType === "article" && hasLegacyPrivateFormativeEnvelope(record.content)) {
      reject(rejected, candidate.id, "PRIVATE_ARTICLE_PAYLOAD");
      continue;
    }

    const source = sourceFromRecord(candidate, record, request);
    if (!source.content.trim()) {
      reject(rejected, candidate.id, "ACTIVE_ATTEMPT_ANSWER_DENIED");
      continue;
    }
    sources.push(source);
  }

  return { sources, rejected };
}

function canonicalCandidateFromMatch(match: { id: string; score: number; metadata: Record<string, unknown> }): CanonicalRuntimeCandidate | null {
  const metadata = match.metadata as Partial<CanonicalVectorMetadata>;
  if (
    typeof metadata.namespace !== "string" ||
    typeof metadata.entityType !== "string" ||
    typeof metadata.entityId !== "string" ||
    typeof metadata.version !== "number" ||
    typeof metadata.status !== "string" ||
    typeof metadata.accessClass !== "string" ||
    typeof metadata.language !== "string" ||
    metadata.profileId !== CANONICAL_VECTOR_PROFILE.id
  ) return null;
  return { id: match.id, score: match.score, metadata: metadata as CanonicalVectorMetadata };
}

async function loadCanonicalRecords(
  candidates: readonly CanonicalRuntimeCandidate[],
  courseId: string,
): Promise<CanonicalHydrationRecord[]> {
  const ids = (entityType: CanonicalEntityType) => [...new Set(
    candidates.filter((candidate) => candidate.metadata.entityType === entityType).map((candidate) => candidate.metadata.entityId),
  )];
  const ideaIds = ids("idea");
  const articleIds = ids("article");
  const sourceChunkIds = ids("source_material");
  const questionIds = ids("question");
  const solutionIds = ids("solution");
  const referenceIds = ids("question_reference");
  const records: CanonicalHydrationRecord[] = [];

  const [ideaRows, articleRows, sourceRows, questionRows, solutionRows, referenceRows] = await Promise.all([
    ideaIds.length
      ? db.select().from(ide).where(inArray(ide.id, ideaIds))
      : Promise.resolve([]),
    articleIds.length
      ? db.select().from(artikel).where(inArray(artikel.id, articleIds))
      : Promise.resolve([]),
    sourceChunkIds.length
      ? db.select({
          chunkId: potonganSumber.id,
          sourceVersion: potonganSumber.sourceVersion,
          content: potonganSumber.content,
          checksum: potonganSumber.checksum,
          courseId: sumberMateri.mataKuliahId,
          chapterId: sumberMateri.babId,
          sourceId: sumberMateri.id,
          sourceTitle: sumberMateri.title,
          sourceStatus: sumberMateri.status,
          sourceCurrentVersion: sumberMateri.version,
        }).from(potonganSumber)
          .innerJoin(sumberMateri, eq(potonganSumber.sumberMateriId, sumberMateri.id))
          .where(and(inArray(potonganSumber.id, sourceChunkIds), eq(potonganSumber.embeddingEligible, true)))
      : Promise.resolve([]),
    questionIds.length
      ? db.select().from(soal).where(and(
          inArray(soal.id, questionIds),
          or(eq(soal.origin, "zyx_original"), eq(soal.origin, "itb_example"), eq(soal.quizEligible, true)),
        ))
      : Promise.resolve([]),
    solutionIds.length
      ? db.select({
          id: pembahasanSoal.id,
          version: pembahasanSoal.version,
          content: pembahasanSoal.content,
          status: pembahasanSoal.status,
          questionId: pembahasanSoal.soalId,
          courseId: soal.mataKuliahId,
          chapterId: soal.babId,
          questionStatus: soal.status,
        }).from(pembahasanSoal)
          .innerJoin(soal, eq(pembahasanSoal.soalId, soal.id))
          .where(and(
            inArray(pembahasanSoal.id, solutionIds),
            or(eq(soal.origin, "zyx_original"), eq(soal.origin, "itb_example"), eq(soal.quizEligible, true)),
          ))
      : Promise.resolve([]),
    referenceIds.length
      ? db.select({
          id: soalItbReferensi.id,
          sourceLabel: soalItbReferensi.sourceLabel,
          visibility: soalItbReferensi.authoringVisibility,
          snapshot: soalItbReferensi.contentSnapshot,
          version: soalItbReferensi.version,
          questionId: soalItbReferensi.soalId,
          courseId: soal.mataKuliahId,
          chapterId: soal.babId,
        }).from(soalItbReferensi)
          .innerJoin(soal, eq(soalItbReferensi.soalId, soal.id))
          .where(inArray(soalItbReferensi.id, referenceIds))
      : Promise.resolve([]),
  ]);

  for (const row of ideaRows) {
    const content = contentWithFormula(row.canonicalStatement, row.conciseExplanation, row.latex);
    const cleanTitle = row.canonicalStatement?.trim()
      ? (row.canonicalStatement.length > 80 ? `${row.canonicalStatement.slice(0, 77)}...` : row.canonicalStatement)
      : row.code;
    records.push({
      namespace: "canonical_ideas",
      entityType: "idea",
      entityId: row.id,
      version: row.version,
      status: canonicalStatus(row.status),
      accessClass: "enrolled",
      courseId: row.mataKuliahId,
      chapterId: row.babId,
      title: cleanTitle,
      content,
      contentHash: hashContent(content),
      href: `/courses/${courseId}/material`,
    });
  }

  for (const row of articleRows) {
    if (hasLegacyPrivateFormativeEnvelope(row.contentMarkdown)) continue;
    const content = articleIndexableMarkdown(row.contentMarkdown);
    records.push({
      namespace: "published_articles",
      entityType: "article",
      entityId: row.id,
      version: row.version,
      status: canonicalStatus(row.status),
      accessClass: "enrolled",
      courseId: row.mataKuliahId,
      chapterId: row.babId ?? undefined,
      title: row.title,
      content,
      contentHash: hashContent(content),
      href: `/courses/${courseId}/articles/${row.slug}`,
    });
  }

  for (const row of sourceRows) {
    if (row.sourceStatus !== "active" || row.sourceVersion !== row.sourceCurrentVersion) continue;
    records.push({
      namespace: "source_materials",
      entityType: "source_material",
      entityId: row.chunkId,
      version: row.sourceVersion,
      status: "active",
      accessClass: "enrolled",
      courseId: row.courseId,
      chapterId: row.chapterId ?? undefined,
      title: row.sourceTitle,
      content: row.content,
      contentHash: hashContent(row.content),
      href: `/courses/${courseId}/material`,
    });
  }

  for (const row of questionRows) {
    const fullContent = `${row.prompt}\n\nOptions: ${stableSerialize(redactQuestionAnswerKeys(row.optionsSnapshot))}`;
    const questionTitle = row.prompt?.trim()
      ? (row.prompt.length > 60 ? `${row.prompt.slice(0, 57)}...` : row.prompt)
      : "Soal latihan";
    records.push({
      namespace: "published_questions",
      entityType: "question",
      entityId: row.id,
      version: row.version,
      status: canonicalStatus(row.status),
      accessClass: "enrolled",
      courseId: row.mataKuliahId,
      chapterId: row.babId ?? undefined,
      title: questionTitle,
      content: fullContent,
      safeContent: row.prompt,
      contentHash: hashContent(fullContent),
      href: `/courses/${courseId}/practice`,
    });
  }

  for (const row of solutionRows) {
    if (row.questionStatus !== "published") continue;
    records.push({
      namespace: "published_solutions",
      entityType: "solution",
      entityId: row.id,
      version: row.version,
      status: canonicalStatus(row.status),
      accessClass: "restricted_solution",
      courseId: row.courseId,
      chapterId: row.chapterId ?? undefined,
      title: "Pembahasan soal",
      content: row.content,
      contentHash: hashContent(row.content),
      href: `/courses/${courseId}/material`,
    });
  }

  for (const row of referenceRows) {
    if (row.visibility !== "allowed") continue;
    const fullContent = stableSerialize(row.snapshot);
    records.push({
      namespace: "itb_question_references",
      entityType: "question_reference",
      entityId: row.id,
      version: row.version,
      status: "active",
      accessClass: "public",
      courseId: row.courseId,
      chapterId: row.chapterId ?? undefined,
      title: row.sourceLabel,
      content: fullContent,
      safeContent: safeQuestionText(row.snapshot, row.sourceLabel),
      contentHash: hashContent(fullContent),
      href: `/courses/${courseId}/material`,
    });
  }

  return records;
}

async function resolveCanonicalCourseId(courseId: string): Promise<string | null> {
  const identity = await resolveCourseIdentity(courseId);
  return identity?.status === "active" ? identity.canonicalId : null;
}

async function resolveCanonicalEnrollment(studentId: string | undefined, courseId: string, fallback: boolean): Promise<boolean> {
  if (!studentId) return fallback;
  const rows = await db
    .select({ id: pendaftaranMurid.id })
    .from(pendaftaranMurid)
    .where(and(
      eq(pendaftaranMurid.penggunaId, studentId),
      eq(pendaftaranMurid.mataKuliahId, courseId),
      inArray(pendaftaranMurid.status, ["active", "completed"]),
    ))
    .limit(1);
  return rows.length > 0;
}

export async function rehydrateCanonicalSourceIds(
  request: CanonicalRuntimeRequest,
  ids: readonly string[],
): Promise<CanonicalHydrationResult> {
  return runCanonicalRuntimeFailClosed("rehydrate", async () => {
    const canonicalCourseId = await resolveCanonicalCourseId(request.courseId);
    if (!canonicalCourseId) return { sources: [], rejected: [] };
    const scopedRequest: CanonicalRuntimeRequest = {
      ...request,
      courseId: canonicalCourseId,
      isEnrolled: await resolveCanonicalEnrollment(request.studentId, canonicalCourseId, request.isEnrolled),
    };
    const candidates: CanonicalRuntimeCandidate[] = [];
    const rejected: CanonicalRejectedCandidate[] = [];
    for (const id of ids) {
      try {
        const parsed = parseVersionedVectorId(id);
        const status: CanonicalStatus = parsed.entityType === "source_material" || parsed.entityType === "question_reference"
          ? "active"
          : "published";
        candidates.push({
          id,
          score: 1,
          metadata: {
            namespace: NAMESPACE_BY_ENTITY[parsed.entityType],
            entityType: parsed.entityType,
            entityId: parsed.entityId,
            version: parsed.version,
            status,
            accessClass: parsed.entityType === "solution" ? "restricted_solution" : parsed.entityType === "question_reference" ? "public" : "enrolled",
            language: "id",
            profileId: CANONICAL_VECTOR_PROFILE.id,
            courseId: canonicalCourseId,
          },
        });
      } catch {
        reject(rejected, id, "INVALID_VECTOR_ID");
      }
    }
    const records = await loadCanonicalRecords(candidates, canonicalCourseId);
    const hydrated = hydrateCanonicalCandidates(candidates, records, scopedRequest);
    return { sources: hydrated.sources, rejected: [...rejected, ...hydrated.rejected] };
  });
}

export async function retrieveCanonicalEvidence(
  request: CanonicalRuntimeRequest,
  question: string,
): Promise<CanonicalHydrationResult> {
  return runCanonicalRuntimeFailClosed("retrieve", async () => {
    const canonicalCourseId = await resolveCanonicalCourseId(request.courseId);
    if (!canonicalCourseId) return { sources: [], rejected: [] };
    const scopedRequest: CanonicalRuntimeRequest = {
      ...request,
      courseId: canonicalCourseId,
      isEnrolled: await resolveCanonicalEnrollment(request.studentId, canonicalCourseId, request.isEnrolled),
    };

    const policy = evaluateAssessmentAssistancePolicy({
      activityKind: scopedRequest.activityKind ?? "study",
      attemptState: scopedRequest.attemptState ?? "none",
      answerReleaseState: scopedRequest.answerReleaseState ?? "hidden",
      matchState: scopedRequest.matchState ?? "none",
    });
    const namespaces: CanonicalNamespace[] = [
      "canonical_ideas",
      "published_articles",
      "source_materials",
      "published_questions",
      "itb_question_references",
    ];
    if (request.accessTier !== "free" && request.capability === "read:published_solutions" && policy.allowDirectAnswerReveal) {
      namespaces.push("published_solutions");
    }

    const matchGroups = await Promise.all(namespaces.map(async (namespace) => {
      const matches = await vectorStore.query(`${canonicalCourseId}_${namespace}`, question, {
        topK: 6,
        ...(scopedRequest.chapterId ? { filter: { chapterId: scopedRequest.chapterId } } : {}),
      });
      return matches.map(canonicalCandidateFromMatch).filter((candidate): candidate is CanonicalRuntimeCandidate => candidate !== null);
    }));
    const candidates = matchGroups.flat();
    const records = await loadCanonicalRecords(candidates, canonicalCourseId);
    return hydrateCanonicalCandidates(candidates, records, scopedRequest);
  });
}

export function canonicalVectorIdFor(entityType: CanonicalEntityType, entityId: string, version: number): string {
  return createVersionedVectorId(entityType, entityId, version);
}
