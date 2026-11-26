import "server-only";
import { db } from "@/db";
import {
  quizTemplates,
  exams,
  bookings,
  tutorSlots,
  courses,
  user as userTable,
} from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { listCurrentEnrolledCourses } from "./current-enrolled-courses";
import { compareAgendaEvents, getAgendaAssessment, getAgendaBookingTime, getAgendaStatus } from "./agenda";
import type { CalendarEventItem } from "./agenda-contract";

export async function getStudentCalendarAgenda(userId: string, now = new Date()): Promise<CalendarEventItem[]> {
  const enrollments = await listCurrentEnrolledCourses(userId);
  const enrolledCourseIds = enrollments.map(enrollment => enrollment.legacyId ?? enrollment.id);

  const events: CalendarEventItem[] = [];

  // 1. Fetch upcoming and active quizzes for enrolled courses
  if (enrolledCourseIds.length > 0) {
    try {
      const activeQuizzes = await db
        .select({
          id: quizTemplates.id,
          title: quizTemplates.title,
          category: quizTemplates.category,
          openAt: quizTemplates.openAt,
          closeAt: quizTemplates.closeAt,
          manualStatus: quizTemplates.manualStatus,
          courseId: quizTemplates.courseId,
          courseTitle: courses.title,
        })
        .from(quizTemplates)
        .innerJoin(courses, eq(quizTemplates.courseId, courses.id))
        .where(
          and(
            inArray(quizTemplates.courseId, enrolledCourseIds),
            eq(quizTemplates.status, "published")
          )
        )
        .limit(30);

      for (const q of activeQuizzes) {
        const entry = getAgendaAssessment(q, now);
        if (!entry) continue;

        events.push({
          id: `quiz-${q.id}`,
          title: q.title,
          courseTitle: q.courseTitle,
          category: "quiz",
          categoryLabel: q.category === "simulation" ? "quizSimulation" : "quiz",
          dateValue: entry.date.toISOString(),
          timeKind: entry.timeKind,
          actionUrl: `/courses/${q.courseId}/quiz/${q.id}`,
          status: entry.status,
        });
      }
    } catch (e) {
      console.error("Error loading quiz events for calendar:", e);
    }
  }

  // 2. Fetch tryouts for enrolled courses
  if (enrolledCourseIds.length > 0) {
    try {
      const activeExams = await db
        .select({
          id: exams.id,
          title: exams.title,
          type: exams.type,
          openAt: exams.openAt,
          closeAt: exams.closeAt,
          courseId: exams.courseId,
          courseTitle: courses.title,
        })
        .from(exams)
        .innerJoin(courses, eq(exams.courseId, courses.id))
        .where(
          and(
            inArray(exams.courseId, enrolledCourseIds),
            eq(exams.status, "published")
          )
        )
        .limit(20);

      for (const ex of activeExams) {
        const entry = getAgendaAssessment(ex, now);
        if (!entry) continue;

        events.push({
          id: `exam-${ex.id}`,
          title: ex.title,
          courseTitle: ex.courseTitle,
          category: "tryout",
          categoryLabel: ex.type === "tryout" ? "tryout" : "exam",
          dateValue: entry.date.toISOString(),
          timeKind: entry.timeKind,
          actionUrl: `/courses/${ex.courseId}/tryout/${ex.id}`,
          status: entry.status,
        });
      }
    } catch (e) {
      console.error("Error loading exam events for calendar:", e);
    }
  }

  // 3. Fetch student tutorial bookings
  try {
    const studentBookings = await db
      .select({
        id: bookings.id,
        sessionDate: bookings.sessionDate,
        status: bookings.status,
        startTime: tutorSlots.startTime,
        endTime: tutorSlots.endTime,
        googleMeetUrl: bookings.googleMeetUrl,
        topic: bookings.topic,
        courseId: bookings.courseId,
        courseTitle: courses.title,
        tutorName: userTable.name,
      })
      .from(bookings)
      .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .innerJoin(courses, eq(bookings.courseId, courses.id))
      .leftJoin(userTable, eq(tutorSlots.tutorId, userTable.id))
      .where(eq(bookings.studentId, userId))
      .orderBy(desc(bookings.bookedAt))
      .limit(15);

    for (const b of studentBookings) {
      const slot = getAgendaBookingTime(b.sessionDate, b.startTime, b.endTime);
      if (!slot) continue;
      const { start, end, scheduledRange } = slot;
      const cancelled = b.status === "cancelled";
      const past = b.status === "completed" || cancelled || end < now;

      events.push({
        id: `booking-${b.id}`,
        title: "",
        courseTitle: b.courseTitle,
        category: "tutorial",
        categoryLabel: "tutorialGroup",
        dateValue: start.toISOString(),
        timeKind: "range",
        scheduledRange,
        tutorialTopic: b.topic,
        tutorName: b.tutorName,
        actionUrl: "/dashboard/schedule",
        meetUrl: past ? null : b.googleMeetUrl,
        cancelled,
        status: getAgendaStatus(start, past, now),
      });
    }
  } catch (e) {
    console.error("Error loading tutorial bookings for calendar:", e);
  }

  events.sort(compareAgendaEvents);

  return events;
}
