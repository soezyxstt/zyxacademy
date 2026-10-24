import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  MessageSquareWarning,
  Plus,
  Users,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import { getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/schedule/calendar-date";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("tutor.dashboard");
  return { title: pageTitle(t("title")), description: t("description") };
}

function formatSessionDate(dateIso: string, locale: "id" | "en") {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export default async function TutorPage() {
  const [locale, t] = await Promise.all([getAppLocale(), getTranslations("tutor.dashboard")]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const isAuthorized = await hasAnyPeran(session.user.id, ["tutor"], { allowAdmin: false });
  if (!isAuthorized) redirect("/");

  const today = getJakartaCalendarDate();
  const week = getCalendarWeekRange(today);
  const schedule = await getTutorScheduleReadModel({
    tutorId: session.user.id,
    allowAdmin: false,
  });

  const currentWeekBookings = schedule.ownedBookings.filter(
    (booking) => booking.sessionDate && booking.sessionDate >= week.startIso && booking.sessionDate <= week.endIso && booking.status !== "cancelled",
  );
  const pendingTickets = schedule.ownedTickets.filter((ticket) => ticket.status === "pending");
  const upcomingSessions = schedule.ownedBookings
    .filter((booking) => booking.sessionDate && booking.sessionDate >= today && !["cancelled", "completed"].includes(booking.status))
    .sort((left, right) => `${left.sessionDate}-${left.startTime || "00:00"}`.localeCompare(`${right.sessionDate}-${right.startTime || "00:00"}`))
    .slice(0, 5);

  const statItems = [
    { label: t("courses"), value: schedule.assignedActiveCourses.length, icon: BookOpen },
    { label: t("activeGroups"), value: schedule.eligibleGroups.length, icon: Users },
    { label: t("sessionsThisWeek"), value: currentWeekBookings.length, icon: CalendarDays },
    { label: t("ticketsWaiting"), value: pendingTickets.length, icon: MessageSquareWarning },
  ];

  return (
    <ApplicationPage spacing="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title={t("title")}
          icon={LayoutDashboard}
          divider={false}
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tutor/schedule">{t("openSchedule")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/tutor/schedule">
              <Plus className="size-4" /> {t("addSlot")}
            </Link>
          </Button>
        </div>
      </div>

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-4" aria-hidden />
                <span className="text-body-sm font-medium">{item.label}</span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">{item.value}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-heading text-body-base font-bold text-foreground">{t("upcomingSessions")}</h2>
            </div>
            <Link href="/tutor/schedule" className="shrink-0 text-body-xs font-semibold text-brand-primary hover:underline">
              {t("allSchedules")}
            </Link>
          </div>

          {upcomingSessions.length === 0 ? (
            <AdminEmptyState
              icon={Clock3}
              title={t("noUpcoming")}
              description={t("noUpcomingDescription")}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/tutor/schedule">{t("addSlot")}</Link>
                </Button>
              }
              className="px-4 py-8"
            />
          ) : (
            <div className="divide-y divide-border">
              {upcomingSessions.map((booking) => (
                <Link
                  key={booking.id}
                  href="/tutor/schedule?tab=sessions"
                  className="group flex min-w-0 items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <Clock3 className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-body-sm font-semibold text-foreground">
                      {booking.course?.title || booking.topic || t("tutorialSession")}
                    </span>
                    <span className="mt-0.5 block break-words text-body-xs text-muted-foreground">
                      {booking.sessionDate ? formatSessionDate(booking.sessionDate, locale) : t("dateUnspecified")}
                      {booking.startTime ? ` · ${booking.startTime}${booking.endTime ? `-${booking.endTime}` : ""}` : ""}
                    </span>
                    <span className="mt-0.5 block break-words text-body-xs text-muted-foreground">
                      {booking.group?.name || t("group")}{booking.mode ? ` · ${booking.mode === "online" ? t("online") : t("inPerson")}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-body-base font-bold text-foreground">{t("attention")}</h2>
          </div>
          {pendingTickets.length === 0 ? (
            <AdminEmptyState
              icon={MessageSquareWarning}
              title={t("noPendingTickets")}
              className="px-4 py-7"
            />
          ) : (
            <div className="divide-y divide-border">
              {pendingTickets.slice(0, 5).map((ticket) => (
                <Link key={ticket.id} href="/tutor/schedule?tab=tickets" className="block px-4 py-3 transition-colors hover:bg-muted/30">
                  <p className="text-body-sm font-semibold text-foreground">
                    {ticket.type === "cancellation" ? t("cancellationRequest") : t("rescheduleRequest")}
                  </p>
                  <p className="mt-0.5 break-words text-body-xs text-muted-foreground">{ticket.reason}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground">{t("teaching")}</h2>
          </div>
          <span className="text-body-xs text-muted-foreground">{t("courseCount", { count: schedule.assignedActiveCourses.length })}</span>
        </div>

        {schedule.assignedActiveCourses.length === 0 ? (
          <AdminEmptyState
            icon={BookOpen}
            title={t("noCourses")}
            description={t("noCoursesDescription")}
            className="px-4 py-8"
          />
        ) : (
          <div className="divide-y divide-border">
            {schedule.assignedActiveCourses.map((course) => {
              const groupCount = schedule.eligibleGroups.filter((group) =>
                group.matchedCourseIds.includes(course.courseId) || Boolean(course.legacyCourseId && group.matchedCourseIds.includes(course.legacyCourseId)),
              ).length;
              return (
                <Link
                  key={course.courseId}
                  href={`/tutor/${course.courseId}`}
                  className="group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-brand-primary">
                    <BookOpen className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-body-sm font-semibold text-foreground">{course.title}</span>
                    <span className="block text-body-xs text-muted-foreground">
                      {course.code || t("courses")} · {t("relatedGroups", { count: groupCount })}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" aria-hidden />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </ApplicationPage>
  );
}
