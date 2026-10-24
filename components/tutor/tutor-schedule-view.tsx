"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  Users,
  Video,
  MapPin,
  BookOpen,
  Send,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  INDONESIAN_DAYS,
  type IndonesianDay,
  getWeekScheduleDays,
  getJakartaCalendarDate,
  getJakartaNow,
  parseDateInput,
  daysFrom,
} from "@/lib/date-utils";
import {
  canTutorCreateAvailability,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";
import { cn } from "@/lib/utils";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import type {
  TutorScheduleReadModel,
  OwnedBookingItem,
  OwnedTicketItem,
} from "@/lib/schedule/tutor-read-model";
import {
  addTutorSlotWithNotesAction,
  getTutorSlotNotesAction,
} from "@/app/(tutor)/tutor/schedule/slot-note-actions";
import {
  deleteTutorSlotAction,
  copyTutorAvailabilityAction,
  moveTutorSessionAction,
  decideTutorRescheduleTicketAction,
  replyTutorTicketMessageAction,
} from "@/app/(tutor)/tutor/schedule/actions";

function computeEndTime(startStr: string): string {
  if (!startStr) return "10:30";
  const [h, m] = startStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "10:30";
  const totalMin = h * 60 + m + 90;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function getIndonesianWeekdayFromDate(dateStr: string): IndonesianDay {
  if (!dateStr) return "Senin";
  const d = parseDateInput(dateStr);
  const dayIdx = d.getDay();
  return dayIdx === 0 ? "Minggu" : INDONESIAN_DAYS[dayIdx - 1];
}

function formatWeekDate(dateStr: string, locale: "id" | "en") {
  const date = parseDateInput(dateStr);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export interface TutorScheduleViewProps {
  initialData: TutorScheduleReadModel;
  currentUserId: string;
  initialWeekOffset?: number;
}

export function TutorScheduleView({
  initialData,
  currentUserId,
  initialWeekOffset = 0,
}: TutorScheduleViewProps) {
  const t = useTranslations("tutor.schedule");
  const { locale } = useAppLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useUrlTab("tab", "calendar");
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("all");

  const [scheduleData, setScheduleData] = useState(initialData);
  const [slotNotes, setSlotNotes] = useState<Record<string, string>>({});
  const [activeSessionBookingId, setActiveSessionBookingId] = useState<string | null>(null);
  const [slotPendingDelete, setSlotPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    setWeekOffset(initialWeekOffset);
    setScheduleData(initialData);
  }, [initialData, initialWeekOffset]);

  useEffect(() => {
    const ids = scheduleData.ownedSlots.map((slot) => slot.id);
    if (ids.length === 0) {
      setSlotNotes({});
      return;
    }
    let cancelled = false;
    void getTutorSlotNotesAction(ids)
      .then((notes) => {
        if (!cancelled) setSlotNotes(notes);
      })
      .catch(() => {
        if (!cancelled) setSlotNotes({});
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleData.ownedSlots]);

  const anchorDate = useMemo(() => {
    return daysFrom(weekOffset * 7, getJakartaNow());
  }, [weekOffset]);

  const weekInfo = useMemo(() => {
    return getWeekScheduleDays(anchorDate);
  }, [anchorDate]);

  const isWeekLocked = false;

  useEffect(() => {
    for (const offset of [weekOffset - 1, weekOffset + 1]) {
      const params = new URLSearchParams(window.location.search);
      if (offset === 0) params.delete("week");
      else params.set("week", String(offset));
      router.prefetch(`${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [router, weekOffset]);

  const [isAddSlotOpen, setIsAddSlotOpen] = useState(false);
  const [isMoveSessionOpen, setIsMoveSessionOpen] = useState(false);
  const [isDecideTicketOpen, setIsDecideTicketOpen] = useState(false);

  const [newSlotDate, setNewSlotDate] = useState(() => getJakartaCalendarDate());
  const [newSlotStart, setNewSlotStart] = useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = useState("10:30");
  const [newSlotMode, setNewSlotMode] = useState<"online" | "offline">("online");
  const [newSlotLocation, setNewSlotLocation] = useState("");
  const [newSlotNotes, setNewSlotNotes] = useState("");

  const derivedWeekday = useMemo(
    () => getIndonesianWeekdayFromDate(newSlotDate),
    [newSlotDate],
  );
  const canEditSelectedSlotDate = true;

  const [movingBooking, setMovingBooking] = useState<OwnedBookingItem | null>(null);
  const [targetMoveSlotId, setTargetMoveSlotId] = useState<string>("");
  const [targetMoveDate, setTargetMoveDate] = useState<string>("");
  const [moveReasonInput, setMoveReasonInput] = useState<string>("");

  const [decidingTicket, setDecidingTicket] = useState<OwnedTicketItem | null>(null);
  const [ticketDecision, setTicketDecision] = useState<"approved" | "rejected">("approved");
  const [decisionNotesInput, setDecisionNotesInput] = useState<string>("");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const filteredSlots = scheduleData.ownedSlots.filter((slot) => {
    if (!slot.sessionDate) return false;
    if (selectedDayFilter !== "all" && slot.dayOfWeek !== selectedDayFilter) return false;
    if (selectedCourseFilter !== "all" && slot.booking?.courseId !== selectedCourseFilter) return false;
    if (selectedGroupFilter !== "all" && slot.booking?.groupId !== selectedGroupFilter) return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchDay = slot.dayOfWeek.toLowerCase().includes(q);
      const matchTime = `${slot.startTime}-${slot.endTime}`.includes(q);
      const matchLocation = slot.location?.toLowerCase().includes(q) ?? false;
      const matchTopic = slot.booking?.topic?.toLowerCase().includes(q) ?? false;
      const matchNotes = slotNotes[slot.id]?.toLowerCase().includes(q) ?? false;
      return matchDay || matchTime || matchLocation || matchTopic || matchNotes;
    }
    return true;
  });

  const filteredBookings = scheduleData.ownedBookings.filter((b) => {
    if (selectedCourseFilter !== "all" && b.courseId !== selectedCourseFilter) return false;
    if (selectedGroupFilter !== "all" && b.groupId !== selectedGroupFilter) return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchGroup = b.group?.name.toLowerCase().includes(q) ?? false;
      const matchCourse = b.course?.title.toLowerCase().includes(q) ?? false;
      const matchTopic = b.topic?.toLowerCase().includes(q) ?? false;
      const matchStudent = b.student?.name?.toLowerCase().includes(q) ?? false;
      return matchGroup || matchCourse || matchTopic || matchStudent;
    }
    return true;
  });

  const filteredTickets = scheduleData.ownedTickets.filter((t) => {
    if (selectedGroupFilter !== "all" && t.groupId !== selectedGroupFilter) return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      return (
        t.reason.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAddSlot = () => {
    startTransition(async () => {
      const res = await addTutorSlotWithNotesAction({
        dayOfWeek: derivedWeekday,
        startTime: newSlotStart,
        endTime: newSlotEnd,
        mode: newSlotMode,
        location: newSlotLocation,
        sessionDate: newSlotDate || undefined,
        notes: newSlotNotes,
      });

      if (res.success) {
        setIsAddSlotOpen(false);
        setNewSlotNotes("");
        toast.success(t("slotAdded"));
        router.refresh();
      } else {
        toast.error(t("slotAddFailed"));
      }
    });
  };

  const handleStartTimeChange = (val: string) => {
    if (!val) {
      setNewSlotStart("");
      setNewSlotEnd(computeEndTime(""));
      return;
    }
    const [hours, minutes] = val.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const snappedMinutes = Math.min(
      20 * 60 + 30,
      Math.max(7 * 60, Math.round((hours * 60 + minutes) / 30) * 30),
    );
    const snapped = `${String(Math.floor(snappedMinutes / 60)).padStart(2, "0")}:${String(snappedMinutes % 60).padStart(2, "0")}`;
    setNewSlotStart(snapped);
    setNewSlotEnd(computeEndTime(snapped));
  };

  const handleCreateSlotDirect = (dateIso: string, startTimeStr?: string) => {
    setNewSlotDate(dateIso);
    setNewSlotNotes("");
    const start = startTimeStr || "09:00";
    setNewSlotStart(start);
    setNewSlotEnd(computeEndTime(start));
    setIsAddSlotOpen(true);
  };

  const handleWeekChange = (offset: number) => {
    setWeekOffset(offset);
    const url = new URL(window.location.href);
    if (offset === 0) url.searchParams.delete("week");
    else url.searchParams.set("week", String(offset));
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };

  const handleOpenMoveModal = (booking: OwnedBookingItem) => {
    setMovingBooking(booking);
    setTargetMoveSlotId("");
    setTargetMoveDate(booking.sessionDate || "");
    setMoveReasonInput("");
    setIsMoveSessionOpen(true);
  };

  const requestDeleteSlot = (slotId: string) => setSlotPendingDelete(slotId);

  const handleDeleteSlot = (slotId: string) => {
    startTransition(async () => {
      const res = await deleteTutorSlotAction({ slotId });
      if (res.success) {
        setSlotNotes((current) => {
          const next = { ...current };
          delete next[slotId];
          return next;
        });
        toast.success(t("slotDeleted"));
        setSlotPendingDelete(null);
        router.refresh();
      } else {
        toast.error(t("slotDeleteFailed"));
      }
    });
  };

  const handleMoveSession = () => {
    if (!movingBooking || !targetMoveSlotId || !targetMoveDate) {
      toast.error(t("chooseSlotAndDate"));
      return;
    }
    startTransition(async () => {
      const res = await moveTutorSessionAction({
        bookingId: movingBooking.id,
        targetSlotId: targetMoveSlotId,
        targetSessionDate: targetMoveDate,
        reason: moveReasonInput,
      });
      if (res.success) {
        setIsMoveSessionOpen(false);
        setMovingBooking(null);
        if (res.movedDirectly) {
          toast.success(t("sessionMoved"));
        } else {
          toast.info(t("rescheduleSubmitted"));
        }
        router.refresh();
      } else {
        toast.error(t("sessionMoveFailed"));
      }
    });
  };

  const handleDecideTicket = () => {
    if (!decidingTicket) return;
    startTransition(async () => {
      const res = await decideTutorRescheduleTicketAction({
        ticketId: decidingTicket.id,
        decision: ticketDecision,
        decisionNotes: decisionNotesInput,
      });
      if (res.success) {
        setIsDecideTicketOpen(false);
        setDecidingTicket(null);
        toast.success(t("ticketDecisionSaved", { decision: t(ticketDecision === "approved" ? "decisionApproved" : "decisionRejected") }));
        router.refresh();
      } else {
        toast.error(t("ticketProcessFailed"));
      }
    });
  };

  const handleReplyTicket = () => {
    if (!openThreadId || replyText.trim().length === 0) return;
    startTransition(async () => {
      const res = await replyTutorTicketMessageAction({
        ticketId: openThreadId,
        message: replyText,
      });
      if (res.success) {
        setReplyText("");
        toast.success(t("replySent"));
        router.refresh();
      } else {
        toast.error(t("replyFailed"));
      }
    });
  };

  const unbookedSlots = scheduleData.ownedSlots.filter((s) => s.sessionDate && !s.booking);
  const weekSlots = scheduleData.ownedSlots.filter(
    (slot) => slot.sessionDate && slot.sessionDate >= weekInfo.startOfWeekIso && slot.sessionDate <= weekInfo.endOfWeekIso,
  );
  const weekBookings = scheduleData.ownedBookings.filter(
    (booking) => booking.sessionDate && booking.sessionDate >= weekInfo.startOfWeekIso && booking.sessionDate <= weekInfo.endOfWeekIso,
  );
  const openedSlotCount = weekSlots.length;
  const filledSlotCount = new Set(weekBookings.map((booking) => booking.slotId)).size;
  const availableSlotCount = Math.max(0, openedSlotCount - filledSlotCount);
  const activeSessionBooking = activeSessionBookingId
    ? scheduleData.ownedBookings.find((booking) => booking.id === activeSessionBookingId) || null
    : null;
  const pendingDeleteSlot = slotPendingDelete
    ? scheduleData.ownedSlots.find((slot) => slot.id === slotPendingDelete) ?? null
    : null;

  const handleCopyPreviousWeek = () => {
    startTransition(async () => {
      const result = await copyTutorAvailabilityAction(weekInfo.startOfWeekIso);
      if (result.success) {
        const conflictMessage = result.conflicts.length > 0
          ? t("slotConflicts", { count: result.conflicts.length })
          : "";
        toast.success(`${t("copiedSlots", { count: result.createdCount })}${conflictMessage}`);
        router.refresh();
      } else {
        toast.error(t("copySlotFailed"));
      }
    });
  };

  const openAddSlotDialog = () => {
    const todayIso = getJakartaCalendarDate();
    setNewSlotDate(weekInfo.days[0].dateIso < todayIso ? todayIso : weekInfo.days[0].dateIso);
    setNewSlotStart("09:00");
    setNewSlotEnd("10:30");
    setNewSlotNotes("");
    setIsAddSlotOpen(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-heading text-xl font-bold text-foreground">{t("title")}</h1>
            <span className="text-body-sm font-semibold text-foreground">
              {formatWeekDate(weekInfo.days[0].dateIso, locale)} - {formatWeekDate(weekInfo.days[6].dateIso, locale)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
            <span><strong className="text-foreground">{openedSlotCount}</strong> {t("opened")}</span>
            <span><strong className="text-foreground">{filledSlotCount}</strong> {t("filled")}</span>
            <span><strong className="text-foreground">{availableSlotCount}</strong> {t("available")}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleCopyPreviousWeek} className="h-9 text-body-sm">
            <CalendarDays className="size-3.5" />
            {t("copyPreviousWeek")}
          </Button>
          <Button type="button" size="sm" onClick={openAddSlotDialog} className="h-9 text-body-sm">
            <Plus className="size-4" />
            {t("addSlot")}
          </Button>
        </div>
      </header>

      {activeTab !== "calendar" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[140px] max-w-sm flex-1">
            <SearchBar
              placeholder={t("search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
            />
          </div>
          <Select value={selectedDayFilter} onValueChange={setSelectedDayFilter}>
            <SelectTrigger className="h-9 w-[130px] shrink-0 rounded-lg text-body-sm">
              <SelectValue placeholder={t("chooseDay")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allDays")}</SelectItem>
              {INDONESIAN_DAYS.map((day) => <SelectItem key={day} value={day}>{t(`days.${day}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {initialData.assignedActiveCourses.length > 0 && (
            <Select value={selectedCourseFilter} onValueChange={setSelectedCourseFilter}>
              <SelectTrigger className="h-9 w-[150px] shrink-0 rounded-lg text-body-sm">
                <SelectValue placeholder={t("allCourses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCourses")}</SelectItem>
                {initialData.assignedActiveCourses.map((course) => (
                  <SelectItem key={course.courseId} value={course.courseId}>{course.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {initialData.eligibleGroups.length > 0 && (
            <Select value={selectedGroupFilter} onValueChange={setSelectedGroupFilter}>
              <SelectTrigger className="h-9 w-[150px] shrink-0 rounded-lg text-body-sm">
                <SelectValue placeholder={t("allGroups")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allGroups")}</SelectItem>
                {initialData.eligibleGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <div>
          <TabsList>
            <TabsTrigger value="calendar">{t("calendar")}</TabsTrigger>
            <TabsTrigger value="tickets">{t("tickets")}</TabsTrigger>
            <TabsTrigger value="groups">{t("classesGroups")}</TabsTrigger>
            <TabsTrigger value="slots">{t("slots")}</TabsTrigger>
            <TabsTrigger value="sessions">{t("sessions")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="space-y-3">
          <div className={calendarStyles.root}>
            <ScheduleCalendarView
              role="teacher"
              currentUserId={currentUserId}
              weekInfo={weekInfo}
              isWeekLocked={isWeekLocked}
              weekOffset={weekOffset}
              onWeekChange={handleWeekChange}
              coursesList={initialData.assignedActiveCourses.map((c) => ({ id: c.courseId, title: c.title }))}
              groupsList={initialData.eligibleGroups.map((g) => ({ id: g.id, name: g.name }))}
              slots={scheduleData.ownedSlots}
              bookings={scheduleData.ownedBookings}
              onCreateScheduleDirect={handleCreateSlotDirect}
              onMoveSession={handleOpenMoveModal}
              onDeleteSlot={requestDeleteSlot}
              onOpenSessionDetail={(booking) => setActiveSessionBookingId(booking.id)}
            />
          </div>
        </TabsContent>

        <TabsContent value="slots" className="space-y-3">
          {filteredSlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card">
              <AdminEmptyState icon={CalendarDays} title={t("noSlots")} description={t("noSlotsDescription")} />
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {filteredSlots.map((slot) => {
                const isBooked = Boolean(slot.booking);
                return (
                  <div key={slot.id} className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-body-base font-bold text-foreground">{t(`days.${slot.dayOfWeek}`)}</span>
                        <Badge variant={isBooked ? "default" : "secondary"} className="rounded-md text-body-xs font-semibold">{isBooked ? t("booked") : t("open")}</Badge>
                        <Badge variant="outline" className="rounded-md text-body-xs font-normal">{slot.mode === "online" ? t("online") : t("inPerson")}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-body-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{slot.startTime} - {slot.endTime} (90m)</span>
                        {slot.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{slot.location}</span>}
                        {slot.sessionDate && <span>{t("date")}: {slot.sessionDate}</span>}
                      </div>
                      {slotNotes[slot.id] && (
                        <p className="max-w-2xl whitespace-pre-wrap break-words text-body-xs text-muted-foreground">
                          {t("tutorNotes")}: {slotNotes[slot.id]}
                        </p>
                      )}
                      {slot.booking && <p className="pt-0.5 text-body-xs font-medium text-foreground">{t("topic")}: {slot.booking.topic || t("noSpecificTopic")}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isBooked ? (
                        <Button variant="outline" size="sm" disabled className="h-8 rounded-lg text-body-sm opacity-60">{t("booked")}</Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={isPending} onClick={() => requestDeleteSlot(slot.id)} className="h-8 rounded-lg text-body-sm text-status-error hover:bg-status-error/10 hover:text-status-error">
                          <Trash2 className="mr-1.5 size-4" />{t("delete")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-3">
          {filteredBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card"><AdminEmptyState icon={BookOpen} title={t("noSessions")} /></div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {filteredBookings.map((booking) => (
                <div key={booking.id} className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-body-base font-bold text-foreground">{booking.course?.title || t("course")}</span>
                      <Badge variant="outline" className="rounded-md border-brand-primary/30 text-body-xs font-semibold text-brand-primary">{booking.group?.name || t("group")}</Badge>
                      <Badge variant={booking.status === "completed" ? "default" : "secondary"} className="rounded-md text-body-xs">{booking.status === "completed" ? t("completed") : t("scheduled")}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-body-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{booking.sessionDate} ({booking.startTime} - {booking.endTime})</span>
                      <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{t("representativeShort")}: {booking.student?.name || t("leader")}</span>
                    </div>
                    {booking.topic && <p className="pt-0.5 text-body-xs font-medium text-foreground">Topik: {booking.topic}</p>}
                    {booking.googleMeetUrl && (
                      <div className="pt-1">
                        <a href={booking.googleMeetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-brand-primary hover:underline">
                          <Video className="size-3.5" /><span>{t("googleMeetSession")}</span><ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenMoveModal(booking)} className="h-8 rounded-lg text-body-sm">
                      <RotateCcw className="mr-1.5 size-3.5" />{t("moveSchedule")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card"><AdminEmptyState icon={ShieldCheck} title={t("noTickets")} /></div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {filteredTickets.map((ticket) => {
                const isPendingTicket = ticket.status === "pending";
                const isThreadOpen = openThreadId === ticket.id;
                return (
                  <div key={ticket.id} className="space-y-3 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-body-base font-bold text-foreground">{t("ticket")}: {ticket.type === "reschedule" ? t("reschedule") : t("cancellation")}</span>
                          <Badge
                            variant={ticket.status === "approved" ? "default" : ticket.status === "rejected" ? "outline" : "secondary"}
                            className={`rounded-md text-body-xs font-semibold ${ticket.status === "rejected" ? "border-status-error/30 bg-status-error/10 text-status-error" : ""}`}
                          >
                            {ticket.status === "approved" ? t("approved") : ticket.status === "rejected" ? t("rejected") : t("awaitingDecision")}
                          </Badge>
                        </div>
                        <p className="text-body-xs font-medium text-foreground">{t("reason")}: {ticket.reason}</p>
                        {ticket.proposedDate && <p className="text-body-xs text-muted-foreground">{t("proposedDate")}: {ticket.proposedDate}</p>}
                        {ticket.decisionNotes && <p className="text-body-xs italic text-muted-foreground">{t("notes")}: {ticket.decisionNotes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setOpenThreadId(isThreadOpen ? null : ticket.id); setReplyText(""); }} aria-expanded={isThreadOpen} className="h-8 rounded-lg text-body-sm">
                          <MessageSquare className="mr-1.5 size-4" />{t("discussion")}{ticket.messages.length > 0 ? ` (${ticket.messages.length})` : ""}
                        </Button>
                        {isPendingTicket && (
                          <Button size="sm" onClick={() => { setDecidingTicket(ticket); setTicketDecision("approved"); setDecisionNotesInput(""); setIsDecideTicketOpen(true); }} className="h-8 rounded-lg bg-brand-primary text-body-sm text-white hover:bg-brand-primary/90">{t("decide")}</Button>
                        )}
                      </div>
                    </div>
                    {isThreadOpen && (
                      <div className="space-y-3 border-l-2 border-border pl-3">
                        {ticket.messages.length === 0 ? (
                          <p className="text-body-xs text-muted-foreground">{t("noMessages")}</p>
                        ) : (
                          <ul className="space-y-2">
                            {ticket.messages.map((msg) => {
                              const isTutor = msg.senderId === currentUserId;
                              return (
                                <li key={msg.id} className={cn("space-y-1 rounded-lg border p-2.5", isTutor ? "border-brand-primary/25 bg-brand-primary/5" : "border-border/70 bg-card")}>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-body-xs font-semibold text-foreground">{isTutor ? t("you") : msg.senderName || t("groupMember")}</p>
                                    <FormattedDate date={msg.createdAt} options={{ dateStyle: "short", timeStyle: "short" }} locale={locale === "en" ? "en-US" : "id-ID"} />
                                  </div>
                                  <p className="whitespace-pre-wrap text-body-sm text-foreground">{msg.message}</p>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <div className="flex items-end gap-2">
                          <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={t("replyPlaceholder")} className="min-h-[44px] flex-1 resize-none text-body-sm" maxLength={2000} />
                          <Button size="sm" disabled={isPending || replyText.trim().length === 0} onClick={handleReplyTicket} aria-label={t("sendReply")} className="h-9 shrink-0 rounded-lg"><Send className="mr-1.5 size-4" />{t("send")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <div className="space-y-3">
            <h2 className="font-heading text-body-base font-bold text-foreground">{t("assignedCourses")}</h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {initialData.assignedActiveCourses.map((course) => (
                <div key={course.courseId} className="flex items-center justify-between gap-3 p-4">
                  <div><p className="font-heading text-body-sm font-bold text-foreground">{course.title}</p><p className="text-body-xs text-muted-foreground">{t("courseCode")}: {course.code || course.courseId}</p></div>
                  <Badge variant="outline" className="rounded-md text-body-xs text-muted-foreground">{course.isCompatibilityFallback ? t("legacyAssignment") : t("canonicalAssignment")}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="font-heading text-body-base font-bold text-foreground">{t("activeGroups")}</h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {initialData.eligibleGroups.length === 0 ? (
                <p className="p-4 text-body-sm text-muted-foreground">{t("noActiveGroups")}</p>
              ) : (
                initialData.eligibleGroups.map((grp) => (
                  <div key={grp.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <p className="font-heading text-body-sm font-bold text-foreground">{grp.name}</p>
                      <p className="text-body-xs text-muted-foreground">{t("package")}: {grp.packageName} ({grp.usedQuotaSessions}/{grp.totalQuotaSessions} {t("sessionsUsed")})</p>
                      <p className="text-body-xs text-muted-foreground">{t("representativeShort")}: {grp.representative?.name || t("leader")} ({grp.representative?.role || t("leader")})</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 rounded-md text-body-xs">{grp.membersCount} {t("members")}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddSlotOpen} onOpenChange={(open) => { if (!isPending) setIsAddSlotOpen(open); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">{t("addSlotTitle")}</DialogTitle>
            <DialogDescription className="text-body-xs">{t("addSlotDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="tutor-slot-date" className="text-body-sm font-semibold">{t("date")}</Label>
              <Input
                id="tutor-slot-date"
                type="date"
                value={newSlotDate}
                min={getJakartaCalendarDate()}
                onChange={(e) => setNewSlotDate(e.target.value)}
                className="h-9 text-body-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("start")}</Label>
                <Input type="time" value={newSlotStart} onChange={(e) => handleStartTimeChange(e.target.value)} placeholder="09:00" min="07:00" max="20:30" step="1800" className="h-9 text-body-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("end")}</Label>
                <Input value={newSlotEnd} readOnly placeholder="10:30" className="h-9 cursor-not-allowed bg-muted text-body-sm text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("sessionMode")}</Label>
              <Select value={newSlotMode} onValueChange={(val) => setNewSlotMode(val as "online" | "offline")}>
                <SelectTrigger className="h-9 text-body-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="online">{t("online")} (Google Meet)</SelectItem><SelectItem value="offline">{t("inPerson")}</SelectItem></SelectContent>
              </Select>
            </div>
            {newSlotMode === "offline" && (
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("location")}</Label>
                <Input value={newSlotLocation} onChange={(e) => setNewSlotLocation(e.target.value)} placeholder={t("locationPlaceholder")} className="h-9 text-body-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="tutor-slot-notes" className="text-body-sm font-semibold">{t("tutorNotes")} <span className="font-normal text-muted-foreground">({t("optional")})</span></Label>
              <Textarea
                id="tutor-slot-notes"
                value={newSlotNotes}
                onChange={(e) => setNewSlotNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                maxLength={1000}
                className="min-h-20 resize-y text-body-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => setIsAddSlotOpen(false)} className="h-9 rounded-lg text-body-sm">{t("cancel")}</Button>
            <Button size="sm" isLoading={isPending} disabled={!newSlotStart} onClick={handleAddSlot} className="h-9 rounded-lg bg-brand-primary text-body-sm text-white hover:bg-brand-primary/90">{t("saveSlot")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmDialog
        open={Boolean(pendingDeleteSlot)}
        onOpenChange={(open) => { if (!open) setSlotPendingDelete(null); }}
        title={t("deleteSlotTitle")}
        description={pendingDeleteSlot ? t("deleteSlotDescription", {
          day: t(`days.${pendingDeleteSlot.dayOfWeek}`),
          startTime: pendingDeleteSlot.startTime,
          endTime: pendingDeleteSlot.endTime,
        }) : ""}
        confirmLabel={t("deleteSpecificSlot")}
        cancelLabel={t("cancel")}
        loading={isPending}
        onConfirm={() => { if (pendingDeleteSlot) handleDeleteSlot(pendingDeleteSlot.id); }}
      />

      <Dialog open={isMoveSessionOpen} onOpenChange={(open) => { if (!isPending) setIsMoveSessionOpen(open); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">{t("moveSessionTitle")}</DialogTitle>
            <DialogDescription className="text-body-xs">{t("moveSessionDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("targetSlot")}</Label>
              <Select value={targetMoveSlotId} onValueChange={setTargetMoveSlotId}>
                <SelectTrigger className="h-9 text-body-sm"><SelectValue placeholder={t("selectNewSlot")} /></SelectTrigger>
                <SelectContent>{unbookedSlots.map((s) => <SelectItem key={s.id} value={s.id}>{t(`days.${s.dayOfWeek}`)} ({s.startTime} - {s.endTime})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("newDate")}</Label>
              <Input type="date" value={targetMoveDate} onChange={(e) => setTargetMoveDate(e.target.value)} className="h-9 text-body-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("changeReason")}</Label>
              <Textarea value={moveReasonInput} onChange={(e) => setMoveReasonInput(e.target.value)} placeholder={t("moveReasonPlaceholder")} className="h-20 resize-none rounded-lg text-body-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => setIsMoveSessionOpen(false)} className="h-9 rounded-lg text-body-sm">{t("cancel")}</Button>
            <Button size="sm" isLoading={isPending} onClick={handleMoveSession} className="h-9 rounded-lg bg-brand-primary text-body-sm text-white hover:bg-brand-primary/90">{t("confirmMove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDecideTicketOpen} onOpenChange={(open) => { if (!isPending) setIsDecideTicketOpen(open); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">{t("ticketDecisionTitle", { type: decidingTicket?.type === "reschedule" ? t("reschedule") : t("cancellation") })}</DialogTitle>
            <DialogDescription className="text-body-xs">{t("ticketDecisionDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("decision")}</Label>
              <Select value={ticketDecision} onValueChange={(val) => setTicketDecision(val as "approved" | "rejected")}>
                <SelectTrigger className="h-9 text-body-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="approved">{t("approve")}</SelectItem><SelectItem value="rejected">{t("rejected")}</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("decisionNotes")}</Label>
              <Textarea value={decisionNotesInput} onChange={(e) => setDecisionNotesInput(e.target.value)} placeholder={t("decisionNotesPlaceholder")} className="h-20 resize-none rounded-lg text-body-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => setIsDecideTicketOpen(false)} className="h-9 rounded-lg text-body-sm">{t("cancel")}</Button>
            <Button size="sm" isLoading={isPending} onClick={handleDecideTicket} className={`h-9 rounded-lg text-body-sm ${ticketDecision === "approved" ? "bg-brand-primary text-white hover:bg-brand-primary/90" : "bg-status-error text-white hover:bg-status-error/90"}`}>{t("saveDecision")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionDetailDrawer
        open={Boolean(activeSessionBookingId)}
        onOpenChange={(open) => { if (!open) setActiveSessionBookingId(null); }}
        booking={activeSessionBooking}
        role="teacher"
        currentUserId={currentUserId}
        tutorName={scheduleData.tutor.name}
        availableSlots={scheduleData.ownedSlots}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
