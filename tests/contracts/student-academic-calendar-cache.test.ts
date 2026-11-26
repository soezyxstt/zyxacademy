import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { academicSchedules } from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(() => client.close());
let revisionReads = 0;
let detailReads = 0;

mock.module("@/db", () => ({
  db: {
    select: (...args: Parameters<typeof testDb.select>) => {
      revisionReads++;
      return testDb.select(...args);
    },
    query: {
      academicSchedules: {
        findMany: (options: Parameters<typeof testDb.query.academicSchedules.findMany>[0]) => {
          detailReads++;
          return testDb.query.academicSchedules.findMany(options);
        },
      },
    },
  },
}));

const { getStudentAcademicCalendar } = await import("@/lib/schedule/student-academic-calendar");

test("reuse survives calendar revisits and reads changed, archived or deleted rows immediately", async () => {
  const read = () => getStudentAcademicCalendar("2026-11-23", "2026-11-29");
  await testDb.insert(academicSchedules).values({
    id: "calendar-reuse", title: "First title", status: "published", startDate: new Date("2026-11-24T01:00:00Z"),
  });
  expect((await read())[0]?.title).toBe("First title");
  expect((await read())[0]?.title).toBe("First title");
  expect([revisionReads, detailReads]).toEqual([2, 1]);

  await testDb.update(academicSchedules).set({ title: "Changed title" }).where(eq(academicSchedules.id, "calendar-reuse"));
  expect((await read())[0]?.title).toBe("Changed title");
  expect([revisionReads, detailReads]).toEqual([3, 2]);

  await testDb.update(academicSchedules).set({ status: "archived" }).where(eq(academicSchedules.id, "calendar-reuse"));
  expect(await read()).toEqual([]);
  await testDb.update(academicSchedules).set({ status: "published" }).where(eq(academicSchedules.id, "calendar-reuse"));
  expect((await read())[0]?.title).toBe("Changed title");
  await testDb.delete(academicSchedules).where(eq(academicSchedules.id, "calendar-reuse"));
  expect(await read()).toEqual([]);
  expect([revisionReads, detailReads]).toEqual([6, 3]);
});
