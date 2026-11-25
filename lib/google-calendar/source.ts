import { and, eq, inArray, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { academicSchedules, bookings, tutorSlots, groupCourses, groupMembers, mataKuliah, quizTemplates, exams, pkaSchedules, pkaRegistrations, courses, groups } from "@/db/schema";
import { listTutorAccessibleCourses } from "@/lib/auth/tutor-access";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { calendarDateToJakartaInstant, minutesFrom } from "@/lib/date-utils";
import type { CalendarEntry } from "./transport";

export async function calendarSource(userId?: string): Promise<CalendarEntry[]> {
  const courseIds = new Set<string>();
  const membership = db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId ?? ""));
  if (userId) {
    for (const course of await listStudentEnrollments(userId)) {
      for (const id of [course.id, course.canonicalId, course.legacyId]) if (id) courseIds.add(id);
    }
    for (const course of await listTutorAccessibleCourses(userId)) {
      courseIds.add(course.courseId);
      if (course.legacyCourseId) courseIds.add(course.legacyCourseId);
    }
    const groupLinkedCourses = await db
      .select({ courseId: groupCourses.courseId })
      .from(groupCourses)
      .where(inArray(groupCourses.groupId, membership));
    const unresolvedGroupCourseIds: string[] = [];
    for (const row of groupLinkedCourses) {
      if (row.courseId) {
        if (!courseIds.has(row.courseId)) unresolvedGroupCourseIds.push(row.courseId);
        courseIds.add(row.courseId);
      }
    }
    if (unresolvedGroupCourseIds.length > 0) {
      const mapped = await db
        .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
        .from(mataKuliah)
        .where(
          or(
            inArray(mataKuliah.id, unresolvedGroupCourseIds),
            inArray(mataKuliah.legacyCourseId, unresolvedGroupCourseIds),
          ),
        );
      for (const row of mapped) {
        if (row.id) courseIds.add(row.id);
        if (row.legacyCourseId) courseIds.add(row.legacyCourseId);
      }
    }
  }
  const ids = [...courseIds];
  const sessions = await db.select({ booking: bookings, slot: tutorSlots, courseTitle: courses.title, groupName: groups.name }).from(bookings)
    .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
    .innerJoin(courses, eq(bookings.courseId, courses.id)).innerJoin(groups, eq(bookings.groupId, groups.id))
    .where(and(inArray(bookings.status, ["scheduled", "rescheduled"]), userId ? or(eq(tutorSlots.tutorId, userId), inArray(bookings.groupId, membership)) : undefined));
  const result: CalendarEntry[] = [];
  for (const { booking, slot, courseTitle, groupName } of sessions) {
    const date = booking.sessionDate ?? slot.sessionDate;
    const startTime = booking.startTime ?? slot.startTime;
    const endTime = booking.endTime ?? slot.endTime;
    if (!date || !startTime || !endTime) continue; // Undated legacy availability is not a concrete appointment.
    const start = calendarDateToJakartaInstant(date, startTime);
    const end = calendarDateToJakartaInstant(date, endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    result.push({ key: `booking:${booking.id}`, summary: `Tutorial ${courseTitle}`,
      description: [groupName, booking.topic, booking.googleMeetUrl, "Zyx Academy"].filter(Boolean).join("\n"),
      location: booking.mode === "online" ? booking.googleMeetUrl ?? undefined : booking.location ?? slot.location ?? undefined, start, end });
  }
  const academic = await db.select().from(academicSchedules).where(and(eq(academicSchedules.status, "published"),
    userId ? or(isNull(academicSchedules.courseId), ids.length ? inArray(academicSchedules.courseId, ids) : undefined) : undefined));
  for (const event of academic) result.push({ key: `academic:${event.id}`, summary: event.title,
    description: event.description ?? "Zyx Academy", location: event.location ?? undefined,
    start: event.startDate, end: event.endDate && event.endDate > event.startDate ? event.endDate : minutesFrom(60, event.startDate) });
  if (!userId || ids.length) {
    const quizzes = await db.select().from(quizTemplates).where(and(eq(quizTemplates.status, "published"), userId ? inArray(quizTemplates.courseId, ids) : undefined));
    const assessments = await db.select().from(exams).where(and(eq(exams.status, "published"), userId ? inArray(exams.courseId, ids) : undefined));
    for (const [kind, events] of [["quiz", quizzes], ["exam", assessments]] as const) {
      for (const event of events) {
        const start = kind === "quiz" ? event.closeAt ?? event.openAt : event.openAt ?? event.closeAt;
        if (!start) continue;
        result.push({ key: `${kind}:${event.id}`, summary: event.title, description: "Zyx Academy",
          start, end: kind !== "quiz" && event.closeAt && event.closeAt > start ? event.closeAt : minutesFrom(1, start) });
      }
    }
  }
  if (!userId || (await db.select({ id: pkaRegistrations.id }).from(pkaRegistrations).where(eq(pkaRegistrations.userId, userId)).limit(1)).length) {
    for (const event of await db.select().from(pkaSchedules)) result.push({ key: `pka:${event.id}`, summary: event.title,
      description: "Tutorial PKA Zyx", location: event.meetLink ?? undefined, start: event.sessionAt, end: minutesFrom(90, event.sessionAt) });
  }
  return result;
}
