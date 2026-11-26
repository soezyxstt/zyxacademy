import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getPeranCodes } from "@/lib/auth/authorization";
import { auth } from "@/lib/auth";
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
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { CalendarAgendaClient, type CalendarEventItem } from "./calendar-agenda-client";
import { TranslatedText } from "@/components/i18n/translated-text";
import { compareAgendaEvents, getAgendaAssessment, getAgendaBookingTime, getAgendaStatus } from "@/lib/student/agenda";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("calendar.pageTitle"), description: t("calendar.metadataDescription"), path: "/calendar" });
}


export default async function CalendarPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect("/sign-in?next=/calendar");
  }

  const userId = session.user.id;
  const enrollments = await listStudentEnrollments(userId);
  const enrolledCourseIds = enrollments.map((e) => e.id);

  const now = new Date();

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

  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="routeTitles.calendar" />}
        icon={CalendarDays}
      />

      <Reveal>
        <CalendarAgendaClient events={events} canSync={(await getPeranCodes(userId)).some(role => role === "murid" || role === "tutor")} />
      </Reveal>
    </ApplicationPage>
  );
}
