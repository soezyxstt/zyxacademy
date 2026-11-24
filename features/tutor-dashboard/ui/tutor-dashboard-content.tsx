"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  MessageSquareWarning,
  Plus,
} from "lucide-react";
import {
  DashboardSectionCount,
  DashboardSectionHeading,
} from "@/components/dashboard/dashboard-section-heading";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import {
  formatTutorSessionDate,
  type TutorDashboardViewProps,
} from "@/features/tutor-dashboard/model/types";

const linkedRow =
  "group -mx-2 block min-h-11 min-w-0 rounded-lg px-2 py-(--row-padding) transition-colors hover:bg-muted/40 active:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring";

function isVisibleCourseCode(code: string | null): code is string {
  return Boolean(code && !code.toLowerCase().startsWith("legacy-"));
}

export function TutorDashboardContent({
  locale,
  counts,
  upcomingSessions,
  pendingTickets,
  courses,
}: TutorDashboardViewProps) {
  const t = useTranslations("tutor.dashboard");

  return (
    <>
      <PageHeader title={t("title")} divider={false} />
      <div className="grid w-full min-w-0 items-start gap-y-8 lg:grid-cols-12 lg:gap-x-10">
        <div className="min-w-0 space-y-8 lg:col-span-7">
          <section className="min-w-0">
            <DashboardSectionHeading
              icon={CalendarClock}
              title={t("upcomingSessions")}
              divider
              meta={
                <DashboardSectionCount>
                  {t("weeklySessionCount", { count: counts.sessionsThisWeek })}
                </DashboardSectionCount>
              }
              actions={
                <Link
                  href="/tutor/schedule"
                  className="group inline-flex min-h-9 items-center gap-0.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span>{t("allSchedules")}</span>
                  <ArrowUpRight
                    className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              }
            />

            {upcomingSessions.length === 0 ? (
              <AdminEmptyState
                compact
                icon={Clock3}
                title={t("noUpcoming")}
                className="items-center justify-between py-2"
                action={
                  <Button asChild variant="outline" size="sm" className="min-h-9 shrink-0">
                    <Link href="/tutor/schedule">
                      <Plus className="size-3.5" aria-hidden />
                      <span>{t("addSlot")}</span>
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/30">
                {upcomingSessions.map((booking) => (
                  <li key={booking.id}>
                    <Link href="/tutor/schedule?tab=sessions" className={linkedRow}>
                      <div className="flex items-start justify-between gap-(--compact-gap)">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="m-0 wrap-anywhere text-body-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                            {booking.courseTitle || booking.topic || t("tutorialSession")}
                          </p>
                          <p className="m-0 wrap-anywhere text-body-xs text-muted-foreground">
                            {booking.groupName || t("group")}
                            {booking.mode ? ` · ${booking.mode === "online" ? t("online") : t("inPerson")}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 space-y-1 text-right tabular-nums">
                          <p className="m-0 text-body-sm font-medium text-foreground">
                            {booking.sessionDate
                              ? formatTutorSessionDate(booking.sessionDate, locale)
                              : t("dateUnspecified")}
                          </p>
                          {booking.startTime && (
                            <p className="m-0 text-body-xs text-muted-foreground">
                              {booking.startTime}
                              {booking.endTime ? `-${booking.endTime}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <DashboardSectionHeading
              icon={GraduationCap}
              title={t("teaching")}
              divider
              meta={
                <DashboardSectionCount>
                  {t("courseCount", { count: counts.courses })} &middot;{" "}
                  {t("activeGroupCount", { count: counts.activeGroups })}
                </DashboardSectionCount>
              }
            />

            {courses.length === 0 ? (
              <AdminEmptyState
                compact
                icon={GraduationCap}
                title={t("noCourses")}
                description={t("noCoursesDescription")}
                className="py-2"
              />
            ) : (
              <ul className="divide-y divide-border/30">
                {courses.map((course) => (
                  <li key={course.courseId}>
                    <Link href={`/tutor/${course.courseId}`} className={linkedRow}>
                      <div className="flex items-center justify-between gap-(--compact-gap)">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <p className="m-0 wrap-anywhere font-heading text-body-sm font-bold text-foreground transition-colors group-hover:text-primary">
                              {course.title}
                            </p>
                            {isVisibleCourseCode(course.code) && (
                              <span
                                className="shrink-0 text-body-xs font-medium uppercase tracking-wider text-muted-foreground"
                                translate="no"
                              >
                                {course.code}
                              </span>
                            )}
                          </div>
                          <p className="m-0 text-body-xs tabular-nums text-muted-foreground">
                            {t("relatedGroups", { count: course.groupCount })}
                          </p>
                        </div>
                        <ArrowUpRight
                          className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                          aria-hidden
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-8 lg:col-span-5 lg:border-l lg:border-border/35 lg:pl-10">
          <section className="min-w-0">
            <DashboardSectionHeading
              icon={MessageSquareWarning}
              title={t("attention")}
              divider
              meta={
                counts.pendingTickets > 0 ? (
                  <DashboardSectionCount tone="warning">
                    {t("pendingTicketCount", { count: counts.pendingTickets })}
                  </DashboardSectionCount>
                ) : null
              }
              actions={
                counts.pendingTickets > 0 ? (
                  <Link
                    href="/tutor/schedule?tab=tickets"
                    className="group inline-flex min-h-9 items-center gap-0.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span>{t("allSchedules")}</span>
                    <ArrowUpRight
                      className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                ) : null
              }
            />

            {pendingTickets.length === 0 ? (
              <AdminEmptyState
                compact
                icon={CheckCircle2}
                title={t("noPendingTickets")}
                className="py-2"
              />
            ) : (
              <ul className="divide-y divide-border/30">
                {pendingTickets.slice(0, 5).map((ticket) => (
                  <li key={ticket.id}>
                    <Link href="/tutor/schedule?tab=tickets" className={linkedRow}>
                      <p className="m-0 text-body-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {ticket.type === "cancellation"
                          ? t("cancellationRequest")
                          : t("rescheduleRequest")}
                      </p>
                      <p className="m-0 mt-1 wrap-anywhere text-body-xs text-muted-foreground">
                        {ticket.reason}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
