"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarRange, Video } from "lucide-react";
import { GoogleCalendarControl } from "@/components/schedule/google-calendar-control";
import { Button } from "@/components/ui/button";
import { useMobilePageActions } from "@/components/navigation/mobile-chrome-context";
import { MOBILE_TOP_NAV_ICON_BUTTON_CLASS } from "@/components/navigation/mobile-top-navbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getJakartaCalendarDate } from "@/lib/date-utils";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type CalendarEventItem = {
  id: string;
  title: string;
  courseTitle: string;
  category: "quiz" | "tryout" | "tutorial";
  categoryLabel: "quiz" | "quizSimulation" | "tryout" | "exam" | "tutorialGroup";
  dateValue: string;
  timeKind: "deadline" | "opens" | "time" | "range";
  scheduledRange?: string;
  tutorialTopic?: string | null;
  tutorName?: string | null;
  actionUrl: string;
  meetUrl?: string | null;
  cancelled?: boolean;
  status: "upcoming" | "today" | "past";
};

const CALENDAR_FILTERS = {
  all: "calendar.filterAll",
  quiz_tryout: "calendar.filterAssessments",
  tutorial: "calendar.filterTutorial",
} as const;

export function CalendarAgendaClient({
  events,
  canSync = true,
}: {
  events: CalendarEventItem[];
  canSync?: boolean;
}) {
  const t = useTranslations("student");
  const [filter, setFilter] = useState<keyof typeof CALENDAR_FILTERS>("all");
  const scheduleLabel = t("calendar.manageTutorialSlots");
  const actions = useMemo(() => (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-lg" className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}>
              <Link href="/dashboard/schedule" aria-label={scheduleLabel}><CalendarRange aria-hidden /></Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{scheduleLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {canSync && <GoogleCalendarControl className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS} />}
    </>
  ), [canSync, scheduleLabel]);
  const actionsInNavbar = useMobilePageActions(actions);

  const filteredEvents = events.filter((event) => {
    if (filter === "quiz_tryout") return event.category !== "tutorial";
    if (filter === "tutorial") return event.category === "tutorial";
    return true;
  });
  const activeEvents = filteredEvents.filter((event) => event.status !== "past");
  const pastEvents = filteredEvents.filter((event) => event.status === "past");

  return (
    <div className="space-y-(--group-gap)">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/55 pb-1">
        <Select value={filter} onValueChange={(value) => setFilter(value as keyof typeof CALENDAR_FILTERS)}>
          <SelectTrigger variant="inline" aria-label={t("calendar.eventCategory")} className="h-8 pl-0 pr-2">
            <SelectValue>{t(CALENDAR_FILTERS[filter])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CALENDAR_FILTERS).map(([value, key]) => (
              <SelectItem key={value} value={value}>{t(key)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!actionsInNavbar && <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" className="h-8 px-2">
            <Link href="/dashboard/schedule">{scheduleLabel}</Link>
          </Button>
          {canSync && <GoogleCalendarControl />}
        </div>}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="space-y-3 px-4 py-8 text-center">
          <CalendarDays className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-body-base font-bold">
            {t(events.length > 0 ? "calendar.emptyFiltered" : "calendar.emptyTitle")}
          </h2>
          {events.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
              {t("calendar.filterAll")}
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href="/courses">{t("calendar.exploreCourses")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {activeEvents.length > 0 && <AgendaSection title={t("calendar.upcoming")} events={activeEvents} />}
          {pastEvents.length > 0 && <AgendaSection title={t("calendar.past")} events={pastEvents} />}
        </div>
      )}
    </div>
  );
}

function AgendaSection({ title, events }: { title: string; events: CalendarEventItem[] }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const formatDate = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  });
  const byDay = new Map<string, CalendarEventItem[]>();
  for (const event of events) {
    const day = getJakartaCalendarDate(new Date(event.dateValue));
    const group = byDay.get(day);
    if (group) group.push(event);
    else byDay.set(day, [event]);
  }

  return (
    <section className="space-y-4">
      <h2 className="font-heading text-body-base font-bold">{title}</h2>
      {Array.from(byDay, ([day, group]) => (
        <div key={day}>
          <h3 className="border-b border-border/60 pb-2 text-body-xs font-semibold text-muted-foreground">
            {group.some((event) => event.status === "today") && (
              <span className="text-foreground">{t("calendar.today")} <span aria-hidden>· </span></span>
            )}
            <time dateTime={day}>{formatDate.format(new Date(group[0].dateValue))}</time>
          </h3>
          <ul className="divide-y divide-border/60">
            {group.map((event) => <AgendaRow key={event.id} event={event} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

function AgendaRow({ event }: { event: CalendarEventItem }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta",
  }).format(new Date(event.dateValue));
  const timeLabel = event.timeKind === "range" && event.scheduledRange
    ? t("calendar.scheduledRange", { range: event.scheduledRange })
    : t(event.timeKind === "opens" ? "calendar.opensAt" : event.timeKind === "deadline" ? "calendar.deadline" : "calendar.timeWib", { time });
  const tutorial = event.category === "tutorial";
  const title = tutorial
    ? event.tutorialTopic
      ? t("calendar.tutorialWithTopic", { topic: event.tutorialTopic })
      : t("calendar.tutorialWithTutor", { name: event.tutorName || t("schedule.tutorFallback") })
    : event.title;
  const detailsOnly = event.timeKind === "opens" || event.status === "past";
  const actionLabel = tutorial
    ? t("calendar.tutorialSchedule")
    : event.category === "quiz"
      ? t(detailsOnly ? "calendar.viewQuiz" : "calendar.doQuiz")
      : t(detailsOnly ? "calendar.viewTryout" : "calendar.openTryout");

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3.5">
      <div className="min-w-0">
        <h4 className={cn("font-heading text-body-sm font-bold break-words", event.status === "past" && "text-muted-foreground")}>
          {title}
        </h4>
        <p className="mt-0.5 text-body-xs text-muted-foreground break-words">
          {event.courseTitle} · {t(`calendar.${event.categoryLabel}`)}
        </p>
        <p className={cn("mt-1 text-body-xs font-medium", event.status === "past" && "text-muted-foreground")}>
          <time dateTime={event.dateValue}>{timeLabel}</time>
          {event.cancelled && <> · {t("calendar.cancelled")}</>}
        </p>
      </div>
      <div className="flex max-w-36 flex-col items-end gap-1 self-center sm:max-w-none">
        <Button
          asChild
          variant={event.status === "past" || event.timeKind === "opens" || event.meetUrl ? "ghost" : "outline"}
          className="h-auto min-h-8 px-2 text-right whitespace-normal"
        >
          <Link href={event.actionUrl}>{actionLabel}</Link>
        </Button>
        {event.meetUrl && (
          <Button asChild variant="outline" className="h-8 px-2">
            <a href={event.meetUrl} target="_blank" rel="noopener noreferrer">
              <Video className="size-3.5" aria-hidden />
              Google Meet
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}
