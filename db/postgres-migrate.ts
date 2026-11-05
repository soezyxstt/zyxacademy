import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertTarget } from "../scripts/neon/import-core";

const url = process.env.DATABASE_URL || "";
assertTarget(url, process.env.NEON_EXPECTED_HOST || "", process.env.NEON_EXPECTED_DATABASE || "");
const targets: Record<string, string> = {
  "br-cool-water-az2xxbul": "ep-damp-wind-azpa13lu",
  "br-holy-snow-azveniaa": "ep-empty-wave-azlduma4",
  "br-gentle-scene-azq0gp91": "ep-sparkling-lab-azrp3ymj",
  "br-wandering-butterfly-azi11h8r": "ep-quiet-math-azyey0mb",
};
const endpoint = targets[process.env.NEON_BRANCH_ID || ""];
if (!endpoint || !new URL(url).hostname.startsWith(`${endpoint}-pooler.`) && !new URL(url).hostname.startsWith(`${endpoint}.`)) throw new Error("ISOLATED_MIGRATION_BRANCH_REQUIRED");

const client = new Client({ connectionString: url });
try {
  await client.connect();
  const identity = await client.query("SELECT current_database() AS database");
  if (identity.rows[0].database !== process.env.NEON_EXPECTED_DATABASE) throw new Error("DATABASE_IDENTITY_MISMATCH");
  await migrate(drizzle(client), { migrationsFolder: "drizzle-postgres" });
  console.log("Isolated Postgres migrations applied");
} catch {
  console.error("Postgres migration failed; inspect the isolated target before retrying");
  process.exitCode = 1;
} finally {
  await client.end();
}
