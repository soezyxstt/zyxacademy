"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Clock,
  Video,
  MapPin,
  CheckCircle2,
  FileText,
  FileQuestion,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  MessageSquare,
  Lock,
  Plus,
  Calendar as CalendarIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatIsoDate,
  formatIsoDateUtc,
  getJakartaNow,
  type IndonesianDay,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

// Tutor distinct color styling
const TUTOR_COLORS = [
  {
    border: "border-indigo-400 dark:border-indigo-600",
    bg: "bg-indigo-50/90 dark:bg-indigo-950/50 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/60",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
    accent: "bg-indigo-500 text-white",
    bar: "bg-indigo-500",
    text: "text-indigo-900 dark:text-indigo-200",
  },
  {
    border: "border-emerald-400 dark:border-emerald-600",
    bg: "bg-emerald-50/90 dark:bg-emerald-950/50 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/60",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
    accent: "bg-emerald-500 text-white",
    bar: "bg-emerald-500",
    text: "text-emerald-900 dark:text-emerald-200",
  },
  {
    border: "border-amber-400 dark:border-amber-600",
    bg: "bg-amber-50/90 dark:bg-amber-950/50 hover:bg-amber-100/90 dark:hover:bg-amber-900/60",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
    accent: "bg-amber-500 text-white",
    bar: "bg-amber-500",
    text: "text-amber-900 dark:text-amber-200",
  },
  {
    border: "border-rose-400 dark:border-rose-600",
    bg: "bg-rose-50/90 dark:bg-rose-950/50 hover:bg-rose-100/90 dark:hover:bg-rose-900/60",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
    accent: "bg-rose-500 text-white",
    bar: "bg-rose-500",
    text: "text-rose-900 dark:text-rose-200",
  },
  {
    border: "border-violet-400 dark:border-violet-600",
    bg: "bg-violet-50/90 dark:bg-violet-950/50 hover:bg-violet-100/90 dark:hover:bg-violet-900/60",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
    accent: "bg-violet-500 text-white",
    bar: "bg-violet-500",
    text: "text-violet-900 dark:text-violet-200",
  },
  {
    border: "border-cyan-400 dark:border-cyan-600",
    bg: "bg-cyan-50/90 dark:bg-cyan-950/50 hover:bg-cyan-100/90 dark:hover:bg-cyan-900/60",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200",
    accent: "bg-cyan-500 text-white",
    bar: "bg-cyan-500",
    text: "text-cyan-900 dark:text-cyan-200",
  },
];

export function getTutorColorStyle(tutorId: string) {
  let hash = 0;
  for (let i = 0; i < (tutorId || "default").length; i++) {
    hash = (tutorId || "default").charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TUTOR_COLORS.length;
  return TUTOR_COLORS[index];
}

// Operating Hours for Google Calendar grid (07:00 to 22:00 WIB)
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS_COUNT = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 56; // 56px per hour row => 90 min slot = 84px

const HOURS = Array.from({ length: HOURS_COUNT }, (_, i) => START_HOUR + i);

const DAY_NAMES_ID: IndonesianDay[] = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

export type ScheduleCalendarProps = {
  role: "student" | "teacher" | "admin";
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
  onCreateScheduleDirect?: (dateIso: string, timeStr?: string) => void;
  onOpenPreSession?: (booking: any) => void;
  onOpenPostSession?: (booking: any) => void;
  onOpenRescheduleTicket?: (booking: any) => void;
  onOpenAuditLog?: (booking: any) => void;
};

// Helper: parse "09:00" or "09:30" to minutes from midnight
function timeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Helper: get month calendar days grid (7 cols x 4-6 rows)
function getMonthCalendarDays(year: number, month: number) {
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Day of week for 1st (0 = Sun, 1 = Mon ... 6 = Sat)
  const firstDayWeekday = firstDayOfMonth.getDay();
  // We start week on Monday (1). If Sunday (0), it is 7th day
  const prefixDays = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;

  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - prefixDays);

  const days: Array<{
    date: Date;
    dateIso: string;
    dayOfMonth: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    dayName: IndonesianDay;
  }> = [];

  const nowJakarta = getJakartaNow();
  const todayIso = formatIsoDateUtc(nowJakarta);

  // Generate 35 or 42 days grid
  const totalDays = prefixDays + lastDayOfMonth.getDate() > 35 ? 42 : 35;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateIso = formatIsoDateUtc(d);
    const dayOfWeekIndex = d.getDay();
    const dayName =
      dayOfWeekIndex === 0
        ? "Minggu"
        : DAY_NAMES_ID[dayOfWeekIndex - 1] || "Senin";

    days.push({
      date: d,
      dateIso,
      dayOfMonth: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateIso === todayIso,
      dayName,
    });
  }

  return days;
}

export function ScheduleCalendarView({
  role,
  currentUserId: _currentUserId,
  weekInfo,
  isWeekLocked,
  weekOffset,
  onWeekChange,
  coursesList,
  tutorsList = [],
  groupsList = [],
  slots,
  bookings,
  academicSchedules = [],
  onSelectSlotToBook,
  onCreateScheduleDirect,
  onOpenPreSession,
  onOpenPostSession,
  onOpenRescheduleTicket,
  onOpenAuditLog,
}: ScheduleCalendarProps) {
  // View Modes: "month" | "week" | "day"
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("week");

  // Active anchor date for Day / Month views
  const [activeDate, setActiveDate] = useState<Date>(() => {
    return getJakartaNow();
  });

  // Filters
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");
  const [selectedTutorFilter, setSelectedTutorFilter] = useState("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to 08:00 on mount for time grid
  useEffect(() => {
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = HOUR_HEIGHT * 1; // scroll to 08:00
    }
  }, [viewMode]);

  // Current time line calculation
  const nowJakarta = getJakartaNow();
  const nowMinutes = nowJakarta.getHours() * 60 + nowJakarta.getMinutes();
  const nowTopPosition =
    ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const todayIso = formatIsoDateUtc(nowJakarta);

  // Filtered Academic Schedules (Exams, Tryouts, Quizzes)
  const filteredAcademicSchedules = useMemo(() => {
    return academicSchedules.filter((sched) => {
      if (
        selectedCourseFilter !== "all" &&
        sched.courseId &&
        sched.courseId !== selectedCourseFilter
      ) {
        return false;
      }
      if (selectedTypeFilter !== "all" && sched.type !== selectedTypeFilter) {
        return false;
      }
      return true;
    });
  }, [academicSchedules, selectedCourseFilter, selectedTypeFilter]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (
        selectedCourseFilter !== "all" &&
        b.courseId !== selectedCourseFilter
      ) {
        return false;
      }
      if (selectedGroupFilter !== "all" && b.groupId !== selectedGroupFilter) {
        return false;
      }
      if (
        selectedTutorFilter !== "all" &&
        b.slot?.tutorId !== selectedTutorFilter
      ) {
        return false;
      }
      return true;
    });
  }, [bookings, selectedCourseFilter, selectedGroupFilter, selectedTutorFilter]);

  // Filtered Slots
  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (
        selectedTutorFilter !== "all" &&
        s.tutorId !== selectedTutorFilter
      ) {
        return false;
      }
      return true;
    });
  }, [slots, selectedTutorFilter]);

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === "day") {
      const nextD = new Date(activeDate);
      nextD.setDate(nextD.getDate() - 1);
      setActiveDate(nextD);
    } else if (viewMode === "week") {
      onWeekChange(weekOffset - 1);
    } else if (viewMode === "month") {
      const nextD = new Date(activeDate);
      nextD.setMonth(nextD.getMonth() - 1);
      setActiveDate(nextD);
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      const nextD = new Date(activeDate);
      nextD.setDate(nextD.getDate() + 1);
      setActiveDate(nextD);
    } else if (viewMode === "week") {
      onWeekChange(weekOffset + 1);
    } else if (viewMode === "month") {
      const nextD = new Date(activeDate);
      nextD.setMonth(nextD.getMonth() + 1);
      setActiveDate(nextD);
    }
  };

  const handleToday = () => {
    const now = getJakartaNow();
    setActiveDate(now);
    if (weekOffset !== 0) {
      onWeekChange(0);
    }
  };

  // Header Date Range Label
  const headerDateLabel = useMemo(() => {
    if (viewMode === "day") {
      return activeDate.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (viewMode === "month") {
      return activeDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      });
    }
    // Week mode
    const first = weekInfo.days[0];
    const last = weekInfo.days[6];
    return `${first.dayOfMonth} ${first.monthName} - ${last.dayOfMonth} ${last.monthName}`;
  }, [viewMode, activeDate, weekInfo]);

  // Day View specific day object
  const activeDayIso = formatIsoDateUtc(activeDate);
  const activeDayOfWeekIndex = activeDate.getDay();
  const activeDayName =
    activeDayOfWeekIndex === 0
      ? "Minggu"
      : DAY_NAMES_ID[activeDayOfWeekIndex - 1] || "Senin";

  // Month View Days
  const monthDays = useMemo(() => {
    return getMonthCalendarDays(
      activeDate.getFullYear(),
      activeDate.getMonth()
    );
  }, [activeDate]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3 font-sans">
        {/* 1. SINGLE-ROW COMPACT TOOLBAR (G-Calendar Style) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card shadow-xs">
          {/* Left: View Switcher & Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Select */}
            <div className="w-[110px] shrink-0">
              <Select
                value={viewMode}
                onValueChange={(val: "day" | "week" | "month") => setViewMode(val)}
              >
                <SelectTrigger className="h-9 text-body-sm rounded-lg bg-card font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Minggu</SelectItem>
                  <SelectItem value="day">Hari</SelectItem>
                  <SelectItem value="month">Bulan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Today Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="h-9 px-3 rounded-lg text-body-sm font-semibold text-foreground hover:bg-muted shrink-0"
            >
              Hari Ini
            </Button>

            {/* Prev & Next Arrows */}
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Berikutnya"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* Date Range Text */}
            <div className="flex items-center gap-1.5 px-1 py-1 shrink-0">
              <CalendarIcon className="size-4 text-brand-primary shrink-0" />
              <span className="text-body-sm font-bold text-foreground capitalize whitespace-nowrap">
                {headerDateLabel}
              </span>
            </div>

            {/* Lock Status (Icon + Accessible Tooltip) */}
            {isWeekLocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help shrink-0">
                    <Lock className="size-4" />
                    <span className="sr-only">Jadwal Minggu Ini Terkunci</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-body-xs">
                  Jadwal minggu ini telah dikunci (Sabtu 23:59 WIB). Perubahan jadwal wajib melalui tiket reschedule.
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Right: Compact Multi-Filters (Using Shadcn Select) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Course Filter */}
            <div className="min-w-[140px] max-w-[180px]">
              <Select
                value={selectedCourseFilter}
                onValueChange={setSelectedCourseFilter}
              >
                <SelectTrigger className="h-9 text-body-sm rounded-lg bg-card">
                  <SelectValue placeholder="Mata Kuliah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Mata Kuliah</SelectItem>
                  {coursesList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tutor Filter */}
            {(role === "student" || role === "admin") && tutorsList.length > 0 && (
              <div className="min-w-[130px] max-w-[160px]">
                <Select
                  value={selectedTutorFilter}
                  onValueChange={setSelectedTutorFilter}
                >
                  <SelectTrigger className="h-9 text-body-sm rounded-lg bg-card">
                    <SelectValue placeholder="Tutor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tutor</SelectItem>
                    {tutorsList.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Group Filter */}
            {(role === "teacher" || role === "admin") && groupsList.length > 0 && (
              <div className="min-w-[130px] max-w-[160px]">
                <Select
                  value={selectedGroupFilter}
                  onValueChange={setSelectedGroupFilter}
                >
                  <SelectTrigger className="h-9 text-body-sm rounded-lg bg-card">
                    <SelectValue placeholder="Kelompok" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelompok</SelectItem>
                    {groupsList.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Schedule Type Filter (for Admin) */}
            {role === "admin" && (
              <div className="min-w-[130px] max-w-[160px]">
                <Select
                  value={selectedTypeFilter}
                  onValueChange={setSelectedTypeFilter}
                >
                  <SelectTrigger className="h-9 text-body-sm rounded-lg bg-card">
                    <SelectValue placeholder="Jenis Jadwal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="official_exam">Ujian ITB</SelectItem>
                    <SelectItem value="tryout">Tryout</SelectItem>
                    <SelectItem value="quiz">Kuis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: GOOGLE CALENDAR 7-DAY WEEKLY TIME GRID                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {viewMode === "week" && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
            {/* Top All-Day / Academic Events Row Header */}
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border/80 bg-muted/20">
              {/* Timezone corner label */}
              <div className="p-2 text-center text-[10px] font-semibold text-muted-foreground border-r border-border/60 flex flex-col justify-center">
                <span>WIB</span>
                <span className="text-[8px] text-muted-foreground/80">GMT+7</span>
              </div>

              {/* 7 Day Column Headers */}
              {weekInfo.days.map((day) => {
                // Find academic schedules on this day
                const dayAcademic = filteredAcademicSchedules.filter((sched) => {
                  if (!sched.startDate) return false;
                  const schedIso = formatIsoDate(new Date(sched.startDate));
                  return schedIso === day.dateIso;
                });

                return (
                  <div
                    key={day.dateIso}
                    className={`p-2 border-r border-border/60 text-center flex flex-col justify-between ${
                      day.isToday ? "bg-brand-primary/5" : ""
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        {day.dayName.slice(0, 3)}
                      </span>
                      <span
                        className={`inline-flex items-center justify-center size-6 text-body-xs font-bold rounded-full my-0.5 ${
                          day.isToday
                            ? "bg-brand-primary text-white"
                            : "text-foreground"
                        }`}
                      >
                        {day.dayOfMonth}
                      </span>
                    </div>

                    {/* Academic Event Chips (All-Day banner) */}
                    {dayAcademic.length > 0 && (
                      <div className="space-y-1 mt-1 text-left">
                        {dayAcademic.map((sched) => (
                          <div
                            key={sched.id}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold truncate bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center gap-1"
                            title={`${sched.title} (${sched.type})`}
                          >
                            <Sparkles className="size-2.5 shrink-0" />
                            <span className="truncate">{sched.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Scrollable Hourly Time Grid */}
            <div
              ref={gridScrollRef}
              className="relative max-h-[620px] overflow-y-auto overflow-x-hidden"
              style={{ height: `${HOURS_COUNT * HOUR_HEIGHT}px` }}
            >
              <div
                className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] relative"
                style={{ height: `${HOURS_COUNT * HOUR_HEIGHT}px` }}
              >
                {/* 1. Left Time Axis */}
                <div className="border-r border-border/60 bg-muted/10 select-none">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-border/30 px-1 pt-1 text-right text-[10px] font-semibold text-muted-foreground"
                    >
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* 2. 7 Day Columns with Time Grid Lines & Event Blocks */}
                {weekInfo.days.map((day) => {
                  const daySlots = filteredSlots.filter(
                    (s) => s.dayOfWeek === day.dayName
                  );

                  const dayBookings = filteredBookings.filter((b) => {
                    if (b.sessionDate && b.sessionDate !== day.dateIso) return false;
                    if (!b.sessionDate && b.slot?.dayOfWeek !== day.dayName) return false;
                    return true;
                  });

                  return (
                    <div
                      key={day.dateIso}
                      className={`relative border-r border-border/60 ${
                        day.isToday ? "bg-brand-primary/[0.02]" : ""
                      }`}
                    >
                      {/* Horizontal Grid lines */}
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          onClick={() => {
                            if (role === "admin" && onCreateScheduleDirect) {
                              const timeStr = `${String(hour).padStart(2, "0")}:00`;
                              onCreateScheduleDirect(day.dateIso, timeStr);
                            }
                          }}
                          className={cn(
                            "border-b border-border/30 w-full transition-colors",
                            role === "admin" && onCreateScheduleDirect && "cursor-pointer hover:bg-brand-primary/10"
                          )}
                          title={role === "admin" && onCreateScheduleDirect ? `Buat jadwal pada ${day.dayName}, ${String(hour).padStart(2, "0")}:00` : undefined}
                        />
                      ))}

                      {/* Current Time Line if Today */}
                      {day.isToday &&
                        nowMinutes >= START_HOUR * 60 &&
                        nowMinutes <= END_HOUR * 60 && (
                          <div
                            className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                            style={{ top: `${nowTopPosition}px` }}
                          >
                            <div className="size-2 rounded-full bg-red-500 -ml-1 ring-2 ring-white dark:ring-background" />
                            <div className="h-[2px] w-full bg-red-500" />
                          </div>
                        )}

                      {/* Render Booked Sessions (Google Calendar Block Style) */}
                      {dayBookings.map((b) => {
                        const startTimeStr = b.startTime || b.slot?.startTime || "09:00";
                        const endTimeStr = b.endTime || b.slot?.endTime || "10:30";
                        const startMin = timeToMinutes(startTimeStr);
                        const endMin = timeToMinutes(endTimeStr);
                        const duration = Math.max(30, endMin - startMin);

                        const top =
                          ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                        const height = (duration / 60) * HOUR_HEIGHT - 2;

                        const tutorStyle = getTutorColorStyle(
                          b.slot?.tutorId || b.studentId
                        );
                        const isCompleted = b.status === "completed";
                        const isCancelled = b.status === "cancelled";
                        const hasQuestions =
                          b.preSessionAttachments &&
                          b.preSessionAttachments.length > 0;

                        return (
                          <div
                            key={b.id}
                            style={{
                              top: `${Math.max(0, top)}px`,
                              height: `${Math.max(32, height)}px`,
                            }}
                            className={`absolute left-0.5 right-0.5 z-20 rounded-md border ${tutorStyle.border} ${tutorStyle.bg} p-1.5 flex flex-col justify-between overflow-hidden shadow-xs transition-all hover:z-30 hover:shadow-md`}
                          >
                            {/* Left solid color accent bar */}
                            <div
                              className={`absolute left-0 top-0 bottom-0 w-1 ${tutorStyle.bar}`}
                            />

                            {/* Header row: Course Title & Time */}
                            <div className="pl-1.5 min-w-0">
                              <div className="flex items-start justify-between gap-1 leading-tight">
                                <span className="text-[11px] font-bold text-foreground truncate block">
                                  {b.course?.title || "Tutorial"}
                                </span>
                                {isCompleted ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 px-1 py-0"
                                  >
                                    Selesai
                                  </Badge>
                                ) : isCancelled ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] bg-red-500/10 text-red-600 border-red-500/30 px-1 py-0"
                                  >
                                    Batal
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-0.5">
                                <Clock className="size-2.5 shrink-0" />
                                <span>
                                  {startTimeStr} - {endTimeStr}
                                </span>
                                <span>•</span>
                                <span>{b.slot?.tutor?.name || "Tutor"}</span>
                              </div>
                            </div>

                            {/* Mode badge & Indicators */}
                            <div className="pl-1.5 flex items-center justify-between gap-1 mt-1">
                              <div className="flex items-center gap-1 truncate">
                                {b.mode === "online" || b.slot?.mode === "online" ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400">
                                    <Video className="size-2.5" />
                                    Online
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[80px]"
                                    title={b.location || b.slot?.location || "Offline"}
                                  >
                                    <MapPin className="size-2.5 shrink-0" />
                                    {b.location || b.slot?.location || "Offline"}
                                  </span>
                                )}

                                {hasQuestions && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-brand-primary">
                                    <FileQuestion className="size-2.5" />
                                    {b.preSessionAttachments.length}
                                  </span>
                                )}
                              </div>

                              {/* Google Meet 1-click button if available */}
                              {b.googleMeetUrl && !isCompleted && !isCancelled && (
                                <a
                                  href={b.googleMeetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-[9px] font-bold transition-colors shrink-0"
                                  title="Buka Google Meet"
                                >
                                  <Video className="size-2.5" />
                                  <span>Meet</span>
                                  <ExternalLink className="size-2" />
                                </a>
                              )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="pl-1.5 flex items-center justify-between gap-1 pt-1 border-t border-border/40 mt-1">
                              {/* Student action buttons */}
                              {role === "student" && !isCompleted && !isCancelled && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onOpenPreSession?.(b)}
                                    className="p-1 rounded text-foreground hover:bg-card text-[9px] font-semibold flex items-center gap-0.5"
                                    title="Unggah Materi / Soal"
                                  >
                                    <FileText className="size-2.5" />
                                    <span>Materi</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenRescheduleTicket?.(b)}
                                    className="p-1 rounded text-foreground hover:bg-card text-[9px] font-semibold flex items-center gap-0.5"
                                    title="Reschedule / Batal"
                                  >
                                    <MessageSquare className="size-2.5" />
                                  </button>
                                </div>
                              )}

                              {/* Tutor action button */}
                              {role === "teacher" && !isCompleted && !isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => onOpenPostSession?.(b)}
                                  className="px-1.5 py-0.5 rounded bg-brand-primary text-white text-[9px] font-bold flex items-center gap-1"
                                >
                                  <CheckCircle2 className="size-2.5" />
                                  <span>Selesai</span>
                                </button>
                              )}

                              {/* Audit trail icon */}
                              <button
                                type="button"
                                onClick={() => onOpenAuditLog?.(b)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground ml-auto"
                                title="Riwayat Jejak Audit"
                              >
                                <History className="size-3" />
                              </button>
                            </div>

                            {b.lastModifiedAt && (
                              <div
                                className="pl-1.5 mt-0.5 text-[8px] text-muted-foreground truncate"
                                title={`Terakhir diubah oleh ${b.lastModifier?.name || "Sistem"}`}
                              >
                                Diubah oleh {b.lastModifier?.name || "Sistem"} •{" "}
                                {formatIsoDate(new Date(b.lastModifiedAt))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Render Available Slots for Booking */}
                      {role === "student" &&
                        daySlots
                          .filter((s) => !s.booking)
                          .map((s) => {
                            const startMin = timeToMinutes(s.startTime);
                            const endMin = timeToMinutes(s.endTime);
                            const duration = Math.max(30, endMin - startMin);

                            const top =
                              ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                            const height =
                              (duration / 60) * HOUR_HEIGHT - 2;

                            return (
                              <button
                                key={s.id}
                                type="button"
                                style={{
                                  top: `${Math.max(0, top)}px`,
                                  height: `${Math.max(28, height)}px`,
                                }}
                                onClick={() => onSelectSlotToBook?.(s, day.dateIso)}
                                className="absolute left-0.5 right-0.5 z-10 rounded-md border border-dashed border-brand-primary/50 bg-brand-primary/5 hover:bg-brand-primary/15 hover:border-brand-primary p-1 flex flex-col justify-between text-left transition-all group"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[10px] font-bold text-foreground truncate">
                                    {s.startTime} - {s.endTime}
                                  </span>
                                  {s.mode === "online" ? (
                                    <span className="text-[8px] text-blue-600 font-bold">
                                      Online
                                    </span>
                                  ) : (
                                    <span className="text-[8px] text-emerald-600 font-bold truncate max-w-[60px]">
                                      {s.location || "Offline"}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-muted-foreground w-full mt-0.5">
                                  <span className="truncate">
                                    {s.tutor?.name || "Tutor"}
                                  </span>
                                  <span className="text-brand-primary font-bold group-hover:underline flex items-center gap-0.5">
                                    <Plus className="size-2.5" />
                                    Pilih
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: GOOGLE CALENDAR SINGLE-DAY EXPANDED VIEW                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {viewMode === "day" && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
            {/* Day Header */}
            <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-heading text-body-base font-bold text-foreground">
                  {activeDate.toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                {activeDayIso === todayIso && (
                  <Badge variant="default" className="text-[10px] bg-brand-primary">
                    Hari Ini
                  </Badge>
                )}
              </div>
              <span className="text-body-xs text-muted-foreground font-semibold">
                Zona Waktu: WIB (GMT+7)
              </span>
            </div>

            {/* Day Hourly Grid */}
            <div
              ref={gridScrollRef}
              className="relative max-h-[620px] overflow-y-auto overflow-x-hidden"
              style={{ height: `${HOURS_COUNT * HOUR_HEIGHT}px` }}
            >
              <div
                className="grid grid-cols-[64px_1fr] relative"
                style={{ height: `${HOURS_COUNT * HOUR_HEIGHT}px` }}
              >
                {/* Time Axis */}
                <div className="border-r border-border/60 bg-muted/10 select-none">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-border/30 px-1.5 pt-1 text-right text-[11px] font-semibold text-muted-foreground"
                    >
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* Day Column */}
                <div className="relative">
                  {/* Grid lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      onClick={() => {
                        if (role === "admin" && onCreateScheduleDirect) {
                          const timeStr = `${String(hour).padStart(2, "0")}:00`;
                          onCreateScheduleDirect(activeDayIso, timeStr);
                        }
                      }}
                      className={cn(
                        "border-b border-border/30 w-full transition-colors",
                        role === "admin" && onCreateScheduleDirect && "cursor-pointer hover:bg-brand-primary/10"
                      )}
                      title={role === "admin" && onCreateScheduleDirect ? `Buat jadwal pada ${activeDayName}, ${String(hour).padStart(2, "0")}:00` : undefined}
                    />
                  ))}

                  {/* Current time line if today */}
                  {activeDayIso === todayIso &&
                    nowMinutes >= START_HOUR * 60 &&
                    nowMinutes <= END_HOUR * 60 && (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                        style={{ top: `${nowTopPosition}px` }}
                      >
                        <div className="size-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white dark:ring-background" />
                        <div className="h-[2px] w-full bg-red-500" />
                      </div>
                    )}

                  {/* Day Booked Sessions */}
                  {filteredBookings
                    .filter((b) => {
                      if (b.sessionDate && b.sessionDate !== activeDayIso)
                        return false;
                      if (!b.sessionDate && b.slot?.dayOfWeek !== activeDayName)
                        return false;
                      return true;
                    })
                    .map((b) => {
                      const startTimeStr =
                        b.startTime || b.slot?.startTime || "09:00";
                      const endTimeStr =
                        b.endTime || b.slot?.endTime || "10:30";
                      const startMin = timeToMinutes(startTimeStr);
                      const endMin = timeToMinutes(endTimeStr);
                      const duration = Math.max(45, endMin - startMin);

                      const top =
                        ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const height = (duration / 60) * HOUR_HEIGHT - 2;

                      const tutorStyle = getTutorColorStyle(
                        b.slot?.tutorId || b.studentId
                      );

                      return (
                        <div
                          key={b.id}
                          style={{
                            top: `${Math.max(0, top)}px`,
                            height: `${Math.max(50, height)}px`,
                          }}
                          className={`absolute left-2 right-2 z-20 rounded-xl border ${tutorStyle.border} ${tutorStyle.bg} p-3 flex items-start justify-between gap-3 shadow-sm`}
                        >
                          <div
                            className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${tutorStyle.bar}`}
                          />
                          <div className="pl-2 space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-heading text-body-sm font-bold text-foreground truncate">
                                {b.course?.title}
                              </h4>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold"
                              >
                                {b.slot?.tutor?.name} • {b.group?.name}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-body-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3.5" />
                                {startTimeStr} - {endTimeStr}
                              </span>
                              <span>•</span>
                              {b.mode === "online" ? (
                                <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                  <Video className="size-3.5" />
                                  Online (Google Meet)
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                  <MapPin className="size-3.5" />
                                  {b.location || "Offline"}
                                </span>
                              )}
                            </div>
                            {b.topic && (
                              <p className="text-body-xs text-foreground font-medium pt-0.5 truncate">
                                💬 Topik: {b.topic}
                              </p>
                            )}
                            {b.lastModifiedAt && (
                              <p
                                className="text-[10px] text-muted-foreground truncate"
                                title={`Terakhir diubah oleh ${b.lastModifier?.name || "Sistem"}`}
                              >
                                Diubah oleh {b.lastModifier?.name || "Sistem"} •{" "}
                                {formatIsoDate(new Date(b.lastModifiedAt))}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {b.googleMeetUrl && (
                              <a
                                href={b.googleMeetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-body-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5 shadow-xs"
                              >
                                <Video className="size-3.5" />
                                <span>Buka Meet</span>
                                <ExternalLink className="size-3" />
                              </a>
                            )}
                            {role === "student" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => onOpenPreSession?.(b)}
                                  className="h-8 rounded-lg text-body-xs font-semibold gap-1"
                                >
                                  <FileText className="size-3.5" />
                                  <span>Materi</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => onOpenRescheduleTicket?.(b)}
                                  className="h-8 rounded-lg text-body-xs font-semibold gap-1"
                                >
                                  <MessageSquare className="size-3.5" />
                                  <span>Reschedule</span>
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onOpenAuditLog?.(b)}
                              className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                              title="Riwayat Jejak Audit"
                            >
                              <History className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                  {/* Day Available Slots for booking */}
                  {role === "student" &&
                    filteredSlots
                      .filter(
                        (s) => s.dayOfWeek === activeDayName && !s.booking
                      )
                      .map((s) => {
                        const startMin = timeToMinutes(s.startTime);
                        const endMin = timeToMinutes(s.endTime);
                        const duration = Math.max(45, endMin - startMin);

                        const top =
                          ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                        const height = (duration / 60) * HOUR_HEIGHT - 2;

                        return (
                          <button
                            key={s.id}
                            type="button"
                            style={{
                              top: `${Math.max(0, top)}px`,
                              height: `${Math.max(38, height)}px`,
                            }}
                            onClick={() => onSelectSlotToBook?.(s, activeDayIso)}
                            className="absolute left-2 right-2 z-10 rounded-xl border border-dashed border-brand-primary/50 bg-brand-primary/5 hover:bg-brand-primary/15 hover:border-brand-primary p-3 flex items-center justify-between text-left transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-body-sm font-bold text-foreground">
                                {s.startTime} - {s.endTime}
                              </span>
                              <span className="text-body-xs text-muted-foreground">
                                Tutor: {s.tutor?.name}
                              </span>
                              {s.mode === "online" ? (
                                <Badge
                                  variant="outline"
                                  className="text-blue-600 text-[10px]"
                                >
                                  Online
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-600 text-[10px]"
                                >
                                  {s.location || "Offline"}
                                </Badge>
                              )}
                            </div>
                            <span className="text-brand-primary font-bold text-body-xs flex items-center gap-1 group-hover:underline">
                              <Plus className="size-4" />
                              Pilih Slot Ini
                            </span>
                          </button>
                        );
                      })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 3: GOOGLE CALENDAR MONTH GRID VIEW                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {viewMode === "month" && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
            {/* 7 Days Column Headers */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/20 text-center">
              {DAY_NAMES_ID.map((dayName) => (
                <div
                  key={dayName}
                  className="p-2 text-body-xs font-bold text-muted-foreground uppercase tracking-wider"
                >
                  {dayName.slice(0, 3)}
                </div>
              ))}
            </div>

            {/* Month Day Cells (7 cols x 5/6 rows) */}
            <div className="grid grid-cols-7 divide-x divide-y divide-border/60">
              {monthDays.map((cell) => {
                // Find bookings on this day
                const cellBookings = filteredBookings.filter(
                  (b) => b.sessionDate === cell.dateIso
                );

                // Find academic schedules on this day
                const cellAcademic = filteredAcademicSchedules.filter(
                  (sched) => {
                    if (!sched.startDate) return false;
                    const schedIso = formatIsoDate(new Date(sched.startDate));
                    return schedIso === cell.dateIso;
                  }
                );

                // Open slots for this weekday
                const cellOpenSlots = filteredSlots.filter(
                  (s) => s.dayOfWeek === cell.dayName && !s.booking
                );

                return (
                  <div
                    key={cell.dateIso}
                    onClick={(e) => {
                      if (e.target === e.currentTarget && role === "admin" && onCreateScheduleDirect) {
                        onCreateScheduleDirect(cell.dateIso, "09:00");
                      }
                    }}
                    className={cn(
                      "min-h-[105px] p-1.5 flex flex-col justify-between transition-colors",
                      cell.isCurrentMonth
                        ? "bg-card hover:bg-muted/10"
                        : "bg-muted/30 opacity-60",
                      cell.isToday && "bg-brand-primary/[0.04]",
                      role === "admin" && onCreateScheduleDirect && "cursor-pointer"
                    )}
                  >
                    {/* Cell Day Header */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center size-5 text-[11px] font-bold rounded-full",
                          cell.isToday
                            ? "bg-brand-primary text-white"
                            : "text-foreground"
                        )}
                      >
                        {cell.dayOfMonth}
                      </span>

                      <div className="flex items-center gap-1">
                        {role === "admin" && onCreateScheduleDirect && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateScheduleDirect(cell.dateIso, "09:00");
                            }}
                            className="text-muted-foreground hover:text-brand-primary font-bold p-0.5 rounded transition-colors"
                            title="Buat Jadwal pada tanggal ini"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDate(cell.date);
                            setViewMode("day");
                          }}
                          className="text-[9px] text-muted-foreground hover:text-brand-primary font-medium"
                        >
                          Detail
                        </button>
                      </div>
                    </div>

                    {/* Events List in Day Cell */}
                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px]">
                      {/* Academic Schedules */}
                      {cellAcademic.map((sched) => (
                        <div
                          key={sched.id}
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold truncate bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
                          title={sched.title}
                        >
                          ★ {sched.title}
                        </div>
                      ))}

                      {/* Booked Sessions */}
                      {cellBookings.map((b) => {
                        const tutorStyle = getTutorColorStyle(
                          b.slot?.tutorId || b.studentId
                        );
                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              if (role === "student") {
                                onOpenPreSession?.(b);
                              } else {
                                onOpenPostSession?.(b);
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold truncate border ${tutorStyle.border} ${tutorStyle.bg} cursor-pointer hover:shadow-xs`}
                            title={`${b.course?.title} (${b.startTime} - ${b.endTime})`}
                          >
                            <span className="font-bold">
                              {b.startTime?.slice(0, 5)}
                            </span>{" "}
                            {b.course?.title || "Tutorial"}
                          </div>
                        );
                      })}

                      {/* Open Slots indicator for students */}
                      {role === "student" &&
                        cellBookings.length === 0 &&
                        cellOpenSlots.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDate(cell.date);
                              setViewMode("day");
                            }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[9px] font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 truncate"
                          >
                            + {cellOpenSlots.length} Slot Tersedia
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
