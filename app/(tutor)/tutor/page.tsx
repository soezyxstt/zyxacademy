import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { hasAnyPeran, listTutorAccessibleCourses } from "@/lib/auth/request-cache";
import { getTutorDashboardReadModel } from "@/lib/schedule/tutor-dashboard-read-model";
import { getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/schedule/calendar-date";
import { ApplicationPage } from "@/components/application-page";
import { TutorDashboardContent } from "@/features/tutor-dashboard/ui/tutor-dashboard-content";
import { pageTitle } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("tutor.dashboard");
  return { title: pageTitle(t("title")), description: t("description") };
}

export default async function TutorPage() {
  const locale = await getAppLocale();
  const session = await getAuthSession();
  if (!session?.user) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (!isAuthorized) redirect("/");

  const today = getJakartaCalendarDate();
  const week = getCalendarWeekRange(today);
  const schedule = await getTutorDashboardReadModel(
    session.user.id,
    today,
    week,
    undefined,
    listTutorAccessibleCourses,
  );

  const courses = schedule.assignedActiveCourses.map((course) => ({
    courseId: course.courseId,
    title: course.title,
    code: course.code ?? null,
    groupCount: schedule.eligibleGroups.filter(
      (group) =>
        group.matchedCourseIds.includes(course.courseId) ||
        Boolean(course.legacyCourseId && group.matchedCourseIds.includes(course.legacyCourseId)),
    ).length,
  }));

  return (
    <ApplicationPage>
      <TutorDashboardContent
        locale={locale}
        counts={{
          courses: schedule.assignedActiveCourses.length,
          activeGroups: schedule.eligibleGroups.length,
          sessionsThisWeek: schedule.sessionsThisWeek,
          pendingTickets: schedule.pendingTicketCount,
        }}
        upcomingSessions={schedule.upcomingSessions}
        pendingTickets={schedule.pendingTickets}
        courses={courses}
      />
    </ApplicationPage>
  );
}
