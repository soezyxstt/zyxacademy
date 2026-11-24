"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { GoogleCalendarControl } from "@/components/schedule/google-calendar-control";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchBar } from "@/components/ui/search-bar";
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { INDONESIAN_DAYS, getJakartaCalendarDate } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { OwnedBookingItem, OwnedSlotItem } from "@/lib/schedule/tutor-read-model";
import {
  formatAgendaDateHeading,
  formatDayNumber,
  formatShortWeekday,
  formatWeekDate,
  type TutorScheduleSurfaceProps,
} from "@/features/tutor-schedule/model/types";

type MobileAgendaItem =
  | { kind: "booking"; startTime: string; endTime: string; booking: OwnedBookingItem }
  | { kind: "slot"; startTime: string; endTime: string; slot: OwnedSlotItem };

/**
 * Mobile tutor schedule (<768px):
 * - Sticky horizontal 5-tab bar (Calendar | Sessions | Tickets | Slots | Groups)
 * - Compact 7-day date strip + single-day vertical agenda timeline
 * - Stacked ticket cards with inline Approve/Reject & Discussion
 * - Bottom-sheet slot creator & bottom-sheet ticket reply composer
 */
export function TutorScheduleMobile({
  initialData,
  scheduleData,
  currentUserId,
  locale,
  isPending,
  activeTab,
  setActiveTab,
  weekOffset,
  weekInfo,
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
  onOpenSessionDetail,
  handleCopyPreviousWeek,
}: TutorScheduleSurfaceProps) {
  const t = useTranslations("tutor.schedule");
  const scheduleLabels = useTranslations("schedule");
  const statusLabel = useTranslations("schedule.session.status");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const todayIso = getJakartaCalendarDate();

  // Build per-day agenda items for the 7-day strip and selected day timeline
  const agendaByDate = useMemo(() => {
    const map = new Map<string, MobileAgendaItem[]>();
    const bookedSlotIds = new Set<string>();

    for (const booking of scheduleData.ownedBookings) {
      if (!booking.sessionDate) continue;
      if (booking.slotId) bookedSlotIds.add(booking.slotId);
      const list = map.get(booking.sessionDate) ?? [];
      list.push({
        kind: "booking",
        startTime: booking.startTime || "00:00",
        endTime: booking.endTime || "",
        booking,
      });
      map.set(booking.sessionDate, list);
    }

    for (const slot of scheduleData.ownedSlots) {
      if (!slot.sessionDate || slot.booking || bookedSlotIds.has(slot.id)) continue;
      const list = map.get(slot.sessionDate) ?? [];
      list.push({
        kind: "slot",
        startTime: slot.startTime,
        endTime: slot.endTime,
        slot,
      });
      map.set(slot.sessionDate, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return map;
  }, [scheduleData.ownedBookings, scheduleData.ownedSlots]);

  const selectedDayItems = agendaByDate.get(selectedDate) ?? [];
  const activeThreadTicket = openThreadId
    ? scheduleData.ownedTickets.find((item) => item.id === openThreadId) ?? null
    : null;

  const showDayFilter = activeTab === "slots";
  const showCourseFilter =
    (activeTab === "slots" || activeTab === "sessions") &&
    initialData.assignedActiveCourses.length > 0;
  const showGroupFilter = activeTab !== "groups" && initialData.eligibleGroups.length > 0;
  const activeFilterCount = [
    showDayFilter && selectedDayFilter !== "all",
    showCourseFilter && selectedCourseFilter !== "all",
    showGroupFilter && selectedGroupFilter !== "all",
  ].filter(Boolean).length;

  const weekRangeLabel = `${formatWeekDate(weekInfo.days[0].dateIso, locale)} - ${formatWeekDate(
    weekInfo.days[6].dateIso,
    locale,
  )}`;

  return (
    <div className="flex w-full min-w-0 flex-col">
      <h1 className="sr-only">{t("title")}</h1>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        syncUrl={false}
        className="w-full min-w-0"
      >
        <TabsList
          variant="page"
          flush
          trailing={
            <Button
              type="button"
              size="icon-sm"
              onClick={openAddSlotDialog}
              aria-label={t("addSlot")}
              className="size-9 shrink-0 rounded-lg"
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          }
        >
          <TabsTrigger value="calendar">{t("calendar")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("sessions")}</TabsTrigger>
          <TabsTrigger value="tickets">{t("tickets")}</TabsTrigger>
          <TabsTrigger value="slots">{t("slots")}</TabsTrigger>
          <TabsTrigger value="groups">{t("classesGroups")}</TabsTrigger>
        </TabsList>

        {/* 1. CALENDAR TAB: 7-day strip + vertical single-day agenda */}
        <TabsContent value="calendar" className="mt-(--related-gap) space-y-(--related-gap)">
          <div className="space-y-2.5 border-b border-border/60 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => handleWeekChange(weekOffset - 1)}
                  aria-label={scheduleLabels("calendar.previousRange")}
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
                  onClick={() => handleWeekChange(weekOffset + 1)}
                  aria-label={scheduleLabels("calendar.nextRange")}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-md bg-muted px-2 py-1 text-body-xs font-medium tabular-nums text-muted-foreground">
                  {filledSlotCount}/{openedSlotCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => {
                    if (weekOffset !== 0) handleWeekChange(0);
                    setSelectedDate(todayIso);
                  }}
                  aria-label={scheduleLabels("calendar.today")}
                >
                  <CalendarCheck2 className="size-4" aria-hidden />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={t("copyPreviousWeek")}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem disabled={isPending} onSelect={handleCopyPreviousWeek}>
                      <CalendarDays className="size-4 text-muted-foreground" />
                      <span>{t("copyPreviousWeek")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* 7-day horizontal date selector */}
            <div className="grid grid-cols-7 gap-1" role="tablist" aria-label={t("calendar")}>
              {weekInfo.days.map((day) => {
                const isSelected = day.dateIso === selectedDate;
                const items = agendaByDate.get(day.dateIso) ?? [];
                const hasBooking = items.some((item) => item.kind === "booking");
                const hasOpenSlot = items.some((item) => item.kind === "slot");

                return (
                  <button
                    key={day.dateIso}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedDate(day.dateIso)}
                    className={cn(
                      "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : day.isToday
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-transparent bg-muted/40 text-foreground active:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "text-body-2xs font-medium uppercase",
                        isSelected ? "text-primary-foreground/85" : "text-muted-foreground",
                      )}
                    >
                      {formatShortWeekday(day.dateIso, locale)}
                    </span>
                    <span className="text-body-sm font-medium tabular-nums">
                      {formatDayNumber(day.dateIso)}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                      {hasBooking && (
                        <span
                          className={cn(
                            "size-1.5 rounded-xs",
                            isSelected ? "bg-primary-foreground" : "bg-brand-primary",
                          )}
                        />
                      )}
                      {hasOpenSlot && (
                        <span
                          className={cn(
                            "size-1.5 rounded-xs",
                            isSelected ? "bg-primary-foreground/70" : "bg-status-success",
                          )}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day agenda header */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 break-words font-heading text-body-base font-bold text-foreground">
              {formatAgendaDateHeading(selectedDate, locale)}
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              <GoogleCalendarControl />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={t("addSlot")}
                      onClick={() => handleCreateSlotDirect(selectedDate)}
                    >
                      <Plus className="size-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("addSlot")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Selected day vertical timeline */}
          {selectedDayItems.length === 0 ? (
            <div className="border-t border-border/60">
              <AdminEmptyState
                icon={CalendarDays}
                title={t("noSlots")}
                className="py-6"
              />
            </div>
          ) : (
            <div className="divide-y divide-border/60 border-y border-border/60">
              {selectedDayItems.map((item) => {
                if (item.kind === "booking") {
                  const { booking } = item;
                  return (
                    <div
                      key={`booking-${booking.id}`}
                      className="space-y-(--compact-gap) py-(--row-padding)"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenSessionDetail(booking.id)}
                        className="flex min-h-9 w-full min-w-0 items-start justify-between gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-body-xs font-semibold tabular-nums text-muted-foreground">
                              <Clock className="size-3.5 shrink-0" aria-hidden />
                              {booking.startTime} - {booking.endTime}
                            </span>
                            <Badge
                              variant={booking.status === "completed" ? "default" : "secondary"}
                              className="rounded-md text-body-2xs"
                            >
                              {statusLabel(
                                booking.status === "completed" || booking.status === "cancelled"
                                  ? booking.status
                                  : "scheduled",
                              )}
                            </Badge>
                          </div>
                          <p className="break-words font-heading text-body-sm font-bold text-foreground">
                            {booking.course?.title || t("course")}
                          </p>
                          <p className="break-words text-body-xs text-muted-foreground">
                            {booking.group?.name || t("group")}
                            {booking.student?.name ? ` · ${booking.student.name}` : ""}
                          </p>
                          {booking.topic && (
                            <p className="break-words text-body-xs text-foreground">
                              {t("topic")}: {booking.topic}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {booking.googleMeetUrl ? (
                          <a
                            href={booking.googleMeetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-auto inline-flex min-h-9 items-center gap-1.5 text-body-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                          >
                            <Video className="size-3.5" aria-hidden />
                            <span>{t("googleMeetSession")}</span>
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenMoveModal(booking)}
                          className="min-h-9 rounded-lg text-body-sm"
                        >
                          <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
                          {t("moveSchedule")}
                        </Button>
                      </div>
                    </div>
                  );
                }

                const { slot } = item;
                const canDelete = !slot.booking && !slotsWithHistory.has(slot.id);
                return (
                  <div
                    key={`slot-${slot.id}`}
                    className="flex min-w-0 items-start justify-between gap-3 py-(--row-padding)"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-body-xs font-semibold tabular-nums text-status-success">
                          <Clock className="size-3.5 shrink-0" aria-hidden />
                          {slot.startTime} - {slot.endTime}
                        </span>
                        <Badge variant="secondary" className="rounded-md text-body-2xs">
                          {t("open")}
                        </Badge>
                        <Badge variant="outline" className="rounded-md text-body-2xs font-normal">
                          {slot.mode === "online" ? t("online") : t("inPerson")}
                        </Badge>
                      </div>
                      {slot.location && (
                        <p className="inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="break-words">{slot.location}</span>
                        </p>
                      )}
                      {slotNotes[slot.id] && (
                        <p className="whitespace-pre-wrap break-words text-body-xs text-muted-foreground">
                          {slotNotes[slot.id]}
                        </p>
                      )}
                    </div>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => requestDeleteSlot(slot.id)}
                        aria-label={t("delete")}
                        className="size-9 shrink-0 rounded-lg text-status-error hover:text-status-error"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 2. SESSIONS TAB */}
        <TabsContent value="sessions" className="mt-3 space-y-3">
          <div className="flex items-center justify-end gap-2 empty:hidden">
            <SearchBar
              size="sm"
              aria-label={t("search")}
              placeholder={t("search")}
              value={searchQuery}
              onSearch={setSearchQuery}
              containerClassName="flex-1 min-w-0"
            />
            {(showCourseFilter || showGroupFilter) && (
              <Button
                type="button"
                variant={activeFilterCount > 0 ? "secondary" : "outline"}
                size="icon"
                className="relative size-9 shrink-0"
                onClick={() => setFilterSheetOpen(true)}
                aria-label={scheduleLabels("calendar.filter")}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-0.5 text-body-2xs font-semibold text-primary"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            )}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="border-t border-border">
              <AdminEmptyState icon={BookOpen} title={t("noSessions")} />
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredBookings.map((booking) => (
                <div key={booking.id} className="space-y-2 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenSessionDetail(booking.id)}
                    className="flex w-full min-w-0 items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words font-heading text-body-sm font-bold text-foreground">
                        {booking.course?.title || t("course")}
                      </p>
                      <p className="text-body-xs tabular-nums text-muted-foreground">
                        {booking.sessionDate} · {booking.startTime} - {booking.endTime}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        {booking.group?.name || t("group")} ·{" "}
                        {booking.student?.name || t("leader")}
                      </p>
                      {booking.topic && (
                        <p className="break-words text-body-xs text-foreground">
                          {t("topic")}: {booking.topic}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={booking.status === "completed" ? "default" : "secondary"}
                      className="shrink-0 rounded-md text-body-2xs"
                    >
                      {statusLabel(
                        booking.status === "completed" || booking.status === "cancelled"
                          ? booking.status
                          : "scheduled",
                      )}
                    </Badge>
                  </button>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {booking.googleMeetUrl ? (
                      <a
                        href={booking.googleMeetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 text-body-xs font-semibold text-brand-primary"
                      >
                        <Video className="size-3.5" aria-hidden />
                        <span>{t("googleMeetSession")}</span>
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenMoveModal(booking)}
                      className="min-h-9 rounded-lg text-body-sm"
                    >
                      <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
                      {t("moveSchedule")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 3. TICKETS TAB: Stacked cards with inline Approve/Reject & Discussion */}
        <TabsContent value="tickets" className="mt-3 space-y-3">
          <div className="flex items-center justify-end gap-2 empty:hidden">
            <SearchBar
              size="sm"
              aria-label={t("search")}
              placeholder={t("search")}
              value={searchQuery}
              onSearch={setSearchQuery}
              containerClassName="flex-1 min-w-0"
            />
            {showGroupFilter && (
              <Button
                type="button"
                variant={activeFilterCount > 0 ? "secondary" : "outline"}
                size="icon"
                className="relative size-9 shrink-0"
                onClick={() => setFilterSheetOpen(true)}
                aria-label={scheduleLabels("calendar.filter")}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-0.5 text-body-2xs font-semibold text-primary"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            )}
          </div>

          {filteredTickets.length === 0 ? (
            <div className="border-t border-border">
              <AdminEmptyState icon={ShieldCheck} title={t("noTickets")} />
            </div>
          ) : (
            <div className="divide-y divide-border/60 border-y border-border/60">
              {filteredTickets.map((ticket) => {
                const isPendingTicket = ticket.status === "pending";
                return (
                  <article
                    key={ticket.id}
                    className="space-y-(--compact-gap) py-(--row-padding)"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-heading text-body-sm font-bold text-foreground">
                          {ticket.type === "reschedule" ? t("reschedule") : t("cancellation")}
                        </p>
                        <p className="break-words text-body-xs text-foreground">
                          {ticket.reason}
                        </p>
                        {ticket.proposedDate && (
                          <p className="text-body-xs tabular-nums text-muted-foreground">
                            {t("proposedDate")}: {ticket.proposedDate}
                          </p>
                        )}
                        {ticket.decisionNotes && (
                          <p className="break-words text-body-xs italic text-muted-foreground">
                            {t("notes")}: {ticket.decisionNotes}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          ticket.status === "approved"
                            ? "default"
                            : ticket.status === "rejected"
                              ? "outline"
                              : "secondary"
                        }
                        className={cn(
                          "shrink-0 rounded-md text-body-2xs font-semibold",
                          ticket.status === "rejected" &&
                            "border-status-error/30 bg-status-error/10 text-status-error",
                        )}
                      >
                        {ticket.status === "approved"
                          ? t("approved")
                          : ticket.status === "rejected"
                            ? t("rejected")
                            : t("awaitingDecision")}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isPendingTicket && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={() => openDecideTicket(ticket, "approved")}
                            className="min-h-9 rounded-lg text-body-sm"
                          >
                            <Check className="mr-1 size-4" aria-hidden />
                            {t("approve")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => openDecideTicket(ticket, "rejected")}
                            className="min-h-9 rounded-lg border-status-error/40 text-body-sm text-status-error hover:bg-status-error/10"
                          >
                            <X className="mr-1 size-4" aria-hidden />
                            {t("rejected")}
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOpenThreadId(ticket.id)}
                        className="min-h-9 rounded-lg text-body-sm"
                      >
                        <MessageSquare className="mr-1.5 size-4" aria-hidden />
                        {t("discussion")}
                        {ticket.messages.length > 0 ? ` (${ticket.messages.length})` : ""}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 4. SLOTS TAB */}
        <TabsContent value="slots" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <SearchBar
              size="sm"
              aria-label={t("search")}
              placeholder={t("search")}
              value={searchQuery}
              onSearch={setSearchQuery}
              containerClassName="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant={activeFilterCount > 0 ? "secondary" : "outline"}
              size="icon"
              className="relative size-9 shrink-0"
              onClick={() => setFilterSheetOpen(true)}
              aria-label={scheduleLabels("calendar.filter")}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {activeFilterCount > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1 top-0.5 text-body-2xs font-semibold text-primary"
                >
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isPending}
              onClick={handleCopyPreviousWeek}
              aria-label={t("copyPreviousWeek")}
              className="size-9 shrink-0"
            >
              <CalendarDays className="size-4" aria-hidden />
            </Button>
          </div>

          {filteredSlots.length === 0 ? (
            <div className="border-t border-border">
              <AdminEmptyState
                icon={CalendarDays}
                title={t("noSlots")}
                description={t("noSlotsDescription")}
              />
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredSlots.map((slot) => {
                const isBooked = Boolean(slot.booking);
                const canDelete = !isBooked && !slotsWithHistory.has(slot.id);
                return (
                  <div
                    key={slot.id}
                    className="flex min-w-0 items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-heading text-body-sm font-bold text-foreground">
                          {t(`days.${slot.dayOfWeek}`)}
                        </span>
                        <Badge
                          variant={isBooked ? "default" : "secondary"}
                          className="rounded-md text-body-2xs font-semibold"
                        >
                          {isBooked ? t("booked") : t("open")}
                        </Badge>
                        <Badge variant="outline" className="rounded-md text-body-2xs font-normal">
                          {slot.mode === "online" ? t("online") : t("inPerson")}
                        </Badge>
                      </div>
                      <p className="text-body-xs tabular-nums text-muted-foreground">
                        {slot.sessionDate ? `${slot.sessionDate} · ` : ""}
                        {slot.startTime} - {slot.endTime}
                      </p>
                      {slot.location && (
                        <p className="inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="break-words">{slot.location}</span>
                        </p>
                      )}
                      {slotNotes[slot.id] && (
                        <p className="whitespace-pre-wrap break-words text-body-xs text-muted-foreground">
                          {t("tutorNotes")}: {slotNotes[slot.id]}
                        </p>
                      )}
                      {slot.booking && (
                        <p className="break-words text-body-xs font-medium text-foreground">
                          {t("topic")}: {slot.booking.topic || t("noSpecificTopic")}
                        </p>
                      )}
                    </div>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => requestDeleteSlot(slot.id)}
                        aria-label={t("delete")}
                        className="size-9 shrink-0 rounded-lg text-status-error hover:text-status-error"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 5. GROUPS TAB */}
        <TabsContent value="groups" className="mt-3 space-y-5">
          <section className="space-y-2">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("assignedCourses")}
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {initialData.assignedActiveCourses.map((course) => (
                <div
                  key={course.courseId}
                  className="flex min-w-0 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-heading text-body-sm font-bold text-foreground">
                      {course.title}
                    </p>
                    <p className="text-body-xs text-muted-foreground">
                      {t("courseCode")}: {course.code || course.courseId}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-md text-body-2xs text-muted-foreground"
                  >
                    {course.isCompatibilityFallback
                      ? t("legacyAssignment")
                      : t("canonicalAssignment")}
                  </Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("activeGroups")}
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {initialData.eligibleGroups.length === 0 ? (
                <AdminEmptyState icon={Users} title={t("noActiveGroups")} className="py-6" />
              ) : (
                initialData.eligibleGroups.map((grp) => (
                  <div
                    key={grp.id}
                    className="flex min-w-0 items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words font-heading text-body-sm font-bold text-foreground">
                        {grp.name}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        {grp.packageName} · {grp.usedQuotaSessions}/{grp.totalQuotaSessions}{" "}
                        {t("sessionsUsed")}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        {t("representativeShort")}: {grp.representative?.name || t("leader")}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 rounded-md text-body-xs tabular-nums"
                    >
                      {grp.membersCount} {t("members")}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* Mobile Filter Bottom Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle className="font-heading text-body-base font-bold">
              {scheduleLabels("calendar.filter")}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-(--panel-padding)">
            {showDayFilter && (
              <div className="space-y-1">
                <Label htmlFor="mobile-tutor-filter-day" className="text-body-sm font-semibold">{t("chooseDay")}</Label>
                <Select value={selectedDayFilter} onValueChange={setSelectedDayFilter}>
                  <SelectTrigger id="mobile-tutor-filter-day" className="px-0">
                    <SelectValue placeholder={t("chooseDay")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allDays")}</SelectItem>
                    {INDONESIAN_DAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {t(`days.${day}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showCourseFilter && (
              <div className="space-y-1">
                <Label htmlFor="mobile-tutor-filter-course" className="text-body-sm font-semibold">{t("allCourses")}</Label>
                <Select value={selectedCourseFilter} onValueChange={setSelectedCourseFilter}>
                  <SelectTrigger id="mobile-tutor-filter-course" className="px-0">
                    <SelectValue placeholder={t("allCourses")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allCourses")}</SelectItem>
                    {initialData.assignedActiveCourses.map((course) => (
                      <SelectItem key={course.courseId} value={course.courseId}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showGroupFilter && (
              <div className="space-y-1">
                <Label htmlFor="mobile-tutor-filter-group" className="text-body-sm font-semibold">{t("allGroups")}</Label>
                <Select value={selectedGroupFilter} onValueChange={setSelectedGroupFilter}>
                  <SelectTrigger id="mobile-tutor-filter-group" className="px-0">
                    <SelectValue placeholder={t("allGroups")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allGroups")}</SelectItem>
                    {initialData.eligibleGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-10 flex-1 text-body-sm"
              onClick={() => {
                setSelectedDayFilter("all");
                setSelectedCourseFilter("all");
                setSelectedGroupFilter("all");
              }}
            >
              {t("allDays")}
            </Button>
            <Button
              type="button"
              className="min-h-10 flex-1 text-body-sm"
              onClick={() => setFilterSheetOpen(false)}
            >
              OK
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bottom-Sheet Slot Creator */}
      <Sheet
        open={isAddSlotOpen}
        onOpenChange={(open) => {
          if (!isPending) setIsAddSlotOpen(open);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle className="font-heading text-body-base font-bold">
              {t("addSlotTitle")}
            </SheetTitle>
            <SheetDescription className="text-body-xs">
              {t("addSlotDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-(--panel-padding)">
            <div className="space-y-1">
              <Label htmlFor="mobile-tutor-slot-date" className="text-body-sm font-semibold">
                {t("date")}
              </Label>
              <Input
                id="mobile-tutor-slot-date"
                type="date"
                value={newSlotDate}
                min={todayIso}
                onChange={(e) => setNewSlotDate(e.target.value)}
                className="h-10 text-body-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("start")}</Label>
                <Input
                  type="time"
                  value={newSlotStart}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  placeholder="09:00"
                  min="07:00"
                  max="20:30"
                  step="1800"
                  className="h-10 text-body-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("end")}</Label>
                <Input
                  value={newSlotEnd}
                  readOnly
                  placeholder="10:30"
                  className="h-10 cursor-not-allowed bg-muted text-body-sm text-muted-foreground"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mobile-tutor-slot-mode" className="text-body-sm font-semibold">{t("sessionMode")}</Label>
              <Select
                value={newSlotMode}
                onValueChange={(val) => setNewSlotMode(val as "online" | "offline")}
              >
                <SelectTrigger id="mobile-tutor-slot-mode" className="px-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">{t("online")} (Google Meet)</SelectItem>
                  <SelectItem value="offline">{t("inPerson")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newSlotMode === "offline" && (
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("location")}</Label>
                <Input
                  value={newSlotLocation}
                  onChange={(e) => setNewSlotLocation(e.target.value)}
                  placeholder={t("locationPlaceholder")}
                  className="h-10 text-body-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="mobile-tutor-slot-notes" className="text-body-sm font-semibold">
                {t("tutorNotes")}{" "}
                <span className="font-normal text-muted-foreground">({t("optional")})</span>
              </Label>
              <Textarea
                id="mobile-tutor-slot-notes"
                value={newSlotNotes}
                onChange={(e) => setNewSlotNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                maxLength={1000}
                className="min-h-20 resize-y text-body-sm"
              />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setIsAddSlotOpen(false)}
              className="min-h-10 flex-1 rounded-lg text-body-sm"
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              isLoading={isPending}
              disabled={!newSlotStart}
              onClick={handleAddSlot}
              className="min-h-10 flex-1 rounded-lg bg-brand-primary text-body-sm text-primary-foreground hover:bg-brand-primary/90"
            >
              {t("saveSlot")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bottom-Sheet Ticket Discussion & Reply Composer */}
      <Sheet
        open={Boolean(activeThreadTicket)}
        onOpenChange={(open) => {
          if (!open) setOpenThreadId(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] flex-col rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {activeThreadTicket && (
            <>
              <SheetHeader className="border-b border-border/60 pb-3">
                <SheetTitle className="font-heading text-body-base font-bold">
                  {t("discussion")}:{" "}
                  {activeThreadTicket.type === "reschedule"
                    ? t("reschedule")
                    : t("cancellation")}
                </SheetTitle>
                <SheetDescription className="break-words text-body-xs">
                  {activeThreadTicket.reason}
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-(--panel-padding) py-2">
                {activeThreadTicket.messages.length === 0 ? (
                  <p className="py-4 text-center text-body-xs text-muted-foreground">
                    {t("noMessages")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {activeThreadTicket.messages.map((msg) => {
                      const isTutor = msg.senderId === currentUserId;
                      return (
                        <li key={msg.id} className="space-y-1 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-body-xs font-semibold text-foreground">
                              {isTutor ? t("you") : msg.senderName || t("groupMember")}
                            </p>
                            <FormattedDate
                              date={msg.createdAt}
                              options={{ dateStyle: "short", timeStyle: "short" }}
                              locale={locale === "en" ? "en-US" : "id-ID"}
                            />
                          </div>
                          <p className="whitespace-pre-wrap wrap-anywhere text-body-sm text-foreground">
                            {msg.message}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex items-end gap-2 border-t border-border/60 px-(--panel-padding) pt-3">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t("replyPlaceholder")}
                  className="min-h-11 flex-1 resize-none text-body-sm"
                  maxLength={2000}
                />
                <Button
                  type="button"
                  size="icon-lg"
                  disabled={isPending || replyText.trim().length === 0}
                  onClick={handleReplyTicket}
                  aria-label={t("sendReply")}
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
