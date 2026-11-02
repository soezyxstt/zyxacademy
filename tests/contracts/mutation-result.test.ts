import { describe, expect, test } from "bun:test";
import { affectedRows } from "@/lib/mutation-result";
import { hasDatabaseErrorCode } from "@/lib/database-retry";

describe("affectedRows", () => {
  test("preserves PostgreSQL and SQLite claim counts", () => {
    expect(affectedRows({ rowCount: 0 })).toBe(0);
    expect(affectedRows({ rowCount: 1 })).toBe(1);
    expect(affectedRows({ rowsAffected: 0 })).toBe(0);
    expect(affectedRows({ affectedRows: 2 })).toBe(2);
    expect(affectedRows({ rowsAffected: 1 })).toBe(1);
  });

  test("fails closed for missing or invalid counts", () => {
    for (const result of [undefined, {}, { rowCount: null }, { rowCount: -1 }, { rowCount: "1" }]) {
      expect(() => affectedRows(result)).toThrow("DATABASE_AFFECTED_ROW_COUNT_UNAVAILABLE");
    }
  });
});

test("PostgreSQL retry and unique conflict codes are recognized through causes", () => {
  for (const code of ["40001", "40P01"]) {
    expect(hasDatabaseErrorCode({ cause: { code } }, ["40001", "40P01"])).toBe(true);
  }
  expect(hasDatabaseErrorCode({ cause: { code: "23505" } }, ["23505"])).toBe(true);
  expect(hasDatabaseErrorCode({ code: "23505" }, ["40001", "40P01"])).toBe(false);
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  expect(hasDatabaseErrorCode(cycle, ["40001"])).toBe(false);
});
