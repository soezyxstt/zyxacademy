"use client";

import Link from "next/link";
import {
  ArrowRight,
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

/**
 * Mobile tutor dashboard (<768px):
 * 2x2 compact KPI strip + stacked divided lists (Upcoming Sessions -> Pending Tickets -> Teaching Courses)
 * with right-aligned metadata. Omits the redundant top schedule icon button (already in Bottom Nav).
 */
export function TutorDashboardMobile({
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
    <div className="flex w-full min-w-0 flex-col space-y-5">
      <PageHeader title={t("title")} icon={LayoutDashboard} divider={false} />

      <section
        aria-label={t("summary")}
        className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/40 py-3"
      >
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate text-body-xs font-medium">{item.label}</span>
              </div>
              <p className="mt-1 font-heading text-h5 font-bold tabular-nums text-foreground">
                {item.value}
              </p>
            </div>
          );
        })}
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("upcomingSessions")}
          </h2>
          <Link
            href="/tutor/schedule"
            className="flex min-h-9 shrink-0 items-center text-body-xs font-semibold text-brand-primary"
          >
            {t("allSchedules")}
          </Link>
        </div>

        {upcomingSessions.length === 0 ? (
          <AdminEmptyState
            icon={Clock3}
            title={t("noUpcoming")}
            action={
              <Button asChild variant="outline" size="sm" className="min-h-10">
                <Link href="/tutor/schedule">{t("addSlot")}</Link>
              </Button>
            }
            className="py-4"
          />
        ) : (
          <div className="divide-y divide-border/30">
            {upcomingSessions.map((booking) => (
              <Link
                key={booking.id}
                href="/tutor/schedule?tab=sessions"
                className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-3 active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-body-sm font-semibold text-foreground">
                    {booking.courseTitle || booking.topic || t("tutorialSession")}
                  </p>
                  <p className="mt-0.5 break-words text-body-xs text-muted-foreground">
                    {booking.groupName || t("group")}
                    {booking.mode
                      ? ` · ${booking.mode === "online" ? t("online") : t("inPerson")}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div className="tabular-nums">
                    <p className="text-body-xs font-medium text-foreground">
                      {booking.sessionDate
                        ? formatTutorSessionDate(booking.sessionDate, locale)
                        : t("dateUnspecified")}
                    </p>
                    {booking.startTime && (
                      <p className="text-body-xs text-muted-foreground">
                        {booking.startTime}
                        {booking.endTime ? `-${booking.endTime}` : ""}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("attention")}
          </h2>
          {pendingTickets.length > 0 && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold tabular-nums text-muted-foreground">
              {pendingTickets.length}
            </span>
          )}
        </div>

        {pendingTickets.length === 0 ? (
          <AdminEmptyState
            icon={MessageSquareWarning}
            title={t("noPendingTickets")}
            className="py-4"
          />
        ) : (
          <div className="divide-y divide-border/30">
            {pendingTickets.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href="/tutor/schedule?tab=tickets"
                className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-3 active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-foreground">
                    {ticket.type === "cancellation"
                      ? t("cancellationRequest")
                      : t("rescheduleRequest")}
                  </p>
                  <p className="mt-0.5 break-words text-body-xs text-muted-foreground">
                    {ticket.reason}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("teaching")}
          </h2>
          <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">
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
          <div className="divide-y divide-border/30">
            {courses.map((course) => (
              <Link
                key={course.courseId}
                href={`/tutor/${course.courseId}`}
                className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-3 active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-body-sm font-semibold text-foreground">
                    {course.title}
                  </p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground">
                    {course.code || t("courses")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <span className="text-body-xs tabular-nums text-muted-foreground">
                    {t("relatedGroups", { count: course.groupCount })}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
