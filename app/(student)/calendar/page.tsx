import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
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
import { createMetadata} from "@/lib/site";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { CalendarAgendaClient, type CalendarEventItem } from "./calendar-agenda-client";
import { TranslatedText } from "@/components/i18n/translated-text";
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
  const nowMs = now.getTime();
  const todayDateStr = now.toISOString().slice(0, 10);

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
        const targetDate = q.closeAt || q.openAt || null;
        if (!targetDate) continue;

        const dateObj = new Date(targetDate);
        const dateIso = dateObj.toISOString().slice(0, 10);
        const isPast = dateObj.getTime() < nowMs;
        const isToday = dateIso === todayDateStr;

        events.push({
          id: `quiz-${q.id}`,
          title: q.title,
          courseTitle: q.courseTitle,
          category: "quiz",
          categoryLabel: q.category === "simulation" ? "Simulasi" : "Kuis",
          dateStr: "",
          timeStr: "",
          dateValue: dateObj.toISOString(),
          timeValue: targetDate.toISOString(),
          timeKind: q.closeAt ? "deadline" : "available",
          actionUrl: `/courses/${q.courseId}/quiz/${q.id}`,
          actionLabel: isPast ? "Tinjau Kuis" : "Kerjakan Kuis",
          status: isToday ? "today" : isPast ? "past" : "upcoming",
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
        const targetDate = ex.openAt || ex.closeAt || null;
        if (!targetDate) continue;

        const dateObj = new Date(targetDate);
        const dateIso = dateObj.toISOString().slice(0, 10);
        const isPast = (ex.closeAt ? new Date(ex.closeAt).getTime() : dateObj.getTime()) < nowMs;
        const isToday = dateIso === todayDateStr;

        events.push({
          id: `exam-${ex.id}`,
          title: ex.title,
          courseTitle: ex.courseTitle,
          category: "tryout",
          categoryLabel: ex.type === "tryout" ? "Tryout" : "Ujian",
          dateStr: "",
          timeStr: "",
          dateValue: dateObj.toISOString(),
          timeValue: targetDate.toISOString(),
          timeKind: "time",
          actionUrl: `/courses/${ex.courseId}/tryout/${ex.id}`,
          actionLabel: isPast ? "Tinjau Tryout" : "Buka Tryout",
          status: isToday ? "today" : isPast ? "past" : "upcoming",
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
      if (!b.sessionDate) continue;

      const dateParts = b.sessionDate.split("-");
      const sessionDateObj = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10)
      );

      const isToday = b.sessionDate === todayDateStr;
      const isPast = b.status === "completed" || b.status === "cancelled" || sessionDateObj.getTime() + 86400000 < nowMs;

        events.push({
        id: `booking-${b.id}`,
          title: "",
        courseTitle: b.courseTitle,
        category: "tutorial",
        categoryLabel: "Tutorial Kelompok",
          dateStr: "",
          timeStr: "",
          dateValue: new Date(Date.UTC(sessionDateObj.getFullYear(), sessionDateObj.getMonth(), sessionDateObj.getDate(), 12)).toISOString(),
          timeKind: b.startTime ? "range" : "scheduled",
          scheduledRange: b.startTime ? `${b.startTime} - ${b.endTime || "Selesai"}` : undefined,
          tutorialTopic: b.topic,
          tutorName: b.tutorName,
        actionUrl: "/dashboard/schedule",
        actionLabel: "Lihat Detail",
        isOnlineMeet: Boolean(b.googleMeetUrl),
        meetUrl: b.googleMeetUrl,
        status: isToday ? "today" : isPast ? "past" : "upcoming",
      });
    }
  } catch (e) {
    console.error("Error loading tutorial bookings for calendar:", e);
  }

  // Sort events: today first, then upcoming ascending, then past descending
  events.sort((a, b) => {
    if (a.status === "today" && b.status !== "today") return -1;
    if (b.status === "today" && a.status !== "today") return 1;
    if (a.status === "upcoming" && b.status === "past") return -1;
    if (a.status === "past" && b.status === "upcoming") return 1;
    return 0;
  });

  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="routeTitles.calendar" />}
        icon={CalendarDays}
      />

      <Reveal className="mt-6">
        <CalendarAgendaClient events={events} />
      </Reveal>
    </ApplicationPage>
  );
}
