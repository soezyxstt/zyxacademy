import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { lockScheduleEntity } from "@/lib/schedule/transaction-lock";

test("schedule locks use parameterized transaction-scoped keys", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query));
    },
  };
  const executor = tx as unknown as Parameters<typeof lockScheduleEntity>[0];
  await lockScheduleEntity(executor, "tutor", "tutor-1");
  await lockScheduleEntity(executor, "ticket", "booking-1");
  expect(queries.map((query) => query.sql)).toEqual([
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
  ]);
  expect(queries.map((query) => query.params)).toEqual([
    ["zyx:schedule:tutor:tutor-1"],
    ["zyx:schedule:ticket:booking-1"],
  ]);
});
