import type { db as applicationDb } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  currentSourceCommit,
  sha256Text,
  stableStringify,
  type MigrationEvidence,
} from "@/lib/staging/migration-ledger";

type Row = Record<string, any>;
type Db = typeof applicationDb;
type Tx = any;

export const BACKFILL_MAPPING_VERSION = 1;
export const BACKFILL_BATCH_SIZE = 100;

const now = (): Date => new Date();

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value < 10_000_000_000 ? value * 1000 : value);
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requiredDate(value: unknown, field: string): Date {
  const parsed = asDate(value);
  if (!parsed) throw new Error(`Missing date field ${field}`);
  return parsed;
}

function sourceChecksum(row: Row): string {
  return sha256Text(stableStringify(row));
}

function stableId(prefix: string, sourceId: string): string {
  const normalized = sourceId.replace(/[^A-Za-z0-9._-]/g, "_");
  if (normalized.length <= 48) return `${prefix}-${normalized}`;
  return `${prefix}-${sha256Text(`${prefix}:${sourceId}`).slice(0, 24)}`;
}

function sourceId(row: Row): string {
  const id = row.id;
  if (id !== null && id !== undefined && String(id).length > 0) return String(id);
  const compositeKeys = Object.keys(row)
    .filter((key) => key.toLowerCase().endsWith("id") && row[key] !== null && row[key] !== undefined)
    .sort();
  if (compositeKeys.length > 0) return compositeKeys.map((key) => `${key}=${String(row[key])}`).join("|");
  throw new Error("Legacy row has no primary id");
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { value };
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asStringArray(value: unknown): string[] {
  return jsonArray(value).map((entry) => String(entry));
}

function difficulty(value: unknown): "easy" | "medium" | "hard" {
  return value === "easy" || value === "hard" ? value : "medium";
}

function cognitiveLevel(value: unknown): "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create" {
  const level = Number(value ?? 1);
  if (level <= 1) return "remember";
  if (level === 2) return "understand";
  if (level === 3) return "apply";
  if (level === 4) return "analyze";
  if (level === 5) return "evaluate";
  return "create";
}

function questionStatus(value: unknown): "draft" | "in_review" | "published" | "retired" {
  if (value === "published" || value === "retired") return value;
  if (value === "flagged") return "in_review";
  return value === "reviewed" ? "in_review" : "draft";
}

function templateStatus(value: unknown): "draft" | "published" | "ended" | "retired" {
  if (value === "published") return "published";
  return "draft";
}

function relationType(value: unknown): "prerequisite" | "related" | "extends" | "example_of" | "misconception_of" | null {
  return value === "prerequisite" || value === "related" || value === "extends" || value === "example_of" || value === "misconception_of"
    ? value
    : null;
}

function targetChecksum(value: unknown): string {
  return sha256Text(stableStringify(value));
}

type Report = {
  runId: string;
  mode: "dry-run" | "apply";
  changedRows: number;
  skippedRows: number;
  mappedRows: Record<string, number>;
  exceptionRows: Record<string, number>;
  blockingExceptions: number;
  orphanRows: number;
  sourceRows: Record<string, number>;
  targetRows: Record<string, number>;
  checkpoints: string[];
  immutableSnapshotHashes: Record<string, string>;
  pka: Record<string, number>;
  warnings: string[];
};

function emptyReport(runId: string, mode: "dry-run" | "apply"): Report {
  return {
    runId,
    mode,
    changedRows: 0,
    skippedRows: 0,
    mappedRows: {},
    exceptionRows: {},
    blockingExceptions: 0,
    orphanRows: 0,
    sourceRows: {},
    targetRows: {},
    checkpoints: [],
    immutableSnapshotHashes: {},
    pka: {},
    warnings: [],
  };
}

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

async function rowsFor(db: any, table: any): Promise<Row[]> {
  return (await db.select().from(table)) as Row[];
}

async function existingById(tx: Tx, table: any, id: string): Promise<Row | null> {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
  return row ?? null;
}

async function petaFor(tx: Tx, legacyTable: string, legacyId: string): Promise<Row | null> {
  const [row] = await tx.select().from(schema.petaIdLegacy).where(
    and(eq(schema.petaIdLegacy.legacyTable, legacyTable), eq(schema.petaIdLegacy.legacyId, legacyId)),
  ).limit(1);
  return row ?? null;
}

async function recordMapping(
  tx: Tx,
  runId: string,
  legacyTable: string,
  legacyId: string,
  targetTable: string,
  targetId: string,
  sourceHash: string,
  targetHash: string,
  report: Report,
): Promise<boolean> {
  const existing = await petaFor(tx, legacyTable, legacyId);
  if (existing) {
    if (existing.sourceChecksum !== sourceHash || existing.targetId !== targetId || existing.targetTable !== targetTable) {
      throw new Error(`SOURCE_CHECKSUM_DRIFT:${legacyTable}:${legacyId}`);
    }
    report.skippedRows += 1;
    return false;
  }
  const targetMapping = await tx.select().from(schema.petaIdLegacy).where(
    and(eq(schema.petaIdLegacy.targetTable, targetTable), eq(schema.petaIdLegacy.targetId, targetId)),
  ).limit(1);
  if (targetMapping.length > 0) throw new Error(`DUPLICATE_TARGET_ID:${targetTable}:${targetId}`);
  await tx.insert(schema.petaIdLegacy).values({
    id: stableId("map", `${legacyTable}:${legacyId}`),
    legacyTable,
    legacyId,
    targetTable,
    targetId,
    mappingVersion: BACKFILL_MAPPING_VERSION,
    sourceChecksum: sourceHash,
    targetChecksum: targetHash,
    runId,
  });
  report.changedRows += 1;
  increment(report.mappedRows, `${legacyTable}->${targetTable}`);
  return true;
}

async function recordException(
  tx: Tx,
  runId: string,
  row: Row,
  reasonCode: string,
  preservationPath: string,
  details: Record<string, unknown>,
  blocksCutover: boolean,
  report: Report,
): Promise<void> {
  const legacyTable = String(row.__legacyTable ?? row.legacyTable ?? "unknown");
  const legacyId = String(row.__legacyId ?? row.id ?? "unknown");
  const hash = sourceChecksum(row.__sourceRow ?? row);
  const id = stableId("exception", `${runId}:${legacyTable}:${legacyId}:${reasonCode}`);
  const existing = await tx.select().from(schema.legacyBackfillExceptions).where(eq(schema.legacyBackfillExceptions.id, id)).limit(1);
  if (existing.length > 0) {
    if (existing[0].sourceChecksum !== hash) throw new Error(`SOURCE_CHECKSUM_DRIFT:${legacyTable}:${legacyId}`);
    if (existing[0].blocksCutover) report.blockingExceptions += 1;
    report.skippedRows += 1;
    return;
  }
  await tx.insert(schema.legacyBackfillExceptions).values({
    id,
    runId,
    legacyTable,
    legacyId,
    reasonCode,
    preservationPath,
    details,
    blocksCutover,
    sourceChecksum: hash,
  });
  increment(report.exceptionRows, reasonCode);
  if (blocksCutover) report.blockingExceptions += 1;
  report.changedRows += 1;
}

type ExceptionSpec = {
  row: Row;
  reasonCode: string;
  preservationPath: string;
  details: Record<string, unknown>;
  blocksCutover: boolean;
};

function exceptionValue(runId: string, spec: ExceptionSpec) {
  const legacyTable = String(spec.row.__legacyTable ?? spec.row.legacyTable ?? "unknown");
  const legacyId = String(spec.row.__legacyId ?? spec.row.id ?? "unknown");
  const sourceRow = spec.row.__sourceRow ?? spec.row;
  const hash = sourceChecksum(sourceRow);
  return {
    id: stableId("exception", `${runId}:${legacyTable}:${legacyId}:${spec.reasonCode}`),
    runId,
    legacyTable,
    legacyId,
    reasonCode: spec.reasonCode,
    preservationPath: spec.preservationPath,
    details: spec.details,
    blocksCutover: spec.blocksCutover,
    sourceChecksum: hash,
  };
}

async function recordExceptionsBatch(tx: Tx, runId: string, specs: ExceptionSpec[], report: Report): Promise<void> {
  if (specs.length === 0) return;
  const values = specs.map((spec) => exceptionValue(runId, spec));
  const ids = values.map((value) => value.id);
  const existing = await tx.select({ id: schema.legacyBackfillExceptions.id, sourceChecksum: schema.legacyBackfillExceptions.sourceChecksum, blocksCutover: schema.legacyBackfillExceptions.blocksCutover })
    .from(schema.legacyBackfillExceptions)
    .where(inArray(schema.legacyBackfillExceptions.id, ids));
  const existingById = new Map<string, Row>(existing.map((row: Row) => [String(row.id), row]));
  const inserts = [];
  for (const value of values) {
    const prior = existingById.get(value.id);
    if (prior) {
      if (prior.sourceChecksum !== value.sourceChecksum) throw new Error(`SOURCE_CHECKSUM_DRIFT:${value.legacyTable}:${value.legacyId}`);
      if (prior.blocksCutover) report.blockingExceptions += 1;
      report.skippedRows += 1;
      continue;
    }
    inserts.push(value);
    increment(report.exceptionRows, value.reasonCode);
    if (value.blocksCutover) report.blockingExceptions += 1;
    report.changedRows += 1;
  }
  if (inserts.length > 0) await tx.insert(schema.legacyBackfillExceptions).values(inserts).onConflictDoNothing();
}

async function ensureTarget(
  tx: Tx,
  table: any,
  values: Row,
  targetId: string,
): Promise<void> {
  const existing = await existingById(tx, table, targetId);
  if (existing) return;
  await tx.insert(table).values(values);
}

async function firstUserId(db: Db): Promise<string | null> {
  const users = await db.select({ id: schema.user.id }).from(schema.user).orderBy(schema.user.id).limit(1);
  return users[0]?.id ?? null;
}

async function ideaMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ id: schema.ide.id }).from(schema.ide);
  const mappings = await db.select({ legacyId: schema.petaIdLegacy.legacyId, targetId: schema.petaIdLegacy.targetId })
    .from(schema.petaIdLegacy)
    .where(eq(schema.petaIdLegacy.legacyTable, "knowledge_objects"));
  const result = new Map<string, string>();
  for (const row of mappings) result.set(row.legacyId, row.targetId);
  for (const row of rows) if (!result.has(row.id)) result.set(row.id, row.id);
  return result;
}

async function processBatches<T>(
  values: T[],
  callback: (batch: T[]) => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += BACKFILL_BATCH_SIZE) {
    await callback(values.slice(offset, offset + BACKFILL_BATCH_SIZE));
  }
}

async function loadSourceRows(db: Db): Promise<Record<string, Row[]>> {
  const tables: Record<string, any> = {
    user: schema.user,
    courses: schema.courses,
    chapters: schema.chapters,
    enrollments: schema.enrollments,
    tutor_courses: schema.tutorCourses,
    master_teaching_documents: schema.masterTeachingDocuments,
    knowledge_objects: schema.knowledgeObjects,
    knowledge_object_sources: schema.knowledgeObjectSources,
    knowledge_relationships: schema.knowledgeRelationships,
    website_materials: schema.websiteMaterials,
    website_material_versions: schema.websiteMaterialVersions,
    flashcard_sets: schema.flashcardSets,
    flashcards: schema.flashcards,
    student_flashcard_progress: schema.studentFlashcardProgress,
    flashcard_reviews: schema.flashcardReviews,
    ai_question_bank: schema.aiQuestionBank,
    quiz_templates: schema.quizTemplates,
    student_quiz_attempts: schema.studentQuizAttempts,
    student_quiz_analytics: schema.studentQuizAnalytics,
    learning_events: schema.learningEvents,
    student_concept_mastery: schema.studentConceptMastery,
    pka_simulation_stages: schema.pkaSimulationStages,
    pka_stage_progress: schema.pkaStageProgress,
    pka_announcements: schema.pkaAnnouncements,
    pka_announcement_reads: schema.pkaAnnouncementReads,
    pka_schedules: schema.pkaSchedules,
    pka_registrations: schema.pkaRegistrations,
  };
  const result: Record<string, Row[]> = {};
  for (const [name, table] of Object.entries(tables)) result[name] = await rowsFor(db, table);
  return result;
}

function annotate(row: Row, legacyTable: string): Row {
  return { __legacyTable: legacyTable, __legacyId: sourceId(row), __sourceRow: row, ...row };
}

async function backfillIdentity(db: Db, source: Record<string, Row[]>, runId: string, report: Report, fallbackUserId: string | null): Promise<void> {
  await processBatches(source.user, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const hash = sourceChecksum(row);
      await ensureTarget(tx, schema.pengguna, { id, status: "active" }, id);
      await recordMapping(tx, runId, "user", id, "pengguna", id, hash, targetChecksum({ id, status: "active" }), report);
    }
  }));

  await processBatches(source.courses, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const hash = sourceChecksum(row);
      const target = {
        id,
        code: `legacy-${id}`,
        title: String(row.title),
        status: "active" as const,
        legacyCourseId: id,
      };
      await ensureTarget(tx, schema.mataKuliah, target, id);
      await recordMapping(tx, runId, "courses", id, "mata_kuliah", id, hash, targetChecksum(target), report);
    }
  }));

  const coursesById = new Map(source.courses.map((row) => [sourceId(row), row]));
  await processBatches(source.chapters, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const courseId = String(row.courseId);
      if (!coursesById.has(courseId)) {
        await recordException(tx, runId, annotate(row, "chapters"), "MISSING_FOREIGN_KEY", `legacy:chapters:${id}`, { field: "courseId", value: courseId }, true, report);
        continue;
      }
      const hash = sourceChecksum(row);
      const target = {
        id,
        mataKuliahId: courseId,
        code: `legacy-${id}`,
        title: String(row.title),
        orderIndex: Number(row.orderIndex),
        status: row.status === "draft" ? "draft" as const : "active" as const,
        legacyChapterId: id,
      };
      await ensureTarget(tx, schema.bab, target, id);
      await recordMapping(tx, runId, "chapters", id, "bab", id, hash, targetChecksum(target), report);
    }
  }));

  await processBatches(source.enrollments, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const userId = String(row.userId);
      const courseId = String(row.courseId);
      if (!fallbackUserId && !source.user.some((user) => sourceId(user) === userId)) {
        await recordException(tx, runId, annotate(row, "enrollments"), "MISSING_FOREIGN_KEY", `legacy:enrollments:${id}`, { userId, courseId }, true, report);
        continue;
      }
      const target = {
        id,
        penggunaId: userId,
        mataKuliahId: courseId,
        status: requiredDate(row.expiresAt, "expiresAt") < now() ? "expired" as const : "active" as const,
        startAt: asDate(row.enrolledAt),
        endAt: requiredDate(row.expiresAt, "expiresAt"),
        legacyEnrollmentId: id,
      };
      await ensureTarget(tx, schema.pendaftaranMurid, target, id);
      await recordMapping(tx, runId, "enrollments", id, "pendaftaran_murid", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  await processBatches(source.tutor_courses, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const target = {
        id,
        penggunaId: String(row.tutorId),
        mataKuliahId: String(row.courseId),
        status: "active" as const,
        assignmentScope: "course" as const,
        legacyTutorCourseId: id,
      };
      if (!fallbackUserId) {
        await recordException(tx, runId, annotate(row, "tutor_courses"), "MISSING_FOREIGN_KEY", `legacy:tutor_courses:${id}`, { tutorId: row.tutorId, courseId: row.courseId }, true, report);
        continue;
      }
      await ensureTarget(tx, schema.penugasanTutor, target, id);
      await recordMapping(tx, runId, "tutor_courses", id, "penugasan_tutor", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));
}

async function backfillSourceAndIdeas(db: Db, source: Record<string, Row[]>, runId: string, report: Report, fallbackUserId: string | null): Promise<void> {
  const courseIds = new Set(source.courses.map(sourceId));
  const chapterIds = new Set(source.chapters.map(sourceId));
  const mtdIds = new Set(source.master_teaching_documents.map(sourceId));

  await processBatches(source.master_teaching_documents, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const creatorId = String(row.createdById);
      if (!fallbackUserId && !source.user.some((user) => sourceId(user) === creatorId)) {
        await recordException(tx, runId, annotate(row, "master_teaching_documents"), "MISSING_CREATOR", `legacy:master_teaching_documents:${id}`, { creatorId }, true, report);
        continue;
      }
      const markdown = String(row.markdownContent ?? "");
      const target = {
        id,
        mataKuliahId: String(row.courseId),
        babId: null,
        sourceType: "markdown" as const,
        title: String(row.title),
        canonicalUriOrR2Key: `legacy:mtd:${id}`,
        version: Number(row.version ?? 1),
        checksum: String(row.sourceHash ?? sha256Text(markdown)),
        status: row.status === "active" ? "active" as const : row.status === "archived" ? "archived" as const : "draft" as const,
        creatorId: creatorId || fallbackUserId,
      };
      await ensureTarget(tx, schema.sumberMateri, target, id);
      await recordMapping(tx, runId, "master_teaching_documents", id, "sumber_materi", id, sourceChecksum(row), targetChecksum(target), report);
      if (markdown.length === 0) {
        await recordException(tx, runId, annotate(row, "master_teaching_documents"), "EMPTY_SOURCE_CONTENT", `legacy:master_teaching_documents:${id}`, { field: "markdownContent" }, false, report);
        continue;
      }
      const chunkId = stableId("chunk", id);
      const chunk = {
        id: chunkId,
        sumberMateriId: id,
        sourceVersion: Number(row.version ?? 1),
        content: markdown,
        startOffset: 0,
        endOffset: markdown.length,
        checksum: sha256Text(markdown),
        embeddingEligible: false,
      };
      await ensureTarget(tx, schema.potonganSumber, chunk, chunkId);
    }
  }));

  await processBatches(source.knowledge_objects, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const courseId = String(row.courseId);
      const chapterId = String(row.chapterId);
      const mtdId = String(row.mtdId);
      const creatorId = String(source.master_teaching_documents.find((mtd) => sourceId(mtd) === mtdId)?.createdById ?? fallbackUserId ?? "");
      if (!courseIds.has(courseId) || !chapterIds.has(chapterId) || !mtdIds.has(mtdId) || !creatorId) {
        await recordException(tx, runId, annotate(row, "knowledge_objects"), "MISSING_FOREIGN_KEY", `legacy:knowledge_objects:${id}`, { courseId, chapterId, mtdId, creatorId }, true, report);
        continue;
      }
      const content = String(row.content ?? "");
      const target = {
        id,
        mataKuliahId: courseId,
        babId: chapterId,
        conceptId: row.conceptId ? String(row.conceptId) : null,
        stableKey: String(row.stableKey ?? `legacy:knowledge_objects:${id}`),
        code: `legacy-${id}`,
        canonicalStatement: String(row.title),
        conciseExplanation: content,
        latex: null,
        knowledgeKind: row.knowledgeKind ?? "other",
        instructionalRole: row.instructionalRole ?? "core",
        difficultyMetadata: { difficulty: row.difficulty, importance: row.importance },
        version: Number(row.version ?? 1),
        status: row.status === "active" ? "published" as const : row.status === "needs_review" ? "needs_review" as const : "superseded" as const,
        sourcePolicy: "source_grounded" as const,
        schemaVersion: "1.0",
        semanticHash: String(row.semanticHash ?? sha256Text(`${row.title}\n${content}`)),
        generationHash: targetChecksum(row),
        creatorId,
      };
      await ensureTarget(tx, schema.ide, target, id);
      const mapped = await recordMapping(tx, runId, "knowledge_objects", id, "ide", id, sourceChecksum(row), targetChecksum(target), report);
      const chunkId = stableId("chunk", mtdId);
      if (await existingById(tx, schema.potonganSumber, chunkId)) {
        await tx.insert(schema.asalIde).values({
          id: stableId("asal", id),
          ideId: id,
          sourceChunkId: chunkId,
          provenanceRole: "core",
          startOffset: 0,
          endOffset: Math.max(1, content.length),
          sourceChecksum: String(row.semanticHash ?? target.semanticHash),
        }).onConflictDoNothing();
      } else {
        await recordException(tx, runId, annotate(row, "knowledge_objects"), "MISSING_PROVENANCE_SOURCE", `legacy:knowledge_objects:${id}`, { mtdId }, false, report);
      }
      if (!mapped) report.skippedRows += 0;
    }
  }));

  const ideaIds = await ideaMap(db);
  await processBatches(source.knowledge_object_sources, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const koId = String(row.koId);
      const targetIdeaId = ideaIds.get(koId);
      if (!targetIdeaId) {
        await recordException(tx, runId, annotate(row, "knowledge_object_sources"), "MISSING_IDEA_MAPPING", `legacy:knowledge_object_sources:${id}`, { koId }, false, report);
        continue;
      }
      const sourceChunkId = stableId("chunk", String(row.sourceDocumentId));
      if (!await existingById(tx, schema.potonganSumber, sourceChunkId)) {
        await recordException(tx, runId, annotate(row, "knowledge_object_sources"), "MISSING_PROVENANCE_SOURCE", `legacy:knowledge_object_sources:${id}`, { sourceDocumentId: row.sourceDocumentId }, false, report);
        continue;
      }
      const target = {
        id: stableId("asal", id),
        ideId: targetIdeaId,
        sourceChunkId,
        provenanceRole: row.supportRole ?? "supporting",
        startOffset: Number(row.startOffset),
        endOffset: Math.max(Number(row.endOffset), Number(row.startOffset) + 1),
        sourceChecksum: String(row.sourceHash),
      };
      await ensureTarget(tx, schema.asalIde, target, target.id);
      await recordMapping(tx, runId, "knowledge_object_sources", id, "asal_ide", target.id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  await processBatches(source.knowledge_relationships, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const type = relationType(row.type);
      const sourceIdeaId = ideaIds.get(String(row.sourceKoId));
      const targetIdeaId = ideaIds.get(String(row.targetKoId));
      if (!type) {
        await recordException(tx, runId, annotate(row, "knowledge_relationships"), "UNKNOWN_RELATION_TYPE", `legacy:knowledge_relationships:${id}`, { type: row.type }, true, report);
        continue;
      }
      if (!sourceIdeaId || !targetIdeaId || sourceIdeaId === targetIdeaId) {
        await recordException(tx, runId, annotate(row, "knowledge_relationships"), "MISSING_IDEA_MAPPING", `legacy:knowledge_relationships:${id}`, { sourceKoId: row.sourceKoId, targetKoId: row.targetKoId }, true, report);
        continue;
      }
      const target = { id, sourceIdeaId, targetIdeaId, relationType: type, version: 1, status: "active" as const };
      await ensureTarget(tx, schema.relasiIde, target, id);
      await recordMapping(tx, runId, "knowledge_relationships", id, "relasi_ide", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  await processBatches(source.website_materials, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const creatorId = fallbackUserId;
      if (!creatorId) {
        await recordException(tx, runId, annotate(row, "website_materials"), "MISSING_CREATOR", `legacy:website_materials:${id}`, {}, true, report);
        continue;
      }
      const status = row.status === "published" ? "published" as const : row.status === "archived" ? "withdrawn" as const : "draft" as const;
      const target = {
        id,
        mataKuliahId: String(row.courseId),
        babId: String(row.chapterId),
        slug: String(row.slug),
        title: String(row.title),
        contentMarkdown: String(row.canonicalMarkdown),
        version: Number(row.contentVersion ?? 1),
        status,
        sourceHash: sha256Text(String(row.canonicalMarkdown)),
        generationHash: String(row.generationHash),
        creatorId,
        publishedAt: status === "published" ? asDate(row.updatedAt) : null,
      };
      await ensureTarget(tx, schema.artikel, target, id);
      await recordMapping(tx, runId, "website_materials", id, "artikel", id, sourceChecksum(row), targetChecksum(target), report);
      const block = {
        id: stableId("block", id),
        artikelId: id,
        blockKey: "legacy-markdown",
        blockType: "markdown",
        orderIndex: 0,
        content: String(row.canonicalMarkdown),
        version: Number(row.contentVersion ?? 1),
        generationHash: String(row.generationHash),
        status: status === "published" ? "published" as const : "draft" as const,
      };
      await ensureTarget(tx, schema.blokArtikel, block, block.id);
    }
  }));

  await processBatches(source.website_material_versions, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      await recordException(tx, runId, annotate(row, "website_material_versions"), "HISTORY_COMPATIBILITY_ONLY", `legacy:website_material_versions:${sourceId(row)}`, { materialId: row.materialId, versionNumber: row.versionNumber }, false, report);
    }
  }));
}

async function backfillProductsAndQuestions(db: Db, source: Record<string, Row[]>, runId: string, report: Report, fallbackUserId: string | null): Promise<void> {
  await processBatches(source.flashcard_sets, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      if (!fallbackUserId) {
        await recordException(tx, runId, annotate(row, "flashcard_sets"), "MISSING_CREATOR", `legacy:flashcard_sets:${id}`, {}, true, report);
        continue;
      }
      const target = {
        id,
        mataKuliahId: String(row.courseId),
        babId: String(row.chapterId),
        title: String(row.title),
        version: 1,
        status: row.status === "published" ? "published" as const : "draft" as const,
        generationHash: String(row.generationHash),
        creatorId: fallbackUserId,
      };
      await ensureTarget(tx, schema.setFlashcard, target, id);
      await recordMapping(tx, runId, "flashcard_sets", id, "set_flashcard", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  const ideas = await ideaMap(db);
  await processBatches(source.flashcards, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const setId = String(row.setId);
      const target = {
        id,
        setFlashcardId: setId,
        front: String(row.front),
        back: String(row.back),
        explanation: row.explanation ? String(row.explanation) : null,
        version: 1,
        status: row.status === "retired" ? "retired" as const : "published" as const,
        generationHash: targetChecksum(row),
      };
      await ensureTarget(tx, schema.flashcard, target, id);
      await recordMapping(tx, runId, "flashcards", id, "flashcard", id, sourceChecksum(row), targetChecksum(target), report);
      if (row.koId) {
        const ideaId = ideas.get(String(row.koId));
        if (ideaId) {
          await tx.insert(schema.flashcardIde).values({ id: stableId("flashcard-ide", id), flashcardId: id, ideId: ideaId, weight: 1 }).onConflictDoNothing();
        } else {
          await recordException(tx, runId, annotate(row, "flashcards"), "MISSING_IDEA_MAPPING", `legacy:flashcards:${id}`, { koId: row.koId }, false, report);
        }
      }
    }
  }));

  await processBatches(source.student_flashcard_progress, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const target = {
        id,
        penggunaId: String(row.studentId),
        flashcardId: String(row.flashcardId),
        dueAt: requiredDate(row.dueDate, "dueDate"),
        intervalDays: Number(row.intervalDays ?? 0),
        easeFactor: Number(row.easeFactor ?? 2.5),
        repetitions: Number(row.repetitions ?? 0),
        lapses: Number(row.lapses ?? 0),
        lastReviewedAt: asDate(row.lastReviewedAt),
        status: "active" as const,
      };
      await ensureTarget(tx, schema.kemajuanFlashcardMurid, target, id);
      await recordMapping(tx, runId, "student_flashcard_progress", id, "kemajuan_flashcard_murid", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  await processBatches(source.flashcard_reviews, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const reviewedAt = requiredDate(row.reviewedAt, "reviewedAt");
      const target = {
        id,
        kemajuanFlashcardMuridId: stableId("progress", `${row.studentId}:${row.flashcardId}`),
        grade: Number(row.grade),
        responseMs: Number(row.responseTimeMs),
        previousDueAt: reviewedAt,
        nextDueAt: reviewedAt,
        reviewedAt,
      };
      const progressRow = await tx.select({ id: schema.kemajuanFlashcardMurid.id }).from(schema.kemajuanFlashcardMurid).where(
        and(eq(schema.kemajuanFlashcardMurid.penggunaId, String(row.studentId)), eq(schema.kemajuanFlashcardMurid.flashcardId, String(row.flashcardId))),
      ).limit(1);
      if (progressRow.length === 0) {
        await recordException(tx, runId, annotate(row, "flashcard_reviews"), "MISSING_PROGRESS_PARENT", `legacy:flashcard_reviews:${id}`, { studentId: row.studentId, flashcardId: row.flashcardId }, false, report);
        continue;
      }
      target.kemajuanFlashcardMuridId = progressRow[0].id;
      await ensureTarget(tx, schema.reviewFlashcard, target, id);
      await recordMapping(tx, runId, "flashcard_reviews", id, "review_flashcard", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  await processBatches(source.ai_question_bank, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      if (!fallbackUserId) {
        await recordException(tx, runId, annotate(row, "ai_question_bank"), "MISSING_CREATOR", `legacy:ai_question_bank:${id}`, {}, true, report);
        continue;
      }
      const target = {
        id,
        mataKuliahId: String(row.courseId),
        babId: null,
        questionType: row.questionType === "multiple_choices" ? "multiple_choices" as const : row.questionType ?? "multiple_choice" as const,
        prompt: String(row.prompt),
        optionsSnapshot: jsonArray(row.options),
        version: 1,
        status: questionStatus(row.reviewStatus),
        difficulty: difficulty(row.difficulty),
        cognitiveLevel: cognitiveLevel(row.applicationLevel),
        reasoningPattern: String(row.reasoningType ?? row.pattern ?? "legacy"),
        generationHash: String(row.generationHash ?? targetChecksum(row)),
        creatorId: fallbackUserId,
      };
      await ensureTarget(tx, schema.soal, target, id);
      await recordMapping(tx, runId, "ai_question_bank", id, "soal", id, sourceChecksum(row), targetChecksum(target), report);
      if (row.knowledgeObjectId) {
        const ideaId = ideas.get(String(row.knowledgeObjectId));
        if (ideaId) {
          await tx.insert(schema.soalIde).values({ id: stableId("soal-ide", id), soalId: id, ideId: ideaId, weight: 1, role: "primary" }).onConflictDoNothing();
        } else {
          await recordException(tx, runId, annotate(row, "ai_question_bank"), "MISSING_IDEA_MAPPING", `legacy:ai_question_bank:${id}`, { knowledgeObjectId: row.knowledgeObjectId }, false, report);
        }
      } else {
        await recordException(tx, runId, annotate(row, "ai_question_bank"), "QUESTION_WITHOUT_EXACT_IDEA", `legacy:ai_question_bank:${id}`, { mappingMethod: "none", masteryEvidence: false }, false, report);
      }
    }
  }));

  await processBatches(source.quiz_templates, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      if (!fallbackUserId) {
        await recordException(tx, runId, annotate(row, "quiz_templates"), "MISSING_CREATOR", `legacy:quiz_templates:${id}`, {}, true, report);
        continue;
      }
      const blueprintId = stableId("blueprint", id);
      const type = row.category === "simulation" ? "tryout" as const : "quiz" as const;
      const blueprint = {
        id: blueprintId,
        mataKuliahId: String(row.courseId),
        title: String(row.title),
        assessmentType: type,
        blueprint: jsonObject(row.selectionRules),
        version: 1,
        status: row.status === "published" ? "approved" as const : "draft" as const,
        generationHash: targetChecksum(row.selectionRules),
        creatorId: fallbackUserId,
      };
      await ensureTarget(tx, schema.blueprintAsesmen, blueprint, blueprintId);
      const assessment = {
        id,
        blueprintAsesmenId: blueprintId,
        mataKuliahId: String(row.courseId),
        title: String(row.title),
        assessmentType: type,
        version: 1,
        status: templateStatus(row.status),
        generationHash: targetChecksum(row),
        creatorId: fallbackUserId,
        publishedAt: row.status === "published" ? asDate(row.updatedAt) : null,
      };
      await ensureTarget(tx, schema.asesmen, assessment, id);
      await recordMapping(tx, runId, "quiz_templates", id, "asesmen", id, sourceChecksum(row), targetChecksum(assessment), report);
      const selection = jsonObject(row.selectionRules);
      const chapterRefs = asStringArray(selection.chapterIds ?? selection.chapters ?? selection.chapter_ids);
      for (const [orderIndex, chapterId] of chapterRefs.entries()) {
        const targetChapter = await tx.select({ id: schema.bab.id }).from(schema.bab).where(eq(schema.bab.id, chapterId)).limit(1);
        if (targetChapter.length === 0) {
          await recordException(tx, runId, annotate(row, "quiz_templates"), "MISSING_FOREIGN_KEY", `legacy:quiz_templates:${id}`, { chapterId }, false, report);
          continue;
        }
        await tx.insert(schema.cakupanAsesmen).values({ id: stableId("coverage", `${id}:${chapterId}`), asesmenId: id, babId: chapterId, orderIndex }).onConflictDoNothing();
      }
      const fixedQuestionIds = asStringArray(selection.fixedQuestionIds ?? selection.fixed_question_ids);
      for (const [orderIndex, questionId] of fixedQuestionIds.entries()) {
        const question = await tx.select().from(schema.soal).where(eq(schema.soal.id, questionId)).limit(1);
        if (question.length === 0) continue;
        await tx.insert(schema.itemAsesmen).values({
          id: stableId("item", `${id}:${questionId}`),
          asesmenId: id,
          soalId: questionId,
          orderIndex,
          renderedQuestionSnapshot: question[0] as Record<string, unknown>,
          optionOrderSnapshot: asStringArray(question[0].optionsSnapshot).map((_, index) => String(index)),
          gradingPolicySnapshot: { source: "legacy", questionId },
          contentVersion: 1,
          generationHash: String(question[0].generationHash),
        }).onConflictDoNothing();
      }
    }
  }));
}

async function backfillHistoryAndLearning(db: Db, source: Record<string, Row[]>, runId: string, report: Report): Promise<void> {
  const ideas = await ideaMap(db);
  await processBatches(source.student_quiz_attempts, async (batch) => db.transaction(async (tx) => {
    const attemptIds = batch.map((row) => sourceId(row));
    const mappedAttempts = await tx.select({ legacyId: schema.petaIdLegacy.legacyId }).from(schema.petaIdLegacy).where(
      and(eq(schema.petaIdLegacy.legacyTable, "student_quiz_attempts"), inArray(schema.petaIdLegacy.legacyId, attemptIds)),
    );
    const mappedAttemptIds = new Set(mappedAttempts.map((row: Row) => String(row.legacyId)));
    for (const row of batch) {
      const id = sourceId(row);
      if (mappedAttemptIds.has(id)) {
        report.skippedRows += 1;
        continue;
      }
      const templateId = String(row.templateId);
      const assessment = await tx.select({ id: schema.asesmen.id }).from(schema.asesmen).where(eq(schema.asesmen.id, templateId)).limit(1);
      if (assessment.length === 0) {
        await recordException(tx, runId, annotate(row, "student_quiz_attempts"), "MISSING_ASSESSMENT_PARENT", `legacy:student_quiz_attempts:${id}`, { templateId }, true, report);
        continue;
      }
      const target = {
        id,
        asesmenId: templateId,
        penggunaId: String(row.studentId),
        status: row.status === "completed" ? "submitted" as const : row.status === "abandoned" ? "cancelled" as const : "in_progress" as const,
        renderedQuestionSnapshot: row.questionsSnapshot as Record<string, unknown>,
        optionOrderSnapshot: {},
        gradingPolicySnapshot: { source: "legacy", gradePreserved: true },
        contentVersion: 1,
        startedAt: requiredDate(row.startedAt, "startedAt"),
        submittedAt: asDate(row.submittedAt),
      };
      await ensureTarget(tx, schema.percobaanAsesmen, target, id);
      await recordMapping(tx, runId, "student_quiz_attempts", id, "percobaan_asesmen", id, sourceChecksum(row), targetChecksum(target), report);
      const snapshotHash = targetChecksum({ questionsSnapshot: row.questionsSnapshot, answersSnapshot: row.answersSnapshot, score: row.score, status: row.status });
      report.immutableSnapshotHashes[id] = snapshotHash;
      await tx.insert(schema.auditMutasi).values({
        id: stableId("attempt-score", id),
        actorId: null,
        entityType: "student_quiz_attempts",
        entityId: id,
        action: "legacy_snapshot_preserved",
        beforeSnapshot: null,
        afterSnapshot: { score: row.score ?? null, snapshotHash },
        correlationId: runId,
      }).onConflictDoNothing();

      const answerObject = jsonObject(row.answersSnapshot);
      const questions = jsonArray(row.questionsSnapshot);
      for (const question of questions) {
        const questionId = String((question as Row)?.id ?? "");
        if (!questionId) continue;
        const itemId = stableId("item", `${templateId}:${questionId}`);
        const item = await tx.select({ id: schema.itemAsesmen.id }).from(schema.itemAsesmen).where(eq(schema.itemAsesmen.id, itemId)).limit(1);
        if (item.length === 0) {
          await recordException(tx, runId, annotate(row, "student_quiz_attempts"), "MISSING_SNAPSHOT_ITEM", `legacy:student_quiz_attempts:${id}`, { questionId }, false, report);
          continue;
        }
        await tx.insert(schema.jawabanMurid).values({
          id: stableId("answer", `${id}:${questionId}`),
          percobaanAsesmenId: id,
          itemAsesmenId: itemId,
          renderedQuestionSnapshot: question as Record<string, unknown>,
          optionOrderSnapshot: asStringArray((question as Row)?.options).map((_, index) => String(index)),
          responseSnapshot: { value: answerObject[questionId] },
          gradingPolicySnapshot: { source: "legacy", gradePreserved: false },
          contentVersion: 1,
          score: null,
          status: "ungraded",
        }).onConflictDoNothing();
      }
    }
  }));

  await processBatches(source.student_quiz_analytics, async (batch) => db.transaction(async (tx) => {
    const auditRows = batch.map((sourceRow) => {
      const row = annotate(sourceRow, "student_quiz_analytics");
      const id = sourceId(sourceRow);
      return {
        id: stableId("analytics", id),
        actorId: null,
        entityType: "student_quiz_analytics",
        entityId: id,
        action: "legacy_snapshot_preserved",
        beforeSnapshot: null,
        afterSnapshot: { attemptId: sourceRow.attemptId, computedMetrics: sourceRow.computedMetrics, aiDiagnosis: sourceRow.aiDiagnosis, status: sourceRow.status },
        correlationId: runId,
        exception: {
          row,
          reasonCode: "ANALYTICS_COMPATIBILITY_ONLY",
          preservationPath: `legacy:student_quiz_analytics:${id}`,
          details: { attemptId: sourceRow.attemptId },
          blocksCutover: false,
        } satisfies ExceptionSpec,
      };
    });
    await tx.insert(schema.auditMutasi).values(auditRows.map(({ exception: _exception, ...auditRow }) => auditRow)).onConflictDoNothing();
    await recordExceptionsBatch(tx, runId, auditRows.map((row) => row.exception), report);
  }));

  await processBatches(source.learning_events, async (batch) => db.transaction(async (tx) => {
    const exceptions: ExceptionSpec[] = [];
    for (const sourceRow of batch) {
      const row = annotate(sourceRow, "learning_events");
      const id = sourceId(sourceRow);
      const ideaId = sourceRow.koId ? ideas.get(String(sourceRow.koId)) : undefined;
      if (!ideaId) {
        exceptions.push({ row, reasonCode: "UNATTRIBUTABLE_LEARNING_EVENT", preservationPath: `legacy:learning_events:${id}`, details: { koId: sourceRow.koId ?? null, masteryEvidence: false }, blocksCutover: false });
        continue;
      }
      const target = {
        id,
        penggunaId: String(sourceRow.studentId),
        ideId: ideaId,
        evidenceSource: String(sourceRow.eventType),
        sourceId: id,
        scoreContribution: Number(sourceRow.correctness ?? 0),
        confidence: 100,
        rubricVersion: "legacy-backfill-v1",
        derivationStatus: "deterministic" as const,
        ambiguous: false,
        affectsMastery: sourceRow.correctness !== null && sourceRow.correctness !== undefined,
        occurredAt: requiredDate(sourceRow.createdAt, "createdAt"),
      };
      await ensureTarget(tx, schema.buktiPembelajaran, target, id);
      await recordMapping(tx, runId, "learning_events", id, "bukti_pembelajaran", id, sourceChecksum(sourceRow), targetChecksum(target), report);
    }
    await recordExceptionsBatch(tx, runId, exceptions, report);
  }));

  await processBatches(source.student_concept_mastery, async (batch) => db.transaction(async (tx) => {
    for (const row of batch) {
      const id = sourceId(row);
      const matchingIdeas = await tx.select({ id: schema.ide.id }).from(schema.ide).where(eq(schema.ide.mataKuliahId, String(row.courseId)));
      const attributable = matchingIdeas.length === 1 && source.learning_events.some((event) => event.studentId === row.studentId && event.courseId === row.courseId && event.koId);
      if (!attributable) {
        await recordException(tx, runId, annotate(row, "student_concept_mastery"), "LEGACY_CONCEPT_BASELINE", `legacy:student_concept_mastery:${id}`, { conceptName: row.conceptName, masteryScore: row.masteryScore, copiedToEveryIdea: false }, false, report);
        continue;
      }
      const ideaId = matchingIdeas[0].id;
      const target = {
        id,
        penggunaId: String(row.studentId),
        ideId: ideaId,
        skor: Number(row.masteryScore),
        keyakinan: Number(row.confidence),
        evidenceCount: Number(row.evidenceCount ?? 0),
        version: 1,
      };
      await ensureTarget(tx, schema.pemahamanIde, target, id);
      await recordMapping(tx, runId, "student_concept_mastery", id, "pemahaman_ide", id, sourceChecksum(row), targetChecksum(target), report);
    }
  }));

  const pkaCompatibility = [
    "pka_simulation_stages",
    "pka_stage_progress",
    "pka_announcements",
    "pka_announcement_reads",
    "pka_schedules",
    "pka_registrations",
  ];
  for (const tableName of pkaCompatibility) {
    await processBatches(source[tableName] ?? [], async (batch) => db.transaction(async (tx) => {
      const auditRows = batch.map((sourceRow) => {
        const id = sourceId(sourceRow);
        return {
          id: stableId("pka", `${tableName}:${id}`),
          actorId: null,
          entityType: tableName,
          entityId: id,
          action: "legacy_compatibility_preserved",
          beforeSnapshot: null,
          afterSnapshot: { sourceChecksum: sourceChecksum(sourceRow), sourceTable: tableName },
          correlationId: runId,
        };
      });
      await tx.insert(schema.auditMutasi).values(auditRows).onConflictDoNothing();
      await recordExceptionsBatch(tx, runId, batch.map((sourceRow) => {
        const row = annotate(sourceRow, tableName);
        const id = sourceId(sourceRow);
        increment(report.pka, tableName);
        return { row, reasonCode: "PKA_COMPATIBILITY_ONLY", preservationPath: `legacy:${tableName}:${id}`, details: { sourceTable: tableName, parity: true }, blocksCutover: false } satisfies ExceptionSpec;
      }), report);
    }));
  }
}

async function getCounts(db: Db): Promise<Record<string, number>> {
  const pairs: Array<[string, any]> = [
    ["mata_kuliah", schema.mataKuliah], ["bab", schema.bab], ["ide", schema.ide], ["artikel", schema.artikel],
    ["set_flashcard", schema.setFlashcard], ["flashcard", schema.flashcard], ["soal", schema.soal], ["asesmen", schema.asesmen],
    ["percobaan_asesmen", schema.percobaanAsesmen], ["bukti_pembelajaran", schema.buktiPembelajaran], ["pemahaman_ide", schema.pemahamanIde],
    ["peta_id_legacy", schema.petaIdLegacy], ["legacy_backfill_exceptions", schema.legacyBackfillExceptions],
  ];
  const result: Record<string, number> = {};
  for (const [name, table] of pairs) {
    const rows = await db.select().from(table);
    result[name] = rows.length;
  }
  return result;
}

function simulateDryRun(source: Record<string, Row[]>, report: Report): void {
  const mappedPairs: Array<[string, string]> = [
    ["user", "pengguna"], ["courses", "mata_kuliah"], ["chapters", "bab"],
    ["enrollments", "pendaftaran_murid"], ["tutor_courses", "penugasan_tutor"],
    ["master_teaching_documents", "sumber_materi"], ["knowledge_objects", "ide"],
    ["knowledge_object_sources", "asal_ide"], ["knowledge_relationships", "relasi_ide"],
    ["website_materials", "artikel"], ["flashcard_sets", "set_flashcard"],
    ["flashcards", "flashcard"], ["student_flashcard_progress", "kemajuan_flashcard_murid"],
    ["flashcard_reviews", "review_flashcard"], ["ai_question_bank", "soal"],
    ["quiz_templates", "asesmen"], ["student_quiz_attempts", "percobaan_asesmen"],
  ];
  for (const [sourceTable, targetTable] of mappedPairs) {
    const count = source[sourceTable]?.length ?? 0;
    if (count > 0) {
      report.mappedRows[`${sourceTable}->${targetTable}`] = count;
      report.changedRows += count;
    }
  }
  for (const row of source.ai_question_bank ?? []) {
    if (!row.knowledgeObjectId) {
      increment(report.exceptionRows, "QUESTION_WITHOUT_EXACT_IDEA");
      report.changedRows += 1;
    }
  }
  const ideaIds = new Set((source.knowledge_objects ?? []).map((row) => String(row.id)));
  for (const row of source.learning_events ?? []) {
    if (row.koId && ideaIds.has(String(row.koId))) {
      increment(report.mappedRows, "learning_events->bukti_pembelajaran");
      report.changedRows += 1;
    } else {
      increment(report.exceptionRows, "UNATTRIBUTABLE_LEARNING_EVENT");
      report.changedRows += 1;
    }
  }
  for (const _row of source.student_concept_mastery ?? []) {
    increment(report.exceptionRows, "LEGACY_CONCEPT_BASELINE");
    report.changedRows += 1;
  }
  for (const _row of source.student_quiz_analytics ?? []) {
    increment(report.exceptionRows, "ANALYTICS_COMPATIBILITY_ONLY");
    report.changedRows += 1;
  }
  for (const tableName of [
    "pka_simulation_stages", "pka_stage_progress",
    "pka_announcements", "pka_announcement_reads", "pka_schedules", "pka_registrations",
    "website_material_versions",
  ]) {
    const count = source[tableName]?.length ?? 0;
    if (count > 0) {
      increment(report.exceptionRows, tableName === "website_material_versions" ? "HISTORY_COMPATIBILITY_ONLY" : "PKA_COMPATIBILITY_ONLY", count);
      report.changedRows += count;
    }
  }
  report.warnings.push("Dry run performed no database writes.");
}

export async function runBackfill(options: {
  runId: string;
  mode: "dry-run" | "apply";
  phase?: "all" | "idea" | "product" | "assessment";
  expectNoop?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<Report> {
  throw new Error("Legacy staging backfill is unsupported on the PostgreSQL migration branch");
}

export function reportToEvidence(report: Report, sourceCommit = currentSourceCommit()): MigrationEvidence {
  return {
    planNumber: "005",
    status: report.blockingExceptions === 0 ? "passed" : "blocked",
    sourceCommit,
    migrationRunId: report.runId,
    resourceFingerprints: [],
    commands: [],
    rowCounts: { ...report.sourceRows, ...report.targetRows },
    reconciliationHashes: {
      sourceRows: sha256Text(stableStringify(report.sourceRows)),
      targetRows: sha256Text(stableStringify(report.targetRows)),
      mappings: sha256Text(stableStringify(report.mappedRows)),
      exceptions: sha256Text(stableStringify(report.exceptionRows)),
    },
    runtimePolicy: { canonicalRepository: "always-on", legacyTablesPreserved: true },
    rollback: { attempted: false, passed: true, detail: "Legacy tables were not deleted or rewritten." },
    operatorTimestamp: new Date().toISOString(),
    knownLimitations: report.warnings,
  };
}

export async function runBackfillCli(defaultPhase: "all" | "idea" | "product" | "assessment" = "all"): Promise<void> {
  await runBackfill({ runId: "", mode: "dry-run", phase: defaultPhase });
}
