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
import { getScheduleData } from "./actions";

async function InitialSchedule({ selectedCourse }: { selectedCourse: Awaited<ReturnType<typeof resolveCourseIdentity>> }) {
  const scope = selectedCourse ? { id: selectedCourse.primaryId, title: selectedCourse.title, compatibleCourseIds: selectedCourse.allIds } : undefined;
  const initialData = await getScheduleData(0, scope?.id).catch(() => null);
  return <StudentScheduleClient key={scope?.id ?? "all"} selectedCourse={scope} initialData={initialData} fetchedAt={initialData?.fetchedAt} />;
}

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
        <ApplicationPage spacing="space-y-(--related-gap)">
          <PageHeader icon={CalendarDays} title={<TranslatedText namespace="student" messageKey="schedule.title" />} />
          <ScheduleCalendarSkeleton />
        </ApplicationPage>
      }
    >
      <InitialSchedule selectedCourse={selectedCourse} />
    </Suspense>
  );
}
