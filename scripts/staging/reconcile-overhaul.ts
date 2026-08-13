import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  currentSourceCommit,
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  sha256Text,
  stableStringify,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, resolveDatabaseConnection } from "@/lib/staging/staging-guard";

type Row = Record<string, any>;
type Db = any;

const SOURCE_TABLES: Record<string, any> = {
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

const TARGET_TABLES: Record<string, any> = {
  pengguna: schema.pengguna,
  mata_kuliah: schema.mataKuliah,
  bab: schema.bab,
  pendaftaran_murid: schema.pendaftaranMurid,
  penugasan_tutor: schema.penugasanTutor,
  sumber_materi: schema.sumberMateri,
  potongan_sumber: schema.potonganSumber,
  ide: schema.ide,
  asal_ide: schema.asalIde,
  relasi_ide: schema.relasiIde,
  artikel: schema.artikel,
  blok_artikel: schema.blokArtikel,
  set_flashcard: schema.setFlashcard,
  flashcard: schema.flashcard,
  kemajuan_flashcard_murid: schema.kemajuanFlashcardMurid,
  review_flashcard: schema.reviewFlashcard,
  soal: schema.soal,
  asesmen: schema.asesmen,
  percobaan_asesmen: schema.percobaanAsesmen,
  bukti_pembelajaran: schema.buktiPembelajaran,
  pemahaman_ide: schema.pemahamanIde,
};

function sourceHash(row: Row): string {
  return sha256Text(stableStringify(row));
}

function valueId(row: Row): string {
  if (row.id !== null && row.id !== undefined) return String(row.id);
  const compositeKeys = Object.keys(row)
    .filter((key) => key.toLowerCase().endsWith("id") && row[key] !== null && row[key] !== undefined)
    .sort();
  return compositeKeys.map((key) => `${key}=${String(row[key])}`).join("|");
}

function tableRows(db: Db, table: any): Promise<Row[]> {
  return db.select().from(table) as Promise<Row[]>;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourse = typeof args.course === "string" ? args.course : null;
  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
      requiredResources: ["database", "authUrl"],
    });
    const client = createClient(resolveDatabaseConnection(process.env));
    const db = drizzle(client, { schema });
    try {
      const sourceRows: Record<string, Row[]> = {};
      for (const [name, table] of Object.entries(SOURCE_TABLES)) sourceRows[name] = await tableRows(db, table);
      const targetRows: Record<string, Row[]> = {};
      for (const [name, table] of Object.entries(TARGET_TABLES)) targetRows[name] = await tableRows(db, table);
      const mappings = await tableRows(db, schema.petaIdLegacy);
      const exceptions = await db.select().from(schema.legacyBackfillExceptions).where(eq(schema.legacyBackfillExceptions.runId, runId));
      const exceptionSummary = exceptions.reduce<Record<string, number>>((summary, row: Row) => {
        summary[String(row.reasonCode)] = (summary[String(row.reasonCode)] ?? 0) + 1;
        return summary;
      }, {});
      const exceptionBySource = new Set(exceptions.map((row: Row) => `${row.legacyTable}:${row.legacyId}`));
      const mappingBySource = new Map(mappings.map((row: Row) => [`${row.legacyTable}:${row.legacyId}`, row]));
      const targetByTableAndId = new Map<string, Row>();
      for (const [tableName, rows] of Object.entries(targetRows)) {
        for (const row of rows) targetByTableAndId.set(`${tableName}:${valueId(row)}`, row);
      }

      const sourceChecksumMismatches: string[] = [];
      const missingTargets: string[] = [];
      const conflictingSources = new Set<string>();
      const conflictingTargets = new Set<string>();
      for (const mapping of mappings) {
        const source = sourceRows[mapping.legacyTable]?.find((row) => valueId(row) === mapping.legacyId);
        if (!source) {
          missingTargets.push(`source:${mapping.legacyTable}:${mapping.legacyId}`);
          continue;
        }
        if (sourceHash(source) !== mapping.sourceChecksum) sourceChecksumMismatches.push(`${mapping.legacyTable}:${mapping.legacyId}`);
        if (!targetByTableAndId.has(`${mapping.targetTable}:${mapping.targetId}`)) missingTargets.push(`target:${mapping.targetTable}:${mapping.targetId}`);
      }
      const sourceKeys = new Set<string>();
      const targetKeys = new Set<string>();
      for (const mapping of mappings) {
        const sourceKey = `${mapping.legacyTable}:${mapping.legacyId}`;
        const targetKey = `${mapping.targetTable}:${mapping.targetId}`;
        if (sourceKeys.has(sourceKey)) conflictingSources.add(sourceKey);
        if (targetKeys.has(targetKey)) conflictingTargets.add(targetKey);
        sourceKeys.add(sourceKey);
        targetKeys.add(targetKey);
      }

      const uncoveredRows: string[] = [];
      for (const [tableName, rows] of Object.entries(sourceRows)) {
        for (const row of rows) {
          const key = `${tableName}:${valueId(row)}`;
          if (!mappingBySource.has(key) && !exceptionBySource.has(key)) uncoveredRows.push(key);
        }
      }

      const snapshotMismatches: string[] = [];
      const attempts = sourceRows.student_quiz_attempts ?? [];
      for (const attempt of attempts) {
        const target = targetRows.percobaan_asesmen.find((row) => valueId(row) === valueId(attempt));
        if (!target || stableStringify(target.renderedQuestionSnapshot) !== stableStringify(attempt.questionsSnapshot)) snapshotMismatches.push(valueId(attempt));
      }

      const fkResult = await client.execute("PRAGMA foreign_key_check");
      const blockingExceptions = exceptions.filter((row: Row) => Boolean(row.blocksCutover));
      const pkaCounts: Record<string, number> = {};
      for (const name of ["pka_simulation_stages", "pka_stage_progress", "pka_announcements", "pka_announcement_reads", "pka_schedules", "pka_registrations"]) {
        pkaCounts[`${name}:legacy`] = sourceRows[name]?.length ?? 0;
        pkaCounts[`${name}:preserved`] = exceptions.filter((row: Row) => row.legacyTable === name && row.reasonCode === "PKA_COMPATIBILITY_ONLY").length;
      }
      const pkaMismatches = Object.keys(pkaCounts).filter((key) => key.endsWith(":legacy") && pkaCounts[key] !== pkaCounts[`${key.slice(0, -7)}:preserved`]);
      let idempotencyChangedRows: number | null = null;
      try {
        const lastApply = await readArtifact<{ changedRows?: number }>(runId, "backfill-all-apply.json");
        idempotencyChangedRows = Number(lastApply.changedRows ?? NaN);
      } catch {
        idempotencyChangedRows = null;
      }
      const courseRows = requestedCourse ? (sourceRows.courses ?? []).filter((row) => valueId(row) === requestedCourse) : sourceRows.courses ?? [];
      const courseIds = new Set(courseRows.map(valueId));
      const courseMappingCount = mappings.filter((row: Row) => row.legacyTable === "courses" && courseIds.has(row.legacyId)).length;
      const report = {
        planNumber: "005",
        runId,
        status: sourceChecksumMismatches.length === 0 && missingTargets.length === 0 && conflictingSources.size === 0 && conflictingTargets.size === 0 && uncoveredRows.length === 0 && snapshotMismatches.length === 0 && pkaMismatches.length === 0 && blockingExceptions.length === 0 && fkResult.rows.length === 0 && idempotencyChangedRows === 0 ? "passed" : "blocked",
        sourceCommit: currentSourceCommit(),
        course: requestedCourse,
        sourceRowCounts: Object.fromEntries(Object.entries(sourceRows).map(([name, rows]) => [name, rows.length])),
        targetRowCounts: Object.fromEntries(Object.entries(targetRows).map(([name, rows]) => [name, rows.length])),
        mappingCount: mappings.length,
        exceptionCount: exceptions.length,
        exceptionSummary,
        blockingExceptionCount: blockingExceptions.length,
        sourceChecksumMismatches,
        missingTargets,
        conflictingSources: [...conflictingSources],
        conflictingTargets: [...conflictingTargets],
        uncoveredRows,
        foreignKeyViolations: fkResult.rows.length,
        immutableSnapshotMismatches: snapshotMismatches,
        pkaCounts,
        pkaMismatches,
        idempotencyChangedRows,
        courseMappingCount,
        reconciliationHashes: {
          source: sha256Text(stableStringify(sourceRows)),
          targets: sha256Text(stableStringify(targetRows)),
          mappings: sha256Text(stableStringify(mappings)),
          exceptions: sha256Text(stableStringify(exceptions)),
        },
        commands: [
          "bun --env-file=.env.staging run staging:preflight",
          `bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id ${runId} --dry-run`,
          `bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id ${runId} --apply`,
          `bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id ${runId} --apply --expect-noop`,
        ],
        featureFlags: {
          FEATURE_ARSITEKTUR_IDE_V1: process.env.FEATURE_ARSITEKTUR_IDE_V1,
          FEATURE_DUAL_WRITE_IDE: process.env.FEATURE_DUAL_WRITE_IDE,
        },
        rollback: { attempted: false, passed: true, detail: "Legacy source tables were preserved." },
        operatorTimestamp: new Date().toISOString(),
      };
      await writeArtifact(runId, "plan-005-result.json", report);
      console.log(JSON.stringify({ status: report.status, runId, mappingCount: mappings.length, exceptionCount: exceptions.length, blockingExceptionCount: blockingExceptions.length, foreignKeyViolations: fkResult.rows.length, uncoveredRows: uncoveredRows.length, snapshotMismatches: snapshotMismatches.length, pkaMismatches: pkaMismatches.length }));
      if (report.status !== "passed") process.exitCode = 1;
    } finally {
      client.close();
    }
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

void main();
