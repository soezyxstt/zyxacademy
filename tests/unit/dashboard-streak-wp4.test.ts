import { expect, mock, test } from "bun:test";
import { addCalendarDays, formatIsoDateUtc, getCalendarWeekRange } from "@/lib/date-utils";

let queries = 0;
let dates: string[] = [];
mock.module("@/db", () => ({
  db: {
    selectDistinct: () => ({ from: () => ({ where: async () => {
      queries++;
      return dates.map((date) => ({ date }));
    } }) }),
  },
}));

const { getWeeklyActivity } = await import("@/lib/streak-service");

test("weekly activity maps distinct UTC dates to Monday through Sunday in one query", async () => {
  const { startIso } = getCalendarWeekRange(formatIsoDateUtc(new Date()));
  dates = [addCalendarDays(startIso, 6), startIso, startIso, addCalendarDays(startIso, 3)];
  queries = 0;
  expect(await getWeeklyActivity("student-a")).toEqual([true, false, false, true, false, false, true]);
  expect(queries).toBe(1);
  dates = [];
  expect(await getWeeklyActivity("student-b")).toEqual([false, false, false, false, false, false, false]);
  expect(queries).toBe(2);
});
