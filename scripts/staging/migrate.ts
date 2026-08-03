import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as schema from "@/db/schema";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  appendMigrationCheckpoint,
  currentSourceCommit,
  finishMigrationRun,
  parseCliArgs,
  requiredCliArg,
  sha256Text,
  stableStringify,
  startMigrationRun,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

async function ledgerTableExists(client: ReturnType<typeof createClient>): Promise<boolean> {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_runs'",
  );
  return result.rows.length > 0;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /foreign.?key/i.test(error.message)) return "FOREIGN_KEY_CHECK_FAILED";
  if (error instanceof Error && /migration/i.test(error.message)) return "MIGRATION_FAILED";
  return "STAGING_MIGRATION_FAILED";
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const planNumber = requiredCliArg(args, "plan");

  try {
    const staging = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    const database = drizzle(client, { schema });
    const schemaJournal = await readFile(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8");
    const schemaVersion = sha256Text(stableStringify(JSON.parse(schemaJournal)));
    const databaseFingerprint = staging.resources.find((item) => item.key === "database")?.hash ?? "unknown";
    let ledgerAvailable = false;
    let status = "passed";
    let errorCode: string | undefined;
    let foreignKeyViolations = 0;

    try {
      ledgerAvailable = await ledgerTableExists(client);
      if (ledgerAvailable) {
        await startMigrationRun(database, {
          id: runId,
          planNumber,
          sourceCommit: currentSourceCommit(),
          schemaVersion,
          databaseFingerprint,
          phase: "migrate",
        });
        await appendMigrationCheckpoint(database, {
          runId,
          phase: "migrate",
          checkpoint: "started",
          status: "running",
        });
      } else {
        await writeArtifact(runId, "ledger-bootstrap.json", {
          status: "running",
          runId,
          planNumber,
          sourceCommit: currentSourceCommit(),
          schemaVersion,
        });
      }

      await client.execute("PRAGMA foreign_keys = OFF");
      try {
        await migrate(database, { migrationsFolder: "./drizzle" });
      } catch (error) {
        status = "failed";
        errorCode = safeErrorCode(error);
      } finally {
        await client.execute("PRAGMA foreign_keys = ON");
      }

      const foreignKeys = await client.execute("PRAGMA foreign_key_check");
      foreignKeyViolations = foreignKeys.rows.length;
      if (foreignKeyViolations > 0) {
        status = "failed";
        errorCode = "FOREIGN_KEY_CHECK_FAILED";
      }

      if (!ledgerAvailable && await ledgerTableExists(client)) {
        ledgerAvailable = true;
        await startMigrationRun(database, {
          id: runId,
          planNumber,
          sourceCommit: currentSourceCommit(),
          schemaVersion,
          databaseFingerprint,
          phase: "migrate",
        });
      }
      if (ledgerAvailable) {
        await appendMigrationCheckpoint(database, {
          runId,
          phase: "migrate",
          checkpoint: "foreign_key_check",
          status,
          rowCount: foreignKeyViolations,
        });
        await finishMigrationRun(database, runId, { status, errorCode });
      }

      const report = {
        status,
        runId,
        planNumber,
        schemaVersion,
        foreignKeyViolations,
        ledgerAvailable,
        errorCode: errorCode ?? null,
      };
      await writeArtifact(runId, "migrate.json", report);
      console.log(JSON.stringify(report));
      if (status !== "passed") process.exitCode = 1;
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
