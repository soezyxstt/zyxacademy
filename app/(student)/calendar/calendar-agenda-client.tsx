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
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

import type { CalendarEventItem } from "@/lib/student/agenda-contract";
import { calendarFilters, describeAgendaEvent, formatAgendaDay, groupCalendarEvents, type CalendarFilter } from "@/lib/student/agenda-presentation";
export type { CalendarEventItem } from "@/lib/student/agenda-contract";

export function CalendarAgendaClient({
  events,
  canSync = true,
}: {
  events: CalendarEventItem[];
  canSync?: boolean;
}) {
  const t = useTranslations("student");
  const [filter, setFilter] = useState<CalendarFilter>("all");
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

  const { active, past } = groupCalendarEvents(events, filter);

  return (
    <div className="space-y-(--group-gap)">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/55 pb-1">
        <Select value={filter} onValueChange={(value) => setFilter(value as CalendarFilter)}>
          <SelectTrigger variant="inline" aria-label={t("calendar.eventCategory")} className="h-8 pl-0 pr-2">
            <SelectValue>{t(`calendar.${calendarFilters[filter]}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(calendarFilters).map(([value, key]) => (
              <SelectItem key={value} value={value}>{t(`calendar.${key}`)}</SelectItem>
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

      {active.length === 0 && past.length === 0 ? (
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
          {active.length > 0 && <AgendaSection title={t("calendar.upcoming")} groups={active} />}
          {past.length > 0 && <AgendaSection title={t("calendar.past")} groups={past} />}
        </div>
      )}
    </div>
  );
}

function AgendaSection({ title, groups }: { title: string; groups: ReturnType<typeof groupCalendarEvents>["active"] }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();

  return (
    <section className="space-y-4">
      <h2 className="font-heading text-body-base font-bold">{title}</h2>
      {groups.map(({ day, events }) => (
        <div key={day}>
          <h3 className="border-b border-border/60 pb-2 text-body-xs font-semibold text-muted-foreground">
            {events.some((event) => event.status === "today") && (
              <span className="text-foreground">{t("calendar.today")} <span aria-hidden>· </span></span>
            )}
            <time dateTime={day}>{formatAgendaDay(events[0].dateValue, locale)}</time>
          </h3>
          <ul className="divide-y divide-border/60">
            {events.map((event) => <AgendaRow key={event.id} event={event} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

function AgendaRow({ event }: { event: CalendarEventItem }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const description = describeAgendaEvent(event, locale);
  const timeLabel = t(`calendar.${description.timeLabel.key}`, description.timeLabel.values);
  const tutorial = event.category === "tutorial";
  const title = tutorial
    ? event.tutorialTopic
      ? t("calendar.tutorialWithTopic", { topic: event.tutorialTopic })
      : t("calendar.tutorialWithTutor", { name: event.tutorName || t("schedule.tutorFallback") })
    : event.title;
  const actionLabel = t(`calendar.${description.actionLabel}`);

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
          variant={description.quietAction ? "ghost" : "outline"}
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
