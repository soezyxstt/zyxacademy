"use client";

import { useState, useMemo } from "react";
import {
  CalendarDays,
  Clock,
  Video,
  MapPin,
  Sparkles,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIsoDate } from "@/lib/date-utils";

// Distinct color palettes for tutors
const TUTOR_COLORS = [
  {
    border: "border-indigo-300 dark:border-indigo-800",
    bg: "bg-indigo-50/70 dark:bg-indigo-950/30",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  {
    border: "border-emerald-300 dark:border-emerald-800",
    bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    border: "border-amber-300 dark:border-amber-800",
    bg: "bg-amber-50/70 dark:bg-amber-950/30",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    border: "border-rose-300 dark:border-rose-800",
    bg: "bg-rose-50/70 dark:bg-rose-950/30",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
    accent: "text-rose-600 dark:text-rose-400",
  },
  {
    border: "border-violet-300 dark:border-violet-800",
    bg: "bg-violet-50/70 dark:bg-violet-950/30",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
    accent: "text-violet-600 dark:text-violet-400",
  },
  {
    border: "border-cyan-300 dark:border-cyan-800",
    bg: "bg-cyan-50/70 dark:bg-cyan-950/30",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300",
    accent: "text-cyan-600 dark:text-cyan-400",
  },
];

export function getTutorColorStyle(tutorId: string) {
  let hash = 0;
  for (let i = 0; i < tutorId.length; i++) {
    hash = tutorId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TUTOR_COLORS.length;
  return TUTOR_COLORS[index];
}

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
  onOpenPreSession?: (booking: any) => void;
  onOpenPostSession?: (booking: any) => void;
  onOpenRescheduleTicket?: (booking: any) => void;
  onOpenAuditLog?: (booking: any) => void;
};

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
  onOpenPreSession,
  onOpenPostSession,
  onOpenRescheduleTicket,
  onOpenAuditLog,
}: ScheduleCalendarProps) {
  // Mobile active day
  const [activeMobileDay, setActiveMobileDay] = useState(
    weekInfo.days.find((d) => d.isToday)?.dayName || "Senin"
  );

  // Filters
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");
  const [selectedTutorFilter, setSelectedTutorFilter] = useState("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  // Filtered academic schedules
  const filteredAcademicSchedules = useMemo(() => {
    return academicSchedules.filter((sched) => {
      if (selectedCourseFilter !== "all" && sched.courseId && sched.courseId !== selectedCourseFilter) {
        return false;
      }
      if (selectedTypeFilter !== "all" && sched.type !== selectedTypeFilter) {
        return false;
      }
      return true;
    });
  }, [academicSchedules, selectedCourseFilter, selectedTypeFilter]);

  return (
    <div className="space-y-4">
      {/* 1. Header Navigation Bar (Week Switcher & Multi-Filters) */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-sm">
        {/* Week Switcher */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onWeekChange(weekOffset - 1)}
            className="h-9 w-9 p-0 rounded-lg"
            title="Minggu Sebelumnya"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/20">
            <CalendarDays className="size-4 text-brand-primary shrink-0" />
            <span className="text-body-xs font-semibold text-foreground whitespace-nowrap">
              {weekInfo.days[0].dayOfMonth} {weekInfo.days[0].monthName} –{" "}
              {weekInfo.days[6].dayOfMonth} {weekInfo.days[6].monthName}
            </span>
          </div>

          <Button
            variant="outline"
            size="xs"
            onClick={() => onWeekChange(weekOffset + 1)}
            className="h-9 w-9 p-0 rounded-lg"
            title="Minggu Berikutnya"
          >
            <ChevronRight className="size-4" />
          </Button>

          {weekOffset !== 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onWeekChange(0)}
              className="h-9 rounded-lg text-body-xs font-semibold text-brand-primary"
            >
              Minggu Ini
            </Button>
          )}

          {isWeekLocked && (
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-amber-600 bg-amber-500/10 border-amber-500/30 gap-1">
              <Lock className="size-3" />
              Terkunci
            </Badge>
          )}
        </div>

        {/* Multi-Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Course Filter */}
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-body-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-brand-primary max-w-[170px] truncate"
          >
            <option value="all">Semua Mata Kuliah</option>
            {coursesList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Tutor Filter (for Student & Admin) */}
          {(role === "student" || role === "admin") && tutorsList.length > 0 && (
            <select
              value={selectedTutorFilter}
              onChange={(e) => setSelectedTutorFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-2.5 text-body-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-brand-primary max-w-[160px] truncate"
            >
              <option value="all">Semua Tutor</option>
              {tutorsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {/* Group Filter (for Tutor & Admin) */}
          {(role === "teacher" || role === "admin") && groupsList.length > 0 && (
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-2.5 text-body-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-brand-primary max-w-[160px] truncate"
            >
              <option value="all">Semua Kelompok</option>
              {groupsList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          {/* Schedule Type Filter */}
          {role === "admin" && (
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-2.5 text-body-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="all">Semua Jenis Jadwal</option>
              <option value="official_exam">Ujian Resmi ITB</option>
              <option value="tryout">Tryout</option>
              <option value="quiz">Kuis</option>
            </select>
          )}
        </div>
      </div>

      {/* 2. Global Academic Events Strip (Ujian Resmi ITB / Tryouts / Quizzes) */}
      {filteredAcademicSchedules.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-2">
          <div className="flex items-center gap-2 text-body-xs font-bold text-foreground">
            <Sparkles className="size-3.5 text-brand-primary" />
            <span>Jadwal Akademik & Evaluasi</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {filteredAcademicSchedules.map((sched) => {
              const typeLabel =
                sched.type === "official_exam"
                  ? "Ujian Resmi ITB"
                  : sched.type === "tryout"
                  ? "Tryout"
                  : "Kuis";

              return (
                <div
                  key={sched.id}
                  className="p-2.5 rounded-lg border border-border bg-card text-body-xs space-y-1 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-foreground truncate">{sched.title}</span>
                    <Badge variant="outline" className="text-[9px] uppercase shrink-0">
                      {typeLabel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                    <Clock className="size-3 shrink-0" />
                    <span>{formatIsoDate(new Date(sched.startDate))}</span>
                    {sched.location && <span>• {sched.location}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Mobile Day Tabs (visible only on mobile) */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-1">
        {weekInfo.days.map((d) => (
          <button
            key={d.dateIso}
            type="button"
            onClick={() => setActiveMobileDay(d.dayName)}
            className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg border text-center transition-all ${
              activeMobileDay === d.dayName
                ? "border-brand-primary bg-brand-primary text-white font-bold"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            <span className="text-[10px] uppercase font-semibold">{d.dayName}</span>
            <span className="text-body-xs font-bold">{d.dayOfMonth}</span>
          </button>
        ))}
      </div>

      {/* 4. Desktop 7-Day Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekInfo.days.map((day) => {
          // On mobile, show only active mobile day
          const isMobileVisible = activeMobileDay === day.dayName;

          // Find slots on this day
          const daySlots = slots.filter((s) => {
            if (s.dayOfWeek !== day.dayName) return false;
            if (selectedTutorFilter !== "all" && s.tutorId !== selectedTutorFilter) return false;
            return true;
          });

          // Find bookings for this day
          const dayBookings = bookings.filter((b) => {
            if (b.sessionDate && b.sessionDate !== day.dateIso) return false;
            if (!b.sessionDate && b.slot?.dayOfWeek !== day.dayName) return false;
            if (selectedCourseFilter !== "all" && b.courseId !== selectedCourseFilter) return false;
            if (selectedGroupFilter !== "all" && b.groupId !== selectedGroupFilter) return false;
            if (selectedTutorFilter !== "all" && b.slot?.tutorId !== selectedTutorFilter) return false;
            return true;
          });

          return (
            <div
              key={day.dateIso}
              className={`flex flex-col rounded-2xl border ${
                day.isToday
                  ? "border-brand-primary/60 bg-brand-primary/5"
                  : "border-border bg-card"
              } p-3 min-h-[380px] shadow-sm ${
                isMobileVisible ? "flex" : "hidden md:flex"
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-2 mb-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-body-sm font-bold text-foreground">
                    {day.dayName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {day.dayOfMonth} {day.monthName}
                  </span>
                </div>
                {day.isToday && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-brand-primary text-white px-1.5 py-0.5 rounded">
                    Hari Ini
                  </span>
                )}
              </div>

              {/* Day Cards Column */}
              <div className="flex-1 space-y-2.5 overflow-y-auto">
                {/* 1. Render Booked Sessions */}
                {dayBookings.map((b) => {
                  const tutorStyle = getTutorColorStyle(b.slot?.tutorId || b.studentId);
                  const isCompleted = b.status === "completed";
                  const isCancelled = b.status === "cancelled";
                  const hasQuestions = b.preSessionAttachments && b.preSessionAttachments.length > 0;
                  const hasTopic = Boolean(b.topic);

                  return (
                    <div
                      key={b.id}
                      className={`p-3 rounded-xl border ${tutorStyle.border} ${tutorStyle.bg} space-y-2 text-body-xs shadow-xs transition-all hover:shadow-sm`}
                    >
                      {/* Top Row: Course & Status */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <span className="font-bold text-foreground block truncate">
                            {b.course?.title || "Tutorial"}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate block">
                            {b.slot?.tutor?.name || "Tutor"} • {b.group?.name || "Kelompok"}
                          </span>
                        </div>
                        {isCompleted ? (
                          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0">
                            Selesai
                          </Badge>
                        ) : isCancelled ? (
                          <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30 shrink-0">
                            Batal
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[9px] bg-brand-primary text-white shrink-0">
                            Terjadwal
                          </Badge>
                        )}
                      </div>

                      {/* Time & Mode */}
                      <div className="flex items-center justify-between text-[11px] text-foreground font-medium">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground shrink-0" />
                          <span>
                            {b.startTime || b.slot?.startTime} - {b.endTime || b.slot?.endTime}
                          </span>
                        </div>

                        {b.mode === "online" || b.slot?.mode === "online" ? (
                          <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold">
                            <Video className="size-3" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[90px]" title={b.location || b.slot?.location || "Offline"}>
                            <MapPin className="size-3 shrink-0" />
                            {b.location || b.slot?.location || "Offline"}
                          </span>
                        )}
                      </div>

                      {/* Google Meet Link if available */}
                      {b.googleMeetUrl && !isCompleted && !isCancelled && (
                        <a
                          href={b.googleMeetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-semibold transition-colors shadow-xs"
                        >
                          <Video className="size-3.5" />
                          <span>Buka Google Meet</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}

                      {/* Topic & Questions Indicator */}
                      {(hasTopic || hasQuestions) && (
                        <div className="p-1.5 rounded-md bg-card/80 border border-border/60 text-[10px] space-y-0.5">
                          {hasTopic && (
                            <p className="font-medium text-foreground truncate">
                              💬 {b.topic}
                            </p>
                          )}
                          {hasQuestions && (
                            <p className="text-brand-primary font-semibold flex items-center gap-1">
                              <FileQuestion className="size-3" />
                              {b.preSessionAttachments.length} Soal Diunggah
                            </p>
                          )}
                        </div>
                      )}

                      {/* Last Modified Banner */}
                      {b.lastModifier && (
                        <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-1 leading-tight">
                          Diubah: <strong className="text-foreground">{b.lastModifier.name}</strong>
                          {b.lastModifiedAt && (
                            <span> • {formatIsoDate(new Date(b.lastModifiedAt))}</span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons Row */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
                        {/* Student Actions */}
                        {role === "student" && !isCompleted && !isCancelled && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onOpenPreSession && onOpenPreSession(b)}
                              className="h-7 px-2 text-[10px] rounded gap-1 text-foreground hover:bg-card"
                              title="Unggah Topik / Soal"
                            >
                              <FileText className="size-3" />
                              <span>Materi</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onOpenRescheduleTicket && onOpenRescheduleTicket(b)}
                              className="h-7 px-2 text-[10px] rounded gap-1 text-foreground hover:bg-card"
                              title="Reschedule / Batal"
                            >
                              <MessageSquare className="size-3" />
                              <span>Reschedule</span>
                            </Button>
                          </>
                        )}

                        {/* Tutor Actions */}
                        {role === "teacher" && !isCompleted && !isCancelled && (
                          <Button
                            variant="default"
                            size="xs"
                            onClick={() => onOpenPostSession && onOpenPostSession(b)}
                            className="h-7 w-full text-[10px] rounded bg-brand-primary text-white gap-1"
                          >
                            <CheckCircle2 className="size-3" />
                            <span>Selesaikan Sesi</span>
                          </Button>
                        )}

                        {/* Audit Trail Button */}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onOpenAuditLog && onOpenAuditLog(b)}
                          className="h-7 px-1.5 text-muted-foreground hover:text-foreground rounded"
                          title="Riwayat Aktivitas"
                        >
                          <History className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Render Available Empty Slots (For Students to Book) */}
                {role === "student" &&
                  daySlots
                    .filter((s) => !s.booking) // only open slots
                    .map((s) => {
                      return (
                        <div
                          key={s.id}
                          className="p-2.5 rounded-xl border border-dashed border-border bg-card/50 hover:bg-card hover:border-brand-primary transition-all space-y-2 text-body-xs group cursor-pointer"
                          onClick={() => onSelectSlotToBook && onSelectSlotToBook(s, day.dateIso)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground text-[11px]">
                              {s.startTime} - {s.endTime}
                            </span>
                            {s.mode === "online" ? (
                              <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-300">
                                Online
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-300 truncate max-w-[70px]">
                                {s.location || "Offline"}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate">{s.tutor?.name || "Tutor"}</span>
                            <span className="text-brand-primary font-bold group-hover:underline flex items-center gap-0.5">
                              <Plus className="size-3" />
                              Pilih
                            </span>
                          </div>
                        </div>
                      );
                    })}

                {/* Empty Day State */}
                {dayBookings.length === 0 && (role !== "student" || daySlots.length === 0) && (
                  <div className="py-12 text-center text-[11px] text-muted-foreground italic">
                    Tidak ada jadwal
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
