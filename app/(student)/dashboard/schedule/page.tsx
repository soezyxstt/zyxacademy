import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/request-cache";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentScheduleClient, ScheduleCalendarSkeleton } from "./schedule-client";
import { TranslatedText } from "@/components/i18n/translated-text";
import { studentScheduleRedirect } from "@/lib/schedule/student-schedule-redirect";
import { getCourse } from "@/lib/course-utils";

export default async function StudentSchedulePage({ searchParams }: { searchParams: Promise<{ course?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const legacyRole = (session.user as { role?: string | null }).role;
  const isAdmin = legacyRole === "admin" || await hasAnyPeran(session.user.id, ["admin"], { allowAdmin: false });
  const isTutor = legacyRole === "teacher" || await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  const course = (await searchParams).course;
  const courseId = typeof course === "string" ? course : "";
  const destination = studentScheduleRedirect(isAdmin, isTutor, courseId.trim().length > 0);
  if (destination) redirect(destination);
  const selectedCourse = isAdmin && courseId ? await getCourse(courseId) : null;

  return (
    <Suspense
      fallback={
        <ApplicationPage spacing="space-y-4">
          <PageHeader icon={CalendarDays} title={<TranslatedText namespace="student" messageKey="schedule.title" />} />
          <ScheduleCalendarSkeleton />
        </ApplicationPage>
      }
    >
      <StudentScheduleClient selectedCourse={selectedCourse ? { id: courseId, title: selectedCourse.title } : undefined} />
    </Suspense>
  );
}
