"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { ViewportSwitch } from "@/components/navigation";
import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUrlTab } from "@/hooks/use-url-tab";
import {
  daysFrom,
  getJakartaCalendarDate,
  getJakartaNow,
  getWeekScheduleDays,
} from "@/lib/date-utils";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import type {
  OwnedBookingItem,
  OwnedTicketItem,
  TutorScheduleReadModel,
} from "@/lib/schedule/tutor-read-model";
import {
  addTutorSlotWithNotesAction,
  getTutorSlotNotesAction,
} from "@/app/(tutor)/tutor/schedule/slot-note-actions";
import {
  copyTutorAvailabilityAction,
  decideTutorRescheduleTicketAction,
  deleteTutorSlotAction,
  moveTutorSessionAction,
  replyTutorTicketMessageAction,
} from "@/app/(tutor)/tutor/schedule/actions";
import {
  computeEndTime,
  getIndonesianWeekdayFromDate,
  type TutorScheduleSurfaceProps,
} from "@/features/tutor-schedule/model/types";
import { TutorScheduleDesktop } from "@/features/tutor-schedule/ui/desktop/tutor-schedule-desktop";
import { TutorScheduleMobile } from "@/features/tutor-schedule/ui/mobile/tutor-schedule-mobile";

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
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");

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

  const defaultSelectedDate = useMemo(() => {
    const todayDay = weekInfo.days.find((day) => day.isToday);
    return todayDay?.dateIso ?? weekInfo.days[0]?.dateIso ?? getJakartaCalendarDate();
  }, [weekInfo.days]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultSelectedDate);

  useEffect(() => {
    const inCurrentWeek = weekInfo.days.some((day) => day.dateIso === selectedDate);
    if (!inCurrentWeek) {
      setSelectedDate(defaultSelectedDate);
    }
  }, [defaultSelectedDate, selectedDate, weekInfo.days]);

  const isWeekLocked = false;

  useEffect(() => {
    for (const offset of [weekOffset - 1, weekOffset + 1]) {
      const params = new URLSearchParams(window.location.search);
      if (offset === 0) params.delete("week");
      else params.set("week", String(offset));
      router.prefetch(`${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [router, weekOffset]);

  // Lifted modal & draft state (preserved across desktop <-> mobile ViewportSwitch)
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

  const [movingBooking, setMovingBooking] = useState<OwnedBookingItem | null>(null);
  const [targetMoveSlotId, setTargetMoveSlotId] = useState<string>("");
  const [targetMoveDate, setTargetMoveDate] = useState<string>("");
  const [moveReasonInput, setMoveReasonInput] = useState<string>("");

  const [decidingTicket, setDecidingTicket] = useState<OwnedTicketItem | null>(null);
  const [ticketDecision, setTicketDecision] = useState<"approved" | "rejected">("approved");
  const [decisionNotesInput, setDecisionNotesInput] = useState<string>("");

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const filteredSlots = scheduleData.ownedSlots.filter((slot) => {
    if (!slot.sessionDate) return false;
    if (selectedDayFilter !== "all" && slot.dayOfWeek !== selectedDayFilter) return false;
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

  const filteredTickets = scheduleData.ownedTickets.filter((ticket) => {
    if (selectedGroupFilter !== "all" && ticket.groupId !== selectedGroupFilter) return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      return (
        ticket.reason.toLowerCase().includes(q) ||
        ticket.type.toLowerCase().includes(q) ||
        ticket.status.toLowerCase().includes(q)
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
    const snapped = `${String(Math.floor(snappedMinutes / 60)).padStart(2, "0")}:${String(
      snappedMinutes % 60,
    ).padStart(2, "0")}`;
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

  const openDecideTicket = (
    ticket: OwnedTicketItem,
    defaultDecision: "approved" | "rejected" = "approved",
  ) => {
    setDecidingTicket(ticket);
    setTicketDecision(defaultDecision);
    setDecisionNotesInput("");
    setIsDecideTicketOpen(true);
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
        toast.success(
          t("ticketDecisionSaved", {
            decision: t(ticketDecision === "approved" ? "decisionApproved" : "decisionRejected"),
          }),
        );
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
    (slot) =>
      slot.sessionDate &&
      slot.sessionDate >= weekInfo.startOfWeekIso &&
      slot.sessionDate <= weekInfo.endOfWeekIso,
  );
  const slotsWithHistory = new Set(scheduleData.ownedBookings.map((booking) => booking.slotId));
  const openedSlotCount = weekSlots.length;
  const filledSlotCount = weekSlots.filter((slot) => slot.booking).length;
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
        const conflictMessage =
          result.conflicts.length > 0
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

  const surfaceProps: TutorScheduleSurfaceProps = {
    initialData,
    scheduleData,
    currentUserId,
    locale,
    isPending,
    activeTab,
    setActiveTab,
    weekOffset,
    weekInfo,
    isWeekLocked,
    handleWeekChange,
    selectedDate,
    setSelectedDate,
    searchQuery,
    setSearchQuery,
    selectedDayFilter,
    setSelectedDayFilter,
    selectedCourseFilter,
    setSelectedCourseFilter,
    selectedGroupFilter,
    setSelectedGroupFilter,
    filteredSlots,
    filteredBookings,
    filteredTickets,
    slotNotes,
    slotsWithHistory,
    openedSlotCount,
    filledSlotCount,
    availableSlotCount,
    isAddSlotOpen,
    setIsAddSlotOpen,
    newSlotDate,
    setNewSlotDate,
    newSlotStart,
    handleStartTimeChange,
    newSlotEnd,
    newSlotMode,
    setNewSlotMode,
    newSlotLocation,
    setNewSlotLocation,
    newSlotNotes,
    setNewSlotNotes,
    handleAddSlot,
    openAddSlotDialog,
    handleCreateSlotDirect,
    requestDeleteSlot,
    handleOpenMoveModal,
    openDecideTicket,
    openThreadId,
    setOpenThreadId,
    replyText,
    setReplyText,
    handleReplyTicket,
    onOpenSessionDetail: setActiveSessionBookingId,
    handleCopyPreviousWeek,
  };

  return (
    <>
      <ViewportSwitch
        desktop={() => <TutorScheduleDesktop {...surfaceProps} />}
        mobile={() => <TutorScheduleMobile {...surfaceProps} />}
      />

      <AdminConfirmDialog
        open={Boolean(pendingDeleteSlot)}
        onOpenChange={(open) => {
          if (!open) setSlotPendingDelete(null);
        }}
        title={t("deleteSlotTitle")}
        description={
          pendingDeleteSlot
            ? t("deleteSlotDescription", {
                day: t(`days.${pendingDeleteSlot.dayOfWeek}`),
                startTime: pendingDeleteSlot.startTime,
                endTime: pendingDeleteSlot.endTime,
              })
            : ""
        }
        confirmLabel={t("deleteSpecificSlot")}
        cancelLabel={t("cancel")}
        loading={isPending}
        onConfirm={() => {
          if (pendingDeleteSlot) handleDeleteSlot(pendingDeleteSlot.id);
        }}
      />

      <Dialog
        open={isMoveSessionOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsMoveSessionOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">
              {t("moveSessionTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              {t("moveSessionDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-(--compact-gap) py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("targetSlot")}</Label>
              <Select value={targetMoveSlotId} onValueChange={setTargetMoveSlotId}>
                <SelectTrigger className="h-9 text-body-sm">
                  <SelectValue placeholder={t("selectNewSlot")} />
                </SelectTrigger>
                <SelectContent>
                  {unbookedSlots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {t(`days.${s.dayOfWeek}`)} ({s.startTime} - {s.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("newDate")}</Label>
              <Input
                type="date"
                value={targetMoveDate}
                onChange={(e) => setTargetMoveDate(e.target.value)}
                className="h-9 text-body-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("changeReason")}</Label>
              <Textarea
                value={moveReasonInput}
                onChange={(e) => setMoveReasonInput(e.target.value)}
                placeholder={t("moveReasonPlaceholder")}
                className="h-20 resize-none rounded-lg text-body-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsMoveSessionOpen(false)}
              className="h-9 rounded-lg text-body-sm"
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleMoveSession}
              className="h-9 rounded-lg bg-brand-primary text-body-sm text-primary-foreground hover:bg-brand-primary/90"
            >
              {t("confirmMove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDecideTicketOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsDecideTicketOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">
              {t("ticketDecisionTitle", {
                type:
                  decidingTicket?.type === "reschedule" ? t("reschedule") : t("cancellation"),
              })}
            </DialogTitle>
            <DialogDescription className="text-body-xs">
              {t("ticketDecisionDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-(--compact-gap) py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("decision")}</Label>
              <Select
                value={ticketDecision}
                onValueChange={(val) => setTicketDecision(val as "approved" | "rejected")}
              >
                <SelectTrigger className="h-9 text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">{t("approve")}</SelectItem>
                  <SelectItem value="rejected">{t("rejected")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold">{t("decisionNotes")}</Label>
              <Textarea
                value={decisionNotesInput}
                onChange={(e) => setDecisionNotesInput(e.target.value)}
                placeholder={t("decisionNotesPlaceholder")}
                className="h-20 resize-none rounded-lg text-body-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsDecideTicketOpen(false)}
              className="h-9 rounded-lg text-body-sm"
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              isLoading={isPending}
              onClick={handleDecideTicket}
              className={`h-9 rounded-lg text-body-sm ${
                ticketDecision === "approved"
                  ? "bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
                  : "bg-status-error text-white hover:bg-status-error/90"
              }`}
            >
              {t("saveDecision")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionDetailDrawer
        open={Boolean(activeSessionBookingId)}
        onOpenChange={(open) => {
          if (!open) setActiveSessionBookingId(null);
        }}
        booking={activeSessionBooking}
        role="teacher"
        currentUserId={currentUserId}
        tutorName={scheduleData.tutor.name}
        availableSlots={scheduleData.ownedSlots}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
