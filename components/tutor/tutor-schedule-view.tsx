"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  Users,
  Video,
  MapPin,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Send,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  isSessionLocked,
  getJakartaNow,
  formatIsoDateUtc,
  parseDateInput,
  daysFrom,
} from "@/lib/date-utils";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { PostSessionModal } from "@/components/schedule/post-session-modal";
import { AuditLogDrawer } from "@/components/schedule/audit-log-drawer";
import { cn } from "@/lib/utils";
import type {
  TutorScheduleReadModel,
  OwnedBookingItem,
  OwnedTicketItem,
} from "@/lib/schedule/tutor-read-model";

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
import {
  addTutorSlotAction,
  deleteTutorSlotAction,
  createTutorSessionAction,
  moveTutorSessionAction,
  decideTutorRescheduleTicketAction,
  replyTutorTicketMessageAction,
} from "@/app/(tutor)/tutor/schedule/actions";

export interface TutorScheduleViewProps {
  initialData: TutorScheduleReadModel;
  currentUserId: string;
}

export function TutorScheduleView({
  initialData,
  currentUserId,
}: TutorScheduleViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useUrlTab("tab", "calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("all");

  // Modals for session post-session and audit
  const [activePostSessionBooking, setActivePostSessionBooking] = useState<OwnedBookingItem | null>(null);
  const [activeAuditLogBooking, setActiveAuditLogBooking] = useState<OwnedBookingItem | null>(null);

  // Week calculation
  const anchorDate = useMemo(() => {
    return daysFrom(weekOffset * 7, getJakartaNow());
  }, [weekOffset]);

  const weekInfo = useMemo(() => {
    return getWeekScheduleDays(anchorDate);
  }, [anchorDate]);

  const isWeekLocked = useMemo(() => {
    return isSessionLocked(weekInfo.days[0].dateIso);
  }, [weekInfo]);

  // Feedback message
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Dialog States
  const [isAddSlotOpen, setIsAddSlotOpen] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [isMoveSessionOpen, setIsMoveSessionOpen] = useState(false);
  const [isDecideTicketOpen, setIsDecideTicketOpen] = useState(false);

  // Form State: Add Slot (No weekday Select; derived from selected date; default date-specific)
  const [newSlotDate, setNewSlotDate] = useState(() => formatIsoDateUtc(getJakartaNow()));
  const [isRepeatWeekly, setIsRepeatWeekly] = useState(false);
  const [newSlotStart, setNewSlotStart] = useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = useState("10:30");
  const [newSlotMode, setNewSlotMode] = useState<"online" | "offline">("online");
  const [newSlotLocation, setNewSlotLocation] = useState("");

  const derivedWeekday = useMemo(
    () => getIndonesianWeekdayFromDate(newSlotDate),
    [newSlotDate]
  );

  // Form State: Create Session
  const [selectedSlotForSession, setSelectedSlotForSession] = useState<string>("");
  const [selectedGroupForSession, setSelectedGroupForSession] = useState<string>("");
  const [selectedCourseForSession, setSelectedCourseForSession] = useState<string>("");
  const [sessionDateInput, setSessionDateInput] = useState<string>("");
  const [sessionTopicInput, setSessionTopicInput] = useState<string>("");

  // Form State: Move Session
  const [movingBooking, setMovingBooking] = useState<OwnedBookingItem | null>(null);
  const [targetMoveSlotId, setTargetMoveSlotId] = useState<string>("");
  const [targetMoveDate, setTargetMoveDate] = useState<string>("");
  const [moveReasonInput, setMoveReasonInput] = useState<string>("");

  // Form State: Decide Ticket
  const [decidingTicket, setDecidingTicket] = useState<OwnedTicketItem | null>(null);
  const [ticketDecision, setTicketDecision] = useState<"approved" | "rejected">("approved");
  const [decisionNotesInput, setDecisionNotesInput] = useState<string>("");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");

  // Ticket discussion thread
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Filtered Slots
  const filteredSlots = initialData.ownedSlots.filter((slot) => {
    if (selectedDayFilter !== "all" && slot.dayOfWeek !== selectedDayFilter) {
      return false;
    }
    if (selectedCourseFilter !== "all" && slot.booking?.courseId !== selectedCourseFilter) {
      return false;
    }
    if (selectedGroupFilter !== "all" && slot.booking?.groupId !== selectedGroupFilter) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchDay = slot.dayOfWeek.toLowerCase().includes(q);
      const matchTime = `${slot.startTime}-${slot.endTime}`.includes(q);
      const matchLocation = slot.location?.toLowerCase().includes(q) ?? false;
      const matchTopic = slot.booking?.topic?.toLowerCase().includes(q) ?? false;
      return matchDay || matchTime || matchLocation || matchTopic;
    }
    return true;
  });

  // Filtered Bookings
  const filteredBookings = initialData.ownedBookings.filter((b) => {
    if (selectedCourseFilter !== "all" && b.courseId !== selectedCourseFilter) {
      return false;
    }
    if (selectedGroupFilter !== "all" && b.groupId !== selectedGroupFilter) {
      return false;
    }
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

  // Filtered Tickets (course filter unsupported: ticket rows carry no course data)
  const filteredTickets = initialData.ownedTickets.filter((t) => {
    if (selectedGroupFilter !== "all" && t.groupId !== selectedGroupFilter) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchReason = t.reason.toLowerCase().includes(q);
      const matchType = t.type.toLowerCase().includes(q);
      const matchStatus = t.status.toLowerCase().includes(q);
      return matchReason || matchType || matchStatus;
    }
    return true;
  });

  // Handler: Add Slot
  const handleAddSlot = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await addTutorSlotAction({
        dayOfWeek: derivedWeekday,
        startTime: newSlotStart,
        endTime: newSlotEnd,
        mode: newSlotMode,
        location: newSlotLocation,
        sessionDate: isRepeatWeekly ? undefined : (newSlotDate || undefined),
      });

      if (res.success) {
        setIsAddSlotOpen(false);
        setFeedback({ type: "success", message: "Slot ketersediaan berhasil ditambahkan." });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal menambahkan slot." });
      }
    });
  };

  const handleStartTimeChange = (val: string) => {
    setNewSlotStart(val);
    setNewSlotEnd(computeEndTime(val));
  };

  const handleCreateSlotDirect = (
    dateIso: string,
    startTimeStr?: string,
    endTimeStr?: string
  ) => {
    setFeedback(null);
    setNewSlotDate(dateIso);
    setIsRepeatWeekly(false);
    const start = startTimeStr || "09:00";
    setNewSlotStart(start);
    setNewSlotEnd(endTimeStr || computeEndTime(start));
    setIsAddSlotOpen(true);
  };

  const handleSelectSlotToSchedule = (slot: any) => {
    setFeedback(null);
    setSelectedSlotForSession(slot.id);
    if (slot.sessionDate) {
      setSessionDateInput(slot.sessionDate);
    } else {
      setSessionDateInput(formatIsoDateUtc(getJakartaNow()));
    }
    setIsCreateSessionOpen(true);
  };

  const handleOpenMoveModal = (booking: OwnedBookingItem) => {
    setFeedback(null);
    setMovingBooking(booking);
    setTargetMoveSlotId("");
    setTargetMoveDate(booking.sessionDate || "");
    setMoveReasonInput("");
    setIsMoveSessionOpen(true);
  };

  // Handler: Delete Slot
  const handleDeleteSlot = (slotId: string) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteTutorSlotAction({ slotId });
      if (res.success) {
        setFeedback({ type: "success", message: "Slot berhasil dihapus." });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal menghapus slot." });
      }
    });
  };

  // Handler: Create Session
  const handleCreateSession = () => {
    if (!selectedSlotForSession || !selectedGroupForSession || !selectedCourseForSession || !sessionDateInput) {
      setFeedback({ type: "error", message: "Harap lengkapi semua field yang diperlukan." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await createTutorSessionAction({
        slotId: selectedSlotForSession,
        groupId: selectedGroupForSession,
        courseId: selectedCourseForSession,
        sessionDate: sessionDateInput,
        topic: sessionTopicInput,
      });

      if (res.success) {
        setIsCreateSessionOpen(false);
        setFeedback({ type: "success", message: "Sesi tutorial berhasil dijadwalkan." });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal menjadwalkan sesi." });
      }
    });
  };

  // Handler: Move Session
  const handleMoveSession = () => {
    if (!movingBooking || !targetMoveSlotId || !targetMoveDate) {
      setFeedback({ type: "error", message: "Harap pilih slot dan tanggal tujuan." });
      return;
    }

    setFeedback(null);
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
        setFeedback({
          type: "success",
          message: res.movedDirectly
            ? "Sesi berhasil dipindahkan."
            : "Jadwal terkunci. Permohonan reschedule berhasil diajukan sebagai tiket.",
        });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal memindahkan sesi." });
      }
    });
  };

  // Handler: Decide Ticket
  const handleDecideTicket = () => {
    if (!decidingTicket) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await decideTutorRescheduleTicketAction({
        ticketId: decidingTicket.id,
        decision: ticketDecision,
        decisionNotes: decisionNotesInput,
      });

      if (res.success) {
        setIsDecideTicketOpen(false);
        setDecidingTicket(null);
        setFeedback({
          type: "success",
          message: `Tiket berhasil ${ticketDecision === "approved" ? "disetujui" : "ditolak"}.`,
        });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal memproses tiket." });
      }
    });
  };

  // Handler: Reply to ticket discussion
  const handleReplyTicket = () => {
    if (!openThreadId || replyText.trim().length === 0) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await replyTutorTicketMessageAction({
        ticketId: openThreadId,
        message: replyText,
      });
      if (res.success) {
        setReplyText("");
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Gagal mengirim pesan." });
      }
    });
  };

  const unbookedSlots = initialData.ownedSlots.filter((s) => !s.booking);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal & Sesi Pengajar"
        icon={CalendarDays}
        divider={true}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFeedback(null);
                setNewSlotDate(formatIsoDateUtc(getJakartaNow()));
                setIsRepeatWeekly(false);
                setNewSlotStart("09:00");
                setNewSlotEnd("10:30");
                setIsAddSlotOpen(true);
              }}
              className="text-body-sm font-semibold h-9 rounded-lg"
            >
              <Plus className="size-4 mr-1.5" />
              Tambah Slot
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFeedback(null);
                setIsCreateSessionOpen(true);
              }}
              className="text-body-sm font-semibold h-9 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              <CalendarDays className="size-4 mr-1.5" />
              Jadwalkan Sesi
            </Button>
          </div>
        }
      />

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-body-sm ${
            feedback.type === "success"
              ? "bg-status-success/10 text-status-success border border-status-success/20"
              : "bg-status-error/10 text-status-error border border-status-error/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filter and Search Toolbar (for list views) */}
      {activeTab !== "calendar" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[140px] max-w-sm">
            <SearchBar
              placeholder="Cari slot, topik, kelompok..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
            />
          </div>

          <Select
            value={selectedDayFilter}
            onValueChange={setSelectedDayFilter}
          >
            <SelectTrigger className="w-[130px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder="Pilih Hari" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Hari</SelectItem>
              {INDONESIAN_DAYS.map((day) => (
                <SelectItem key={day} value={day}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {initialData.assignedActiveCourses.length > 0 && (
            <Select
              value={selectedCourseFilter}
              onValueChange={setSelectedCourseFilter}
            >
              <SelectTrigger className="w-[150px] h-9 text-body-sm rounded-lg shrink-0">
                <SelectValue placeholder="Semua Mata Kuliah" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Mata Kuliah</SelectItem>
                {initialData.assignedActiveCourses.map((course) => (
                  <SelectItem key={course.courseId} value={course.courseId}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {initialData.eligibleGroups.length > 0 && (
            <Select
              value={selectedGroupFilter}
              onValueChange={setSelectedGroupFilter}
            >
              <SelectTrigger className="w-[150px] h-9 text-body-sm rounded-lg shrink-0">
                <SelectValue placeholder="Semua Kelompok" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelompok</SelectItem>
                {initialData.eligibleGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">
            Kalender
          </TabsTrigger>
          <TabsTrigger value="tickets">
            Tiket
          </TabsTrigger>
          <TabsTrigger value="groups">
            Kelas & Kelompok
          </TabsTrigger>
          <TabsTrigger value="slots">
            Daftar Slot
          </TabsTrigger>
          <TabsTrigger value="sessions">
            Daftar Sesi
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: Kalender (Default) */}
        <TabsContent value="calendar" className="space-y-4">
          <ScheduleCalendarView
            role="teacher"
            currentUserId={currentUserId}
            weekInfo={weekInfo}
            isWeekLocked={isWeekLocked}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            coursesList={initialData.assignedActiveCourses.map((c) => ({
              id: c.courseId,
              title: c.title,
            }))}
            groupsList={initialData.eligibleGroups.map((g) => ({
              id: g.id,
              name: g.name,
            }))}
            slots={initialData.ownedSlots}
            bookings={initialData.ownedBookings}
            onCreateScheduleDirect={handleCreateSlotDirect}
            onSelectSlotToSchedule={handleSelectSlotToSchedule}
            onMoveSession={handleOpenMoveModal}
            onDeleteSlot={handleDeleteSlot}
            onOpenPostSession={setActivePostSessionBooking}
            onOpenAuditLog={setActiveAuditLogBooking}
          />
        </TabsContent>

        {/* Tab 1: Slots */}
        <TabsContent value="slots" className="space-y-3">
          {filteredSlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card">
              <AdminEmptyState
                icon={CalendarDays}
                title="Belum ada slot ketersediaan."
                description="Tambahkan slot 90 menit agar sesi tutorial kelompok dapat dijadwalkan."
              />
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {filteredSlots.map((slot) => {
                const isBooked = Boolean(slot.booking);
                return (
                  <div
                    key={slot.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-heading text-body-base font-bold text-foreground">
                          {slot.dayOfWeek}
                        </span>
                        <Badge
                          variant={isBooked ? "default" : "secondary"}
                          className="text-body-xs font-semibold rounded-md"
                        >
                          {isBooked ? "Terisi" : "Tersedia"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-body-xs font-normal rounded-md"
                        >
                          {slot.mode === "online" ? "Online" : "Tatap Muka"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-body-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {slot.startTime} - {slot.endTime} (90m)
                        </span>
                        {slot.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {slot.location}
                          </span>
                        )}
                        {slot.sessionDate && (
                          <span>Tanggal: {slot.sessionDate}</span>
                        )}
                      </div>

                      {slot.booking && (
                        <p className="text-body-xs text-foreground font-medium pt-0.5">
                          Topik: {slot.booking.topic || "Belum ada topik khusus"}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isBooked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="text-body-sm h-8 rounded-lg opacity-60"
                        >
                          Terkunci
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="text-body-sm text-status-error hover:bg-status-error/10 hover:text-status-error h-8 rounded-lg"
                        >
                          <Trash2 className="size-4 mr-1.5" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Sessions */}
        <TabsContent value="sessions" className="space-y-3">
          {filteredBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card">
              <AdminEmptyState
                icon={BookOpen}
                title="Belum ada sesi tutorial yang dijadwalkan."
              />
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading text-body-base font-bold text-foreground">
                        {booking.course?.title || "Mata Kuliah"}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-body-xs font-semibold rounded-md text-brand-primary border-brand-primary/30"
                      >
                        {booking.group?.name || "Kelompok"}
                      </Badge>
                      <Badge
                        variant={booking.status === "completed" ? "default" : "secondary"}
                        className="text-body-xs rounded-md"
                      >
                        {booking.status === "completed" ? "Selesai" : "Terjadwal"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-body-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {booking.sessionDate} ({booking.startTime} - {booking.endTime})
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" />
                        Rep: {booking.student?.name || "Ketua"}
                      </span>
                    </div>

                    {booking.topic && (
                      <p className="text-body-xs text-foreground font-medium pt-0.5">
                        Topik: {booking.topic}
                      </p>
                    )}

                    {booking.googleMeetUrl && (
                      <div className="pt-1">
                        <a
                          href={booking.googleMeetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-brand-primary hover:underline"
                        >
                          <Video className="size-3.5" />
                          <span>Google Meet Sesi</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMovingBooking(booking);
                        setTargetMoveSlotId("");
                        setTargetMoveDate("");
                        setMoveReasonInput("");
                        setIsMoveSessionOpen(true);
                      }}
                      className="text-body-sm h-8 rounded-lg"
                    >
                      <RotateCcw className="size-3.5 mr-1.5" />
                      Pindah Jadwal
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Tickets */}
        <TabsContent value="tickets" className="space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card">
              <AdminEmptyState
                icon={ShieldCheck}
                title="Tidak ada tiket reschedule atau pembatalan."
              />
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {filteredTickets.map((ticket) => {
                const isPendingTicket = ticket.status === "pending";
                const isThreadOpen = openThreadId === ticket.id;
                return (
                  <div key={ticket.id} className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-body-base font-bold text-foreground">
                            Tiket {ticket.type === "reschedule" ? "Reschedule" : "Pembatalan"}
                          </span>
                          <Badge
                            variant={
                              ticket.status === "approved"
                                ? "default"
                                : ticket.status === "rejected"
                                  ? "outline"
                                  : "secondary"
                            }
                            className={`text-body-xs rounded-md font-semibold ${
                              ticket.status === "rejected"
                                ? "border-status-error/30 bg-status-error/10 text-status-error"
                                : ""
                            }`}
                          >
                            {ticket.status === "approved"
                              ? "Disetujui"
                              : ticket.status === "rejected"
                                ? "Ditolak"
                                : "Menunggu Keputusan"}
                          </Badge>
                        </div>

                        <p className="text-body-xs text-foreground font-medium">
                          Alasan: {ticket.reason}
                        </p>

                        {ticket.proposedDate && (
                          <p className="text-body-xs text-muted-foreground">
                            Usulan Tanggal: {ticket.proposedDate}
                          </p>
                        )}

                        {ticket.decisionNotes && (
                          <p className="text-body-xs text-muted-foreground italic">
                            Catatan: {ticket.decisionNotes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOpenThreadId(isThreadOpen ? null : ticket.id);
                            setReplyText("");
                          }}
                          aria-expanded={isThreadOpen}
                          className="text-body-sm h-8 rounded-lg"
                        >
                          <MessageSquare className="size-4 mr-1.5" />
                          Diskusi{ticket.messages.length > 0 ? ` (${ticket.messages.length})` : ""}
                        </Button>
                        {isPendingTicket && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setDecidingTicket(ticket);
                              setTicketDecision("approved");
                              setDecisionNotesInput("");
                              setIsDecideTicketOpen(true);
                            }}
                            className="text-body-sm h-8 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
                          >
                            Putuskan
                          </Button>
                        )}
                      </div>
                    </div>

                    {isThreadOpen && (
                      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                        {ticket.messages.length === 0 ? (
                          <p className="text-body-xs text-muted-foreground">
                            Belum ada pesan diskusi pada tiket ini.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {ticket.messages.map((msg) => {
                              const isTutor = msg.senderId === currentUserId;
                              return (
                                <li
                                  key={msg.id}
                                  className={cn(
                                    "space-y-1 rounded-lg border p-2.5",
                                    isTutor
                                      ? "border-brand-primary/25 bg-brand-primary/5"
                                      : "border-border/70 bg-card"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-body-xs font-semibold text-foreground">
                                      {isTutor
                                        ? "Anda"
                                        : msg.senderName || "Anggota Kelompok"}
                                    </p>
                                    <FormattedDate
                                      date={msg.createdAt}
                                      options={{ dateStyle: "short", timeStyle: "short" }}
                                      locale="id-ID"
                                    />
                                  </div>
                                  <p className="text-body-sm text-foreground whitespace-pre-wrap">
                                    {msg.message}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        <div className="flex items-end gap-2">
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Balas diskusi untuk kelompok belajar..."
                            className="min-h-[44px] flex-1 text-body-sm resize-none"
                            maxLength={2000}
                          />
                          <Button
                            size="sm"
                            disabled={isPending || replyText.trim().length === 0}
                            onClick={handleReplyTicket}
                            aria-label="Kirim balasan"
                            className="h-9 rounded-lg shrink-0"
                          >
                            <Send className="size-4 mr-1.5" />
                            Kirim
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Groups & Courses */}
        <TabsContent value="groups" className="space-y-4">
          <div className="space-y-3">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              Mata Kuliah Ditugaskan
            </h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {initialData.assignedActiveCourses.map((course) => (
                <div
                  key={course.courseId}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-heading text-body-sm font-bold text-foreground">
                      {course.title}
                    </p>
                    <p className="text-body-xs text-muted-foreground">
                      Kode: {course.code || course.courseId}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-body-xs rounded-md text-muted-foreground"
                  >
                    {course.isCompatibilityFallback ? "Legacy Assignment" : "Canonical Penugasan"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              Kelompok Belajar Aktif
            </h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {initialData.eligibleGroups.length === 0 ? (
                <p className="p-4 text-body-sm text-muted-foreground">
                  Belum ada kelompok aktif yang terdaftar pada mata kuliah penugasan.
                </p>
              ) : (
                initialData.eligibleGroups.map((grp) => (
                  <div
                    key={grp.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-heading text-body-sm font-bold text-foreground">
                        {grp.name}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        Paket: {grp.packageName} ({grp.usedQuotaSessions}/{grp.totalQuotaSessions} sesi digunakan)
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        Perwakilan: {grp.representative?.name || "Ketua"} ({grp.representative?.role || "Leader"})
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-body-xs rounded-md shrink-0">
                      {grp.membersCount} Anggota
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog 1: Add Slot */}
      <Dialog
        open={isAddSlotOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsAddSlotOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-body-base font-bold font-heading">
              Tambah Slot Ketersediaan 90 Menit
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              Buat slot ketersediaan mengajar mingguan berdurasi tepat 90 menit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Tanggal</Label>
              <Input
                type="date"
                value={newSlotDate}
                onChange={(e) => setNewSlotDate(e.target.value)}
                className="text-body-sm h-9"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="repeat-weekly" className="text-body-sm font-semibold cursor-pointer">
                  Ulangi Setiap Minggu
                </Label>
                <p className="text-body-xs text-muted-foreground">
                  Hari: <span className="font-semibold text-foreground">{derivedWeekday}</span>
                </p>
              </div>
              <Checkbox
                id="repeat-weekly"
                checked={isRepeatWeekly}
                onCheckedChange={(checked) => setIsRepeatWeekly(Boolean(checked))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">Mulai (HH:MM)</Label>
                <Input
                  value={newSlotStart}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  placeholder="09:00"
                  className="text-body-sm h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">Selesai (HH:MM)</Label>
                <Input
                  value={newSlotEnd}
                  readOnly
                  placeholder="10:30"
                  className="text-body-sm h-9 bg-muted text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Mode Sesi</Label>
              <Select
                value={newSlotMode}
                onValueChange={(val) => setNewSlotMode(val as "online" | "offline")}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online (Google Meet)</SelectItem>
                  <SelectItem value="offline">Tatap Muka (Offline)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newSlotMode === "offline" && (
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">Lokasi / Ruangan Fisik</Label>
                <Input
                  value={newSlotLocation}
                  onChange={(e) => setNewSlotLocation(e.target.value)}
                  placeholder="Ruang 204 Gedung Utama"
                  className="text-body-sm h-9"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsAddSlotOpen(false)}
              className="text-body-sm h-9 rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleAddSlot}
              className="text-body-sm h-9 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              Simpan Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Create Session */}
      <Dialog
        open={isCreateSessionOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsCreateSessionOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-body-base font-bold font-heading">
              Jadwalkan Sesi Tutorial
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              Pilih kelompok belajar aktif, mata kuliah, dan slot ketersediaan milik Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Kelompok Belajar</Label>
              <Select
                value={selectedGroupForSession}
                onValueChange={setSelectedGroupForSession}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue placeholder="Pilih Kelompok" />
                </SelectTrigger>
                <SelectContent>
                  {initialData.eligibleGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.membersCount} anggota)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Mata Kuliah</Label>
              <Select
                value={selectedCourseForSession}
                onValueChange={setSelectedCourseForSession}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue placeholder="Pilih Mata Kuliah" />
                </SelectTrigger>
                <SelectContent>
                  {initialData.assignedActiveCourses.map((c) => (
                    <SelectItem key={c.courseId} value={c.courseId}>
                      {c.title} ({c.code || c.courseId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Slot Tersedia</Label>
              <Select
                value={selectedSlotForSession}
                onValueChange={setSelectedSlotForSession}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue placeholder="Pilih Slot 90 Menit" />
                </SelectTrigger>
                <SelectContent>
                  {unbookedSlots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.dayOfWeek} ({s.startTime} - {s.endTime}) [{s.mode}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Tanggal Sesi (YYYY-MM-DD)</Label>
              <Input
                type="date"
                value={sessionDateInput}
                onChange={(e) => setSessionDateInput(e.target.value)}
                className="text-body-sm h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Topik Bahasan</Label>
              <Input
                value={sessionTopicInput}
                onChange={(e) => setSessionTopicInput(e.target.value)}
                placeholder="Contoh: Pembahasan Soal UTS Bab 3"
                className="text-body-sm h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsCreateSessionOpen(false)}
              className="text-body-sm h-9 rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleCreateSession}
              className="text-body-sm h-9 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              Jadwalkan Sesi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Move Session */}
      <Dialog
        open={isMoveSessionOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsMoveSessionOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-body-base font-bold font-heading">
              Pindahkan Jadwal Sesi
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              Pilih slot ketersediaan baru. Jika jadwal telah terkunci, permohonan akan diajukan sebagai tiket.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Slot Tujuan</Label>
              <Select
                value={targetMoveSlotId}
                onValueChange={setTargetMoveSlotId}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue placeholder="Pilih Slot Baru" />
                </SelectTrigger>
                <SelectContent>
                  {unbookedSlots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.dayOfWeek} ({s.startTime} - {s.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Tanggal Baru</Label>
              <Input
                type="date"
                value={targetMoveDate}
                onChange={(e) => setTargetMoveDate(e.target.value)}
                className="text-body-sm h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Alasan Perubahan</Label>
              <Textarea
                value={moveReasonInput}
                onChange={(e) => setMoveReasonInput(e.target.value)}
                placeholder="Jelaskan alasan pemindahan sesi..."
                className="text-body-sm rounded-lg resize-none h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsMoveSessionOpen(false)}
              className="text-body-sm h-9 rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleMoveSession}
              className="text-body-sm h-9 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              Konfirmasi Pindah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Decide Ticket */}
      <Dialog
        open={isDecideTicketOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsDecideTicketOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-body-base font-bold font-heading">
              Putusan Tiket {decidingTicket?.type === "reschedule" ? "Reschedule" : "Pembatalan"}
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              Tentukan persetujuan atau penolakan permohonan perubahan jadwal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Keputusan</Label>
              <Select
                value={ticketDecision}
                onValueChange={(val) => setTicketDecision(val as "approved" | "rejected")}
              >
                <SelectTrigger className="text-body-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Setujui (Approved)</SelectItem>
                  <SelectItem value="rejected">Tolak (Rejected)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">Catatan Keputusan</Label>
              <Textarea
                value={decisionNotesInput}
                onChange={(e) => setDecisionNotesInput(e.target.value)}
                placeholder="Tuliskan catatan penjelasan untuk kelompok belajar..."
                className="text-body-sm rounded-lg resize-none h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsDecideTicketOpen(false)}
              className="text-body-sm h-9 rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleDecideTicket}
              className={`text-body-sm h-9 rounded-lg ${
                ticketDecision === "approved"
                  ? "bg-brand-primary text-white hover:bg-brand-primary/90"
                  : "bg-status-error text-white hover:bg-status-error/90"
              }`}
            >
              Simpan Keputusan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Session Modal */}
      <PostSessionModal
        open={Boolean(activePostSessionBooking)}
        onOpenChange={(open) => {
          if (!open) setActivePostSessionBooking(null);
        }}
        booking={activePostSessionBooking}
        onSuccess={() => {
          setActivePostSessionBooking(null);
          setFeedback({
            type: "success",
            message: "Catatan dan berkas sesi berhasil disimpan.",
          });
          router.refresh();
        }}
      />

      {/* Audit Log Drawer */}
      <AuditLogDrawer
        open={Boolean(activeAuditLogBooking)}
        onOpenChange={(open) => {
          if (!open) setActiveAuditLogBooking(null);
        }}
        booking={activeAuditLogBooking}
      />
    </div>
  );
}
