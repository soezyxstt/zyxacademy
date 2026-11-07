import { expect, test } from "bun:test";
import { runBackfill, runBackfillCli } from "@/lib/migrasi/backfill-engine";

test("legacy staging backfill refuses all modes before accessing a database", async () => {
  const error = "Legacy staging backfill is unsupported on the PostgreSQL migration branch";
  // Exercise the empty environment boundary without inheriting process settings.
  await expect(runBackfill({ runId: "test", mode: "dry-run", env: {} as NodeJS.ProcessEnv })).rejects.toThrow(error);
  await expect(runBackfill({ runId: "test", mode: "apply", env: {} as NodeJS.ProcessEnv })).rejects.toThrow(error);
  await expect(runBackfillCli()).rejects.toThrow(error);
});
