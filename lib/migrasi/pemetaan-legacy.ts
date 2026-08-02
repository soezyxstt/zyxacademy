import { createHash } from "node:crypto";

/** Legacy identifiers may be numeric in old exports but are text in the target domain. */
export type LegacyId = string | number;

export type TargetIdCollection = ReadonlySet<string> | readonly string[];

export type MappingStatus = "exact" | "ambiguous" | "unmapped";

export type RelationType = "prerequisite" | "related" | "extends" | "example_of" | "misconception_of";

export type CompatibilityExceptionCode =
  | "AMBIGUOUS_ASSESSMENT_MAPPING"
  | "DUPLICATE_TARGET_ID"
  | "ORPHAN_REFERENCE"
  | "UNKNOWN_RELATION_TYPE"
  | "UNATTRIBUTABLE_MASTERY"
  | "UNSUPPORTED_CONTENT";

export type LegacyStatus = "active" | "draft" | "archived" | "retired" | "superseded" | "needs_review";

export type TargetIdeaStatus = "draft" | "published" | "needs_review" | "withdrawn" | "superseded";

export type TargetArticleStatus = "draft" | "in_review" | "published" | "withdrawn";

export type TargetFlashcardStatus = "draft" | "published" | "retired";

export type TargetQuestionStatus = "draft" | "in_review" | "published" | "retired";

/**
 * This mirrors the pure stable-value behavior used by the migration ledger.
 * Keeping it local means mapping tests never load the database module.
 */
export function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Creates the checksum used for source and target reconciliation. */
export function stableChecksum(value: unknown): string {
  return sha256Text(stableStringify(value));
}

function asLegacyId(value: LegacyId): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Legacy identifiers must be finite numbers");
    return String(value);
  }
  if (value.length === 0 || value.trim().length === 0 || value.includes("\u0000")) {
    throw new Error("Legacy identifiers must be non-empty and contain no NUL characters");
  }
  return value;
}

function hasTargetId(existingTargetIds: TargetIdCollection | undefined, id: string): boolean {
  if (!existingTargetIds) return false;
  const isSet = typeof (existingTargetIds as ReadonlySet<string>).has === "function";
  return isSet
    ? (existingTargetIds as ReadonlySet<string>).has(id)
    : (existingTargetIds as readonly string[]).includes(id);
}

/**
 * Preserves a legacy ID when it is available. On collision, the source tuple
 * produces a deterministic ID and a counter makes the result collision-safe.
 */
export function stableTargetId(
  legacyTable: string,
  legacyId: LegacyId,
  existingTargetIds?: TargetIdCollection,
): string {
  const sourceId = asLegacyId(legacyId);
  if (!hasTargetId(existingTargetIds, sourceId)) return sourceId;

  const sourceHash = sha256Text(`${legacyTable}\u0000${sourceId}`);
  const base = `legacy-${sourceHash.slice(0, 32)}`;
  if (!hasTargetId(existingTargetIds, base)) return base;

  let collisionIndex = 1;
  while (hasTargetId(existingTargetIds, `${base}-${collisionIndex}`)) collisionIndex += 1;
  return `${base}-${collisionIndex}`;
}

/** Deterministic ID for a target join row. */
export function stableJoinId(joinTable: string, ...legacyParts: LegacyId[]): string {
  return `${joinTable}-${sha256Text(stableStringify(legacyParts.map(asLegacyId))).slice(0, 32)}`;
}

function stableExceptionKey(input: {
  legacyTable: string;
  legacyId: LegacyId;
  reasonCode: CompatibilityExceptionCode;
}): string {
  return stableStringify({
    legacyId: asLegacyId(input.legacyId),
    legacyTable: input.legacyTable,
    reasonCode: input.reasonCode,
  });
}

/** Deterministic ID for one source exception, stable across retries. */
export function stableExceptionId(
  legacyTable: string,
  legacyId: LegacyId,
  reasonCode: CompatibilityExceptionCode,
): string {
  return `legacy-exception-${sha256Text(stableExceptionKey({ legacyTable, legacyId, reasonCode })).slice(0, 32)}`;
}

export interface CompatibilityException {
  id: string;
  legacyTable: string;
  legacyId: string;
  reasonCode: CompatibilityExceptionCode;
  reason: string;
  preservationPath: string;
  blocksCutover: boolean;
  sourceChecksum: string;
}

export interface CompatibilityExceptionInput {
  id?: string;
  legacyTable: string;
  legacyId: LegacyId;
  reasonCode: CompatibilityExceptionCode;
  reason: string;
  preservationPath: string;
  blocksCutover: boolean;
  source?: unknown;
  sourceChecksum?: string;
}

/** Builds a complete exception ledger row without timestamps or random IDs. */
export function createCompatibilityException(input: CompatibilityExceptionInput): CompatibilityException {
  const legacyId = asLegacyId(input.legacyId);
  return {
    id: input.id ?? stableExceptionId(input.legacyTable, legacyId, input.reasonCode),
    legacyTable: input.legacyTable,
    legacyId,
    reasonCode: input.reasonCode,
    reason: input.reason,
    preservationPath: input.preservationPath,
    blocksCutover: input.blocksCutover,
    sourceChecksum: input.sourceChecksum ?? stableChecksum(input.source ?? input),
  };
}

export interface LegacyCourseInput {
  id: LegacyId;
  title: string;
  code?: string | null;
  category?: string | null;
  status?: string | null;
  description?: string | null;
}

export interface MappedCourse {
  id: string;
  legacyTable: "courses";
  legacyId: string;
  targetTable: "mata_kuliah";
  code: string;
  title: string;
  status: "draft" | "active" | "archived";
  legacyCourseId: string;
  sourceChecksum: string;
  mappingStatus: "exact";
}

export interface LegacyChapterInput {
  id: LegacyId;
  courseId: LegacyId;
  title: string;
  code?: string | null;
  orderIndex?: number | null;
  status?: string | null;
}

export interface MapChapterOptions {
  targetCourseId?: string;
  existingTargetIds?: TargetIdCollection;
}

export interface MappedChapter {
  id: string;
  legacyTable: "chapters";
  legacyId: string;
  targetTable: "bab";
  mataKuliahId: string;
  code: string;
  title: string;
  orderIndex: number;
  status: "draft" | "active" | "archived";
  legacyChapterId: string;
  sourceChecksum: string;
  mappingStatus: "exact";
}

export interface LegacyIdeaInput {
  id: LegacyId;
  courseId: LegacyId;
  chapterId: LegacyId;
  conceptId: LegacyId;
  title?: string | null;
  conceptName: string;
  content: string;
  code?: string | null;
  canonicalStatement?: string | null;
  conciseExplanation?: string | null;
  latex?: string | null;
  type?: string | null;
  knowledgeKind?: string | null;
  instructionalRole?: string | null;
  difficultyMetadata?: Record<string, unknown> | null;
  version?: number | null;
  status?: string | null;
  stableKey?: string | null;
  semanticHash?: string | null;
  generationHash?: string | null;
  creatorId?: string | null;
}

export interface MapIdeaOptions {
  targetCourseId?: string;
  targetChapterId?: string;
  targetConceptId?: string;
  creatorId: string;
  existingTargetIds?: TargetIdCollection;
}

export interface MappedIdea {
  id: string;
  legacyTable: "knowledge_objects";
  legacyId: string;
  targetTable: "ide";
  mataKuliahId: string;
  babId: string;
  conceptId: string;
  stableKey: string;
  code: string;
  canonicalStatement: string;
  conciseExplanation: string;
  latex: string | null;
  knowledgeKind: "definition" | "principle" | "formula" | "procedure" | "example" | "constraint" | "misconception" | "other";
  instructionalRole: "core" | "prerequisite" | "enrichment" | "assessment_support" | "reference";
  difficultyMetadata: Record<string, unknown>;
  version: number;
  status: TargetIdeaStatus;
  sourcePolicy: "source_grounded";
  schemaVersion: "idea.v1";
  semanticHash: string;
  generationHash: string;
  creatorId: string;
  sourceChecksum: string;
  mappingStatus: "exact";
}

export interface LegacyArticleSection {
  id?: LegacyId;
  key?: string | null;
  type?: string | null;
  content: string;
  orderIndex?: number | null;
}

export interface LegacyArticleInput {
  id: LegacyId;
  courseId: LegacyId;
  chapterId?: LegacyId | null;
  sourceMtdId: LegacyId;
  sourceMtdVersion: number;
  title: string;
  slug?: string | null;
  canonicalMarkdown: string;
  structuredContent?: unknown;
  version?: number | null;
  status?: string | null;
  generationHash?: string | null;
  creatorId: string;
}

export interface MapArticleOptions {
  targetCourseId?: string;
  targetChapterId?: string | null;
  existingTargetIds?: TargetIdCollection;
}

export interface MappedArticleBlock {
  id: string;
  blockKey: string;
  blockType: string;
  orderIndex: number;
  content: string;
  version: number;
  generationHash: string;
  status: "draft" | "published" | "withdrawn";
  reviewStatus: "lossless" | "needs_review";
}

export interface MappedArticle {
  id: string;
  legacyTable: "website_materials";
  legacyId: string;
  targetTable: "artikel";
  mataKuliahId: string;
  babId: string | null;
  slug: string;
  title: string;
  contentMarkdown: string;
  version: number;
  status: TargetArticleStatus;
  sourceHash: string;
  generationHash: string;
  creatorId: string;
  sourceMtdId: string;
  sourceMtdVersion: number;
  blocks: MappedArticleBlock[];
  transformation: "lossless_ast" | "markdown_needs_review";
  sourceChecksum: string;
  mappingStatus: "exact";
}

export interface LegacyFlashcardInput {
  id: LegacyId;
  setId: LegacyId;
  koId?: LegacyId | null;
  front: string;
  back: string;
  explanation?: string | null;
  status?: string | null;
  generationHash?: string | null;
}

export interface MapFlashcardOptions {
  targetSetId?: string;
  ideaIdForKo?: string | null;
  existingTargetIds?: TargetIdCollection;
}

export interface MappedFlashcard {
  id: string;
  legacyTable: "flashcards";
  legacyId: string;
  targetTable: "flashcard";
  setFlashcardId: string;
  front: string;
  back: string;
  explanation: string | null;
  version: 1;
  status: TargetFlashcardStatus;
  generationHash: string;
  ideaLink: { id: string; ideId: string; weight: 1 } | null;
  sourceChecksum: string;
  mappingStatus: "exact" | "unmapped";
  exception?: CompatibilityException;
}

export interface LegacyQuestionInput {
  id: LegacyId;
  courseId: LegacyId;
  chapterId?: LegacyId | null;
  questionType?: string | null;
  prompt: string;
  options?: unknown[] | null;
  difficulty?: string | null;
  status?: string | null;
  generationHash?: string | null;
  exactIdeaId?: string | null;
  fallbackIdeaIds?: readonly string[];
  candidateIdeaIds?: readonly string[];
}

export interface MapQuestionOptions {
  targetCourseId?: string;
  targetChapterId?: string | null;
  existingTargetIds?: TargetIdCollection;
}

export interface MappedQuestionIdeaLink {
  id: string;
  soalId: string;
  ideId: string;
  weight: 1;
  role: "primary" | "supporting";
  mappingStatus: MappingStatus;
  evidenceEligible: boolean;
}

export interface MappedQuestion {
  id: string;
  legacyTable: "ai_question_bank";
  legacyId: string;
  targetTable: "soal";
  mataKuliahId: string;
  babId: string | null;
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  prompt: string;
  optionsSnapshot: unknown[];
  version: 1;
  status: TargetQuestionStatus;
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  reasoningPattern: string;
  generationHash: string;
  ideaLinks: MappedQuestionIdeaLink[];
  mappingStatus: MappingStatus;
  masteryEvidenceAllowed: boolean;
  sourceChecksum: string;
  exception?: CompatibilityException;
}

export interface LegacyRelationInput {
  id: LegacyId;
  sourceKoId: LegacyId;
  targetKoId: LegacyId;
  type: string;
  explanation?: string | null;
}

export interface MapRelationOptions {
  sourceIdeaId?: string;
  targetIdeaId?: string;
}

export interface MappedRelation {
  id: string;
  legacyTable: "knowledge_relationships";
  legacyId: string;
  targetTable: "relasi_ide";
  sourceIdeaId: string;
  targetIdeaId: string;
  relationType: RelationType | null;
  explanation: string | null;
  mappingStatus: "exact" | "unmapped";
  sourceChecksum: string;
  exception?: CompatibilityException;
}

export interface LegacyConceptMasteryInput {
  id: LegacyId;
  studentId: string;
  courseId: string;
  conceptId?: string | null;
  conceptName: string;
  masteryScore: number;
  confidence: number;
  evidenceCount: number;
}

export interface LegacyMasteryEvidence {
  ideaId?: string | null;
  courseId?: string | null;
  conceptId?: string | null;
  mappingStatus: MappingStatus;
  evidenceCount?: number | null;
  snapshotHash?: string | null;
  expectedSnapshotHash?: string | null;
}

export interface AttributedIdeaMastery {
  ideaId: string;
  sourceConceptMasteryId: string;
  masteryScore: number;
  confidence: number;
  evidenceCount: number;
  derivedFromEvidence: true;
}

export interface MasteryAttribution {
  baseline: {
    sourceConceptMasteryId: string;
    studentId: string;
    courseId: string;
    conceptId: string | null;
    conceptName: string;
    masteryScore: number;
    confidence: number;
    evidenceCount: number;
    compatibilityOnly: true;
  };
  attributedIdeas: AttributedIdeaMastery[];
  excludedEvidenceCount: number;
  exception?: CompatibilityException;
}

function mapCourseStatus(status: string | null | undefined): MappedCourse["status"] {
  if (status === "draft") return "draft";
  if (status === "archived" || status === "retired" || status === "superseded") return "archived";
  return "active";
}

function mapChapterStatus(status: string | null | undefined): MappedChapter["status"] {
  return mapCourseStatus(status);
}

function mapIdeaStatus(status: string | null | undefined): TargetIdeaStatus {
  if (status === "draft") return "draft";
  if (status === "needs_review") return "needs_review";
  if (status === "retired") return "withdrawn";
  if (status === "superseded") return "superseded";
  return "published";
}

function mapArticleStatus(status: string | null | undefined): TargetArticleStatus {
  if (status === "draft") return "draft";
  if (status === "in_review" || status === "needs_review") return "in_review";
  if (status === "withdrawn" || status === "retired") return "withdrawn";
  return "published";
}

function mapFlashcardStatus(status: string | null | undefined): TargetFlashcardStatus {
  if (status === "draft") return "draft";
  if (status === "retired" || status === "withdrawn") return "retired";
  return "published";
}

function mapQuestionStatus(status: string | null | undefined): TargetQuestionStatus {
  if (status === "draft") return "draft";
  if (status === "in_review" || status === "needs_review") return "in_review";
  if (status === "retired" || status === "withdrawn") return "retired";
  return "published";
}

function mapQuestionType(type: string | null | undefined): MappedQuestion["questionType"] {
  if (type === "multiple_choices") return "multiple_choices";
  if (type === "short_answer") return "short_answer";
  if (type === "essay") return "essay";
  return "multiple_choice";
}

function mapDifficulty(difficulty: string | null | undefined): MappedQuestion["difficulty"] {
  if (difficulty === "easy") return "easy";
  if (difficulty === "hard") return "hard";
  return "medium";
}

function mapKnowledgeKind(
  knowledgeKind: string | null | undefined,
  legacyType: string | null | undefined,
): MappedIdea["knowledgeKind"] {
  const value = knowledgeKind ?? legacyType;
  if (value === "definition" || value === "principle" || value === "formula" || value === "procedure") return value;
  if (value === "example" || value === "constraint" || value === "misconception") return value;
  return "other";
}

function mapInstructionalRole(role: string | null | undefined): MappedIdea["instructionalRole"] {
  if (role === "prerequisite") return "prerequisite";
  if (role === "enrichment") return "enrichment";
  if (role === "assessment_support") return "assessment_support";
  if (role === "reference") return "reference";
  return "core";
}

function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `legacy-${sha256Text(value).slice(0, 12)}`;
}

function mapArticleBlocks(
  articleId: string,
  structuredContent: unknown,
  canonicalMarkdown: string,
  version: number,
  generationHash: string,
  status: MappedArticleBlock["status"],
): { blocks: MappedArticleBlock[]; transformation: MappedArticle["transformation"] } {
  const rawSections = Array.isArray(structuredContent)
    ? structuredContent
    : structuredContent && typeof structuredContent === "object" && Array.isArray((structuredContent as { blocks?: unknown }).blocks)
      ? (structuredContent as { blocks: unknown[] }).blocks
      : null;

  const sections = rawSections?.filter((section): section is LegacyArticleSection => {
    if (!section || typeof section !== "object") return false;
    const candidate = section as Partial<LegacyArticleSection>;
    return typeof candidate.content === "string";
  });

  if (sections && sections.length === rawSections?.length && sections.length > 0) {
    return {
      transformation: "lossless_ast",
      blocks: sections.map((section, index) => {
        const blockKey = section.key?.trim() || (section.id === undefined ? `section-${index + 1}` : asLegacyId(section.id));
        const blockType = section.type?.trim() || "markdown";
        return {
          id: stableJoinId("blok_artikel", articleId, blockKey),
          blockKey,
          blockType,
          orderIndex: section.orderIndex ?? index,
          content: section.content,
          version,
          generationHash: stableChecksum({ articleId, blockKey, content: section.content, generationHash }),
          status,
          reviewStatus: "lossless",
        };
      }),
    };
  }

  return {
    transformation: "markdown_needs_review",
    blocks: [
      {
        id: stableJoinId("blok_artikel", articleId, "legacy-markdown"),
        blockKey: "legacy-markdown",
        blockType: "legacy_markdown",
        orderIndex: 0,
        content: canonicalMarkdown,
        version,
        generationHash: stableChecksum({ articleId, canonicalMarkdown, generationHash }),
        status: status === "published" ? "draft" : status,
        reviewStatus: "needs_review",
      },
    ],
  };
}

/** Maps one legacy course to its one-to-one Indonesian course row. */
export function mapLegacyCourse(input: LegacyCourseInput, existingTargetIds?: TargetIdCollection): MappedCourse {
  const legacyId = asLegacyId(input.id);
  const id = stableTargetId("courses", legacyId, existingTargetIds);
  return {
    id,
    legacyTable: "courses",
    legacyId,
    targetTable: "mata_kuliah",
    code: input.code?.trim() || `LEGACY-${sha256Text(legacyId).slice(0, 12).toUpperCase()}`,
    title: input.title,
    status: mapCourseStatus(input.status),
    legacyCourseId: legacyId,
    sourceChecksum: stableChecksum(input),
    mappingStatus: "exact",
  };
}

/** Maps one legacy chapter after the parent course target ID is known. */
export function mapLegacyChapter(input: LegacyChapterInput, options: MapChapterOptions = {}): MappedChapter {
  const legacyId = asLegacyId(input.id);
  const targetCourseId = options.targetCourseId ?? stableTargetId("courses", input.courseId);
  const id = stableTargetId("chapters", legacyId, options.existingTargetIds);
  return {
    id,
    legacyTable: "chapters",
    legacyId,
    targetTable: "bab",
    mataKuliahId: targetCourseId,
    code: input.code?.trim() || `BAB-${legacyId}`,
    title: input.title,
    orderIndex: input.orderIndex ?? 0,
    status: mapChapterStatus(input.status),
    legacyChapterId: legacyId,
    sourceChecksum: stableChecksum(input),
    mappingStatus: "exact",
  };
}

/** Maps one knowledge object to exactly one Idea without changing its source identity. */
export function mapLegacyIdea(input: LegacyIdeaInput, options: MapIdeaOptions): MappedIdea {
  const legacyId = asLegacyId(input.id);
  const id = stableTargetId("knowledge_objects", legacyId, options.existingTargetIds);
  const sourceChecksum = stableChecksum(input);
  const canonicalStatement = input.canonicalStatement?.trim() || input.title?.trim() || input.content;
  const conciseExplanation = input.conciseExplanation?.trim() || input.content;
  return {
    id,
    legacyTable: "knowledge_objects",
    legacyId,
    targetTable: "ide",
    mataKuliahId: options.targetCourseId ?? stableTargetId("courses", input.courseId),
    babId: options.targetChapterId ?? stableTargetId("chapters", input.chapterId),
    conceptId: options.targetConceptId ?? asLegacyId(input.conceptId),
    stableKey: input.stableKey?.trim() || `legacy:knowledge_objects:${legacyId}`,
    code: input.code?.trim() || `LEGACY-${sha256Text(legacyId).slice(0, 12).toUpperCase()}`,
    canonicalStatement,
    conciseExplanation,
    latex: input.latex ?? null,
    knowledgeKind: mapKnowledgeKind(input.knowledgeKind, input.type),
    instructionalRole: mapInstructionalRole(input.instructionalRole),
    difficultyMetadata: input.difficultyMetadata ?? {},
    version: input.version && input.version > 0 ? input.version : 1,
    status: mapIdeaStatus(input.status),
    sourcePolicy: "source_grounded",
    schemaVersion: "idea.v1",
    semanticHash: input.semanticHash ?? stableChecksum({ canonicalStatement, conciseExplanation, latex: input.latex ?? null }),
    generationHash: input.generationHash ?? sourceChecksum,
    creatorId: input.creatorId ?? options.creatorId,
    sourceChecksum,
    mappingStatus: "exact",
  };
}

/** Maps an article, retaining full Markdown when its AST cannot be translated losslessly. */
export function mapLegacyArticle(input: LegacyArticleInput, options: MapArticleOptions = {}): MappedArticle {
  const legacyId = asLegacyId(input.id);
  const id = stableTargetId("website_materials", legacyId, options.existingTargetIds);
  const version = input.version && input.version > 0 ? input.version : 1;
  const sourceHash = stableChecksum(input.canonicalMarkdown);
  const generationHash = input.generationHash ?? stableChecksum(input);
  const status = mapArticleStatus(input.status);
  const blocks = mapArticleBlocks(id, input.structuredContent, input.canonicalMarkdown, version, generationHash, status === "in_review" ? "draft" : status);
  return {
    id,
    legacyTable: "website_materials",
    legacyId,
    targetTable: "artikel",
    mataKuliahId: options.targetCourseId ?? stableTargetId("courses", input.courseId),
    babId: input.chapterId === null ? null : options.targetChapterId ?? (input.chapterId === undefined ? null : stableTargetId("chapters", input.chapterId)),
    slug: normalizeSlug(input.slug?.trim() || input.title),
    title: input.title,
    contentMarkdown: input.canonicalMarkdown,
    version,
    status,
    sourceHash,
    generationHash,
    creatorId: input.creatorId,
    sourceMtdId: asLegacyId(input.sourceMtdId),
    sourceMtdVersion: input.sourceMtdVersion,
    blocks: blocks.blocks,
    transformation: blocks.transformation,
    sourceChecksum: stableChecksum(input),
    mappingStatus: "exact",
  };
}

/** Maps a flashcard and emits a single Idea link only when its KO mapping is exact. */
export function mapLegacyFlashcard(input: LegacyFlashcardInput, options: MapFlashcardOptions = {}): MappedFlashcard {
  const legacyId = asLegacyId(input.id);
  const id = stableTargetId("flashcards", legacyId, options.existingTargetIds);
  const setFlashcardId = options.targetSetId ?? stableTargetId("flashcard_sets", input.setId);
  const ideaLink = input.koId !== null && input.koId !== undefined && options.ideaIdForKo
    ? { id: stableJoinId("flashcard_ide", id, options.ideaIdForKo), ideId: options.ideaIdForKo, weight: 1 as const }
    : null;
  const sourceChecksum = stableChecksum(input);
  const exception = input.koId !== null && input.koId !== undefined && !options.ideaIdForKo
    ? createCompatibilityException({
        legacyTable: "flashcards",
        legacyId,
        reasonCode: "ORPHAN_REFERENCE",
        reason: "The legacy flashcard references a KO without an exact Idea mapping.",
        preservationPath: `legacy:flashcards:${legacyId}`,
        blocksCutover: true,
        source: input,
        sourceChecksum,
      })
    : undefined;
  return {
    id,
    legacyTable: "flashcards",
    legacyId,
    targetTable: "flashcard",
    setFlashcardId,
    front: input.front,
    back: input.back,
    explanation: input.explanation ?? null,
    version: 1,
    status: mapFlashcardStatus(input.status),
    generationHash: input.generationHash ?? sourceChecksum,
    ideaLink,
    sourceChecksum,
    mappingStatus: exception ? "unmapped" : "exact",
    ...(exception ? { exception } : {}),
  };
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

/**
 * Maps exact question links as evidence-eligible. Fallback candidates remain
 * explicit ambiguous links and can never produce mastery evidence.
 */
export function mapLegacyQuestion(input: LegacyQuestionInput, options: MapQuestionOptions = {}): MappedQuestion {
  const legacyId = asLegacyId(input.id);
  const id = stableTargetId("ai_question_bank", legacyId, options.existingTargetIds);
  const exactIdeaId = input.exactIdeaId?.trim() || null;
  const candidates = uniqueIds(input.fallbackIdeaIds ?? input.candidateIdeaIds ?? []);
  const sourceChecksum = stableChecksum(input);
  let mappingStatus: MappingStatus = "unmapped";
  let ideaIds: string[] = [];
  let exception: CompatibilityException | undefined;

  if (exactIdeaId) {
    mappingStatus = "exact";
    ideaIds = [exactIdeaId];
  } else if (candidates.length > 0) {
    mappingStatus = "ambiguous";
    ideaIds = candidates;
    exception = createCompatibilityException({
      legacyTable: "ai_question_bank",
      legacyId,
      reasonCode: "AMBIGUOUS_ASSESSMENT_MAPPING",
      reason: "Legacy fallback candidates were retained as ambiguous and are not mastery evidence.",
      preservationPath: `legacy:ai_question_bank:${legacyId}`,
      blocksCutover: true,
      source: input,
      sourceChecksum,
    });
  } else {
    exception = createCompatibilityException({
      legacyTable: "ai_question_bank",
      legacyId,
      reasonCode: "ORPHAN_REFERENCE",
      reason: "The question has no exact or fallback Idea mapping.",
      preservationPath: `legacy:ai_question_bank:${legacyId}`,
      blocksCutover: true,
      source: input,
      sourceChecksum,
    });
  }

  const ideaLinks = ideaIds.map((ideaId, index) => ({
    id: stableJoinId("soal_ide", id, ideaId),
    soalId: id,
    ideId: ideaId,
    weight: 1 as const,
    role: index === 0 && mappingStatus === "exact" ? ("primary" as const) : ("supporting" as const),
    mappingStatus,
    evidenceEligible: mappingStatus === "exact",
  }));

  return {
    id,
    legacyTable: "ai_question_bank",
    legacyId,
    targetTable: "soal",
    mataKuliahId: options.targetCourseId ?? stableTargetId("courses", input.courseId),
    babId: input.chapterId === null ? null : options.targetChapterId ?? (input.chapterId === undefined ? null : stableTargetId("chapters", input.chapterId)),
    questionType: mapQuestionType(input.questionType),
    prompt: input.prompt,
    optionsSnapshot: input.options ?? [],
    version: 1,
    status: mapQuestionStatus(input.status),
    difficulty: mapDifficulty(input.difficulty),
    cognitiveLevel: "understand",
    reasoningPattern: "legacy_import",
    generationHash: input.generationHash ?? sourceChecksum,
    ideaLinks,
    mappingStatus,
    masteryEvidenceAllowed: mappingStatus === "exact",
    sourceChecksum,
    ...(exception ? { exception } : {}),
  };
}

const RELATION_TRANSLATIONS: Readonly<Record<string, RelationType>> = {
  prerequisite: "prerequisite",
  prerequisite_of: "prerequisite",
  prereq: "prerequisite",
  requires: "prerequisite",
  required: "prerequisite",
  depends_on: "prerequisite",
  precondition: "prerequisite",
  related: "related",
  related_to: "related",
  association: "related",
  see_also: "related",
  extends: "extends",
  extension_of: "extends",
  elaborates: "extends",
  elaborates_on: "extends",
  example: "example_of",
  example_of: "example_of",
  instance_of: "example_of",
  illustrates: "example_of",
  misconception: "misconception_of",
  misconception_of: "misconception_of",
  common_error: "misconception_of",
  error_of: "misconception_of",
};

function translateRelationType(type: string): RelationType | null {
  const normalized = type.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return RELATION_TRANSLATIONS[normalized] ?? null;
}

/** Maps known relation types and fails closed with a ledger exception for unknown types. */
export function mapLegacyRelation(input: LegacyRelationInput, options: MapRelationOptions = {}): MappedRelation {
  const legacyId = asLegacyId(input.id);
  const sourceIdeaId = options.sourceIdeaId ?? asLegacyId(input.sourceKoId);
  const targetIdeaId = options.targetIdeaId ?? asLegacyId(input.targetKoId);
  const relationType = translateRelationType(input.type);
  const sourceChecksum = stableChecksum(input);
  const exception = relationType
    ? undefined
    : createCompatibilityException({
        legacyTable: "knowledge_relationships",
        legacyId,
        reasonCode: "UNKNOWN_RELATION_TYPE",
        reason: `Legacy relation type "${input.type}" has no target translation.`,
        preservationPath: `legacy:knowledge_relationships:${legacyId}`,
        blocksCutover: true,
        source: input,
        sourceChecksum,
      });
  return {
    id: stableTargetId("knowledge_relationships", legacyId),
    legacyTable: "knowledge_relationships",
    legacyId,
    targetTable: "relasi_ide",
    sourceIdeaId,
    targetIdeaId,
    relationType,
    explanation: input.explanation ?? null,
    mappingStatus: relationType ? "exact" : "unmapped",
    sourceChecksum,
    ...(exception ? { exception } : {}),
  };
}

/**
 * Keeps the legacy concept score as a compatibility baseline. Only explicit,
 * exact, snapshot-safe evidence can create an Idea attribution.
 */
export function attributeLegacyConceptMastery(
  input: LegacyConceptMasteryInput,
  evidence: readonly LegacyMasteryEvidence[],
): MasteryAttribution {
  const legacyId = asLegacyId(input.id);
  const baseline = {
    sourceConceptMasteryId: legacyId,
    studentId: input.studentId,
    courseId: input.courseId,
    conceptId: input.conceptId ?? null,
    conceptName: input.conceptName,
    masteryScore: input.masteryScore,
    confidence: input.confidence,
    evidenceCount: input.evidenceCount,
    compatibilityOnly: true as const,
  };
  const eligible = evidence.filter((item) => {
    if (!item.ideaId || item.mappingStatus !== "exact") return false;
    if (item.courseId && item.courseId !== input.courseId) return false;
    if (item.conceptId && input.conceptId && item.conceptId !== input.conceptId) return false;
    if (item.snapshotHash && item.expectedSnapshotHash && item.snapshotHash !== item.expectedSnapshotHash) return false;
    return true;
  });
  const grouped = new Map<string, number>();
  for (const item of eligible) {
    grouped.set(item.ideaId!, (grouped.get(item.ideaId!) ?? 0) + Math.max(1, item.evidenceCount ?? 1));
  }
  const attributedIdeas = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([ideaId, evidenceCount]) => ({
    ideaId,
    sourceConceptMasteryId: legacyId,
    masteryScore: input.masteryScore,
    confidence: input.confidence,
    evidenceCount,
    derivedFromEvidence: true as const,
  }));
  const excludedEvidenceCount = evidence.length - eligible.length;
  const exception = attributedIdeas.length === 0
    ? createCompatibilityException({
        legacyTable: "student_concept_mastery",
        legacyId,
        reasonCode: "UNATTRIBUTABLE_MASTERY",
        reason: "The legacy concept baseline has no exact, snapshot-safe Idea evidence.",
        preservationPath: `legacy:student_concept_mastery:${legacyId}`,
        blocksCutover: false,
        source: input,
      })
    : undefined;
  return { baseline, attributedIdeas, excludedEvidenceCount, ...(exception ? { exception } : {}) };
}
