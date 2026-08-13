import { createClient } from "@libsql/client";
import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  hmacText,
  parseCliArgs,
  requiredCliArg,
  requireManifestKey,
  sha256Text,
  stableStringify,
  stableValue,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

type Row = Record<string, unknown>;

type TableManifest = {
  name: string;
  sqlHash: string;
  rowCount: number;
  primaryKeyColumns: string[];
  primaryKeySetHash: string;
};

type InventoryManifest = {
  runId: string;
  phase: string;
  tables: TableManifest[];
  schemaHash: string;
  foreignKeyViolations: number;
  semanticCounts: Record<string, number>;
  manifestHash: string;
};

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(result: { rows: unknown[] }): Row[] {
  return result.rows as Row[];
}

function countValue(row: Row): number {
  const value = row.count ?? row["COUNT(*)"] ?? 0;
  return Number(value);
}

async function tablePrimaryKeys(client: ReturnType<typeof createClient>, tableName: string): Promise<string[]> {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return rows(result)
    .filter((row) => Number(row.pk ?? 0) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((row) => String(row.name));
}

async function tablePrimaryKeySetHash(
  client: ReturnType<typeof createClient>,
  tableName: string,
  primaryKeyColumns: string[],
  key: string,
): Promise<string> {
  const selectColumns = primaryKeyColumns.length > 0 ? primaryKeyColumns.map(quoteIdentifier).join(", ") : "*";
  const orderBy = primaryKeyColumns.length > 0
    ? ` ORDER BY ${primaryKeyColumns.map(quoteIdentifier).join(", ")}`
    : "";
  const result = await client.execute(
    `SELECT ${selectColumns} FROM ${quoteIdentifier(tableName)}${orderBy}`,
  );
  const values = rows(result).map((row) => {
    if (primaryKeyColumns.length === 0) return stableValue(row);
    return primaryKeyColumns.map((column) => stableValue(row[column]));
  });
  return hmacText(key, values.map((value) => stableStringify(value)).join("\n"));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const phase = requiredCliArg(args, "phase");

  try {
    const key = requireManifestKey();
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);

    try {
      const schemaResult = await client.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      );
      const schemaObjects = rows(schemaResult).map((row) => ({
        type: String(row.type),
        name: String(row.name),
        tableName: String(row.tbl_name ?? ""),
        sql: row.sql === null || row.sql === undefined ? null : String(row.sql),
      }));
      const tableObjects = schemaObjects.filter((object) => object.type === "table");
      const tables: TableManifest[] = [];

      for (const table of tableObjects) {
        const primaryKeyColumns = await tablePrimaryKeys(client, table.name);
        const countResult = await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`);
        tables.push({
          name: table.name,
          sqlHash: sha256Text(table.sql ?? ""),
          rowCount: countValue(rows(countResult)[0] ?? {}),
          primaryKeyColumns,
          primaryKeySetHash: await tablePrimaryKeySetHash(client, table.name, primaryKeyColumns, key),
        });
      }

      const foreignKeyResult = await client.execute("PRAGMA foreign_key_check");
      const semanticCounts: Record<string, number> = {};
      const semanticTables: Record<string, string[]> = {
        users: ["user", "users"],
        sessions: ["session", "sessions"],
        enrollments: ["enrollments"],
        tutorAssignments: ["tutor_courses", "tutor_assignments"],
        courses: ["courses"],
        chapters: ["chapters"],
        knowledgeObjects: ["knowledge_objects"],
        materials: ["website_materials", "materials"],
        flashcards: ["flashcards"],
        quizzes: ["quiz_templates", "quizzes"],
        attempts: ["student_quiz_attempts", "quiz_attempts"],
        answersOrSnapshots: ["student_quiz_answers", "quiz_answers", "submissions"],
        mastery: ["student_concept_mastery", "mastery"],
        pkaRegistration: ["pka_registrations", "tutorial_pka_registrations"],
        pkaStageProgress: ["pka_stage_progress", "tutorial_pka_progress"],
        announcements: ["announcements"],
        schedules: ["schedules", "tutor_slots"],
      };
      const existingTables = new Set(tableObjects.map((table) => table.name));
      for (const [label, candidates] of Object.entries(semanticTables)) {
        const matching = candidates.find((candidate) => existingTables.has(candidate));
        if (!matching) {
          semanticCounts[label] = 0;
          continue;
        }
        const countResult = await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(matching)}`);
        semanticCounts[label] = countValue(rows(countResult)[0] ?? {});
      }

      const manifestCore = {
        tables,
        schemaObjects: schemaObjects.map((object) => ({ ...object, sql: object.sql ? sha256Text(object.sql) : null })),
        foreignKeyViolations: foreignKeyResult.rows.length,
        semanticCounts,
      };
      const manifest: InventoryManifest = {
        runId,
        phase,
        ...manifestCore,
        schemaHash: sha256Text(stableStringify(manifestCore.schemaObjects)),
        manifestHash: hmacText(key, stableStringify(manifestCore)),
      };
      await writeArtifact(runId, `inventory-${phase}.json`, manifest);
      console.log(JSON.stringify({
        status: foreignKeyResult.rows.length === 0 ? "ok" : "blocked",
        runId,
        phase,
        tableCount: tables.length,
        foreignKeyViolations: foreignKeyResult.rows.length,
        manifestHash: manifest.manifestHash,
      }));
      if (foreignKeyResult.rows.length > 0) process.exitCode = 1;
    } finally {
      client.close();
    }
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
