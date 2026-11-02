import { expect, test } from "bun:test";
import { runBackfill, runBackfillCli } from "@/lib/migrasi/backfill-engine";

test("legacy staging backfill refuses all modes before accessing a database", async () => {
  const error = "Legacy staging backfill is unsupported on the PostgreSQL migration branch";
  await expect(runBackfill({ runId: "test", mode: "dry-run", env: {} })).rejects.toThrow(error);
  await expect(runBackfill({ runId: "test", mode: "apply", env: {} })).rejects.toThrow(error);
  await expect(runBackfillCli()).rejects.toThrow(error);
});
