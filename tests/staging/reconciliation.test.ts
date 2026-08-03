import { describe, expect, it } from "bun:test";
import { unexpectedAddedTables, unexpectedChangedTables } from "@/lib/staging/reconciliation";

describe("staging additive reconciliation", () => {
  it("ignores migration bookkeeping changes for every plan", () => {
    expect(unexpectedChangedTables("003", [
      "__drizzle_migrations",
      "migration_runs",
      "migration_checkpoints",
      "courses",
    ])).toEqual(["courses"]);
  });

  it("allows arbitrary additive tables after Plan 001 while preserving its narrow bootstrap rule", () => {
    expect(unexpectedAddedTables("003", ["ide", "sumber_materi"])).toEqual([]);
    expect(unexpectedAddedTables("001", ["migration_runs", "migration_checkpoints", "ide"])).toEqual(["ide"]);
  });
});
