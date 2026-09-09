"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Plus,
  Users,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Edit3,
  Bot,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import { AuditLogDrawer } from "@/components/schedule/audit-log-drawer";
import { RescheduleTicketModal } from "@/components/schedule/reschedule-ticket-modal";
import {
  createAcademicSchedule,
  updateAcademicSchedule,
  deleteAcademicSchedule,
  adminBatchGenerateMeet,
  adminCreateTutorAvailability,
  adminAssignTutorialSession,
  adminMoveTutorialSession,
  adminCancelTutorialSession,
  updateTutorCourses,
} from "@/app/(admin)/admin/(academic)/schedules/actions";
import { formatIsoDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";

type Props = {
  initialData: any;
  initialWeekOffset?: number;
};

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.max(0, (hours || 0) * 60 + (mins || 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function AcademicSchedulesDashboard({ initialData, initialWeekOffset = 0 }: Props) {
  const router = useRouter();
  const data = initialData;

  // Tabs / Active View
  const [activeTab, setActiveTab] = useUrlTab("tab", "calendar");
  const [calendarMode, setCalendarMode] = useUrlTab("calendarMode", "academic");

  // Dialog States for Academic Schedules CRUD
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [pendingDeleteSchedule, setPendingDeleteSchedule] = useState<any | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);

  // Form States for Academic Schedule
  const [formType, setFormType] = useState<"official_exam" | "tryout" | "quiz" | "general">("official_exam");
  const [formTitle, setFormTitle] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Active Modals for viewing session details
  const [selectedAuditBooking, setSelectedAuditBooking] = useState<any | null>(null);
  const [selectedTicketBooking, setSelectedTicketBooking] = useState<any | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<any | null>(null);

  // Tutorial operations and explicit admin overrides
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

  // Batch Meet Loading
  const [batchMeetLoading, setBatchMeetLoading] = useState(false);

  // Tutor Certification Management
  const [editingTutor, setEditingTutor] = useState<any | null>(null);
  const [certSelectedIds, setCertSelectedIds] = useState<string[]>([]);
  const [certSaving, setCertSaving] = useState(false);

  // Metrics
  const totalBookings = data.bookings.length;
  const completedBookings = data.bookings.filter((b: any) => b.status === "completed").length;
  const pendingTickets = data.tickets.filter((t: any) => t.status === "pending").length;

  const handleWeekChange = (offset: number) => {
    const url = new URL(window.location.href);
    if (offset === 0) {
      url.searchParams.delete("week");
    } else {
      url.searchParams.set("week", String(offset));
    }
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };

  const resetAvailabilityForm = () => {
    setAvailabilityTutorId(data.tutors[0]?.id || "");
    setAvailabilityDate(data.weekRange?.startIso || "");
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
        toast.success("Availability tutor berhasil dibuat");
        setAvailabilityOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal membuat availability");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
        toast.success("Sesi tutorial berhasil ditetapkan");
        setAssignmentSlot(null);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal menetapkan sesi");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
        toast.success("Sesi tutorial berhasil dipindahkan");
        setMoveBooking(null);
        setSelectedSessionDetail(null);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal memindahkan sesi");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
        toast.success("Sesi tutorial berhasil dibatalkan");
        setCancelBooking(null);
        setSelectedSessionDetail(null);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal membatalkan sesi");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setFormType("official_exam");
    setFormTitle("");
    setFormCourseId("");
    setFormDescription("");
    setFormStartDate("");
    setFormEndDate("");
    setFormLocation("");
    setIsCreateOpen(true);
  };

  const handleCreateDirect = (dateIso: string, startTime?: string, endTime?: string) => {
    const startT = startTime || "09:00";
    let endT = endTime;
    if (!endT) {
      const [h, m] = startT.split(":").map(Number);
      const endH = Math.min(23, (h || 0) + 1);
      const endM = (m || 0) + 30 >= 60 ? (m || 0) + 30 - 60 : (m || 0) + 30;
      const adjustedEndH = (m || 0) + 30 >= 60 ? Math.min(23, endH + 1) : endH;
      endT = `${String(adjustedEndH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    }

    setFormType("official_exam");
    setFormTitle("");
    setFormCourseId("");
    setFormDescription("");
    setFormStartDate(`${dateIso}T${startT}`);
    setFormEndDate(`${dateIso}T${endT}`);
    setFormLocation("");
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formStartDate) {
      toast.error("Judul dan tanggal mulai wajib diisi");
      return;
    }

    setFormLoading(true);
    try {
      const res = await createAcademicSchedule({
        type: formType,
        title: formTitle.trim(),
        courseId: formCourseId || null,
        description: formDescription || null,
        startDate: new Date(formStartDate),
        endDate: formEndDate ? new Date(formEndDate) : null,
        location: formLocation || null,
      });

      if (res.success) {
        toast.success("Jadwal akademik berhasil dibuat");
        setIsCreateOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal membuat jadwal");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEdit = (sched: any) => {
    setEditingSchedule(sched);
    setFormType(sched.type);
    setFormTitle(sched.title);
    setFormCourseId(sched.courseId || "");
    setFormDescription(sched.description || "");
    setFormStartDate(
      sched.startDate ? new Date(sched.startDate).toISOString().slice(0, 16) : ""
    );
    setFormEndDate(
      sched.endDate ? new Date(sched.endDate).toISOString().slice(0, 16) : ""
    );
    setFormLocation(sched.location || "");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;

    setFormLoading(true);
    try {
      const res = await updateAcademicSchedule(editingSchedule.id, {
        type: formType,
        title: formTitle.trim(),
        courseId: formCourseId || null,
        description: formDescription || null,
        startDate: new Date(formStartDate),
        endDate: formEndDate ? new Date(formEndDate) : null,
        location: formLocation || null,
      });

      if (res.success) {
        toast.success("Jadwal akademik berhasil diperbarui");
        setEditingSchedule(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal memperbarui");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteSchedule) return;

    setIsDeletingSchedule(true);
    try {
      const res = await deleteAcademicSchedule(pendingDeleteSchedule.id);
      if (res.success) {
        toast.success("Jadwal akademik berhasil dihapus");
        setPendingDeleteSchedule(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus jadwal");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const handleBatchMeetAutomation = async () => {
    setBatchMeetLoading(true);
    try {
      const res = await adminBatchGenerateMeet();
      if (res.success) {
        toast.success(`Otomasi selesai: ${res.count} tautan Google Meet baru dibuat`);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal melakukan otomasi");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setBatchMeetLoading(false);
    }
  };

  const handleOpenCertDialog = (tutor: any) => {
    setEditingTutor(tutor);
    setCertSelectedIds((tutor.tutorCourses || []).map((tc: any) => tc.courseId));
  };

  const handleToggleCourse = (courseId: string) => {
    setCertSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleSaveCerts = async () => {
    if (!editingTutor) return;

    setCertSaving(true);
    try {
      const res = await updateTutorCourses(editingTutor.id, certSelectedIds);
      if (res.success) {
        toast.success("Sertifikasi mata kuliah tutor diperbarui");
        setEditingTutor(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal memperbarui sertifikasi");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCertSaving(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2.5 font-sans">
        {/* Unified Admin Schedule Header Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
          {/* View Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarDays className="size-3.5" />
                <span>Master Kalender</span>
              </TabsTrigger>
              <TabsTrigger value="academic">
                <span>Jadwal Resmi</span>
              </TabsTrigger>
              <TabsTrigger value="tutors">
                <span>Tutor</span>
              </TabsTrigger>
              <TabsTrigger value="tickets">
                <span>Tiket Reschedule</span>
                {pendingTickets > 0 ? (
                  <Badge className="h-4 min-w-4 bg-amber-500 px-1 py-0 text-body-2xs font-bold text-white">
                    {pendingTickets}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="audit">
                <span>Jejak Audit</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Quick Action Buttons (Bot & + Buat Jadwal) */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={batchMeetLoading}
                  onClick={handleBatchMeetAutomation}
                  className="h-8.5 px-2.5 rounded-lg text-body-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/40 dark:hover:bg-blue-950/30 gap-1.5"
                >
                  <Bot className="size-3.5" />
                  <span className="hidden sm:inline">Otomasi Meet</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-body-xs">
                Generate Google Meet link otomatis untuk semua sesi aktif
              </TooltipContent>
            </Tooltip>

            {calendarMode === "tutorial" ? (
              <Button
                size="sm"
                onClick={openAvailabilityDialog}
                className="h-8.5 px-3 rounded-lg text-body-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>Tambah availability</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleOpenCreate}
                className="h-8.5 px-3 rounded-lg text-body-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>Buat jadwal akademik</span>
              </Button>
            )}
          </div>
        </div>

        {/* Tab Contents */}

        {/* TAB 1: Master Calendar */}
        {activeTab === "calendar" && (
          <div className="space-y-3">
            <Tabs value={calendarMode} onValueChange={setCalendarMode}>
              <TabsList>
                <TabsTrigger value="academic">
                  <GraduationCap className="size-3.5" />
                  Akademik
                </TabsTrigger>
                <TabsTrigger value="tutorial">
                  <Users className="size-3.5" />
                  Tutorial
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {calendarMode === "tutorial" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                  <div>
                    <p className="font-heading text-body-sm font-bold text-foreground">Coverage minggu tutorial</p>
                    <p className="text-body-xs text-muted-foreground">
                      Slot dan sesi hanya menampilkan tanggal pada minggu yang sedang dibuka.
                    </p>
                  </div>
                  {Number(data.legacyNullDateSlotCount || 0) > 0 && (
                    <Badge variant="outline" className="rounded-md border-amber-500/40 text-amber-700 dark:text-amber-300">
                      {data.legacyNullDateSlotCount} availability legacy perlu ditinjau
                    </Badge>
                  )}
                </div>
                <AdminTable>
                  <table className="w-full text-left text-body-sm">
                    <AdminTableHead>
                      <tr>
                        <th scope="col">Tutor</th>
                        <th scope="col">Slot dibuka</th>
                        <th scope="col">Booked</th>
                        <th scope="col">Available</th>
                        <th scope="col">Status pengiriman</th>
                      </tr>
                    </AdminTableHead>
                    <tbody className="divide-y divide-border">
                      {(data.coverage || []).length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <AdminEmptyState compact title="Belum ada tutor terdaftar." />
                          </td>
                        </tr>
                      ) : (data.coverage || []).map((row: any) => (
                          <tr key={row.tutorId}>
                            <td className="px-4 py-2.5 font-semibold text-foreground">{row.tutorName}</td>
                            <td className="px-4 py-2.5 text-body-xs text-muted-foreground">{row.slotsOpened}</td>
                            <td className="px-4 py-2.5 text-body-xs text-muted-foreground">{row.booked}</td>
                            <td className="px-4 py-2.5 text-body-xs text-muted-foreground">{row.available}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className="rounded-md text-body-xs">{row.status}</Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </AdminTable>
              </div>
            )}

            <ScheduleCalendarView
              role="admin"
              adminMode={calendarMode === "tutorial" ? "tutorial" : "academic"}
              currentUserId=""
              weekInfo={data.weekInfo}
              isWeekLocked={data.isWeekLocked}
              weekOffset={data.weekOffset ?? initialWeekOffset}
              onWeekChange={handleWeekChange}
              coursesList={data.courses}
              tutorsList={data.tutors}
              groupsList={data.groups}
              slots={data.slots}
              bookings={data.bookings}
              academicSchedules={data.academicSchedules}
              onCreateScheduleDirect={calendarMode === "academic" ? handleCreateDirect : undefined}
              onAssignTutorialSlot={calendarMode === "tutorial" ? openAssignmentDialog : undefined}
              onOpenSessionDetail={calendarMode === "tutorial" ? setSelectedSessionDetail : undefined}
              onEditSchedule={(sched) => handleOpenEdit(sched)}
              onDeleteSchedule={(sched) => setPendingDeleteSchedule(sched)}
              onOpenAuditLog={(booking) => setSelectedAuditBooking(booking)}
              onOpenRescheduleTicket={(booking) => setSelectedTicketBooking(booking)}
            />
          </div>
        )}

      {/* TAB 2: Academic Schedules CRUD */}
      {activeTab === "academic" && (
        <div className="space-y-4">
          <AdminTable>
            <table className="w-full min-w-3xl text-left text-body-sm">
              <AdminTableHead>
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Jenis & Judul Jadwal
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mata Kuliah
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Waktu Pelaksanaan
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lokasi / Tautan
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                    Aksi
                  </th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border">
                {data.academicSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-body-sm">
                      Belum ada jadwal akademik resmi yang dibuat.
                    </td>
                  </tr>
                ) : (
                  data.academicSchedules.map((sched: any) => {
                    const typeLabel =
                      sched.type === "official_exam"
                        ? "Ujian Resmi ITB"
                        : sched.type === "tryout"
                        ? "Tryout"
                        : "Kuis";

                    return (
                      <tr key={sched.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4 font-bold text-foreground">
                          <div className="flex flex-col">
                            <span className="text-body-sm">{sched.title}</span>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">
                              {typeLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-body-xs">
                          {sched.course ? (
                            <span className="font-semibold text-brand-primary">
                              {sched.course.title}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Semua Mata Kuliah</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-body-xs text-muted-foreground">
                          <span>{formatIsoDate(new Date(sched.startDate))}</span>
                          {sched.endDate && (
                            <span> - {formatIsoDate(new Date(sched.endDate))}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-body-xs text-muted-foreground">
                          {sched.location || "-"}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge tone="success">Published</StatusBadge>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleOpenEdit(sched)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Edit3 className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setPendingDeleteSchedule(sched)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              title="Hapus"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </AdminTable>
        </div>
      )}

      {/* TAB 3: Reschedule Tickets Monitoring */}
      {activeTab === "tickets" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead>
              <tr>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Jenis & Kelompok
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mata Kuliah & Tutor
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Alasan Permohonan
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tanggal Pengajuan
                </th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground text-body-sm">
                    Belum ada permohonan reschedule atau pembatalan.
                  </td>
                </tr>
              ) : (
                data.tickets.map((t: any) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground capitalize">
                          Permohonan {t.type}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {t.booking?.group?.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-body-xs">
                      <p className="font-semibold text-foreground">{t.booking?.course?.title}</p>
                      <p className="text-[10px] text-muted-foreground">Tutor: {t.tutor?.name}</p>
                    </td>
                    <td className="px-5 py-4 text-body-xs text-muted-foreground max-w-xs truncate">
                      {t.reason}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        variant={t.status === "approved" ? "default" : "outline"}
                        className={`text-[10px] uppercase font-bold ${
                          t.status === "approved"
                            ? "bg-emerald-600 text-white"
                            : t.status === "rejected"
                            ? "bg-red-500/10 text-red-600 border-red-500/30"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t.status === "approved"
                          ? "Disetujui"
                          : t.status === "rejected"
                          ? "Ditolak"
                          : "Pending"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-body-xs text-muted-foreground whitespace-nowrap">
                      {formatIsoDate(new Date(t.createdAt))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTable>
      )}

      {/* TAB 4: Audit Logs Monitoring */}
      {activeTab === "audit" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead>
              <tr>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Aktivitas
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kelompok & Kelas
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pelaku (Actor)
                </th>
                <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Waktu
                </th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground text-body-sm">
                    Belum ada riwayat aktivitas yang tercatat.
                  </td>
                </tr>
              ) : (
                data.auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4 font-semibold text-foreground text-body-xs">
                      {log.summary}
                    </td>
                    <td className="px-5 py-4 text-body-xs">
                      <p className="font-medium text-foreground">{log.booking?.group?.name}</p>
                      <p className="text-[10px] text-muted-foreground">{log.booking?.course?.title}</p>
                    </td>
                    <td className="px-5 py-4 text-body-xs text-muted-foreground">
                      {log.actor?.name || "Sistem"}
                    </td>
                    <td className="px-5 py-4 text-body-xs text-muted-foreground whitespace-nowrap">
                      {formatIsoDate(new Date(log.createdAt))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTable>
      )}

      {/* TAB 5: Tutor Certification Management */}
      {activeTab === "tutors" && (
        <div className="space-y-3">
          <p className="text-body-xs text-muted-foreground">
            Atur mata kuliah yang disertifikasi untuk setiap tutor. Murid hanya dapat memesan slot tutor untuk mata kuliah yang tersertifikasi.
          </p>
          <AdminTable>
            <table className="w-full min-w-3xl text-left text-body-sm">
              <AdminTableHead>
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tutor
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mata Kuliah Tersertifikasi
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Slot Dibuka
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Aksi
                  </th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border">
                {data.tutors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground text-body-sm">
                      Belum ada tutor terdaftar.
                    </td>
                  </tr>
                ) : (
                  data.tutors.map((tutor: any) => {
                    const slotCount = data.slots.filter(
                      (s: any) => s.tutorId === tutor.id
                    ).length;
                    return (
                      <tr key={tutor.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4 text-body-xs font-semibold text-foreground">
                          {tutor.name}
                        </td>
                        <td className="px-5 py-4">
                          {(tutor.tutorCourses || []).length === 0 ? (
                            <span className="text-body-xs text-muted-foreground italic">
                              Belum ada sertifikasi
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {(tutor.tutorCourses || []).map((tc: any) => (
                                <Badge key={tc.courseId} variant="outline" className="text-[10px] rounded-md">
                                  {tc.course?.title}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-body-xs text-muted-foreground">
                          {slotCount}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenCertDialog(tutor)}
                            className="h-8 rounded-lg gap-1.5 text-[11px]"
                          >
                            <GraduationCap className="size-3.5" />
                            <span>Kelola Sertifikasi</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </AdminTable>
        </div>
      )}

      {/* Admin tutor availability override */}
      <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">Tambah availability tutor</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Override admin membuat slot konkret 90 menit. Deadline tutor tidak diterapkan, tetapi tanggal, durasi, dan overlap tetap divalidasi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAvailabilitySubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold">Tutor</label>
              <Select value={availabilityTutorId} onValueChange={setAvailabilityTutorId}>
                <SelectTrigger className="h-10 rounded-lg text-body-sm"><SelectValue placeholder="Pilih tutor" /></SelectTrigger>
                <SelectContent>{data.tutors.map((tutor: any) => <SelectItem key={tutor.id} value={tutor.id}>{tutor.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Tanggal sesi</label>
                <Input type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} required className="h-10 rounded-lg text-body-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Mulai</label>
                <Input type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} required className="h-10 rounded-lg text-body-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold">Selesai</label>
              <Input value={addMinutesToTime(availabilityStart, 90)} readOnly className="h-10 rounded-lg bg-muted text-body-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Mode</label>
                <Select value={availabilityMode} onValueChange={(value: "online" | "offline") => setAvailabilityMode(value)}>
                  <SelectTrigger className="h-10 rounded-lg text-body-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Tatap muka</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Lokasi</label>
                <Input value={availabilityLocation} onChange={(event) => setAvailabilityLocation(event.target.value)} disabled={availabilityMode !== "offline"} placeholder="Wajib untuk offline" className="h-10 rounded-lg text-body-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold">Alasan override</label>
              <Textarea value={availabilityReason} onChange={(event) => setAvailabilityReason(event.target.value)} required rows={3} placeholder="Contoh: tutor berhalangan mengisi slot sebelum deadline" className="rounded-lg text-body-sm" />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={availabilityLoading}>Batal</Button></DialogClose>
              <Button type="submit" isLoading={availabilityLoading} disabled={availabilityLoading} className="bg-brand-primary text-white">Simpan availability</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Admin direct tutorial assignment override */}
      <Dialog open={Boolean(assignmentSlot)} onOpenChange={(open) => !open && setAssignmentSlot(null)}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">Tetapkan sesi tutorial</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Alur exceptional admin untuk mengisi slot yang sudah tersedia. FCFS dan kuota kelompok tetap berlaku.
            </DialogDescription>
          </DialogHeader>
          {assignmentSlot && (
            <form onSubmit={handleAssignmentSubmit} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-body-xs">
                {assignmentSlot.sessionDate} · {assignmentSlot.startTime} - {assignmentSlot.endTime} · {assignmentSlot.tutor?.name || "Tutor"}
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Kelompok</label>
                <Select value={assignmentGroupId} onValueChange={setAssignmentGroupId}>
                  <SelectTrigger className="h-10 rounded-lg text-body-sm"><SelectValue placeholder="Pilih kelompok" /></SelectTrigger>
                  <SelectContent>{data.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Mata kuliah</label>
                <Select value={assignmentCourseId} onValueChange={setAssignmentCourseId}>
                  <SelectTrigger className="h-10 rounded-lg text-body-sm"><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger>
                  <SelectContent>{data.courses.map((course: any) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Topik awal (opsional)</label>
                <Input value={assignmentTopic} onChange={(event) => setAssignmentTopic(event.target.value)} className="h-10 rounded-lg text-body-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Alasan override</label>
                <Textarea value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} required rows={3} placeholder="Jelaskan alasan penetapan manual" className="rounded-lg text-body-sm" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={assignmentLoading}>Batal</Button></DialogClose>
                <Button type="submit" isLoading={assignmentLoading} disabled={assignmentLoading} className="bg-brand-primary text-white">Tetapkan sesi</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin move override */}
      <Dialog open={Boolean(moveBooking)} onOpenChange={(open) => !open && setMoveBooking(null)}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">Pindahkan sesi tutorial</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">Pilih slot konkret yang masih kosong dan berikan alasan override.</DialogDescription>
          </DialogHeader>
          {moveBooking && (
            <form onSubmit={handleMoveSubmit} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-body-xs">Sesi {moveBooking.sessionDate} · {moveBooking.startTime || moveBooking.slot?.startTime} - {moveBooking.endTime || moveBooking.slot?.endTime}</div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Slot tujuan</label>
                <Select value={moveTargetSlotId} onValueChange={setMoveTargetSlotId}>
                  <SelectTrigger className="h-10 rounded-lg text-body-sm"><SelectValue placeholder="Pilih slot kosong" /></SelectTrigger>
                  <SelectContent>
                    {data.slots.filter((slot: any) => slot.sessionDate && !slot.booking && slot.id !== moveBooking.slotId).map((slot: any) => (
                      <SelectItem key={slot.id} value={slot.id}>{slot.sessionDate} · {slot.startTime} - {slot.endTime} · {slot.tutor?.name || "Tutor"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Alasan override</label>
                <Textarea value={moveReason} onChange={(event) => setMoveReason(event.target.value)} required rows={3} placeholder="Jelaskan alasan pemindahan" className="rounded-lg text-body-sm" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={moveLoading}>Batal</Button></DialogClose>
                <Button type="submit" isLoading={moveLoading} disabled={moveLoading} className="bg-brand-primary text-white">Pindahkan sesi</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin cancellation override */}
      <Dialog open={Boolean(cancelBooking)} onOpenChange={(open) => !open && setCancelBooking(null)}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">Batalkan sesi tutorial</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">Pembatalan adalah override dan selalu membutuhkan alasan.</DialogDescription>
          </DialogHeader>
          {cancelBooking && (
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-body-xs">{cancelBooking.course?.title || "Tutorial"} · {cancelBooking.sessionDate}</div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold">Alasan override</label>
                <Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required rows={3} placeholder="Jelaskan alasan pembatalan" className="rounded-lg text-body-sm" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={cancelLoading}>Batal</Button></DialogClose>
                <Button type="submit" isLoading={cancelLoading} disabled={cancelLoading} className="bg-status-error text-white">Batalkan sesi</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <SessionDetailDrawer
        open={Boolean(selectedSessionDetail)}
        onOpenChange={(open) => !open && setSelectedSessionDetail(null)}
        booking={selectedSessionDetail}
        isAdmin
        onAdminMove={openMoveDialog}
        onAdminCancel={openCancelDialog}
        onOpenAuditLog={setSelectedAuditBooking}
      />

      {/* Create Academic Schedule Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <CalendarDays className="size-5 text-brand-primary" />
              Buat Jadwal Akademik Baru
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Jadwalkan Ujian Resmi ITB, Tryout Akbar, atau Kuis Serentak untuk murid.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 my-2">
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Jenis Jadwal
              </label>
              <Select
                value={formType}
                onValueChange={(val: any) => setFormType(val)}
              >
                <SelectTrigger className="h-10 rounded-lg text-body-sm bg-card">
                  <SelectValue placeholder="Pilih Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="official_exam">Ujian Resmi ITB</SelectItem>
                  <SelectItem value="tryout">Tryout</SelectItem>
                  <SelectItem value="quiz">Kuis</SelectItem>
                  <SelectItem value="general">Kegiatan Akademik Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Judul Jadwal
              </label>
              <Input
                placeholder="Contoh: UTS Kalkulus 1 ITB Semester Ganjil"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Mata Kuliah (Opsional)
              </label>
              <Select
                value={formCourseId || "all"}
                onValueChange={(val) => setFormCourseId(val === "all" ? "" : val)}
              >
                <SelectTrigger className="h-10 rounded-lg text-body-sm bg-card">
                  <SelectValue placeholder="Pilih Mata Kuliah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">-- Berlaku untuk Semua Mata Kuliah --</SelectItem>
                  {data.courses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  Tanggal & Jam Mulai
                </label>
                <Input
                  type="datetime-local"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  required
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  Tanggal & Jam Selesai
                </label>
                <Input
                  type="datetime-local"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Lokasi / Tautan (Opsional)
              </label>
              <Input
                placeholder="Contoh: Ruang GKUB ITB atau tautan platform"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Deskripsi / Petunjuk Pelaksanaan
              </label>
              <Textarea
                placeholder="Petunjuk teknis pengerjaan dan materi cakupan..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="rounded-lg text-body-sm resize-none"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={formLoading}>
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={formLoading}
                isLoading={formLoading}
                className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
              >
                Simpan Jadwal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Academic Schedule Dialog */}
      <Dialog open={Boolean(editingSchedule)} onOpenChange={(open) => !open && setEditingSchedule(null)}>
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <Edit3 className="size-5 text-brand-primary" />
              Edit Jadwal Akademik
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 my-2">
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Jenis Jadwal
              </label>
              <Select
                value={formType}
                onValueChange={(val: any) => setFormType(val)}
              >
                <SelectTrigger className="h-10 rounded-lg text-body-sm bg-card">
                  <SelectValue placeholder="Pilih Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="official_exam">Ujian Resmi ITB</SelectItem>
                  <SelectItem value="tryout">Tryout</SelectItem>
                  <SelectItem value="quiz">Kuis</SelectItem>
                  <SelectItem value="general">Kegiatan Akademik Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Judul Jadwal
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Mata Kuliah
              </label>
              <Select
                value={formCourseId || "all"}
                onValueChange={(val) => setFormCourseId(val === "all" ? "" : val)}
              >
                <SelectTrigger className="h-10 rounded-lg text-body-sm bg-card">
                  <SelectValue placeholder="Pilih Mata Kuliah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">-- Berlaku untuk Semua Mata Kuliah --</SelectItem>
                  {data.courses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  Tanggal & Jam Mulai
                </label>
                <Input
                  type="datetime-local"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  required
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  Tanggal & Jam Selesai
                </label>
                <Input
                  type="datetime-local"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Lokasi / Tautan
              </label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Deskripsi
              </label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="rounded-lg text-body-sm resize-none"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={formLoading}>
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={formLoading}
                isLoading={formLoading}
                className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
              >
                Simpan Perubahan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Academic Schedule Dialog */}
      <AdminConfirmDialog
        open={Boolean(pendingDeleteSchedule)}
        onOpenChange={(open) => !open && setPendingDeleteSchedule(null)}
        title="Hapus Jadwal Akademik"
        description={
          <>
            Apakah Anda yakin ingin menghapus jadwal{" "}
            <strong className="text-foreground">{pendingDeleteSchedule?.title}</strong>?
          </>
        }
        loading={isDeletingSchedule}
        onConfirm={handleDeleteConfirm}
      />

      {/* Audit Log Drawer */}
      <AuditLogDrawer
        open={Boolean(selectedAuditBooking)}
        onOpenChange={(open) => !open && setSelectedAuditBooking(null)}
        booking={selectedAuditBooking}
      />

      {/* Reschedule Ticket Modal */}
      <RescheduleTicketModal
        open={Boolean(selectedTicketBooking)}
        onOpenChange={(open) => !open && setSelectedTicketBooking(null)}
        booking={selectedTicketBooking}
        role="admin"
        currentUserId=""
        onSuccess={() => router.refresh()}
      />

      {/* Tutor Certification Dialog */}
      <Dialog
        open={Boolean(editingTutor)}
        onOpenChange={(open) => !open && setEditingTutor(null)}
      >
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <GraduationCap className="size-5 text-brand-primary" />
              Sertifikasi Mata Kuliah: {editingTutor?.name}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Pilih mata kuliah yang boleh diampu tutor ini. Murid hanya dapat memesan slot untuk mata kuliah yang tersertifikasi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 my-2 max-h-80 overflow-y-auto pr-1">
            {data.courses.map((c: any) => {
              const isChecked = certSelectedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isChecked
                      ? "border-brand-primary bg-brand-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 text-body-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleCourse(c.id)}
                      className="size-4 accent-brand-primary rounded"
                    />
                    <span>{c.title}</span>
                  </div>
                  {isChecked && (
                    <CheckCircle2 className="size-4 text-brand-primary shrink-0" />
                  )}
                </label>
              );
            })}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={certSaving}>
                Batal
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={certSaving}
              isLoading={certSaving}
              onClick={handleSaveCerts}
              className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
            >
              Simpan Sertifikasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
