"use client";

import Link from "next/link";
import { BookOpen, Clock3, MessageSquareWarning } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import {
  formatTutorSessionDate,
  type TutorDashboardViewProps,
} from "@/features/tutor-dashboard/model/types";

const sectionTitle = "font-heading text-body-base font-bold text-foreground";
const sectionMeta = "text-body-xs tabular-nums text-muted-foreground";
const linkedRow = "block min-h-11 min-w-0 rounded-md py-(--row-padding) transition-colors hover:bg-muted/35 active:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring";

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
      <div className="grid items-start gap-y-(--major-gap) xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-x-10">
        <section className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-(--related-gap) gap-y-1">
            <h2 className={sectionTitle}>{t("upcomingSessions")}</h2>
            <Link
              href="/tutor/schedule"
              className="inline-flex min-h-9 items-center text-body-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("allSchedules")}
            </Link>
          </div>
          <p className={sectionMeta}>{t("weeklySessionCount", { count: counts.sessionsThisWeek })}</p>

          {upcomingSessions.length === 0 ? (
            <AdminEmptyState
              icon={Clock3}
              title={t("noUpcoming")}
              action={
                <Button asChild variant="outline" size="sm" className="min-h-10 whitespace-normal">
                  <Link href="/tutor/schedule">{t("addSlot")}</Link>
                </Button>
              }
              className="py-(--related-gap)"
            />
          ) : (
            <ul className="mt-1 divide-y divide-border/30">
              {upcomingSessions.map((booking) => (
                <li key={booking.id}>
                  <Link href="/tutor/schedule?tab=sessions" className={linkedRow}>
                    <div className="flex items-start justify-between gap-(--compact-gap)">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="m-0 wrap-anywhere text-body-sm font-semibold text-foreground">
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

        <section className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-(--related-gap) gap-y-1">
            <h2 className={sectionTitle}>{t("attention")}</h2>
            {counts.pendingTickets > 0 && (
              <Link
                href="/tutor/schedule?tab=tickets"
                className="inline-flex min-h-9 items-center text-body-xs tabular-nums text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("pendingTicketCount", { count: counts.pendingTickets })}
              </Link>
            )}
          </div>

          {pendingTickets.length === 0 ? (
            <AdminEmptyState
              icon={MessageSquareWarning}
              title={t("noPendingTickets")}
              className="py-(--related-gap)"
            />
          ) : (
            <ul className="divide-y divide-border/30">
              {pendingTickets.slice(0, 5).map((ticket) => (
                <li key={ticket.id}>
                  <Link href="/tutor/schedule?tab=tickets" className={linkedRow}>
                    <p className="m-0 text-body-sm font-semibold text-foreground">
                      {ticket.type === "cancellation" ? t("cancellationRequest") : t("rescheduleRequest")}
                    </p>
                    <p className="m-0 mt-1 wrap-anywhere text-body-xs text-muted-foreground">{ticket.reason}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 xl:col-start-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-(--related-gap) gap-y-1">
            <h2 className={sectionTitle}>{t("teaching")}</h2>
            <p className={sectionMeta}>
              {t("courseCount", { count: counts.courses })} &middot; {t("activeGroupCount", { count: counts.activeGroups })}
            </p>
          </div>

          {courses.length === 0 ? (
            <AdminEmptyState
              icon={BookOpen}
              title={t("noCourses")}
              description={t("noCoursesDescription")}
              className="py-(--related-gap)"
            />
          ) : (
            <ul className="divide-y divide-border/30">
              {courses.map((course) => (
                <li key={course.courseId}>
                  <Link href={`/tutor/${course.courseId}`} className={linkedRow}>
                    <div className="flex items-start justify-between gap-(--compact-gap)">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="m-0 wrap-anywhere text-body-sm font-semibold text-foreground">{course.title}</p>
                        {course.code && (
                          <p className="m-0 wrap-anywhere text-body-xs text-muted-foreground" translate="no">{course.code}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-right text-body-xs tabular-nums text-muted-foreground">
                        {t("relatedGroups", { count: course.groupCount })}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
