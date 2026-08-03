import { runBackfillCli } from "@/lib/migrasi/backfill-engine";

void runBackfillCli("product").catch((error) => {
  console.error(JSON.stringify({ status: "blocked", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
