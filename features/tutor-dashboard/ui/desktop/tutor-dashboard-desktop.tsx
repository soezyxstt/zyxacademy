"use client";

import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import {
  formatTutorSessionDate,
  type TutorDashboardViewProps,
} from "@/features/tutor-dashboard/model/types";

export function TutorDashboardDesktop({
  locale,
  counts,
  upcomingSessions,
  pendingTickets,
  courses,
}: TutorDashboardViewProps) {
  const t = useTranslations("tutor.dashboard");

  const statItems = [
    { label: t("courses"), value: counts.courses, icon: BookOpen },
    { label: t("activeGroups"), value: counts.activeGroups, icon: Users },
    { label: t("sessionsThisWeek"), value: counts.sessionsThisWeek, icon: CalendarDays },
    { label: t("ticketsWaiting"), value: counts.pendingTickets, icon: MessageSquareWarning },
  ];

  return (
    <div className="space-y-(--section-gap)">
      <PageHeader title={t("title")} icon={LayoutDashboard} divider={false} />

      <section
        aria-label={t("summary")}
        className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/55 py-4 lg:grid-cols-4"
      >
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-4" aria-hidden />
                <span className="text-body-sm font-medium">{item.label}</span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold tabular-nums text-foreground">
                {item.value}
              </p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-(--section-gap) xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="min-w-0">
          <div className="flex items-center justify-between gap-(--compact-gap) border-b border-border/55 pb-2">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("upcomingSessions")}
            </h2>
            <Link
              href="/tutor/schedule"
              className="shrink-0 text-body-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
            >
              {t("allSchedules")}
            </Link>
          </div>

          {upcomingSessions.length === 0 ? (
            <AdminEmptyState
              icon={Clock3}
              title={t("noUpcoming")}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/tutor/schedule">{t("addSlot")}</Link>
                </Button>
              }
              className="py-4"
            />
          ) : (
            <div className="divide-y divide-border/55">
              {upcomingSessions.map((booking) => (
                <Link
                  key={booking.id}
                  href="/tutor/schedule?tab=sessions"
                  className="flex min-h-11 min-w-0 items-start justify-between gap-3 py-(--row-padding) transition-colors hover:bg-muted/35 active:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-body-sm font-semibold text-foreground">
                      {booking.courseTitle || booking.topic || t("tutorialSession")}
                    </span>
                    <span className="mt-0.5 block break-words text-body-xs text-muted-foreground">
                      {booking.groupName || t("group")}
                      {booking.mode
                        ? ` · ${booking.mode === "online" ? t("online") : t("inPerson")}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block text-body-xs font-medium text-foreground">
                      {booking.sessionDate
                        ? formatTutorSessionDate(booking.sessionDate, locale)
                        : t("dateUnspecified")}
                    </span>
                    {booking.startTime && (
                      <span className="block text-body-xs text-muted-foreground">
                        {booking.startTime}
                        {booking.endTime ? `-${booking.endTime}` : ""}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <div className="border-b border-border/55 pb-2">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("attention")}
            </h2>
          </div>
          {pendingTickets.length === 0 ? (
            <AdminEmptyState
              icon={MessageSquareWarning}
              title={t("noPendingTickets")}
              className="py-4"
            />
          ) : (
            <div className="divide-y divide-border/55">
              {pendingTickets.slice(0, 5).map((ticket) => (
                <Link
                  key={ticket.id}
                  href="/tutor/schedule?tab=tickets"
                  className="block min-h-11 py-(--row-padding) transition-colors hover:bg-muted/35 active:bg-muted/40"
                >
                  <p className="text-body-sm font-semibold text-foreground">
                    {ticket.type === "cancellation"
                      ? t("cancellationRequest")
                      : t("rescheduleRequest")}
                  </p>
                  <p className="mt-0.5 break-words text-body-xs text-muted-foreground">
                    {ticket.reason}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between gap-3 border-b border-border/55 pb-2">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {t("teaching")}
          </h2>
          <span className="text-body-xs tabular-nums text-muted-foreground">
            {t("courseCount", { count: courses.length })}
          </span>
        </div>

        {courses.length === 0 ? (
          <AdminEmptyState
            icon={BookOpen}
            title={t("noCourses")}
            description={t("noCoursesDescription")}
            className="py-5"
          />
        ) : (
          <div className="divide-y divide-border/55">
            {courses.map((course) => (
              <Link
                key={course.courseId}
                href={`/tutor/${course.courseId}`}
                className="flex min-h-11 min-w-0 items-start justify-between gap-3 py-(--row-padding) transition-colors hover:bg-muted/35 active:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-body-sm font-semibold text-foreground">
                    {course.title}
                  </span>
                  <span className="block text-body-xs text-muted-foreground">
                    {course.code || t("courses")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-body-xs tabular-nums text-muted-foreground">
                  {t("relatedGroups", { count: course.groupCount })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
