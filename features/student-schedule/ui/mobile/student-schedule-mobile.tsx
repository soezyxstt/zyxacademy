"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  getJakartaCalendarDate,
  type CalendarDate,
} from "@/lib/schedule/calendar-date";
import { canBookTutorialSlot } from "@/lib/schedule/week-policy";
import { cn } from "@/lib/utils";
import {
  filterStudentScheduleEvents,
  formatScheduleDateLabel,
  minutesToTime,
  normalizeStudentScheduleEvents,
  type StudentAgendaEvent,
  type StudentScheduleViewProps,
} from "@/features/student-schedule/model/schedule-events";

function getAgendaAccentClass(event: StudentAgendaEvent): string {
  if (event.locked) return "bg-muted-foreground";
  if (event.kind === "availability") return "bg-status-success";
  if (event.kind === "booking") return "bg-status-info";
  const type = event.source?.type;
  if (type === "official_exam") return "bg-status-warning";
  if (type === "tryout") return "bg-brand-secondary";
  if (type === "quiz") return "bg-tertiary-3";
  return "bg-brand-primary";
}

function getAgendaCardTone(event: StudentAgendaEvent): string {
  if (event.locked) {
    return "border-border/70 bg-muted/40 text-muted-foreground";
  }
  if (event.kind === "availability") {
    return "border-status-success/40 bg-status-success/5 text-foreground";
  }
  if (event.kind === "booking") {
    return "border-status-info/40 bg-status-info/5 text-foreground";
  }
  return "border-status-warning/40 bg-status-warning/5 text-foreground";
}

/**
 * Mobile student schedule view (<768px):
 * Sticky 7-day horizontal date strip with dot indicators + vertical agenda cards
 * + bottom Sheet for course/tutor filters.
 */
export function StudentScheduleMobile({
  loading,
  allowPastBooking,
  weekInfo,
  weekOffset,
  onWeekChange,
  coursesList,
  tutorsList,
  initialCourseFilter,
  compatibleCourseIds,
  slots,
  bookings,
  academicSchedules,
  toolbarControls,
  onSelectSlotToBook,
  onOpenSessionDetail,
  onEditSchedule,
}: StudentScheduleViewProps) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const [now, setNow] = useState(() => new Date());
  const today = getJakartaCalendarDate(now);

  const defaultSelectedDate = useMemo<CalendarDate>(() => {
    const todayInWeek = weekInfo.days.find((day) => day.isToday);
    return (todayInWeek?.dateIso ?? weekInfo.days[0]?.dateIso ?? today) as CalendarDate;
  }, [weekInfo.days, today]);

  const [selectedDate, setSelectedDate] = useState<CalendarDate>(defaultSelectedDate);
  const [courseFilter, setCourseFilter] = useState(initialCourseFilter || "all");
  const [tutorFilter, setTutorFilter] = useState("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    setCourseFilter(initialCourseFilter || "all");
  }, [initialCourseFilter]);

  useEffect(() => {
    const inCurrentWeek = weekInfo.days.some((day) => day.dateIso === selectedDate);
    if (!inCurrentWeek) {
      setSelectedDate(defaultSelectedDate);
    }
  }, [defaultSelectedDate, selectedDate, weekInfo.days]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(timer);
  }, [now]);

  const normalizedEvents = useMemo(
    () =>
      normalizeStudentScheduleEvents({
        slots,
        bookings,
        academicSchedules,
        allowPastBooking,
        now,
        labels: {
          tutorFallback: t("session.tutorFallback"),
          tutorLabel: t("audit.tutor"),
          cancelled: t("session.status.cancelled"),
          sessionTitle: t("session.title"),
          academicTypeLabel: (type) => t(`academic.types.${type}`),
        },
      }),
    [academicSchedules, allowPastBooking, bookings, now, slots, t]
  );

  const filteredEvents = useMemo(
    () =>
      filterStudentScheduleEvents({
        events: normalizedEvents,
        courseFilter,
        tutorFilter,
        compatibleCourseIds,
      }),
    [compatibleCourseIds, courseFilter, normalizedEvents, tutorFilter]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, StudentAgendaEvent[]>();
    for (const event of filteredEvents) {
      const existing = map.get(event.dateIso);
      if (existing) existing.push(event);
      else map.set(event.dateIso, [event]);
    }
    return map;
  }, [filteredEvents]);

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];
  const hasActiveFilter = courseFilter !== "all" || tutorFilter !== "all";

  const weekRangeLabel = `${formatScheduleDateLabel(
    weekInfo.startOfWeekIso as CalendarDate,
    { day: "numeric", month: "short" },
    locale
  )} - ${formatScheduleDateLabel(
    weekInfo.endOfWeekIso as CalendarDate,
    { day: "numeric", month: "short", year: "numeric" },
    locale
  )}`;

  const selectedDayHeading = formatScheduleDateLabel(
    selectedDate,
    { weekday: "long", day: "numeric", month: "long" },
    locale
  );

  const handleOpenEvent = (event: StudentAgendaEvent) => {
    if (event.kind === "availability") {
      if (allowPastBooking || canBookTutorialSlot(event.dateIso, event.source.startTime, now)) {
        onSelectSlotToBook(event.source, event.dateIso);
      }
      return;
    }
    if (event.kind === "academic") {
      onEditSchedule(event.source);
      return;
    }
    onOpenSessionDetail(event.source);
  };

  return (
    <div className="flex w-full min-w-0 flex-col space-y-3" aria-busy={loading}>
      {/* Sticky week controls + 7-day horizontal date strip */}
      <div className="sticky top-(--mobile-navbar-height,0px) z-20 -mx-4 border-b border-border/70 bg-background/95 px-4 pb-2.5 pt-1 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => onWeekChange(weekOffset - 1)}
              aria-label={t("calendar.previousRange")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="truncate font-heading text-body-sm font-semibold text-foreground">
              {weekRangeLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => onWeekChange(weekOffset + 1)}
              aria-label={t("calendar.nextRange")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {toolbarControls}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => {
                if (weekOffset !== 0) onWeekChange(0);
                setSelectedDate(today);
              }}
              aria-label={t("calendar.today")}
            >
              <CalendarCheck2 className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative size-9 shrink-0"
              onClick={() => setFilterSheetOpen(true)}
              aria-label={t("calendar.filter")}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {hasActiveFilter ? (
                <span
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-xs bg-brand-primary"
                  aria-hidden
                />
              ) : null}
            </Button>
          </div>
        </div>

        {/* 7-day horizontal date strip */}
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label={weekRangeLabel}>
          {weekInfo.days.map((day) => {
            const isSelected = day.dateIso === selectedDate;
            const dayEvents = eventsByDate.get(day.dateIso) ?? [];
            const hasBooking = dayEvents.some((e) => e.kind === "booking");
            const hasAvailable = dayEvents.some((e) => e.kind === "availability" && !e.locked);
            const hasAcademic = dayEvents.some((e) => e.kind === "academic");
            const shortWeekday = formatScheduleDateLabel(
              day.dateIso as CalendarDate,
              { weekday: "short" },
              locale
            );

            return (
              <button
                key={day.dateIso}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={formatScheduleDateLabel(
                  day.dateIso as CalendarDate,
                  { weekday: "long", day: "numeric", month: "short" },
                  locale
                )}
                onClick={() => setSelectedDate(day.dateIso as CalendarDate)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                    : day.isToday
                      ? "border-border bg-muted/50 text-foreground"
                      : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/40"
                )}
              >
                <span className="text-body-2xs font-medium uppercase leading-none">
                  {shortWeekday.slice(0, 3)}
                </span>
                <span className="text-body-sm font-semibold tabular-nums leading-tight">
                  {day.dayOfMonth}
                </span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                  {hasBooking ? <span className="size-1.5 rounded-xs bg-status-info" /> : null}
                  {hasAvailable ? <span className="size-1.5 rounded-xs bg-status-success" /> : null}
                  {hasAcademic ? <span className="size-1.5 rounded-xs bg-status-warning" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Heading */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <h2 className="font-heading text-body-sm font-semibold text-foreground">
          {selectedDayHeading}
        </h2>
        <span className="text-body-xs font-medium tabular-nums text-muted-foreground">
          {selectedDayEvents.length === 0
            ? t("calendar.zeroSessions")
            : `${selectedDayEvents.length}`}
        </span>
      </div>

      {/* Vertical Agenda Cards */}
      {selectedDayEvents.length > 0 ? (
        <div className="space-y-2.5">
          {selectedDayEvents.map((event) => {
            const interactive = !(event.kind === "availability" && event.locked);
            const timeLabel = event.allDay
              ? t("calendar.allDay")
              : `${minutesToTime(event.startMinutes)} - ${minutesToTime(event.endMinutes)} WIB`;
            const kindLabel =
              event.kind === "availability"
                ? t("calendar.availableSlots")
                : event.kind === "booking"
                  ? t("calendar.scheduledSessions")
                  : t("calendar.academicSchedules");

            return (
              <div
                key={event.id}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => handleOpenEvent(event) : undefined}
                onKeyDown={
                  interactive
                    ? (keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          handleOpenEvent(event);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "relative overflow-hidden rounded-xl border py-3 pl-3.5 pr-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  getAgendaCardTone(event),
                  interactive && "cursor-pointer active:bg-muted/60"
                )}
              >
                <span
                  className={cn("absolute inset-y-0 left-0 w-1", getAgendaAccentClass(event))}
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-body-xs font-semibold tabular-nums text-foreground">
                        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {timeLabel}
                      </span>
                      <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-body-2xs font-medium text-muted-foreground">
                        {kindLabel}
                      </span>
                    </div>

                    <p className="break-words font-heading text-body-sm font-semibold text-foreground">
                      {event.title}
                    </p>

                    {event.subtitle ? (
                      <p className="break-words text-body-xs text-muted-foreground">
                        {event.subtitle}
                      </p>
                    ) : null}

                    {event.meta ? (
                      <p className="line-clamp-2 break-words text-body-xs text-muted-foreground">
                        {event.meta}
                      </p>
                    ) : null}

                    {(event.mode || event.location) ? (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-body-xs text-muted-foreground">
                        {event.mode === "online" ? (
                          <span className="inline-flex items-center gap-1">
                            <Video className="size-3.5" aria-hidden />
                            {t("session.online")}
                          </span>
                        ) : null}
                        {event.mode === "offline" ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {t("calendar.offline")}
                          </span>
                        ) : null}
                        {event.location ? (
                          <span className="break-words">{event.location}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {interactive ? (
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-4 py-8 text-center">
          <CalendarDays className="mb-2 size-7 text-muted-foreground/60" aria-hidden />
          <p className="text-body-sm font-medium text-foreground">{t("calendar.zeroSessions")}</p>
        </div>
      )}

      {/* Bottom Sheet for Course & Tutor Filters + Legend */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
          aria-describedby={undefined}
        >
          <SheetHeader className="border-b border-border/70 pb-3 text-left">
            <SheetTitle className="font-heading text-body-base font-semibold">
              {t("calendar.filter")}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="block text-body-sm font-semibold text-foreground">
                {t("academic.course")}
              </label>
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="min-h-11 w-full text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-body-sm">
                    {t("calendar.allCourses")}
                  </SelectItem>
                  {coursesList.map((course) => (
                    <SelectItem key={course.id} value={course.id} className="text-body-sm">
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tutorsList.length > 0 ? (
              <div className="space-y-1.5">
                <label className="block text-body-sm font-semibold text-foreground">
                  {t("audit.tutor")}
                </label>
                <Select value={tutorFilter} onValueChange={setTutorFilter}>
                  <SelectTrigger className="min-h-11 w-full text-body-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-body-sm">
                      {t("calendar.allTutors")}
                    </SelectItem>
                    {tutorsList.map((tutor) => (
                      <SelectItem key={tutor.id} value={tutor.id} className="text-body-sm">
                        {tutor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5 border-t border-border/60 pt-3">
              <p className="text-body-xs font-semibold text-foreground">{t("calendar.legend")}</p>
              <div className="grid grid-cols-2 gap-1.5 text-body-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-xs bg-status-success" />
                  {t("calendar.availableSlots")}
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-xs bg-status-info" />
                  {t("calendar.scheduledSessions")}
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-xs bg-status-warning" />
                  {t("calendar.academicSchedules")}
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-xs bg-muted-foreground" />
                  {t("calendar.completedOrPast")}
                </p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
