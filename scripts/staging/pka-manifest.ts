import { createClient } from "@libsql/client";
import { join } from "node:path";
import { assertStagingEnvironment, parseEnvFile, resolveDatabaseConnection, safeGuardError } from "@/lib/staging/staging-guard";
import { currentSourceCommit, hmacText, parseCliArgs, requiredCliArg, requireManifestKey, sha256Text, stableStringify, stableValue, writeArtifact } from "@/lib/staging/migration-ledger";

const PARITY_TABLES = [
  "courses",
  "mata_kuliah",
  "bab",
  "user",
  "pengguna",
  "peran",
  "pengguna_peran",
  "enrollments",
  "pendaftaran_murid",
  "pka_registrations",
  "pka_announcements",
  "pka_schedules",
  "pka_simulation_stages",
  "pka_stage_progress",
  "sumber_materi",
  "potongan_sumber",
  "ide",
  "artikel",
  "diktat_materi",
  "soal",
  "pembahasan_soal",
  "set_flashcard",
  "flashcard",
  "student_quiz_attempts",
  "student_quiz_analytics",
  "student_quiz_answers",
  "submissions",
  "pemahaman_ide",
  "alur_konten",
  "student_concept_mastery",
  "student_flashcard_progress",
  "flashcard_reviews",
  "chat_sessions",
  "tutor_chat_messages",
  "chat_message_sources",
] as const;

type Row = Record<string, unknown>;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(result: { rows: unknown[] }): Row[] {
  return result.rows as Row[];
}

async function tableExists(client: ReturnType<typeof createClient>, tableName: string): Promise<boolean> {
  const result = await client.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", args: [tableName] });
  return result.rows.length > 0;
}

async function manifestTable(client: ReturnType<typeof createClient>, tableName: string, key: string) {
  if (!(await tableExists(client, tableName))) {
    return { tableName, exists: false, rowCount: 0, primaryKeySetHash: hmacText(key, "missing"), semanticHash: hmacText(key, "missing") };
  }
  const info = rows(await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`));
  const primaryKeyColumns = info.filter((row) => Number(row.pk ?? 0) > 0).sort((left, right) => Number(left.pk) - Number(right.pk)).map((row) => String(row.name));
  const orderBy = primaryKeyColumns.length > 0 ? ` ORDER BY ${primaryKeyColumns.map(quoteIdentifier).join(", ")}` : "";
  const data = rows(await client.execute(`SELECT * FROM ${quoteIdentifier(tableName)}${orderBy}`));
  const primaryKeys = primaryKeyColumns.length > 0
    ? data.map((row) => primaryKeyColumns.map((column) => stableValue(row[column])))
    : data.map((row) => stableValue(row));
  return {
    tableName,
    exists: true,
    rowCount: data.length,
    primaryKeyColumns,
    primaryKeySetHash: hmacText(key, stableStringify(primaryKeys)),
    semanticHash: hmacText(key, stableStringify(data.map(stableValue))),
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const phase = requiredCliArg(args, "phase");
  if (phase !== "before" && phase !== "after") throw new Error("INVALID_PKA_MANIFEST_PHASE");
  try {
    const key = requireManifestKey();
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    try {
      const tableManifests = [];
      for (const tableName of [...new Set(PARITY_TABLES)]) tableManifests.push(await manifestTable(client, tableName, key));
      const core = { planNumber: "015", runId, phase, tables: tableManifests, stagingResourceFingerprints: guard.resources };
      const artifact = {
        ...core,
        sourceCommit: currentSourceCommit(),
        manifestHash: hmacText(key, stableStringify(core)),
        tableCount: tableManifests.filter((table) => table.exists).length,
        operatorTimestamp: new Date().toISOString(),
      };
      await writeArtifact(runId, `plan-015-pka-manifest-${phase}.json`, artifact);
      console.log(JSON.stringify({ status: "ok", runId, phase, tableCount: artifact.tableCount, manifestHash: artifact.manifestHash, sourceCommit: sha256Text(artifact.sourceCommit).slice(0, 12) }));
    } finally {
      client.close();
    }
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
