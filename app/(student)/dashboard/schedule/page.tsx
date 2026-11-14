import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentScheduleClient, ScheduleCalendarSkeleton } from "./schedule-client";
import { TranslatedText } from "@/components/i18n/translated-text";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

export default async function StudentSchedulePage({ searchParams }: { searchParams: Promise<{ course?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/");

  const course = (await searchParams).course;
  const courseId = typeof course === "string" ? course.trim() : "";
  const selectedCourse = courseId ? await resolveCourseIdentity(courseId) : null;
  if (courseId && (!selectedCourse || selectedCourse.status !== "active")) notFound();

  return (
    <Suspense
      fallback={
        <ApplicationPage spacing="space-y-4">
          <PageHeader icon={CalendarDays} title={<TranslatedText namespace="student" messageKey="schedule.title" />} />
          <ScheduleCalendarSkeleton />
        </ApplicationPage>
      }
    >
      <StudentScheduleClient selectedCourse={selectedCourse ? { id: selectedCourse.primaryId, title: selectedCourse.title, compatibleCourseIds: selectedCourse.allIds } : undefined} />
    </Suspense>
  );
}
