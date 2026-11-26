import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { academicSchedules, courses } from "@/db/schema";
import { createOnlineReadMemo } from "@/lib/online-read-memo";

type CalendarEntry = Pick<typeof academicSchedules.$inferSelect,
  "id" | "type" | "title" | "courseId" | "description" | "startDate" | "endDate" | "location" | "status"
> & { course: { id: string; title: string } | null };

const readCalendar = createOnlineReadMemo<CalendarEntry[]>(60_000, 64);

/** Call after authenticating the student and resolving the optional active course. */
export async function getStudentAcademicCalendar(weekStart: string, weekEnd: string, courseIds?: string[]) {
  const where = and(
    eq(academicSchedules.status, "published"),
    courseIds ? inArray(academicSchedules.courseId, courseIds) : undefined,
    lte(academicSchedules.startDate, new Date(`${weekEnd}T23:59:59.999+07:00`)),
    or(isNull(academicSchedules.endDate), gte(academicSchedules.endDate, new Date(`${weekStart}T00:00:00.000+07:00`))),
  );
  const revision = await db.select({
    id: academicSchedules.id,
    rowVersion: sql<string>`${academicSchedules}.xmin::text`,
    course: { id: courses.id, title: courses.title },
  }).from(academicSchedules)
    .leftJoin(courses, eq(academicSchedules.courseId, courses.id))
    .where(where)
    .orderBy(academicSchedules.id);

  if (!revision.length) return [];
  const key = JSON.stringify([weekStart, weekEnd, courseIds?.slice().sort() ?? null, revision]);
  const courseByEvent = new Map(revision.map((entry) => [entry.id, entry.course]));
  return readCalendar(key, async () => {
    const rows = await db.query.academicSchedules.findMany({
      columns: { id: true, type: true, title: true, courseId: true, description: true, startDate: true, endDate: true, location: true, status: true },
      where: and(where, inArray(academicSchedules.id, revision.map((entry) => entry.id))),
      orderBy: [desc(academicSchedules.startDate)],
    });
    return rows.map((row) => ({ ...row, course: courseByEvent.get(row.id) ?? null }));
  });
}
