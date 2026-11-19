import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { EXPECTED_JOURNAL, PENDING } from "../staging/gamification-migration-core";

const prefix = [...EXPECTED_JOURNAL, ...PENDING];
const checkedInMigrations = readMigrationFiles({ migrationsFolder: "drizzle-postgres" });
// The first 24 files include two historical hash differences and two
// independently applied entries. The bridge retains the exact observed prefix.
const expected = [
  ...prefix,
  ...checkedInMigrations.slice(24).map(({ folderMillis, hash }) => [folderMillis, hash] as const),
];
const client = new Client({
  connectionString: process.env.CLOUD_RUN_PREFLIGHT_DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
const mode = process.argv[2];

try {
  if (mode !== "runtime" && mode !== "journal") throw new Error("STAGING_PREFLIGHT_MODE_REQUIRED");
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '10s'");
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role",
  );
  const role = mode === "runtime" ? "zyx_staging_app_20261115" : "zyx_staging_web_preflight";
  if (identity.rows[0]?.database !== "neondb" || identity.rows[0]?.role !== role) {
    throw new Error("STAGING_PREFLIGHT_IDENTITY_MISMATCH");
  }
  if (mode === "journal") {
    const migrations = await client.query<{ created_at: string; hash: string }>(
      "SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at, id",
    );
    if (migrations.rows.length !== expected.length || migrations.rows.some((row, index) =>
      Number(row.created_at) !== expected[index][0] || row.hash !== expected[index][1]
    )) {
      throw new Error("STAGING_MIGRATION_JOURNAL_MISMATCH");
    }
  }
  const ready = await client.query<{ id: string }>(
    "SELECT id FROM public.gamification_question_history_cutover ORDER BY id LIMIT 2",
  );
  if (ready.rowCount !== 1 || ready.rows[0]?.id !== "v1") {
    throw new Error("STAGING_COMPACT_HISTORY_NOT_READY");
  }
  console.log(mode === "journal"
    ? `Verified staging database, ${expected.length} migration records and the compact history ready marker.`
    : "Verified staging application database credentials and compact history ready marker.");
} catch (error) {
  const message = error instanceof Error && /^STAGING_[A-Z_]+$/.test(error.message)
    ? error.message
    : "STAGING_PREFLIGHT_DATABASE_CHECK_FAILED";
  console.error(message);
  process.exitCode = 1;
} finally {
  await client.end();
}
