"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Users,
  Clock,
  ArrowRight,
  Video,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

export type CalendarEventItem = {
  id: string;
  title: string;
  courseTitle: string;
  category: "quiz" | "tryout" | "tutorial";
  categoryLabel: string;
  dateStr: string;
  timeStr: string;
  dateValue?: string;
  timeValue?: string;
  timeKind?: "deadline" | "available" | "time" | "range" | "scheduled";
  scheduledRange?: string;
  tutorialTopic?: string | null;
  tutorName?: string | null;
  actionUrl: string;
  actionLabel: string;
  isOnlineMeet?: boolean;
  meetUrl?: string | null;
  status: "upcoming" | "today" | "past";
};

export function CalendarAgendaClient({
  events,
}: {
  events: CalendarEventItem[];
}) {
  const t = useTranslations("student");
  const [filter, setFilter] = useState<"all" | "quiz_tryout" | "tutorial">("all");

  const filteredEvents = events.filter((ev) => {
    if (filter === "quiz_tryout") return ev.category === "quiz" || ev.category === "tryout";
    if (filter === "tutorial") return ev.category === "tutorial";
    return true;
  });

  const upcomingEvents = filteredEvents.filter((e) => e.status === "today" || e.status === "upcoming");
  const pastEvents = filteredEvents.filter((e) => e.status === "past");

  return (
    <div className="space-y-6">
      {/* Category filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "all"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t("calendar.filterAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setFilter("quiz_tryout")}
            aria-pressed={filter === "quiz_tryout"}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "quiz_tryout"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t("calendar.filterAssessments")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setFilter("tutorial")}
            aria-pressed={filter === "tutorial"}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "tutorial"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t("calendar.filterTutorial")}
          </Button>
        </div>

        <Link
          href="/dashboard/schedule"
          className="text-body-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
        >
          {t("calendar.manageTutorialSlots")}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Events list */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Calendar className="size-6" />
          </div>
          <h3 className="font-heading text-body-base font-bold text-foreground">
            {t("calendar.emptyTitle")}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
            {t("calendar.emptyDescription")}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Button asChild size="sm" className="rounded-lg text-body-sm">
              <Link href="/courses">{t("calendar.exploreCourses")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
              <Link href="/dashboard/schedule">{t("calendar.tutorialSchedule")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming / Today Section */}
          {upcomingEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                <Clock className="size-4 text-brand-primary" />
                {t("calendar.upcoming")}
              </h2>
              <div className="divide-y divide-border/60">
                {upcomingEvents.map((item) => (
                  <EventCard key={item.id} event={item} />
                ))}
              </div>
            </div>
          )}

          {/* Past Events Section */}
          {pastEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                {t("calendar.past")}
              </h2>
              <div className="divide-y divide-border/60">
                {pastEvents.map((item) => (
                  <EventCard key={item.id} event={item} isPast />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  isPast = false,
}: {
  event: CalendarEventItem;
  isPast?: boolean;
}) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const dateLabel = event.dateValue
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(event.dateValue))
    : event.dateStr;
  const timeValueLabel = event.timeValue
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(event.timeValue))
    : null;
  const timeLabel = event.timeKind === "deadline" && timeValueLabel
    ? t("calendar.deadline", { time: timeValueLabel })
    : event.timeKind === "available"
      ? t("calendar.available")
      : event.timeKind === "time" && timeValueLabel
        ? t("calendar.timeWib", { time: timeValueLabel })
        : event.timeKind === "range" && event.scheduledRange
          ? t("calendar.scheduledRange", { range: event.scheduledRange })
          : event.timeKind === "scheduled"
            ? t("calendar.scheduled")
            : event.timeStr;
  const categoryIcon = {
    quiz: ClipboardList,
    tryout: GraduationCap,
    tutorial: Users,
  }[event.category];

  const IconComponent = categoryIcon || CalendarDays;

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center justify-between gap-3 py-3",
        event.status === "today"
          ? "border-l-2 border-primary pl-3"
          : "hover:bg-muted/20",
        isPast && "text-muted-foreground"
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              event.category === "tutorial"
                ? "bg-muted text-foreground"
                : "bg-muted text-foreground"
            )}
          >
            <IconComponent className="size-3" />
            {event.category === "tutorial"
              ? t("calendar.tutorialGroup")
              : event.category === "quiz"
                ? event.categoryLabel === "Simulasi" ? t("calendar.quizSimulation") : t("calendar.quiz")
                : event.categoryLabel === "Tryout" ? t("calendar.tryout") : t("calendar.exam")}
          </span>

          <span className="text-body-xs font-medium text-muted-foreground">
            {dateLabel}
          </span>
        </div>

        <h3 className="mt-1.5 font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words">
          {event.category === "tutorial"
            ? event.tutorialTopic
              ? t("calendar.tutorialWithTopic", { topic: event.tutorialTopic })
              : t("calendar.tutorialWithTutor", { name: event.tutorName || t("schedule.tutorFallback") })
            : event.title}
        </h3>

        <p className="mt-1 text-body-xs text-muted-foreground break-words">
          {event.courseTitle}
        </p>

        <div className="mt-1 flex items-center gap-2 text-body-xs font-medium text-foreground">
          <Clock className="size-3.5 text-muted-foreground shrink-0" />
          <span>{timeLabel}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        {event.isOnlineMeet && event.meetUrl && (
          <a
            href={event.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-body-xs font-semibold text-status-success hover:underline"
          >
            <Video className="size-3.5" />
            Google Meet
          </a>
        )}

        <Button
          asChild
          size="sm"
          variant={event.status === "today" ? "default" : "outline"}
          className="ml-auto rounded-md text-body-sm h-8 px-3"
        >
          <Link href={event.actionUrl}>
            {event.category === "tutorial"
              ? t("calendar.viewDetails")
              : event.category === "quiz"
                ? isPast ? t("calendar.reviewQuiz") : t("calendar.doQuiz")
                : isPast ? t("calendar.reviewTryout") : t("calendar.openTryout")}
            <ArrowRight className="ml-1 size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
