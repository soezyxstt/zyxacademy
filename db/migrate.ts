import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { InStatement } from "@libsql/client";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { db } from "./index";

const MIGRATIONS_FOLDER = "./drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Drizzle Kit can emit a full index rebuild when a snapshot differs from the
 * local SQLite schema. A missing index is safe to drop, so make only those
 * generated statements idempotent at execution time. The generated SQL files
 * remain the source of truth and are not edited by this runner.
 */
function normalizeMigrationStatement(statement: string): string {
  return statement.replace(
    /^(\s*DROP\s+INDEX\s+)(?!IF\s+EXISTS\b)/i,
    "$1IF EXISTS ",
  );
}

function parseDroppedIndex(statement: string): string | null {
  const match = statement.match(
    /^\s*DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?[`"]([^`"]+)[`"]\s*;?\s*$/i,
  );
  return match?.[1] ?? null;
}

type AddedColumn = {
  statement: string;
  table: string;
  column: string;
};

function parseAddedColumn(statement: string): AddedColumn | null {
  const match = statement.match(
    /^\s*ALTER\s+TABLE\s+[`"]([^`"]+)[`"]\s+ADD\s+[`"]([^`"]+)[`"]\s/i,
  );

  if (!match) {
    return null;
  }

  return {
    statement,
    table: match[1],
    column: match[2],
  };
}

function parseCreatedIndex(statement: string) {
  const match = statement.match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+[`"]([^`"]+)[`"]\s+ON\s+[`"]([^`"]+)[`"]\s*\(([^)]*)\)/i,
  );

  if (!match) {
    return null;
  }

  return {
    table: match[2],
    columns: match[3]
      .split(",")
      .map((column) => column.trim().replace(/^[`"\[]|[`"\]]$/g, "")),
  };
}

function migrationCreatesTutorSlotExactUniqueIndex(statements: readonly string[]): boolean {
  return statements.some((statement) =>
    /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\`\"]tutor_slots_exact_unique_idx[\`\"]\s+ON\s+[\`\"]tutor_slots[\`\"]/i.test(statement),
  );
}

async function assertMigrationPreconditions(
  client: typeof db.$client,
  statements: readonly string[],
): Promise<void> {
  if (!migrationCreatesTutorSlotExactUniqueIndex(statements)) return;

  const duplicateRows = await client.execute(`
    SELECT tutor_id, session_date, start_time, end_time, COUNT(*) AS duplicate_count
    FROM tutor_slots
    WHERE session_date IS NOT NULL
    GROUP BY tutor_id, session_date, start_time, end_time
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  const duplicate = duplicateRows.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!duplicate) return;

  throw new Error(
    `MIGRATION_PRECONDITION_FAILED: duplicate dated tutor slot exists for ${String(duplicate.tutor_id)} ${String(duplicate.session_date)} ${String(duplicate.start_time)}-${String(duplicate.end_time)} (${String(duplicate.duplicate_count)} rows)`,
  );
}

/**
 * Some SQLite schema diffs emit ADD COLUMN statements after index rebuilds
 * that reference those new columns. Defer only the affected index rebuilds
 * until the corresponding columns exist. Unrelated statements retain their
 * generated order.
 */
function orderMigrationStatements(statements: string[]): string[] {
  const addedColumns = statements
    .map(parseAddedColumn)
    .filter((column): column is AddedColumn => column !== null);
  const pendingByTable = new Map<string, AddedColumn[]>();

  for (const addedColumn of addedColumns) {
    const pending = pendingByTable.get(addedColumn.table) ?? [];
    pending.push(addedColumn);
    pendingByTable.set(addedColumn.table, pending);
  }

  const ordered: string[] = [];

  for (const statement of statements) {
    const addedColumn = parseAddedColumn(statement);
    if (addedColumn) {
      continue;
    }

    const createdIndex = parseCreatedIndex(statement);
    if (createdIndex) {
      const pending = pendingByTable.get(createdIndex.table);
      const requiresAddedColumn = pending?.some(({ column }) =>
        createdIndex.columns.includes(column),
      );

      if (requiresAddedColumn && pending) {
        ordered.push(...pending.map(({ statement: addStatement }) => addStatement));
        pending.length = 0;
      }
    }

    ordered.push(statement);
  }

  for (const addedColumn of addedColumns) {
    const pending = pendingByTable.get(addedColumn.table);
    if (pending?.some(({ statement }) => statement === addedColumn.statement)) {
      ordered.push(addedColumn.statement);
      pending.splice(
        pending.findIndex(({ statement }) => statement === addedColumn.statement),
        1,
      );
    }
  }

  return ordered;
}

async function filterExistingColumns(
  client: typeof db.$client,
  statements: string[],
): Promise<string[]> {
  const tableColumns = new Map<string, Set<string>>();
  const filtered: string[] = [];

  for (const statement of statements) {
    const addedColumn = parseAddedColumn(statement);
    if (!addedColumn) {
      filtered.push(statement);
      continue;
    }

    let columns = tableColumns.get(addedColumn.table);
    if (!columns) {
      const tableInfo = await client.execute(
        `PRAGMA table_info("${addedColumn.table.replaceAll('"', '""')}")`,
      );
      const rows = tableInfo.rows as unknown as Array<{
        [key: number]: unknown;
        name?: unknown;
      }>;
      columns = new Set(
        rows
          .map((row) => row[1] ?? row.name)
          .filter((name): name is string => typeof name === "string"),
      );
      tableColumns.set(addedColumn.table, columns);
    }

    if (!columns.has(addedColumn.column)) {
      filtered.push(statement);
    }
  }

  return filtered;
}

async function filterMissingIndexDrops(
  client: typeof db.$client,
  statements: string[],
): Promise<string[]> {
  const indexRows = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL`,
  );
  const existingIndexes = new Set(
    (indexRows.rows as unknown as Array<{ name?: unknown }>).flatMap((row) =>
      typeof row.name === "string" ? [row.name] : [],
    ),
  );

  return statements.filter((statement) => {
    const indexName = parseDroppedIndex(statement);
    return indexName === null || existingIndexes.has(indexName);
  });
}

async function migrateLocalDatabase() {
  const client = db.$client;
  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const appliedMigrations = await client.execute(
    `SELECT id, hash, created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`,
  );
  // Keep Drizzle's timestamp gate. This repository has historical migration
  // rows whose hashes no longer match the generated SQL, so hash-only replay
  // would incorrectly execute already-applied migrations again.
  const lastAppliedMigration = appliedMigrations.rows[0] as unknown as { created_at?: unknown } | undefined;
  const lastAppliedAt = lastAppliedMigration?.created_at;

  for (const migration of migrations) {
    if (
      lastAppliedAt === undefined ||
      Number(lastAppliedAt) < migration.folderMillis
    ) {
      await assertMigrationPreconditions(client, migration.sql);
      const statementsToApply = await filterExistingColumns(client, migration.sql);
      const statementsWithValidIndexDrops = await filterMissingIndexDrops(
        client,
        statementsToApply,
      );
      const migrationStatements: InStatement[] = [];

      for (const statement of orderMigrationStatements(statementsWithValidIndexDrops)) {
        migrationStatements.push(normalizeMigrationStatement(statement));
      }

      migrationStatements.push({
        sql: `INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`,
        args: [migration.hash, migration.folderMillis],
      });

      await client.migrate(migrationStatements);
    }
  }
}

async function main() {
  console.log("Running local migrations...");
  try {
    await db.$client.execute("PRAGMA foreign_keys = OFF");
    await migrateLocalDatabase();
    await db.$client.execute("PRAGMA foreign_keys = ON");
    console.log("Local migrations applied successfully!");
    process.exit(0);
  } catch (error) {
    await db.$client.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
    console.error("Failed to run local migrations:", error);
    process.exit(1);
  }
}

main();
