"use client";

import {
  BookOpen,
  CalendarDays,
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
} from "lucide-react";
import { GoogleCalendarControl } from "@/components/schedule/google-calendar-control";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { INDONESIAN_DAYS, getJakartaCalendarDate } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";
import {
  formatWeekDate,
  type TutorScheduleSurfaceProps,
} from "@/features/tutor-schedule/model/types";

export function TutorScheduleDesktop({
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
  onOpenSessionDetail,
  handleCopyPreviousWeek,
}: TutorScheduleSurfaceProps) {
  const t = useTranslations("tutor.schedule");
  const scheduleLabels = useTranslations("schedule");
  const statusLabel = useTranslations("schedule.session.status");

  const showDayFilter = activeTab === "slots";
  const showCourseFilter =
    (activeTab === "slots" || activeTab === "sessions") &&
    initialData.assignedActiveCourses.length > 0;
  const showGroupFilter = activeTab !== "groups" && initialData.eligibleGroups.length > 0;
  const activeFilters = [
    showDayFilter && selectedDayFilter !== "all",
    showCourseFilter && selectedCourseFilter !== "all",
    showGroupFilter && selectedGroupFilter !== "all",
  ].filter(Boolean).length;
  const filterLabel = activeFilters
    ? t("activeFilters", { count: activeFilters })
    : scheduleLabels("calendar.filter");

  const viewSelect = (
    <Select value={activeTab} onValueChange={setActiveTab}>
      <SelectTrigger
        aria-label={t("calendar")}
        variant="inline"
        className="max-w-[180px] shrink-0 font-semibold"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="calendar">{t("calendar")}</SelectItem>
        <SelectItem value="tickets">{t("tickets")}</SelectItem>
        <SelectItem value="groups">{t("classesGroups")}</SelectItem>
        <SelectItem value="slots">{t("slots")}</SelectItem>
        <SelectItem value="sessions">{t("sessions")}</SelectItem>
      </SelectContent>
    </Select>
  );

  const headerActions = (
    <>
      <GoogleCalendarControl />
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="lg" className="shrink-0 gap-1 px-2">
                <Users className="size-3.5" />
                <span>
                  {filledSlotCount}/{openedSlotCount}
                </span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {formatWeekDate(weekInfo.days[0].dateIso, locale)} -{" "}
            {formatWeekDate(weekInfo.days[6].dateIso, locale)}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-60 space-y-1.5 p-3 text-body-xs">
          <p className="font-semibold text-foreground">
            {formatWeekDate(weekInfo.days[0].dateIso, locale)} -{" "}
            {formatWeekDate(weekInfo.days[6].dateIso, locale)}
          </p>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("opened")}</span>
            <strong className="text-foreground">{openedSlotCount}</strong>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("filled")}</span>
            <strong className="text-foreground">{filledSlotCount}</strong>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("available")}</span>
            <strong className="text-foreground">{availableSlotCount}</strong>
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={t("copyPreviousWeek")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("copyPreviousWeek")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled={isPending} onSelect={handleCopyPreviousWeek}>
            <CalendarDays className="size-4 text-muted-foreground" />
            <span>{t("copyPreviousWeek")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-lg"
            onClick={openAddSlotDialog}
            aria-label={t("addSlot")}
          >
            <Plus aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("addSlot")}</TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <TooltipProvider>
      <div className="min-w-0 max-w-full space-y-(--compact-gap)">
        <h1 className="sr-only">{t("title")}</h1>

        {activeTab !== "calendar" && (
          <div className="group flex min-w-0 flex-wrap items-center gap-1.5">
            {activeTab !== "groups" && (
              <SearchBar
                collapsible
                size="sm"
                aria-label={t("search")}
                placeholder={t("search")}
                value={searchQuery}
                onSearch={setSearchQuery}
                containerClassName="max-w-sm"
              />
            )}
            <div className="flex min-w-0 items-center gap-1">
              {viewSelect}
              {(showDayFilter || showCourseFilter || showGroupFilter) && (
                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon-lg"
                          variant={activeFilters ? "secondary" : "ghost"}
                          aria-label={filterLabel}
                        >
                          <SlidersHorizontal aria-hidden />
                          {activeFilters > 0 && (
                            <span
                              aria-hidden
                              className="absolute right-1 top-0.5 text-body-2xs font-semibold text-primary"
                            >
                              {activeFilters}
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{filterLabel}</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="start" className="w-64 max-w-[calc(100dvw-2rem)] space-y-2">
                    {showDayFilter && (
                      <Select value={selectedDayFilter} onValueChange={setSelectedDayFilter}>
                        <SelectTrigger aria-label={t("chooseDay")}>
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
                    )}
                    {showCourseFilter && (
                      <Select value={selectedCourseFilter} onValueChange={setSelectedCourseFilter}>
                        <SelectTrigger aria-label={t("allCourses")}>
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
                    )}
                    {showGroupFilter && (
                      <Select value={selectedGroupFilter} onValueChange={setSelectedGroupFilter}>
                        <SelectTrigger aria-label={t("allGroups")}>
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
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div className={calendarStyles.root}>
            <ScheduleCalendarView
              role="teacher"
              currentUserId={currentUserId}
              weekInfo={weekInfo}
              isWeekLocked={isWeekLocked}
              weekOffset={weekOffset}
              onWeekChange={handleWeekChange}
              coursesList={initialData.assignedActiveCourses.map((c) => ({
                id: c.courseId,
                title: c.title,
              }))}
              groupsList={initialData.eligibleGroups.map((g) => ({ id: g.id, name: g.name }))}
              slots={scheduleData.ownedSlots}
              bookings={scheduleData.ownedBookings}
              onCreateScheduleDirect={handleCreateSlotDirect}
              onMoveSession={handleOpenMoveModal}
              onDeleteSlot={requestDeleteSlot}
              onOpenSessionDetail={(booking) => onOpenSessionDetail(booking.id)}
              leadingToolbarControls={viewSelect}
              trailingToolbarControls={headerActions}
            />
          </div>
        )}

        {activeTab === "slots" && (
          <div className="space-y-(--compact-gap)">
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
                  return (
                    <div
                      key={slot.id}
                      className="flex flex-col justify-between gap-(--compact-gap) py-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-body-base font-bold text-foreground">
                            {t(`days.${slot.dayOfWeek}`)}
                          </span>
                          <Badge
                            variant={isBooked ? "default" : "secondary"}
                            className="rounded-md text-body-xs font-semibold"
                          >
                            {isBooked ? t("booked") : t("open")}
                          </Badge>
                          <Badge variant="outline" className="rounded-md text-body-xs font-normal">
                            {slot.mode === "online" ? t("online") : t("inPerson")}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-(--compact-gap) text-body-xs text-muted-foreground">
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
                            <span>
                              {t("date")}: {slot.sessionDate}
                            </span>
                          )}
                        </div>
                        {slotNotes[slot.id] && (
                          <p className="max-w-2xl whitespace-pre-wrap break-words text-body-xs text-muted-foreground">
                            {t("tutorNotes")}: {slotNotes[slot.id]}
                          </p>
                        )}
                        {slot.booking && (
                          <p className="pt-0.5 text-body-xs font-medium text-foreground">
                            {t("topic")}: {slot.booking.topic || t("noSpecificTopic")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isBooked && !slotsWithHistory.has(slot.id) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={isPending}
                                aria-label={t("delete")}
                                className="h-8 w-8 rounded-lg"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem
                                onSelect={() => requestDeleteSlot(slot.id)}
                                className="text-status-error focus:text-status-error"
                              >
                                <Trash2 className="size-4" />
                                <span>{t("delete")}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="space-y-(--compact-gap)">
            {filteredBookings.length === 0 ? (
              <div className="border-t border-border">
                <AdminEmptyState icon={BookOpen} title={t("noSessions")} />
              </div>
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-col justify-between gap-(--compact-gap) py-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-body-base font-bold text-foreground">
                          {booking.course?.title || t("course")}
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-md border-brand-primary/30 text-body-xs font-semibold text-brand-primary"
                        >
                          {booking.group?.name || t("group")}
                        </Badge>
                        <Badge
                          variant={booking.status === "completed" ? "default" : "secondary"}
                          className="rounded-md text-body-xs"
                        >
                          {statusLabel(
                            booking.status === "completed" || booking.status === "cancelled"
                              ? booking.status
                              : "scheduled",
                          )}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-(--compact-gap) text-body-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {booking.sessionDate} ({booking.startTime} - {booking.endTime})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" />
                          {t("representativeShort")}: {booking.student?.name || t("leader")}
                        </span>
                      </div>
                      {booking.topic && (
                        <p className="pt-0.5 text-body-xs font-medium text-foreground">
                          {t("topic")}: {booking.topic}
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
                            <span>{t("googleMeetSession")}</span>
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenMoveModal(booking)}
                        className="h-8 rounded-lg text-body-sm"
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        {t("moveSchedule")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "tickets" && (
          <div className="space-y-(--compact-gap)">
            {filteredTickets.length === 0 ? (
              <div className="border-t border-border">
                <AdminEmptyState icon={ShieldCheck} title={t("noTickets")} />
              </div>
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {filteredTickets.map((ticket) => {
                  const isPendingTicket = ticket.status === "pending";
                  const isThreadOpen = openThreadId === ticket.id;
                  return (
                    <Collapsible
                      key={ticket.id}
                      open={isThreadOpen}
                      onOpenChange={(open) => {
                        setOpenThreadId(open ? ticket.id : null);
                        if (!open) setReplyText("");
                      }}
                      className="space-y-(--compact-gap) py-3"
                    >
                      <div className="flex flex-col justify-between gap-(--compact-gap) sm:flex-row sm:items-center">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-heading text-body-base font-bold text-foreground">
                              {t("ticket")}:{" "}
                              {ticket.type === "reschedule"
                                ? t("reschedule")
                                : t("cancellation")}
                            </span>
                            <Badge
                              variant={
                                ticket.status === "approved"
                                  ? "default"
                                  : ticket.status === "rejected"
                                    ? "outline"
                                    : "secondary"
                              }
                              className={`rounded-md text-body-xs font-semibold ${
                                ticket.status === "rejected"
                                  ? "border-status-error/30 bg-status-error/10 text-status-error"
                                  : ""
                              }`}
                            >
                              {ticket.status === "approved"
                                ? t("approved")
                                : ticket.status === "rejected"
                                  ? t("rejected")
                                  : t("awaitingDecision")}
                            </Badge>
                          </div>
                          <p className="text-body-xs font-medium text-foreground">
                            {t("reason")}: {ticket.reason}
                          </p>
                          {ticket.proposedDate && (
                            <p className="text-body-xs text-muted-foreground">
                              {t("proposedDate")}: {ticket.proposedDate}
                            </p>
                          )}
                          {ticket.decisionNotes && (
                            <p className="text-body-xs italic text-muted-foreground">
                              {t("notes")}: {ticket.decisionNotes}
                            </p>
                          )}
                        </div>
                        {isPendingTicket ? (
                          <DropdownMenu>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-lg"
                                    aria-label={t("ticketActions")}
                                  >
                                    <MoreHorizontal aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{t("ticketActions")}</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setOpenThreadId(isThreadOpen ? null : ticket.id);
                                  if (isThreadOpen) setReplyText("");
                                }}
                              >
                                <MessageSquare aria-hidden />
                                {isThreadOpen ? t("hideDiscussion") : t("discussion")}
                                {ticket.messages.length > 0 ? ` (${ticket.messages.length})` : ""}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openDecideTicket(ticket, "approved")}>
                                {t("decide")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 self-start rounded-lg text-body-sm sm:self-auto"
                            >
                              <MessageSquare aria-hidden />
                              {t("discussion")}
                              {ticket.messages.length > 0 ? ` (${ticket.messages.length})` : ""}
                            </Button>
                          </CollapsibleTrigger>
                        )}
                      </div>
                      <CollapsibleContent>
                        <div className="space-y-(--compact-gap) border-l-2 border-border pl-3">
                          {ticket.messages.length === 0 ? (
                            <p className="text-body-xs text-muted-foreground">{t("noMessages")}</p>
                          ) : (
                            <ul className="divide-y divide-border">
                              {ticket.messages.map((msg) => {
                                const isTutor = msg.senderId === currentUserId;
                                return (
                                  <li key={msg.id} className="space-y-1 py-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
                          <div className="flex items-end gap-2">
                            <Textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder={t("replyPlaceholder")}
                              className="min-h-[44px] flex-1 resize-none text-body-sm"
                              maxLength={2000}
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon-lg"
                                  disabled={isPending || replyText.trim().length === 0}
                                  onClick={handleReplyTicket}
                                  aria-label={t("sendReply")}
                                >
                                  <Send aria-hidden />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("sendReply")}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "groups" && (
          <div className="space-y-(--related-gap)">
            <div className="space-y-(--compact-gap)">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                {t("assignedCourses")}
              </h2>
              <div className="divide-y divide-border border-y border-border">
                {initialData.assignedActiveCourses.map((course) => (
                  <div
                    key={course.courseId}
                    className="flex items-center justify-between gap-(--compact-gap) py-3"
                  >
                    <div>
                      <p className="font-heading text-body-sm font-bold text-foreground">
                        {course.title}
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        {t("courseCode")}: {course.code || course.courseId}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-md text-body-xs text-muted-foreground">
                      {course.isCompatibilityFallback
                        ? t("legacyAssignment")
                        : t("canonicalAssignment")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-(--compact-gap)">
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
                      className="flex flex-col justify-between gap-(--compact-gap) py-3 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <p className="font-heading text-body-sm font-bold text-foreground">
                          {grp.name}
                        </p>
                        <p className="text-body-xs text-muted-foreground">
                          {t("package")}: {grp.packageName} ({grp.usedQuotaSessions}/
                          {grp.totalQuotaSessions} {t("sessionsUsed")})
                        </p>
                        <p className="text-body-xs text-muted-foreground">
                          {t("representativeShort")}: {grp.representative?.name || t("leader")} (
                          {grp.representative?.role || t("leader")})
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 rounded-md text-body-xs">
                        {grp.membersCount} {t("members")}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <Dialog
          open={isAddSlotOpen}
          onOpenChange={(open) => {
            if (!isPending) setIsAddSlotOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-base font-bold">
                {t("addSlotTitle")}
              </DialogTitle>
              <DialogDescription className="text-body-xs">
                {t("addSlotDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-(--compact-gap) py-2">
              <div className="space-y-1">
                <Label htmlFor="tutor-slot-date" className="text-body-sm font-semibold">
                  {t("date")}
                </Label>
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
                  <Input
                    type="time"
                    value={newSlotStart}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    placeholder="09:00"
                    min="07:00"
                    max="20:30"
                    step="1800"
                    className="h-9 text-body-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-body-sm font-semibold">{t("end")}</Label>
                  <Input
                    value={newSlotEnd}
                    readOnly
                    placeholder="10:30"
                    className="h-9 cursor-not-allowed bg-muted text-body-sm text-muted-foreground"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-body-sm font-semibold">{t("sessionMode")}</Label>
                <Select
                  value={newSlotMode}
                  onValueChange={(val) => setNewSlotMode(val as "online" | "offline")}
                >
                  <SelectTrigger className="h-9 text-body-sm">
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
                    className="h-9 text-body-sm"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="tutor-slot-notes" className="text-body-sm font-semibold">
                  {t("tutorNotes")}{" "}
                  <span className="font-normal text-muted-foreground">({t("optional")})</span>
                </Label>
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
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setIsAddSlotOpen(false)}
                className="h-9 rounded-lg text-body-sm"
              >
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                isLoading={isPending}
                disabled={!newSlotStart}
                onClick={handleAddSlot}
                className="h-9 rounded-lg bg-brand-primary text-body-sm text-primary-foreground hover:bg-brand-primary/90"
              >
                {t("saveSlot")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
