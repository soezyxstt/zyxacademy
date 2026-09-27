"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  MapPin,
  SlidersHorizontal,
  Trash2,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addCalendarDays,
  addCalendarMonths,
  diffCalendarDays,
  getCalendarDayIndex,
  getCalendarMonthRange,
  getCalendarWeekRange,
  getJakartaCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/lib/schedule/calendar-date";

const START_HOUR = 7;
const END_HOUR = 24;
const HOUR_HEIGHT = 64;
const START_MINUTES = START_HOUR * 60;
const END_MINUTES = END_HOUR * 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
const DAY_LABELS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

export type ScheduleCalendarProps = {
  role: "student" | "teacher" | "admin";
  adminMode?: "all" | "academic" | "tutorial";
  currentUserId: string;
  weekInfo: {
    startOfWeekIso: string;
    endOfWeekIso: string;
    mondayDate: Date;
    days: Array<{
      dateIso: string;
      dayName: string;
      dayOfMonth: number;
      monthName: string;
      isToday: boolean;
      isPast: boolean;
    }>;
  };
  isWeekLocked: boolean;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  coursesList: Array<{ id: string; title: string }>;
  tutorsList?: Array<{ id: string; name: string }>;
  groupsList?: Array<{ id: string; name: string }>;
  slots: any[];
  bookings: any[];
  academicSchedules?: any[];
  onSelectSlotToBook?: (slot: any, dateIso: string) => void;
  onCreateScheduleDirect?: (dateIso: string, startTimeStr?: string, endTimeStr?: string) => void;
  onOpenPreSession?: (booking: any) => void;
  onOpenPostSession?: (booking: any) => void;
  onOpenRescheduleTicket?: (booking: any) => void;
  onOpenAuditLog?: (booking: any) => void;
  onEditSchedule?: (schedule: any) => void;
  onDeleteSchedule?: (schedule: any) => void;
  onMoveSession?: (booking: any) => void;
  onDeleteSlot?: (slotId: string) => void;
  onAssignTutorialSlot?: (slot: any) => void;
  onOpenSessionDetail?: (booking: any) => void;
  initialCourseFilter?: string;
};

type CalendarViewMode = "day" | "week" | "month";
type EventKind = "availability" | "booking" | "academic";

type CalendarEvent = {
  id: string;
  kind: EventKind;
  dateIso: CalendarDate;
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  mode?: "online" | "offline" | string | null;
  location?: string | null;
  courseId?: string | null;
  tutorId?: string | null;
  locked?: boolean;
  allDay?: boolean;
  source: any;
};

type PositionedEvent = CalendarEvent & {
  lane: number;
  laneCount: number;
};

function timeToMinutes(value?: string | null): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return START_MINUTES;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(value: number): string {
  const bounded = Math.max(0, Math.min(24 * 60, value));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatCalendarDateLabel(dateIso: CalendarDate, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = parseCalendarDate(dateIso);
  return new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)),
  );
}

function getJakartaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function parseAcademicInstant(value: unknown): { dateIso: CalendarDate; minutes: number } | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateIso = `${values.year}-${values.month}-${values.day}` as CalendarDate;
  return {
    dateIso,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function academicTypeLabel(type?: string | null): string {
  if (type === "official_exam") return "Ujian ITB";
  if (type === "tryout") return "Tryout";
  if (type === "quiz") return "Kuis";
  return "Akademik";
}

function eventTone(event: CalendarEvent): string {
  if (event.locked) {
    return "border-zinc-500/60 bg-zinc-500/10 text-muted-foreground";
  }
  if (event.kind === "availability") {
    return "border-emerald-500/70 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
  }
  if (event.kind === "booking") {
    return "border-indigo-500/70 bg-indigo-500/10 text-indigo-950 dark:text-indigo-100";
  }
  const type = event.source?.type;
  if (type === "official_exam") return "border-amber-500/80 bg-amber-500/15 text-amber-950 dark:text-amber-100";
  if (type === "tryout") return "border-violet-500/70 bg-violet-500/10 text-violet-950 dark:text-violet-100";
  if (type === "quiz") return "border-sky-500/70 bg-sky-500/10 text-sky-950 dark:text-sky-100";
  return "border-brand-primary/60 bg-brand-primary/10 text-foreground";
}

function eventAccent(event: CalendarEvent): string {
  if (event.locked) return "bg-zinc-500";
  if (event.kind === "availability") return "bg-emerald-500";
  if (event.kind === "booking") return "bg-indigo-500";
  if (event.source?.type === "official_exam") return "bg-amber-500";
  if (event.source?.type === "tryout") return "bg-violet-500";
  if (event.source?.type === "quiz") return "bg-sky-500";
  return "bg-brand-primary";
}

function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const result: PositionedEvent[] = [];
  let group: CalendarEvent[] = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    const laneEnds: number[] = [];
    const staged: Array<{ event: CalendarEvent; lane: number }> = [];
    for (const event of group) {
      let lane = laneEnds.findIndex((end) => end <= event.startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(event.endMinutes);
      } else {
        laneEnds[lane] = event.endMinutes;
      }
      staged.push({ event, lane });
    }
    const laneCount = Math.max(1, laneEnds.length);
    result.push(...staged.map(({ event, lane }) => ({ ...event, lane, laneCount })));
    group = [];
    groupEnd = -1;
  };

  for (const event of sorted) {
    if (group.length > 0 && event.startMinutes >= groupEnd) flush();
    group.push(event);
    groupEnd = Math.max(groupEnd, event.endMinutes);
  }
  flush();
  return result;
}

function MonthPicker({
  value,
  viewMode,
  onSelect,
}: {
  value: CalendarDate;
  viewMode: CalendarViewMode;
  onSelect: (dateIso: CalendarDate) => void;
}) {
  const [cursor, setCursor] = useState<CalendarDate>(() => getCalendarMonthRange(value).startIso);

  useEffect(() => {
    setCursor(getCalendarMonthRange(value).startIso);
  }, [value]);

  const monthRange = getCalendarMonthRange(cursor);
  const firstDay = getCalendarDayIndex(monthRange.startIso);
  const mondayOffset = (firstDay + 6) % 7;
  const gridStart = addCalendarDays(monthRange.startIso, -mondayOffset);
  const selectedWeek = getCalendarWeekRange(value);
  const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
  const today = getJakartaCalendarDate();
  const cursorParts = parseCalendarDate(cursor);

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] p-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setCursor(addCalendarMonths(cursor, -1))} aria-label="Bulan sebelumnya">
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-heading text-body-sm font-semibold">
          {formatCalendarDateLabel(cursor, { month: "long", year: "numeric" })}
        </p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setCursor(addCalendarMonths(cursor, 1))} aria-label="Bulan berikutnya">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground">
        {["S", "S", "R", "K", "J", "S", "M"].map((label, index) => (
          <div key={`${label}-${index}`} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((dateIso) => {
          const parts = parseCalendarDate(dateIso);
          const isCurrentMonth = parts.month === cursorParts.month;
          const selected = viewMode === "week"
            ? dateIso >= selectedWeek.startIso && dateIso <= selectedWeek.endIso
            : viewMode === "month"
              ? parts.month === parseCalendarDate(value).month && parts.year === parseCalendarDate(value).year
              : dateIso === value;
          const isToday = dateIso === today;
          return (
            <button
              key={dateIso}
              type="button"
              onClick={() => onSelect(dateIso)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-md text-body-xs transition-colors hover:bg-muted",
                !isCurrentMonth && "text-muted-foreground/45",
                selected && "bg-brand-primary/10 text-brand-primary",
                dateIso === value && "font-bold ring-1 ring-brand-primary/60",
                isToday && "after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-brand-primary",
              )}
            >
              {parts.day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(today)}>Hari ini</Button>
      </div>
    </div>
  );
}

function EventCard({
  event,
  compact = false,
  onOpen,
  onDeleteSlot,
}: {
  event: CalendarEvent;
  compact?: boolean;
  onOpen?: () => void;
  onDeleteSlot?: (slotId: string) => void;
}) {
  const interactive = Boolean(onOpen);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(eventKey) => {
        if (interactive && (eventKey.key === "Enter" || eventKey.key === " ")) {
          eventKey.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "group relative h-full min-h-10 overflow-hidden rounded-md border pl-2 pr-1.5 py-1.5 text-left shadow-xs",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        eventTone(event),
        interactive && "cursor-pointer hover:brightness-[1.04]",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", eventAccent(event))} aria-hidden />
      <div className="flex h-full min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-start gap-1">
          <p className={cn("min-w-0 flex-1 break-words font-semibold leading-tight", compact ? "text-[10px]" : "text-[11px]")}>{event.title}</p>
          {event.kind === "availability" && onDeleteSlot && !event.locked ? (
            <button
              type="button"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onDeleteSlot(event.source.id);
              }}
              className="shrink-0 rounded p-0.5 text-current/65 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-white/10"
              aria-label="Hapus slot"
            >
              <Trash2 className="size-3" />
            </button>
          ) : null}
        </div>
        {event.allDay ? (
          <p className={cn("break-words leading-tight text-current/80", compact ? "text-[9px]" : "text-[10px]")}>Sepanjang hari</p>
        ) : (
          <p className={cn("break-words leading-tight text-current/80", compact ? "text-[9px]" : "text-[10px]")}>{minutesToTime(event.startMinutes)} - {minutesToTime(event.endMinutes)}</p>
        )}
        {event.subtitle ? <p className={cn("break-words leading-tight text-current/75", compact ? "text-[9px]" : "text-[10px]")}>{event.subtitle}</p> : null}
        {!compact && event.meta ? <p className="break-words text-[10px] leading-tight text-current/65">{event.meta}</p> : null}
        {!compact && (event.mode || event.location) ? (
          <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-0.5 text-[9px] font-medium text-current/75">
            {event.mode === "online" ? <span className="inline-flex items-center gap-1"><Video className="size-2.5" /> Online</span> : null}
            {event.mode === "offline" ? <span className="inline-flex items-center gap-1"><MapPin className="size-2.5" /> Offline</span> : null}
            {event.location ? <span className="break-words">{event.location}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ScheduleCalendarView({
  role,
  adminMode = "all",
  weekInfo,
  isWeekLocked,
  weekOffset,
  onWeekChange,
  coursesList,
  tutorsList = [],
  slots,
  bookings,
  academicSchedules = [],
  onSelectSlotToBook,
  onCreateScheduleDirect,
  onOpenPreSession,
  onOpenPostSession,
  onOpenAuditLog,
  onEditSchedule,
  onMoveSession,
  onDeleteSlot,
  onAssignTutorialSlot,
  onOpenSessionDetail,
  initialCourseFilter = "all",
}: ScheduleCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [activeDate, setActiveDate] = useState<CalendarDate>(() => weekInfo.startOfWeekIso as CalendarDate);
  const [courseFilter, setCourseFilter] = useState(initialCourseFilter || "all");
  const [tutorFilter, setTutorFilter] = useState("all");
  const today = getJakartaCalendarDate();
  const nowMinutes = getJakartaClock();

  useEffect(() => {
    const incomingStart = weekInfo.startOfWeekIso as CalendarDate;
    const incomingEnd = weekInfo.endOfWeekIso as CalendarDate;
    if (activeDate < incomingStart || activeDate > incomingEnd) {
      setActiveDate(incomingStart);
    }
  }, [activeDate, weekInfo.endOfWeekIso, weekInfo.startOfWeekIso]);

  const selectAnchor = (dateIso: CalendarDate) => {
    setActiveDate(dateIso);
    const currentWeekStart = getCalendarWeekRange(today).startIso;
    const targetWeekStart = getCalendarWeekRange(dateIso).startIso;
    const targetOffset = Math.round(diffCalendarDays(targetWeekStart, currentWeekStart) / 7);
    if (targetOffset !== weekOffset) onWeekChange(targetOffset);
  };

  const navigate = (direction: -1 | 1) => {
    const next = viewMode === "day"
      ? addCalendarDays(activeDate, direction)
      : viewMode === "week"
        ? addCalendarDays(activeDate, direction * 7)
        : addCalendarMonths(activeDate, direction);
    selectAnchor(next);
  };

  const normalizedEvents = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];
    const bookingSlotIds = new Set(bookings.map((booking: any) => booking.slotId).filter(Boolean));

    for (const slot of slots) {
      const dateIso = slot.sessionDate as CalendarDate | null | undefined;
      if (!dateIso || bookingSlotIds.has(slot.id) || slot.booking) continue;
      const startMinutes = timeToMinutes(slot.startTime);
      const endMinutes = Math.max(startMinutes + 30, timeToMinutes(slot.endTime));
      const tutorName = slot.tutor?.name || "Tutor";
      result.push({
        id: `slot-${slot.id}`,
        kind: "availability",
        dateIso,
        startMinutes,
        endMinutes,
        title: `${minutesToTime(startMinutes)}-${minutesToTime(endMinutes)}`,
        subtitle: `Tutor: ${tutorName}`,
        meta: slot.notes || null,
        mode: slot.mode,
        location: slot.location,
        tutorId: slot.tutorId || slot.tutor?.id || null,
        locked: dateIso < today,
        source: slot,
      });
    }

    for (const booking of bookings) {
      const dateIso = booking.sessionDate as CalendarDate | null | undefined;
      if (!dateIso) continue;
      const startMinutes = timeToMinutes(booking.startTime || booking.slot?.startTime);
      const endMinutes = Math.max(startMinutes + 30, timeToMinutes(booking.endTime || booking.slot?.endTime));
      const groupName = booking.group?.name || booking.groupName;
      const tutorName = booking.slot?.tutor?.name || booking.tutor?.name;
      const subtitle = [groupName, tutorName ? `Tutor: ${tutorName}` : null].filter(Boolean).join(" • ") || null;
      result.push({
        id: `booking-${booking.id}`,
        kind: "booking",
        dateIso,
        startMinutes,
        endMinutes,
        title: booking.course?.title || booking.courseTitle || booking.topic || "Sesi tutorial",
        subtitle,
        meta: booking.topic || booking.preSessionNotes || null,
        mode: booking.mode || booking.slot?.mode,
        location: booking.location || booking.slot?.location,
        courseId: booking.courseId || booking.course?.id || null,
        tutorId: booking.slot?.tutorId || booking.tutorId || booking.slot?.tutor?.id || null,
        locked: false,
        source: booking,
      });
    }

    for (const schedule of academicSchedules) {
      const start = parseAcademicInstant(schedule.startDate);
      if (!start) continue;
      const end = parseAcademicInstant(schedule.endDate);
      const allDay = start.minutes === 0 && !schedule.endDate;
      const sameDayEnd = end && end.dateIso === start.dateIso ? end.minutes : null;
      const endMinutes = allDay
        ? END_MINUTES
        : sameDayEnd && sameDayEnd > start.minutes
          ? sameDayEnd
          : start.minutes + 90;
      result.push({
        id: `academic-${schedule.id}`,
        kind: "academic",
        dateIso: start.dateIso,
        startMinutes: start.minutes,
        endMinutes,
        title: schedule.title || academicTypeLabel(schedule.type),
        subtitle: schedule.course?.title || schedule.courseTitle || academicTypeLabel(schedule.type),
        meta: schedule.description || null,
        location: schedule.location,
        courseId: schedule.courseId || schedule.course?.id || null,
        allDay,
        source: schedule,
      });
    }

    return result;
  }, [academicSchedules, bookings, isWeekLocked, slots, today]);

  const filteredEvents = useMemo(() => normalizedEvents.filter((event) => {
    if (courseFilter !== "all") {
      if (event.kind === "availability") {
        const tutorCourses = event.source?.tutor?.tutorCourses || [];
        const hasCourse = tutorCourses.some((entry: any) => (entry.courseId || entry.course?.id) === courseFilter);
        if (!hasCourse) return false;
      } else if (event.courseId !== courseFilter) {
        return false;
      }
    }
    if (tutorFilter !== "all" && event.kind !== "academic" && event.tutorId !== tutorFilter) return false;
    if (role === "admin" && adminMode === "academic" && event.kind !== "academic") return false;
    if (role === "admin" && adminMode === "tutorial" && event.kind === "academic") return false;
    return true;
  }), [adminMode, courseFilter, normalizedEvents, role, tutorFilter]);

  const visibleDays = useMemo(() => {
    if (viewMode === "day") {
      const info = weekInfo.days.find((day) => day.dateIso === activeDate);
      return [info || {
        dateIso: activeDate,
        dayName: formatCalendarDateLabel(activeDate, { weekday: "long" }),
        dayOfMonth: parseCalendarDate(activeDate).day,
        monthName: formatCalendarDateLabel(activeDate, { month: "short" }),
        isToday: activeDate === today,
        isPast: activeDate < today,
      }];
    }
    return weekInfo.days;
  }, [activeDate, today, viewMode, weekInfo.days]);

  const rangeLabel = viewMode === "day"
    ? formatCalendarDateLabel(activeDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : viewMode === "month"
      ? formatCalendarDateLabel(activeDate, { month: "long", year: "numeric" })
      : `${formatCalendarDateLabel(weekInfo.startOfWeekIso as CalendarDate, { day: "numeric", month: "short" })} - ${formatCalendarDateLabel(weekInfo.endOfWeekIso as CalendarDate, { day: "numeric", month: "short", year: "numeric" })}`;

  const openEvent = (event: CalendarEvent) => {
    if (event.kind === "availability") {
      if (role === "student" && !event.locked) onSelectSlotToBook?.(event.source, event.dateIso);
      else if (role === "admin") onAssignTutorialSlot?.(event.source);
      return;
    }
    if (event.kind === "academic") {
      onEditSchedule?.(event.source);
      return;
    }
    if (onOpenSessionDetail) onOpenSessionDetail(event.source);
    else if (role === "student") onOpenPreSession?.(event.source);
    else onOpenPostSession?.(event.source);
  };

  const handleGridCreate = (dateIso: CalendarDate, hour: number) => {
    if (!onCreateScheduleDirect) return;
    const start = hour * 60;
    const end = role === "teacher" ? start + 90 : start + 60;
    if (end > END_MINUTES) return;
    onCreateScheduleDirect(dateIso, minutesToTime(start), minutesToTime(end));
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/65 p-2 shadow-xs backdrop-blur-sm sm:flex-nowrap">
        <Select value={viewMode} onValueChange={(value: CalendarViewMode) => setViewMode(value)}>
          <SelectTrigger className="h-9 w-[106px] shrink-0 text-body-sm font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Hari</SelectItem>
            <SelectItem value="week">Minggu</SelectItem>
            <SelectItem value="month">Bulan</SelectItem>
          </SelectContent>
        </Select>

        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => selectAnchor(today)}>Hari Ini</Button>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Rentang sebelumnya"><ChevronLeft className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Rentang berikutnya"><ChevronRight className="size-4" /></Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-9 min-w-0 max-w-full justify-start gap-2 px-2 text-body-sm font-semibold sm:flex-1">
              <CalendarDays className="size-4 shrink-0 text-brand-primary" />
              <span className="truncate">{rangeLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <MonthPicker value={activeDate} viewMode={viewMode} onSelect={selectAnchor} />
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Keterangan warna"><Info className="size-4" /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-2 p-3 text-body-xs">
              <p className="font-semibold text-foreground">Keterangan</p>
              <div className="space-y-1.5 text-muted-foreground">
                <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-emerald-500" /> Slot tersedia</p>
                <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-indigo-500" /> Sesi terjadwal</p>
                <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-amber-500" /> Jadwal akademik / ujian</p>
                <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-zinc-500" /> Selesai atau lewat</p>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 px-2.5"><SlidersHorizontal className="size-4" /><span className="hidden sm:inline">Filter</span></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              <div className="space-y-1.5">
                <p className="text-body-xs font-semibold">Mata kuliah</p>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua mata kuliah</SelectItem>
                    {coursesList.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {tutorsList.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-body-xs font-semibold">Tutor</p>
                  <Select value={tutorFilter} onValueChange={setTutorFilter}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua tutor</SelectItem>
                      {tutorsList.map((tutor) => <SelectItem key={tutor.id} value={tutor.id}>{tutor.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {viewMode === "month" ? (
        <MonthView
          activeDate={activeDate}
          events={filteredEvents}
          today={today}
          onSelectDate={(dateIso) => {
            setViewMode("day");
            selectAnchor(dateIso);
          }}
          onOpenEvent={openEvent}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card/55 shadow-xs">
          <div className={cn("min-w-[820px]", viewMode === "day" && "min-w-[420px]") }>
            <div
              className="grid border-b border-border/70 bg-muted/20"
              style={{ gridTemplateColumns: viewMode === "day" ? "56px minmax(0,1fr)" : "56px repeat(7,minmax(108px,1fr))" }}
            >
              <div className="flex flex-col items-center justify-center border-r border-border/70 py-2 text-[10px] font-semibold text-muted-foreground">
                <span>WIB</span><span className="mt-0.5 text-[9px]">GMT+7</span>
              </div>
              {visibleDays.map((day) => (
                <div key={day.dateIso} className={cn("border-r border-border/60 px-2 py-2 text-center", day.isToday && "bg-brand-primary/5") }>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{String(day.dayName).slice(0, 3)}</p>
                  <p className={cn("mx-auto mt-1 flex size-7 items-center justify-center rounded-full text-body-sm font-bold", day.isToday && "bg-brand-primary text-white")}>{day.dayOfMonth}</p>
                </div>
              ))}
            </div>

            {filteredEvents.some((event) => event.allDay && visibleDays.some((day) => day.dateIso === event.dateIso)) ? (
              <div
                className="grid border-b border-border/70 bg-card"
                style={{ gridTemplateColumns: viewMode === "day" ? "56px minmax(0,1fr)" : "56px repeat(7,minmax(108px,1fr))" }}
              >
                <div className="flex items-center justify-end border-r border-border/70 px-1 py-1.5 text-[9px] font-medium text-muted-foreground">
                  Sepanjang hari
                </div>
                {visibleDays.map((day) => {
                  const allDayEvents = filteredEvents.filter((event) => event.allDay && event.dateIso === day.dateIso);
                  return (
                    <div key={`all-day-${day.dateIso}`} className={cn("min-h-10 space-y-1 border-r border-border/60 p-1", day.isToday && "bg-brand-primary/[0.02]")}>
                      {allDayEvents.map((event) => (
                        <div key={event.id} className="min-h-10">
                          <EventCard event={event} compact onOpen={() => openEvent(event)} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="max-h-[72vh] overflow-y-auto">
              <div
                className="grid relative"
                style={{
                  gridTemplateColumns: viewMode === "day" ? "56px minmax(0,1fr)" : "56px repeat(7,minmax(108px,1fr))",
                  height: `${HOURS.length * HOUR_HEIGHT}px`,
                }}
              >
                <div className="relative border-r border-border/70 bg-muted/5">
                  {HOURS.map((hour) => (
                    <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-border/35 pr-1 pt-1 text-right text-[10px] font-medium text-muted-foreground">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                  <span className="absolute bottom-0 right-1 translate-y-1/2 bg-card px-0.5 text-[9px] text-muted-foreground">24:00</span>
                </div>

                {visibleDays.map((day) => {
                  const dayIso = day.dateIso as CalendarDate;
                  const dayEvents = layoutEvents(filteredEvents.filter((event) => !event.allDay && event.dateIso === dayIso && event.endMinutes > START_MINUTES && event.startMinutes < END_MINUTES));
                  const canCreate = Boolean(onCreateScheduleDirect) && (role === "admin" || role === "teacher") && dayIso >= today;
                  return (
                    <div key={dayIso} className={cn("relative border-r border-border/60", day.isToday && "bg-brand-primary/[0.02]") }>
                      {HOURS.map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          aria-label={`Buat jadwal ${dayIso} ${hour}:00`}
                          onClick={() => canCreate && handleGridCreate(dayIso, hour)}
                          className={cn("block w-full border-b border-border/35 transition-colors", canCreate && "cursor-pointer hover:bg-brand-primary/5")}
                          style={{ height: HOUR_HEIGHT }}
                          disabled={!canCreate}
                        />
                      ))}

                      {day.isToday && nowMinutes >= START_MINUTES && nowMinutes <= END_MINUTES ? (
                        <div className="pointer-events-none absolute left-0 right-0 z-30 flex items-center" style={{ top: `${((nowMinutes - START_MINUTES) / 60) * HOUR_HEIGHT}px` }}>
                          <span className="-ml-1 size-2 rounded-full bg-red-500 ring-2 ring-card" />
                          <span className="h-0.5 flex-1 bg-red-500" />
                        </div>
                      ) : null}

                      {dayEvents.map((event) => {
                        const visibleStart = Math.max(START_MINUTES, event.startMinutes);
                        const visibleEnd = Math.min(END_MINUTES, event.endMinutes);
                        const top = ((visibleStart - START_MINUTES) / 60) * HOUR_HEIGHT;
                        const height = Math.max(42, ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT - 3);
                        const laneWidth = 100 / event.laneCount;
                        const left = event.lane * laneWidth;
                        const opening = event.kind === "availability"
                          ? role === "student" ? !event.locked : role === "admin"
                          : true;
                        return (
                          <div
                            key={event.id}
                            className="absolute z-20 px-0.5"
                            style={{ top, height, left: `${left}%`, width: `${laneWidth}%` }}
                          >
                            <EventCard
                              event={event}
                              onOpen={opening ? () => openEvent(event) : undefined}
                              onDeleteSlot={(role === "teacher" || (role === "admin" && (adminMode === "tutorial" || adminMode === "all"))) ? onDeleteSlot : undefined}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function MonthView({
  activeDate,
  events,
  today,
  onSelectDate,
  onOpenEvent,
}: {
  activeDate: CalendarDate;
  events: CalendarEvent[];
  today: CalendarDate;
  onSelectDate: (dateIso: CalendarDate) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const monthRange = getCalendarMonthRange(activeDate);
  const firstDay = getCalendarDayIndex(monthRange.startIso);
  const gridStart = addCalendarDays(monthRange.startIso, -((firstDay + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
  const activeParts = parseCalendarDate(activeDate);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card/55 shadow-xs">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-border/70 bg-muted/20">
          {["SEN", "SEL", "RAB", "KAM", "JUM", "SAB", "MIN"].map((label) => (
            <div key={label} className="border-r border-border/60 px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((dateIso) => {
            const parts = parseCalendarDate(dateIso);
            const inMonth = parts.month === activeParts.month && parts.year === activeParts.year;
            const dayEvents = events.filter((event) => event.dateIso === dateIso).sort((a, b) => a.startMinutes - b.startMinutes);
            return (
              <div key={dateIso} className={cn("min-h-32 border-b border-r border-border/50 p-1.5", !inMonth && "bg-muted/10 text-muted-foreground/55", dateIso === today && "bg-brand-primary/[0.025]") }>
                <button type="button" onClick={() => onSelectDate(dateIso)} className={cn("mb-1 flex size-7 items-center justify-center rounded-full text-body-xs font-semibold hover:bg-muted", dateIso === today && "bg-brand-primary text-white")}>{parts.day}</button>
                <div className="space-y-1">
                  {dayEvents.map((event) => (
                    <div key={event.id} className="min-h-12">
                      <EventCard event={event} compact onOpen={() => onOpenEvent(event)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
