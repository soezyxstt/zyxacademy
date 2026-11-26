import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { addCalendarDays, todayUtc } from "@/lib/date-utils";

const client = new PGlite();
mock.module("@/db", () => ({ db: drizzle(client) }));
const { getOrUpdateStreak } = await import("@/lib/streak-service");

const today = todayUtc();
const yesterday = addCalendarDays(today, -1);

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE "user" (id text PRIMARY KEY);
    CREATE TABLE student_streaks (
      student_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      current_streak bigint NOT NULL DEFAULT 0,
      longest_streak bigint NOT NULL DEFAULT 0,
      last_active_date text NOT NULL
    );
    CREATE TABLE learning_events (
      student_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL
    );
    INSERT INTO "user" (id) VALUES ('first-active'), ('first-inactive'), ('consecutive'), ('gap'), ('waiting');
  `);
  await client.query("INSERT INTO learning_events (student_id, created_at) VALUES ('first-active', $1), ('consecutive', $1), ('gap', $1)", [`${today}T01:00:00Z`]);
  await client.query(
    "INSERT INTO student_streaks (student_id, current_streak, longest_streak, last_active_date) VALUES ('consecutive', 2, 2, $1), ('gap', 3, 9, $2), ('waiting', 3, 9, $1)",
    [yesterday, addCalendarDays(today, -3)],
  );
});

afterAll(async () => { await client.close(); });

test("simultaneous first dashboard reads converge on one initialized streak", async () => {
  const reads = await Promise.all([
    getOrUpdateStreak("first-active"),
    getOrUpdateStreak("first-active"),
  ]);
  expect(reads).toEqual([{ current: 1, longest: 1 }, { current: 1, longest: 1 }]);
  const { rows } = await client.query("SELECT last_active_date FROM student_streaks WHERE student_id = 'first-active'");
  expect(rows).toEqual([{ last_active_date: today }]);
});

test("simultaneous first reads without activity both return zero", async () => {
  const reads = await Promise.all([
    getOrUpdateStreak("first-inactive"),
    getOrUpdateStreak("first-inactive"),
  ]);
  expect(reads).toEqual([{ current: 0, longest: 0 }, { current: 0, longest: 0 }]);
});

test("advances once per active day, retains best result across gaps, and preserves an inactive day", async () => {
  const reads = await Promise.all([
    getOrUpdateStreak("consecutive"),
    getOrUpdateStreak("consecutive"),
  ]);
  expect(reads).toEqual([{ current: 3, longest: 3 }, { current: 3, longest: 3 }]);
  expect(await getOrUpdateStreak("gap")).toEqual({ current: 1, longest: 9 });
  expect(await getOrUpdateStreak("waiting")).toEqual({ current: 3, longest: 9 });
  const { rows } = await client.query("SELECT last_active_date FROM student_streaks WHERE student_id = 'waiting'");
  expect(rows).toEqual([{ last_active_date: yesterday }]);
});
