import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Script to duplicate/clone a Turso Production database into a Staging database.
 * Auto-detects credentials from `.env.prod` and `.env.staging`.
 * 
 * Usage:
 *   bun run db:sync-prod-to-staging
 */

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

async function main() {
  const rootDir = process.cwd();
  const envProd = parseEnvFile(join(rootDir, ".env.prod"));
  const envStaging = parseEnvFile(join(rootDir, ".env.staging"));

  const prodUrl =
    process.env.PROD_TURSO_URL ||
    envProd.TURSO_DATABASE_URL ||
    envProd.TURSO_CONNECTION_URL ||
    process.env.TURSO_DATABASE_URL;

  const prodToken =
    process.env.PROD_TURSO_TOKEN ||
    envProd.TURSO_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN;

  const stagingUrl =
    process.env.STAGING_TURSO_URL ||
    envStaging.TURSO_DATABASE_URL ||
    envStaging.TURSO_CONNECTION_URL;

  const stagingToken =
    process.env.STAGING_TURSO_TOKEN ||
    envStaging.TURSO_AUTH_TOKEN;

  if (!prodUrl || !prodToken) {
    console.error("Error: Production database URL/Token not found in environment or .env.prod.");
    process.exit(1);
  }

  if (!stagingUrl || !stagingToken) {
    console.error("Error: Staging database URL/Token not found in environment or .env.staging.");
    process.exit(1);
  }

  console.log("=============================================");
  console.log("  TURSO DATABASE SYNC (PROD -> STAGING)");
  console.log("=============================================");
  console.log(`Source (Prod):    ${prodUrl}`);
  console.log(`Target (Staging): ${stagingUrl}`);
  console.log("=============================================\n");

  const prodClient = createClient({ url: prodUrl, authToken: prodToken });
  const stagingClient = createClient({ url: stagingUrl, authToken: stagingToken });

  // 1. Fetch tables from production
  const tablesRes = await prodClient.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_shape_%';"
  );

  console.log(`Found ${tablesRes.rows.length} tables in Production database.`);

  // 2. Fetch existing staging tables and drop them cleanly
  const existingStagingTables = await stagingClient.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
  );

  console.log(`Clearing ${existingStagingTables.rows.length} existing tables in Staging...`);
  await stagingClient.execute("PRAGMA foreign_keys = OFF;");

  for (const row of existingStagingTables.rows) {
    const tableName = row.name as string;
    await stagingClient.execute(`DROP TABLE IF EXISTS "${tableName}";`);
  }

  // 3. Create all tables in Staging first so all referenced tables exist
  console.log("Creating table schemas in Staging...");
  for (const row of tablesRes.rows) {
    const createSql = row.sql as string;
    if (createSql) {
      await stagingClient.execute(createSql);
    }
  }

  // 4. Copy rows table by table
  console.log("\nTransferring data rows...");
  let totalRowsTransferred = 0;

  for (const row of tablesRes.rows) {
    const tableName = row.name as string;
    if (!tableName) continue;

    process.stdout.write(`Syncing [${tableName}]... `);

    const dataRes = await prodClient.execute(`SELECT * FROM "${tableName}";`);
    if (dataRes.rows.length === 0) {
      console.log("0 rows (skipped)");
      continue;
    }

    const columns = dataRes.columns;
    const colNames = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders});`;

    // Batch insert rows in chunks of 50, with FK checks turned off inside batch
    const chunkSize = 50;
    const rows = dataRes.rows;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const statements: Array<{ sql: string; args?: any[] }> = [
        { sql: "PRAGMA foreign_keys = OFF;" },
        ...chunk.map((r) => ({
          sql: insertSql,
          args: columns.map((col) => r[col] ?? null),
        })),
      ];

      await stagingClient.batch(statements, "write");
    }

    totalRowsTransferred += dataRes.rows.length;
    console.log(`${dataRes.rows.length} rows copied.`);
  }

  // 5. Fetch and create indexes
  const indexRes = await prodClient.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%';"
  );

  console.log(`\nSyncing ${indexRes.rows.length} indexes...`);
  for (const row of indexRes.rows) {
    const indexSql = row.sql as string;
    if (!indexSql) continue;
    try {
      await stagingClient.execute(indexSql);
    } catch {
      // Index might already exist from table creation
    }
  }

  // 6. Re-enable FK checks on Staging
  await stagingClient.execute("PRAGMA foreign_keys = ON;");

  console.log("\n=============================================");
  console.log(`SUCCESS! Copied ${tablesRes.rows.length} tables and ${totalRowsTransferred} rows from Production to Staging.`);
  console.log("=============================================");
}

main().catch((err) => {
  console.error("\nSync failed with error:", err);
  process.exit(1);
});
