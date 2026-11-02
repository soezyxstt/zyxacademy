"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  Edit3,
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import { AuditLogDrawer } from "@/components/schedule/audit-log-drawer";
import { RescheduleTicketModal } from "@/components/schedule/reschedule-ticket-modal";
import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";
import {
  createAcademicSchedule,
  updateAcademicSchedule,
  deleteAcademicSchedule,
  adminBatchGenerateMeet,
  adminCreateTutorAvailability,
  adminAssignTutorialSession,
  adminMoveTutorialSession,
  adminCancelTutorialSession,
  adminDeleteTutorAvailability,
  updateTutorCourses,
} from "@/app/(admin)/admin/(academic)/schedules/actions";
import { daysFrom, formatIsoDate, getJakartaNow, getWeekScheduleDays } from "@/lib/date-utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations } from "@/lib/i18n/client";

type Props = {
  initialData: any;
  initialWeekOffset?: number;
};

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.max(0, (hours || 0) * 60 + (mins || 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function scheduleTypeLabel(type: string, t: ReturnType<typeof useTranslations<"adminOps">>) {
  if (type === "official_exam") return t("academicScheduleUI.officialExam");
  if (type === "tryout") return t("academicScheduleUI.tryout");
  if (type === "quiz") return t("academicScheduleUI.quiz");
  return t("academicScheduleUI.general");
}

/**
 * Dashboard for managing academic schedules, tutor availability, and group tutorial sessions.
 */
export function AcademicSchedulesDashboard({ initialData, initialWeekOffset = 0 }: Props) {
  const translate = useTranslations("adminOps");
  const router = useRouter();
  const data = initialData;
  const [activeTab, setActiveTab] = useUrlTab("tab", "calendar");
  const [calendarMode, setCalendarMode] = useUrlTab("calendarMode", "all");
  const [displayWeekOffset, setDisplayWeekOffset] = useState(initialWeekOffset);

  useEffect(() => {
    setDisplayWeekOffset(initialWeekOffset);
  }, [initialWeekOffset]);

  const displayWeekInfo = useMemo(
    () => getWeekScheduleDays(daysFrom(displayWeekOffset * 7, getJakartaNow())),
    [displayWeekOffset],
  );
  const displayWeekLocked = false;

  useEffect(() => {
    for (const offset of [displayWeekOffset - 1, displayWeekOffset + 1]) {
      const params = new URLSearchParams(window.location.search);
      if (offset === 0) params.delete("week");
      else params.set("week", String(offset));
      const query = params.toString();
      router.prefetch(query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
  }, [displayWeekOffset, router]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [pendingDeleteSchedule, setPendingDeleteSchedule] = useState<any | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [formType, setFormType] = useState<"official_exam" | "tryout" | "quiz" | "general">("official_exam");
  const [formTitle, setFormTitle] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [selectedAuditBooking, setSelectedAuditBooking] = useState<any | null>(null);
  const [selectedTicketBooking, setSelectedTicketBooking] = useState<any | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<any | null>(null);

  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityTutorId, setAvailabilityTutorId] = useState("");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("09:00");
  const [availabilityMode, setAvailabilityMode] = useState<"online" | "offline">("online");
  const [availabilityLocation, setAvailabilityLocation] = useState("");
  const [availabilityReason, setAvailabilityReason] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [assignmentSlot, setAssignmentSlot] = useState<any | null>(null);
  const [assignmentGroupId, setAssignmentGroupId] = useState("");
  const [assignmentCourseId, setAssignmentCourseId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentTopic, setAssignmentTopic] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const [moveBooking, setMoveBooking] = useState<any | null>(null);
  const [moveTargetSlotId, setMoveTargetSlotId] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveLoading, setMoveLoading] = useState(false);
  const [cancelBooking, setCancelBooking] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [batchMeetLoading, setBatchMeetLoading] = useState(false);

  const [editingTutor, setEditingTutor] = useState<any | null>(null);
  const [certSelectedIds, setCertSelectedIds] = useState<string[]>([]);
  const [certSaving, setCertSaving] = useState(false);

  const [pendingDeleteSlot, setPendingDeleteSlot] = useState<any | null>(null);
  const [deleteSlotReason, setDeleteSlotReason] = useState("");
  const [deleteSlotLoading, setDeleteSlotLoading] = useState(false);

  const pendingTickets = (data?.tickets ?? []).filter((ticket: any) => ticket.status === "pending").length;

  const handleWeekChange = (offset: number) => {
    setDisplayWeekOffset(offset);
    const url = new URL(window.location.href);
    if (offset === 0) url.searchParams.delete("week");
    else url.searchParams.set("week", String(offset));
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };

  const resetAvailabilityForm = () => {
    setAvailabilityTutorId(data.tutors[0]?.id || "");
    setAvailabilityDate(displayWeekInfo.startOfWeekIso || data.weekRange?.startIso || "");
    setAvailabilityStart("09:00");
    setAvailabilityMode("online");
    setAvailabilityLocation("");
    setAvailabilityReason("");
  };

  const openAvailabilityDialog = () => {
    resetAvailabilityForm();
    setAvailabilityOpen(true);
  };

  const handleAvailabilitySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAvailabilityLoading(true);
    try {
      const result = await adminCreateTutorAvailability({
        tutorId: availabilityTutorId,
        sessionDate: availabilityDate,
        startTime: availabilityStart,
        endTime: addMinutesToTime(availabilityStart, 90),
        mode: availabilityMode,
        location: availabilityMode === "offline" ? availabilityLocation : null,
        reason: availabilityReason,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.availabilityCreated"));
        setAvailabilityOpen(false);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.availabilityCreateFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const openAssignmentDialog = (slot: any) => {
    setAssignmentSlot(slot);
    setAssignmentGroupId("");
    setAssignmentCourseId("");
    setAssignmentReason("");
    setAssignmentTopic("");
  };

  const handleAssignmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignmentSlot) return;
    setAssignmentLoading(true);
    try {
      const result = await adminAssignTutorialSession({
        slotId: assignmentSlot.id,
        groupId: assignmentGroupId,
        courseId: assignmentCourseId,
        reason: assignmentReason,
        topic: assignmentTopic || null,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.assigned"));
        setAssignmentSlot(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.assignFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setAssignmentLoading(false);
    }
  };

  const openMoveDialog = (booking: any) => {
    setMoveBooking(booking);
    setMoveTargetSlotId("");
    setMoveReason("");
  };

  const handleMoveSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!moveBooking) return;
    setMoveLoading(true);
    try {
      const result = await adminMoveTutorialSession({
        bookingId: moveBooking.id,
        targetSlotId: moveTargetSlotId,
        reason: moveReason,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.moved"));
        setMoveBooking(null);
        setSelectedSessionDetail(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.moveFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setMoveLoading(false);
    }
  };

  const openCancelDialog = (booking: any) => {
    setCancelBooking(booking);
    setCancelReason("");
  };

  const handleCancelSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancelBooking) return;
    setCancelLoading(true);
    try {
      const result = await adminCancelTutorialSession({
        bookingId: cancelBooking.id,
        reason: cancelReason,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.cancelled"));
        setCancelBooking(null);
        setSelectedSessionDetail(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.cancelFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setCancelLoading(false);
    }
  };

  const openDeleteSlotDialog = (slotId: string) => {
    const slot = data.slots.find((s: any) => s.id === slotId) || { id: slotId };
    setPendingDeleteSlot(slot);
    setDeleteSlotReason("");
  };

  const handleDeleteSlotSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingDeleteSlot) return;
    setDeleteSlotLoading(true);
    try {
      const result = await adminDeleteTutorAvailability({
        slotId: pendingDeleteSlot.id,
        reason: deleteSlotReason,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.availabilityDeleted"));
        setPendingDeleteSlot(null);
        router.refresh();
      } else {
        toast.error(translate("academicScheduleUI.availabilityDeleteFailure"));
      }
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setDeleteSlotLoading(false);
    }
  };

  const resetAcademicForm = () => {
    setFormType("official_exam");
    setFormTitle("");
    setFormCourseId("");
    setFormDescription("");
    setFormStartDate("");
    setFormEndDate("");
    setFormLocation("");
  };

  const handleOpenCreate = () => {
    resetAcademicForm();
    setIsCreateOpen(true);
  };

  const handleCreateDirect = (dateIso: string, startTime?: string, endTime?: string) => {
    const startT = startTime || "09:00";
    let endT = endTime;
    if (!endT) {
      const [h, m] = startT.split(":").map(Number);
      const startMinutes = (h || 0) * 60 + (m || 0);
      const endMinutes = Math.min(23 * 60 + 59, startMinutes + 90);
      endT = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    }
    resetAcademicForm();
    setFormStartDate(`${dateIso}T${startT}`);
    setFormEndDate(`${dateIso}T${endT}`);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formTitle.trim() || !formStartDate) {
      toast.error(translate("academicScheduleUI.titleAndStartRequired"));
      return;
    }
    setFormLoading(true);
    try {
      const result = await createAcademicSchedule({
        type: formType,
        title: formTitle.trim(),
        courseId: formCourseId || null,
        description: formDescription || null,
        startDate: new Date(formStartDate),
        endDate: formEndDate ? new Date(formEndDate) : null,
        location: formLocation || null,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.academicCreated"));
        setIsCreateOpen(false);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.academicCreateFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEdit = (schedule: any) => {
    setEditingSchedule(schedule);
    setFormType(schedule.type);
    setFormTitle(schedule.title);
    setFormCourseId(schedule.courseId || "");
    setFormDescription(schedule.description || "");
    setFormStartDate(schedule.startDate ? new Date(schedule.startDate).toISOString().slice(0, 16) : "");
    setFormEndDate(schedule.endDate ? new Date(schedule.endDate).toISOString().slice(0, 16) : "");
    setFormLocation(schedule.location || "");
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingSchedule) return;
    setFormLoading(true);
    try {
      const result = await updateAcademicSchedule(editingSchedule.id, {
        type: formType,
        title: formTitle.trim(),
        courseId: formCourseId || null,
        description: formDescription || null,
        startDate: new Date(formStartDate),
        endDate: formEndDate ? new Date(formEndDate) : null,
        location: formLocation || null,
      });
      if (result.success) {
        toast.success(translate("academicScheduleUI.academicUpdated"));
        setEditingSchedule(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.academicUpdateFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteSchedule) return;
    setIsDeletingSchedule(true);
    try {
      const result = await deleteAcademicSchedule(pendingDeleteSchedule.id);
      if (result.success) {
        toast.success(translate("academicScheduleUI.academicDeleted"));
        setPendingDeleteSchedule(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.academicDeleteFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const handleBatchMeetAutomation = async () => {
    setBatchMeetLoading(true);
    try {
      const result = await adminBatchGenerateMeet();
      if (result.success) {
        toast.success(`Otomasi selesai: ${result.count} tautan Google Meet baru dibuat`);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.automationFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setBatchMeetLoading(false);
    }
  };

  const handleOpenCertDialog = (tutor: any) => {
    setEditingTutor(tutor);
    setCertSelectedIds((tutor.tutorCourses || []).map((item: any) => item.courseId));
  };

  const handleToggleCourse = (courseId: string) => {
    setCertSelectedIds((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId],
    );
  };

  const handleSaveCerts = async () => {
    if (!editingTutor) return;
    setCertSaving(true);
    try {
      const result = await updateTutorCourses(editingTutor.id, certSelectedIds);
      if (result.success) {
        toast.success(translate("academicScheduleUI.certsUpdated"));
        setEditingTutor(null);
        router.refresh();
      } else toast.error(translate("academicScheduleUI.certsFailure"));
    } catch {
      toast.error(translate("academicScheduleUI.connectionError"));
    } finally {
      setCertSaving(false);
    }
  };

  const academicForm = (
    <form onSubmit={editingSchedule ? handleEditSubmit : handleCreateSubmit} className="my-2 space-y-4">
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.type")}</label>
        <Select value={formType} onValueChange={(value: any) => setFormType(value)}>
          <SelectTrigger className="h-10 rounded-lg bg-card text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="official_exam">{translate("academicScheduleUI.officialExam")}</SelectItem>
            <SelectItem value="tryout">{translate("academicScheduleUI.tryout")}</SelectItem>
            <SelectItem value="quiz">{translate("academicScheduleUI.quiz")}</SelectItem>
            <SelectItem value="general">{translate("academicScheduleUI.general")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.title")}</label>
        <Input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required placeholder={translate("academicScheduleUI.titlePlaceholder")} className="h-10 rounded-lg text-body-sm" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.courseOptional")}</label>
        <Select value={formCourseId || "all"} onValueChange={(value) => setFormCourseId(value === "all" ? "" : value)}>
          <SelectTrigger className="h-10 rounded-lg bg-card text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("academicScheduleUI.allCourses")}</SelectItem>
            {data.courses.map((course: any) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.start")}</label>
          <Input type="datetime-local" value={formStartDate} onChange={(event) => setFormStartDate(event.target.value)} required className="h-10 rounded-lg text-body-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.end")}</label>
          <Input type="datetime-local" value={formEndDate} onChange={(event) => setFormEndDate(event.target.value)} className="h-10 rounded-lg text-body-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.locationOptional")}</label>
        <Input value={formLocation} onChange={(event) => setFormLocation(event.target.value)} placeholder={translate("academicScheduleUI.locationPlaceholder")} className="h-10 rounded-lg text-body-sm" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">{translate("academicScheduleUI.description")}</label>
        <Textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} rows={3} className="resize-y rounded-lg text-body-sm" />
      </div>
      <DialogFooter className="gap-2 pt-2">
        <DialogClose asChild><Button variant="outline" type="button" disabled={formLoading}>{translate("academicScheduleUI.cancel")}</Button></DialogClose>
        <Button type="submit" disabled={formLoading} isLoading={formLoading} className="rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90">{editingSchedule ? translate("academicScheduleUI.saveChanges") : translate("academicScheduleUI.saveSchedule")}</Button>
      </DialogFooter>
    </form>
  );

  return (
    <div className="space-y-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="min-w-max">
              <TabsTrigger value="calendar"><CalendarDays className="size-3.5" />{translate("academicScheduleUI.calendar")}</TabsTrigger>
              <TabsTrigger value="academic">{translate("academicScheduleUI.list")}</TabsTrigger>
              <TabsTrigger value="tutors">{translate("academicScheduleUI.tutors")}</TabsTrigger>
              <TabsTrigger value="tickets">
                {translate("academicScheduleUI.rescheduleTab")}
                {pendingTickets > 0 ? <Badge className="h-4 min-w-4 bg-amber-500 px-1 py-0 text-body-2xs font-bold text-white">{pendingTickets}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="audit">{translate("academicScheduleUI.audit")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === "calendar" ? (
          <Select value={calendarMode} onValueChange={setCalendarMode}>
            <SelectTrigger className="h-9 w-[150px] shrink-0 rounded-lg text-body-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{translate("academicScheduleUI.allSchedules")}</SelectItem>
              <SelectItem value="tutorial">{translate("academicScheduleUI.tutorial")}</SelectItem>
              <SelectItem value="academic">{translate("academicScheduleUI.academic")}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <Button variant="outline" size="sm" disabled={batchMeetLoading} onClick={handleBatchMeetAutomation} className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-body-sm font-semibold text-blue-600">
          <Bot className="size-3.5" />
          <span className="hidden sm:inline">{translate("academicScheduleUI.meetAutomation")}</span>
        </Button>

        {activeTab === "calendar" && (calendarMode === "tutorial" || calendarMode === "all") && (
          <Button
            variant={calendarMode === "all" ? "outline" : "default"}
            size="sm"
            onClick={openAvailabilityDialog}
            className="h-9 shrink-0 gap-1.5 rounded-lg text-body-sm font-semibold"
          >
            <Plus className="size-3.5" />
            <span className={calendarMode === "all" ? "hidden sm:inline" : undefined}>{translate("academicScheduleUI.add")}</span> {translate("academicScheduleUI.availability")}
          </Button>
        )}

        {(activeTab === "academic" || (activeTab === "calendar" && (calendarMode === "academic" || calendarMode === "all"))) && (
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-9 shrink-0 gap-1.5 rounded-lg text-body-sm font-semibold"
          >
            <Plus className="size-3.5" />
            {translate("academicScheduleUI.createButton")}
          </Button>
        )}
      </div>

      {activeTab === "calendar" && (
        <div className="space-y-3">
          {(calendarMode === "tutorial" || calendarMode === "all") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-body-xs">
              <span className="text-muted-foreground">{translate("academicScheduleUI.coverage")}</span>
              <div className="flex items-center gap-2">
                {(data.coverage || []).map((row: any) => (
                  <Badge key={row.tutorId} variant="outline" className="rounded-md font-normal">{row.tutorName}: {row.available} {translate("academicScheduleUI.available")}</Badge>
                ))}
                {Number(data.legacyNullDateSlotCount || 0) > 0 ? <Badge variant="outline" className="rounded-md border-amber-500/40 text-amber-700">{data.legacyNullDateSlotCount} {translate("academicScheduleUI.legacySlots")}</Badge> : null}
              </div>
            </div>
          )}
          <div className={calendarStyles.root}>
            <ScheduleCalendarView
              role="admin"
              adminMode={calendarMode as "all" | "tutorial" | "academic"}
              currentUserId=""
              weekInfo={displayWeekInfo}
              isWeekLocked={displayWeekLocked}
              weekOffset={displayWeekOffset}
              onWeekChange={handleWeekChange}
              coursesList={data.courses}
              tutorsList={data.tutors}
              groupsList={data.groups}
              slots={data.slots}
              bookings={data.bookings}
              academicSchedules={data.academicSchedules}
              onCreateScheduleDirect={calendarMode === "academic" || calendarMode === "all" ? handleCreateDirect : undefined}
              onAssignTutorialSlot={calendarMode === "tutorial" || calendarMode === "all" ? openAssignmentDialog : undefined}
              onOpenSessionDetail={calendarMode === "tutorial" || calendarMode === "all" ? setSelectedSessionDetail : undefined}
              onDeleteSlot={calendarMode === "tutorial" || calendarMode === "all" ? openDeleteSlotDialog : undefined}
              onEditSchedule={handleOpenEdit}
              onDeleteSchedule={setPendingDeleteSchedule}
              onOpenAuditLog={setSelectedAuditBooking}
              onOpenRescheduleTicket={setSelectedTicketBooking}
            />
          </div>
        </div>
      )}

      {activeTab === "academic" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead>
              <tr><th>{translate("academicScheduleUI.tableTypeTitle")}</th><th>{translate("academicScheduleUI.course")}</th><th>{translate("academicScheduleUI.time")}</th><th>{translate("academicScheduleUI.location")}</th><th>{translate("academicScheduleUI.status")}</th><th className="text-center">{translate("academicScheduleUI.actions")}</th></tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.academicSchedules.length === 0 ? (
                <tr><td colSpan={6}><AdminEmptyState compact title={translate("academicScheduleUI.noAcademic")} /></td></tr>
              ) : data.academicSchedules.map((schedule: any) => (
                <tr key={schedule.id} className="align-top transition-colors hover:bg-muted/30">
                  <td className="max-w-md px-4 py-3">
                    <p className="break-words font-bold leading-snug text-foreground">{schedule.title}</p>
                    <p className="mt-1 text-body-2xs font-bold uppercase tracking-wide text-muted-foreground">{scheduleTypeLabel(schedule.type, translate)}</p>
                    {schedule.description ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-body-xs text-muted-foreground">{schedule.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-body-xs">{schedule.course?.title || <span className="text-muted-foreground">{translate("academicScheduleUI.allCoursesLabel")}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-body-xs text-muted-foreground">{formatIsoDate(new Date(schedule.startDate))}{schedule.endDate ? ` - ${formatIsoDate(new Date(schedule.endDate))}` : ""}</td>
                  <td className="max-w-xs break-all px-4 py-3 text-body-xs text-muted-foreground">{schedule.location || "-"}</td>
                  <td className="px-4 py-3"><StatusBadge tone="success">{translate("academicScheduleUI.published")}</StatusBadge></td>
                  <td className="px-4 py-3"><div className="flex justify-center gap-1"><Button variant="ghost" size="xs" onClick={() => handleOpenEdit(schedule)} title={translate("academicScheduleUI.edit")}><Edit3 className="size-4" /></Button><Button variant="ghost" size="xs" onClick={() => setPendingDeleteSchedule(schedule)} className="text-red-500" title={translate("academicScheduleUI.delete")}><Trash2 className="size-4" /></Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      {activeTab === "tickets" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead><tr><th>{translate("academicScheduleUI.ticketTypeGroup")}</th><th>{translate("academicScheduleUI.courseTutor")}</th><th>{translate("academicScheduleUI.reason")}</th><th>{translate("academicScheduleUI.status")}</th><th>{translate("academicScheduleUI.date")}</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {(data?.tickets ?? []).length === 0 ? <tr><td colSpan={5}><AdminEmptyState compact title={translate("academicScheduleUI.noTickets")} /></td></tr> : (data?.tickets ?? []).map((ticket: any) => (
                <tr key={ticket.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3"><p className="font-semibold capitalize text-foreground">{translate("academicScheduleUI.requestType", { type: ticket.type })}</p><p className="text-body-xs text-muted-foreground">{ticket.booking?.group?.name}</p></td>
                  <td className="px-4 py-3 text-body-xs"><p>{ticket.booking?.course?.title}</p><p className="text-muted-foreground">{translate("academicScheduleUI.tutorPrefix", { name: ticket.tutor?.name ?? "" })}</p></td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-body-xs text-muted-foreground">{ticket.reason}</td>
                  <td className="px-4 py-3"><Badge variant={ticket.status === "approved" ? "default" : "outline"}>{ticket.status === "approved" ? translate("academicScheduleUI.approved") : ticket.status === "rejected" ? translate("academicScheduleUI.rejected") : translate("academicScheduleUI.pending")}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-body-xs text-muted-foreground">{formatIsoDate(new Date(ticket.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      {activeTab === "audit" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead><tr><th>{translate("academicScheduleUI.activity")}</th><th>{translate("academicScheduleUI.groupClass")}</th><th>{translate("academicScheduleUI.actor")}</th><th>{translate("academicScheduleUI.time")}</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {(data?.auditLogs ?? []).length === 0 ? <tr><td colSpan={4}><AdminEmptyState compact title={translate("academicScheduleUI.noActivity")} /></td></tr> : (data?.auditLogs ?? []).map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30"><td className="max-w-lg whitespace-pre-wrap break-words px-4 py-3 text-body-xs font-semibold">{log.summary}</td><td className="px-4 py-3 text-body-xs"><p>{log.booking?.group?.name}</p><p className="text-muted-foreground">{log.booking?.course?.title}</p></td><td className="px-4 py-3 text-body-xs text-muted-foreground">{log.actor?.name || translate("academicScheduleUI.system")}</td><td className="whitespace-nowrap px-4 py-3 text-body-xs text-muted-foreground">{formatIsoDate(new Date(log.createdAt))}</td></tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      {activeTab === "tutors" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead><tr><th>{translate("academicScheduleUI.tutor")}</th><th>{translate("academicScheduleUI.certifiedCourses")}</th><th>{translate("academicScheduleUI.openedSlots")}</th><th className="text-right">{translate("academicScheduleUI.actions")}</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.tutors.length === 0 ? <tr><td colSpan={4}><AdminEmptyState compact title={translate("academicScheduleUI.noTutors")} /></td></tr> : data.tutors.map((tutor: any) => (
                <tr key={tutor.id} className="hover:bg-muted/30"><td className="px-4 py-3 text-body-xs font-semibold">{tutor.name}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(tutor.tutorCourses || []).length ? tutor.tutorCourses.map((item: any) => <Badge key={item.courseId} variant="outline" className="rounded-md text-body-2xs">{item.course?.title}</Badge>) : <span className="text-body-xs text-muted-foreground">{translate("academicScheduleUI.noCerts")}</span>}</div></td><td className="px-4 py-3 text-body-xs text-muted-foreground">{data.slots.filter((slot: any) => slot.tutorId === tutor.id).length}</td><td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => handleOpenCertDialog(tutor)} className="h-8"><GraduationCap className="size-3.5" />{translate("academicScheduleUI.manage")}</Button></td></tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{translate("academicScheduleUI.addAvailability")}</DialogTitle><DialogDescription>{translate("academicScheduleUI.availabilityHelp")}</DialogDescription></DialogHeader>
          <form onSubmit={handleAvailabilitySubmit} className="space-y-4">
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.tutor")}</label><Select value={availabilityTutorId} onValueChange={setAvailabilityTutorId}><SelectTrigger><SelectValue placeholder={translate("academicScheduleUI.chooseTutor")} /></SelectTrigger><SelectContent>{data.tutors.map((tutor: any) => <SelectItem key={tutor.id} value={tutor.id}>{tutor.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.sessionDate")}</label><Input type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} required /></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.startTime")}</label><Input type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} required /></div></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.endTime")}</label><Input value={addMinutesToTime(availabilityStart, 90)} readOnly className="bg-muted" /></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.mode")}</label><Select value={availabilityMode} onValueChange={(value: "online" | "offline") => setAvailabilityMode(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">{translate("academicScheduleUI.online")}</SelectItem><SelectItem value="offline">{translate("academicScheduleUI.offline")}</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.location")}</label><Input value={availabilityLocation} onChange={(event) => setAvailabilityLocation(event.target.value)} disabled={availabilityMode !== "offline"} /></div></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.overrideReason")}</label><Textarea value={availabilityReason} onChange={(event) => setAvailabilityReason(event.target.value)} required rows={3} /></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={availabilityLoading}>{translate("academicScheduleUI.cancel")}</Button></DialogClose><Button type="submit" isLoading={availabilityLoading}>{translate("academicScheduleUI.saveAvailability")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentSlot)} onOpenChange={(open) => !open && setAssignmentSlot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{translate("academicScheduleUI.assignSession")}</DialogTitle><DialogDescription>{translate("academicScheduleUI.assignHelp")}</DialogDescription></DialogHeader>
          {assignmentSlot ? <form onSubmit={handleAssignmentSubmit} className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-body-xs">{assignmentSlot.sessionDate} · {assignmentSlot.startTime} - {assignmentSlot.endTime} · {assignmentSlot.tutor?.name || translate("academicScheduleUI.tutor")}</div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.group")}</label><Select value={assignmentGroupId} onValueChange={setAssignmentGroupId}><SelectTrigger><SelectValue placeholder={translate("academicScheduleUI.chooseGroup")} /></SelectTrigger><SelectContent>{data.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.course")}</label><Select value={assignmentCourseId} onValueChange={setAssignmentCourseId}><SelectTrigger><SelectValue placeholder={translate("academicScheduleUI.chooseCourse")} /></SelectTrigger><SelectContent>{data.courses.map((course: any) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.initialTopic")}</label><Input value={assignmentTopic} onChange={(event) => setAssignmentTopic(event.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.overrideReason")}</label><Textarea value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} required rows={3} /></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={assignmentLoading}>{translate("academicScheduleUI.cancel")}</Button></DialogClose><Button type="submit" isLoading={assignmentLoading}>{translate("academicScheduleUI.submitAssignment")}</Button></DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveBooking)} onOpenChange={(open) => !open && setMoveBooking(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{translate("academicScheduleUI.moveSession")}</DialogTitle><DialogDescription>{translate("academicScheduleUI.moveHelp")}</DialogDescription></DialogHeader>{moveBooking ? <form onSubmit={handleMoveSubmit} className="space-y-4"><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.targetSlot")}</label><Select value={moveTargetSlotId} onValueChange={setMoveTargetSlotId}><SelectTrigger><SelectValue placeholder={translate("academicScheduleUI.chooseEmptySlot")} /></SelectTrigger><SelectContent>{data.slots.filter((slot: any) => slot.sessionDate && !slot.booking && slot.id !== moveBooking.slotId).map((slot: any) => <SelectItem key={slot.id} value={slot.id}>{slot.sessionDate} · {slot.startTime} - {slot.endTime} · {slot.tutor?.name || translate("academicScheduleUI.tutor")}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.overrideReason")}</label><Textarea value={moveReason} onChange={(event) => setMoveReason(event.target.value)} required rows={3} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={moveLoading}>{translate("academicScheduleUI.cancel")}</Button></DialogClose><Button type="submit" isLoading={moveLoading}>{translate("academicScheduleUI.moveSubmit")}</Button></DialogFooter></form> : null}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelBooking)} onOpenChange={(open) => !open && setCancelBooking(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{translate("academicScheduleUI.cancelSession")}</DialogTitle><DialogDescription>{translate("academicScheduleUI.cancelHelp")}</DialogDescription></DialogHeader>{cancelBooking ? <form onSubmit={handleCancelSubmit} className="space-y-4"><div className="space-y-1.5"><label className="text-body-xs font-semibold">{translate("academicScheduleUI.overrideReason")}</label><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required rows={3} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={cancelLoading}>{translate("academicScheduleUI.cancel")}</Button></DialogClose><Button type="submit" isLoading={cancelLoading} className="bg-status-error text-white">{translate("academicScheduleUI.cancelSubmit")}</Button></DialogFooter></form> : null}</DialogContent>
      </Dialog>

      <SessionDetailDrawer open={Boolean(selectedSessionDetail)} onOpenChange={(open) => !open && setSelectedSessionDetail(null)} booking={selectedSessionDetail} isAdmin onAdminMove={openMoveDialog} onAdminCancel={openCancelDialog} onOpenAuditLog={setSelectedAuditBooking} />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-brand-primary" />{translate("academicScheduleUI.newAcademic")}</DialogTitle><DialogDescription>{translate("academicScheduleUI.academicHelp")}</DialogDescription></DialogHeader>{academicForm}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingSchedule)} onOpenChange={(open) => !open && setEditingSchedule(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="size-5 text-brand-primary" />{translate("academicScheduleUI.editAcademic")}</DialogTitle></DialogHeader>{academicForm}</DialogContent>
      </Dialog>

      <AdminConfirmDialog open={Boolean(pendingDeleteSchedule)} onOpenChange={(open) => !open && setPendingDeleteSchedule(null)} title={translate("academicScheduleUI.deleteAcademic")} description={translate("academicScheduleUI.deletePrompt", { title: pendingDeleteSchedule?.title ?? "" })} confirmLabel={translate("academicScheduleUI.delete")} loading={isDeletingSchedule} onConfirm={handleDeleteConfirm} />
      <AuditLogDrawer open={Boolean(selectedAuditBooking)} onOpenChange={(open) => !open && setSelectedAuditBooking(null)} booking={selectedAuditBooking} />
      <RescheduleTicketModal open={Boolean(selectedTicketBooking)} onOpenChange={(open) => !open && setSelectedTicketBooking(null)} booking={selectedTicketBooking} role="admin" currentUserId="" onSuccess={() => router.refresh()} />

      <Dialog open={Boolean(editingTutor)} onOpenChange={(open) => !open && setEditingTutor(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GraduationCap className="size-5 text-brand-primary" />{translate("academicScheduleUI.certificationTitle", { name: editingTutor?.name ?? "" })}</DialogTitle><DialogDescription>{translate("academicScheduleUI.certHelp")}</DialogDescription></DialogHeader>
          <div className="my-2 max-h-80 space-y-2 overflow-y-auto pr-1">
            {data.courses.map((course: any) => {
              const checked = certSelectedIds.includes(course.id);
              return <label key={course.id} className={`flex items-center justify-between border-b border-border px-2 py-2 ${checked ? "border-brand-primary bg-brand-primary/10" : "border-border"}`}><div className="flex items-center gap-2 text-body-sm font-semibold"><Checkbox checked={checked} onCheckedChange={() => handleToggleCourse(course.id)} /><span>{course.title}</span></div>{checked ? <CheckCircle2 className="size-4 text-brand-primary" /> : null}</label>;
            })}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline" type="button" disabled={certSaving}>{translate("academicScheduleUI.cancel")}</Button></DialogClose><Button type="button" disabled={certSaving} isLoading={certSaving} onClick={handleSaveCerts}>{translate("academicScheduleUI.saveCerts")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDeleteSlot)} onOpenChange={(open) => !open && setPendingDeleteSlot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{translate("academicScheduleUI.deleteAvailability")}</DialogTitle>
            <DialogDescription>{translate("academicScheduleUI.deleteAvailabilityHelp")}</DialogDescription>
          </DialogHeader>
          {pendingDeleteSlot ? (
            <form onSubmit={handleDeleteSlotSubmit} className="space-y-4">
              {pendingDeleteSlot.sessionDate ? (
                <div className="rounded-lg border bg-muted/20 p-3 text-body-xs">
                  {pendingDeleteSlot.sessionDate} · {pendingDeleteSlot.startTime} - {pendingDeleteSlot.endTime} · {pendingDeleteSlot.tutor?.name || "Tutor"}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">{translate("academicScheduleUI.overrideReason")}</label>
                <Textarea
                  value={deleteSlotReason}
                  onChange={(event) => setDeleteSlotReason(event.target.value)}
                  required
                  rows={3}
                  placeholder={translate("academicScheduleUI.deleteSlotPlaceholder")}
                />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={deleteSlotLoading}>{translate("academicScheduleUI.cancel")}</Button>
                </DialogClose>
                <Button type="submit" isLoading={deleteSlotLoading} disabled={deleteSlotLoading} className="bg-status-error text-white hover:bg-status-error/90">
                  {translate("academicScheduleUI.deleteAvailability")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
