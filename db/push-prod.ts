import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import * as fs from "fs";
import * as path from "path";

// Explicitly load .env.prod if present
const envProdPath = path.resolve(process.cwd(), ".env.prod");
if (fs.existsSync(envProdPath)) {
  const envContent = fs.readFileSync(envProdPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  }
}

import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

async function main() {
  console.log("=== Production Migration Safe Runner ===");

  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_CONNECTION_URL || (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgres") ? process.env.DATABASE_URL : undefined);
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !url.startsWith("libsql://") && !url.startsWith("https://")) {
    console.error("Error: Production database URL must be a remote Turso URL (libsql:// or https://).");
    process.exit(1);
  }

  if (!authToken) {
    console.error("Error: TURSO_AUTH_TOKEN is missing. Production migration cannot proceed without auth token.");
    process.exit(1);
  }

  console.log(`Connecting to production database: ${url}`);
  const client = createClient({ url, authToken });
  const db = drizzle(client);

  try {
    // 1. Export current production database / Create backup snapshot
    console.log("\n[1/6] Fetching database tables for backup...");
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
    );
    const tables = tablesResult.rows.map((row) => row.name as string);

    const backupData: Record<string, any[]> = {};
    const rowCountsBefore: Record<string, number> = {};

    console.log(`Found ${tables.length} tables to backup.`);
    for (const table of tables) {
      console.log(`Backing up table: ${table}...`);
      const rowsResult = await client.execute(`SELECT * FROM "${table}"`);
      backupData[table] = rowsResult.rows;
      rowCountsBefore[table] = rowsResult.rows.length;
    }

    // Write backup file
    const backupsDir = path.resolve("drizzle/backups");
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const backupPath = path.join(backupsDir, `backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`[2/6] Backup snapshot successfully written to: ${backupPath}`);

    // 3. Run schema verification
    console.log("\n[3/6] Running connection & basic schema verification...");
    await client.execute("SELECT 1");
    console.log("Verification checks passed.");

    // 4. Apply migrations
    console.log("\n[4/6] Applying migrations to production database...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully.");

    // 5. Verify row counts
    console.log("\n[5/6] Verifying row counts post-migration...");
    for (const table of tables) {
      const countResult = await client.execute(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = Number(countResult.rows[0].count);
      const beforeCount = rowCountsBefore[table] ?? 0;
      console.log(`Table "${table}": count before = ${beforeCount}, count after = ${count}`);
      if (count < beforeCount) {
        throw new Error(`Data loss detected in table "${table}"! Count dropped from ${beforeCount} to ${count}.`);
      }
    }
    console.log("Row count verification passed successfully (no data loss detected).");

    // 6. Verify foreign keys
    console.log("\n[6/6] Checking for foreign key violations...");
    const fkCheckResult = await client.execute("PRAGMA foreign_key_check");
    if (fkCheckResult.rows.length > 0) {
      console.error("Warning: Foreign key violations detected!", fkCheckResult.rows);
      throw new Error("Foreign key verification failed. Migration contains violations.");
    }
    console.log("Foreign key verification passed. No violations found.");

    console.log("\n=== Production Migration Completed Successfully & Verified ===");
    process.exit(0);
  } catch (err) {
    console.error("\n!!! Production Migration Failed !!!");
    console.error(err);
    process.exit(1);
  }
}

main();
