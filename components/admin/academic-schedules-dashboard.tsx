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
  updateTutorCourses,
} from "@/app/(admin)/admin/(academic)/schedules/actions";
import { daysFrom, formatIsoDate, getJakartaNow, getWeekScheduleDays } from "@/lib/date-utils";
import { isTutorialWeekLocked } from "@/lib/schedule/week-policy";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";

type Props = {
  initialData: any;
  initialWeekOffset?: number;
};

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.max(0, (hours || 0) * 60 + (mins || 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function scheduleTypeLabel(type: string) {
  if (type === "official_exam") return "Ujian ITB";
  if (type === "tryout") return "Tryout";
  if (type === "quiz") return "Kuis";
  return "Akademik";
}

export function AcademicSchedulesDashboard({ initialData, initialWeekOffset = 0 }: Props) {
  const router = useRouter();
  const data = initialData;
  const [activeTab, setActiveTab] = useUrlTab("tab", "calendar");
  const [calendarMode, setCalendarMode] = useUrlTab("calendarMode", "academic");
  const [displayWeekOffset, setDisplayWeekOffset] = useState(initialWeekOffset);

  useEffect(() => {
    setDisplayWeekOffset(initialWeekOffset);
  }, [initialWeekOffset]);

  const displayWeekInfo = useMemo(
    () => getWeekScheduleDays(daysFrom(displayWeekOffset * 7, getJakartaNow())),
    [displayWeekOffset],
  );
  const displayWeekLocked = useMemo(
    () => isTutorialWeekLocked(displayWeekInfo.startOfWeekIso),
    [displayWeekInfo.startOfWeekIso],
  );

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

  const pendingTickets = data.tickets.filter((ticket: any) => ticket.status === "pending").length;

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
        toast.success("Availability tutor berhasil dibuat");
        setAvailabilityOpen(false);
        router.refresh();
      } else toast.error(result.error || "Gagal membuat availability");
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
      } else toast.error(result.error || "Gagal menetapkan sesi");
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
      } else toast.error(result.error || "Gagal memindahkan sesi");
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
      } else toast.error(result.error || "Gagal membatalkan sesi");
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCancelLoading(false);
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
      toast.error("Judul dan tanggal mulai wajib diisi");
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
        toast.success("Jadwal akademik berhasil dibuat");
        setIsCreateOpen(false);
        router.refresh();
      } else toast.error(result.error || "Gagal membuat jadwal");
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
        toast.success("Jadwal akademik berhasil diperbarui");
        setEditingSchedule(null);
        router.refresh();
      } else toast.error(result.error || "Gagal memperbarui");
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
      const result = await deleteAcademicSchedule(pendingDeleteSchedule.id);
      if (result.success) {
        toast.success("Jadwal akademik berhasil dihapus");
        setPendingDeleteSchedule(null);
        router.refresh();
      } else toast.error(result.error || "Gagal menghapus jadwal");
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
      } else toast.error(result.error || "Gagal melakukan otomasi");
    } catch {
      toast.error("Terjadi kesalahan koneksi");
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
        toast.success("Sertifikasi mata kuliah tutor diperbarui");
        setEditingTutor(null);
        router.refresh();
      } else toast.error(result.error || "Gagal memperbarui sertifikasi");
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCertSaving(false);
    }
  };

  const academicForm = (
    <form onSubmit={editingSchedule ? handleEditSubmit : handleCreateSubmit} className="my-2 space-y-4">
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">Jenis Jadwal</label>
        <Select value={formType} onValueChange={(value: any) => setFormType(value)}>
          <SelectTrigger className="h-10 rounded-lg bg-card text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="official_exam">Ujian ITB</SelectItem>
            <SelectItem value="tryout">Tryout</SelectItem>
            <SelectItem value="quiz">Kuis</SelectItem>
            <SelectItem value="general">Kegiatan Akademik Lainnya</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">Judul Jadwal</label>
        <Input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required placeholder="Contoh: UTS Kalkulus 1 ITB Semester Ganjil" className="h-10 rounded-lg text-body-sm" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">Mata Kuliah (Opsional)</label>
        <Select value={formCourseId || "all"} onValueChange={(value) => setFormCourseId(value === "all" ? "" : value)}>
          <SelectTrigger className="h-10 rounded-lg bg-card text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Berlaku untuk semua mata kuliah</SelectItem>
            {data.courses.map((course: any) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-body-xs font-semibold text-foreground">Tanggal & Jam Mulai</label>
          <Input type="datetime-local" value={formStartDate} onChange={(event) => setFormStartDate(event.target.value)} required className="h-10 rounded-lg text-body-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-body-xs font-semibold text-foreground">Tanggal & Jam Selesai</label>
          <Input type="datetime-local" value={formEndDate} onChange={(event) => setFormEndDate(event.target.value)} className="h-10 rounded-lg text-body-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">Lokasi / Tautan (Opsional)</label>
        <Input value={formLocation} onChange={(event) => setFormLocation(event.target.value)} placeholder="Contoh: Ruang GKUB ITB atau tautan platform" className="h-10 rounded-lg text-body-sm" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-body-xs font-semibold text-foreground">Deskripsi / Petunjuk</label>
        <Textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} rows={3} className="resize-y rounded-lg text-body-sm" />
      </div>
      <DialogFooter className="gap-2 pt-2">
        <DialogClose asChild><Button variant="outline" type="button" disabled={formLoading}>Batal</Button></DialogClose>
        <Button type="submit" disabled={formLoading} isLoading={formLoading} className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90">{editingSchedule ? "Simpan Perubahan" : "Simpan Jadwal"}</Button>
      </DialogFooter>
    </form>
  );

  return (
    <div className="space-y-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="min-w-max">
              <TabsTrigger value="calendar"><CalendarDays className="size-3.5" />Kalender</TabsTrigger>
              <TabsTrigger value="academic">Daftar Jadwal</TabsTrigger>
              <TabsTrigger value="tutors">Tutor</TabsTrigger>
              <TabsTrigger value="tickets">
                Tiket Reschedule
                {pendingTickets > 0 ? <Badge className="h-4 min-w-4 bg-amber-500 px-1 py-0 text-body-2xs font-bold text-white">{pendingTickets}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="audit">Jejak Audit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === "calendar" ? (
          <Select value={calendarMode} onValueChange={setCalendarMode}>
            <SelectTrigger className="h-9 w-[140px] shrink-0 rounded-lg text-body-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="academic">Akademik</SelectItem>
              <SelectItem value="tutorial">Tutorial</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <Button variant="outline" size="sm" disabled={batchMeetLoading} onClick={handleBatchMeetAutomation} className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-body-sm font-semibold text-blue-600">
          <Bot className="size-3.5" />
          <span className="hidden sm:inline">Otomasi Meet</span>
        </Button>

        {activeTab === "calendar" && calendarMode === "tutorial" ? (
          <Button size="sm" onClick={openAvailabilityDialog} className="h-9 shrink-0 gap-1.5 rounded-lg text-body-sm font-semibold"><Plus className="size-3.5" />Tambah availability</Button>
        ) : (
          <Button size="sm" onClick={handleOpenCreate} className="h-9 shrink-0 gap-1.5 rounded-lg text-body-sm font-semibold"><Plus className="size-3.5" />Buat jadwal</Button>
        )}
      </div>

      {activeTab === "calendar" && (
        <div className="space-y-3">
          {calendarMode === "tutorial" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-body-xs">
              <span className="text-muted-foreground">Coverage tutorial untuk pekan yang sedang dilihat.</span>
              <div className="flex items-center gap-2">
                {(data.coverage || []).map((row: any) => (
                  <Badge key={row.tutorId} variant="outline" className="rounded-md font-normal">{row.tutorName}: {row.available} tersedia</Badge>
                ))}
                {Number(data.legacyNullDateSlotCount || 0) > 0 ? <Badge variant="outline" className="rounded-md border-amber-500/40 text-amber-700">{data.legacyNullDateSlotCount} slot legacy</Badge> : null}
              </div>
            </div>
          )}
          <div className={calendarStyles.root}>
            <ScheduleCalendarView
              role="admin"
              adminMode={calendarMode === "tutorial" ? "tutorial" : "academic"}
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
              onCreateScheduleDirect={calendarMode === "academic" ? handleCreateDirect : undefined}
              onAssignTutorialSlot={calendarMode === "tutorial" ? openAssignmentDialog : undefined}
              onOpenSessionDetail={calendarMode === "tutorial" ? setSelectedSessionDetail : undefined}
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
              <tr><th>Jenis & Judul</th><th>Mata Kuliah</th><th>Waktu</th><th>Lokasi / Tautan</th><th>Status</th><th className="text-center">Aksi</th></tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.academicSchedules.length === 0 ? (
                <tr><td colSpan={6}><AdminEmptyState compact title="Belum ada jadwal akademik." /></td></tr>
              ) : data.academicSchedules.map((schedule: any) => (
                <tr key={schedule.id} className="align-top transition-colors hover:bg-muted/30">
                  <td className="max-w-md px-4 py-3">
                    <p className="break-words font-bold leading-snug text-foreground">{schedule.title}</p>
                    <p className="mt-1 text-body-2xs font-bold uppercase tracking-wide text-muted-foreground">{scheduleTypeLabel(schedule.type)}</p>
                    {schedule.description ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-body-xs text-muted-foreground">{schedule.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-body-xs">{schedule.course?.title || <span className="text-muted-foreground">Semua mata kuliah</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-body-xs text-muted-foreground">{formatIsoDate(new Date(schedule.startDate))}{schedule.endDate ? ` - ${formatIsoDate(new Date(schedule.endDate))}` : ""}</td>
                  <td className="max-w-xs break-all px-4 py-3 text-body-xs text-muted-foreground">{schedule.location || "-"}</td>
                  <td className="px-4 py-3"><StatusBadge tone="success">Dipublikasikan</StatusBadge></td>
                  <td className="px-4 py-3"><div className="flex justify-center gap-1"><Button variant="ghost" size="xs" onClick={() => handleOpenEdit(schedule)} title="Edit"><Edit3 className="size-4" /></Button><Button variant="ghost" size="xs" onClick={() => setPendingDeleteSchedule(schedule)} className="text-red-500" title="Hapus"><Trash2 className="size-4" /></Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      {activeTab === "tickets" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead><tr><th>Jenis & Kelompok</th><th>Mata Kuliah & Tutor</th><th>Alasan</th><th>Status</th><th>Tanggal</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.tickets.length === 0 ? <tr><td colSpan={5}><AdminEmptyState compact title="Belum ada permohonan reschedule atau pembatalan." /></td></tr> : data.tickets.map((ticket: any) => (
                <tr key={ticket.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3"><p className="font-semibold capitalize text-foreground">Permohonan {ticket.type}</p><p className="text-body-xs text-muted-foreground">{ticket.booking?.group?.name}</p></td>
                  <td className="px-4 py-3 text-body-xs"><p>{ticket.booking?.course?.title}</p><p className="text-muted-foreground">Tutor: {ticket.tutor?.name}</p></td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-body-xs text-muted-foreground">{ticket.reason}</td>
                  <td className="px-4 py-3"><Badge variant={ticket.status === "approved" ? "default" : "outline"}>{ticket.status === "approved" ? "Disetujui" : ticket.status === "rejected" ? "Ditolak" : "Pending"}</Badge></td>
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
            <AdminTableHead><tr><th>Aktivitas</th><th>Kelompok & Kelas</th><th>Pelaku</th><th>Waktu</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.auditLogs.length === 0 ? <tr><td colSpan={4}><AdminEmptyState compact title="Belum ada riwayat aktivitas." /></td></tr> : data.auditLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30"><td className="max-w-lg whitespace-pre-wrap break-words px-4 py-3 text-body-xs font-semibold">{log.summary}</td><td className="px-4 py-3 text-body-xs"><p>{log.booking?.group?.name}</p><p className="text-muted-foreground">{log.booking?.course?.title}</p></td><td className="px-4 py-3 text-body-xs text-muted-foreground">{log.actor?.name || "Sistem"}</td><td className="whitespace-nowrap px-4 py-3 text-body-xs text-muted-foreground">{formatIsoDate(new Date(log.createdAt))}</td></tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      {activeTab === "tutors" && (
        <AdminTable>
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead><tr><th>Tutor</th><th>Mata Kuliah Tersertifikasi</th><th>Slot Dibuka</th><th className="text-right">Aksi</th></tr></AdminTableHead>
            <tbody className="divide-y divide-border">
              {data.tutors.length === 0 ? <tr><td colSpan={4}><AdminEmptyState compact title="Belum ada tutor terdaftar." /></td></tr> : data.tutors.map((tutor: any) => (
                <tr key={tutor.id} className="hover:bg-muted/30"><td className="px-4 py-3 text-body-xs font-semibold">{tutor.name}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(tutor.tutorCourses || []).length ? tutor.tutorCourses.map((item: any) => <Badge key={item.courseId} variant="outline" className="rounded-md text-body-2xs">{item.course?.title}</Badge>) : <span className="text-body-xs text-muted-foreground">Belum ada sertifikasi</span>}</div></td><td className="px-4 py-3 text-body-xs text-muted-foreground">{data.slots.filter((slot: any) => slot.tutorId === tutor.id).length}</td><td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => handleOpenCertDialog(tutor)} className="h-8"><GraduationCap className="size-3.5" />Kelola</Button></td></tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      )}

      <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tambah availability tutor</DialogTitle><DialogDescription>Override admin membuat slot konkret 90 menit. Validasi tanggal, durasi, dan overlap tetap berlaku.</DialogDescription></DialogHeader>
          <form onSubmit={handleAvailabilitySubmit} className="space-y-4">
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Tutor</label><Select value={availabilityTutorId} onValueChange={setAvailabilityTutorId}><SelectTrigger><SelectValue placeholder="Pilih tutor" /></SelectTrigger><SelectContent>{data.tutors.map((tutor: any) => <SelectItem key={tutor.id} value={tutor.id}>{tutor.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-body-xs font-semibold">Tanggal sesi</label><Input type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} required /></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">Mulai</label><Input type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} required /></div></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Selesai</label><Input value={addMinutesToTime(availabilityStart, 90)} readOnly className="bg-muted" /></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-body-xs font-semibold">Mode</label><Select value={availabilityMode} onValueChange={(value: "online" | "offline") => setAvailabilityMode(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Tatap muka</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">Lokasi</label><Input value={availabilityLocation} onChange={(event) => setAvailabilityLocation(event.target.value)} disabled={availabilityMode !== "offline"} /></div></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Alasan override</label><Textarea value={availabilityReason} onChange={(event) => setAvailabilityReason(event.target.value)} required rows={3} /></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={availabilityLoading}>Batal</Button></DialogClose><Button type="submit" isLoading={availabilityLoading}>Simpan availability</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentSlot)} onOpenChange={(open) => !open && setAssignmentSlot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tetapkan sesi tutorial</DialogTitle><DialogDescription>Isi slot yang tersedia dengan kelompok dan mata kuliah.</DialogDescription></DialogHeader>
          {assignmentSlot ? <form onSubmit={handleAssignmentSubmit} className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-body-xs">{assignmentSlot.sessionDate} · {assignmentSlot.startTime} - {assignmentSlot.endTime} · {assignmentSlot.tutor?.name || "Tutor"}</div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Kelompok</label><Select value={assignmentGroupId} onValueChange={setAssignmentGroupId}><SelectTrigger><SelectValue placeholder="Pilih kelompok" /></SelectTrigger><SelectContent>{data.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Mata kuliah</label><Select value={assignmentCourseId} onValueChange={setAssignmentCourseId}><SelectTrigger><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger><SelectContent>{data.courses.map((course: any) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Topik awal (opsional)</label><Input value={assignmentTopic} onChange={(event) => setAssignmentTopic(event.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-body-xs font-semibold">Alasan override</label><Textarea value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} required rows={3} /></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={assignmentLoading}>Batal</Button></DialogClose><Button type="submit" isLoading={assignmentLoading}>Tetapkan sesi</Button></DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveBooking)} onOpenChange={(open) => !open && setMoveBooking(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Pindahkan sesi tutorial</DialogTitle><DialogDescription>Pilih slot konkret yang masih kosong dan beri alasan override.</DialogDescription></DialogHeader>{moveBooking ? <form onSubmit={handleMoveSubmit} className="space-y-4"><div className="space-y-1.5"><label className="text-body-xs font-semibold">Slot tujuan</label><Select value={moveTargetSlotId} onValueChange={setMoveTargetSlotId}><SelectTrigger><SelectValue placeholder="Pilih slot kosong" /></SelectTrigger><SelectContent>{data.slots.filter((slot: any) => slot.sessionDate && !slot.booking && slot.id !== moveBooking.slotId).map((slot: any) => <SelectItem key={slot.id} value={slot.id}>{slot.sessionDate} · {slot.startTime} - {slot.endTime} · {slot.tutor?.name || "Tutor"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-body-xs font-semibold">Alasan override</label><Textarea value={moveReason} onChange={(event) => setMoveReason(event.target.value)} required rows={3} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={moveLoading}>Batal</Button></DialogClose><Button type="submit" isLoading={moveLoading}>Pindahkan sesi</Button></DialogFooter></form> : null}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelBooking)} onOpenChange={(open) => !open && setCancelBooking(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Batalkan sesi tutorial</DialogTitle><DialogDescription>Pembatalan admin selalu membutuhkan alasan.</DialogDescription></DialogHeader>{cancelBooking ? <form onSubmit={handleCancelSubmit} className="space-y-4"><div className="space-y-1.5"><label className="text-body-xs font-semibold">Alasan override</label><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required rows={3} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={cancelLoading}>Batal</Button></DialogClose><Button type="submit" isLoading={cancelLoading} className="bg-status-error text-white">Batalkan sesi</Button></DialogFooter></form> : null}</DialogContent>
      </Dialog>

      <SessionDetailDrawer open={Boolean(selectedSessionDetail)} onOpenChange={(open) => !open && setSelectedSessionDetail(null)} booking={selectedSessionDetail} isAdmin onAdminMove={openMoveDialog} onAdminCancel={openCancelDialog} onOpenAuditLog={setSelectedAuditBooking} />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-brand-primary" />Buat Jadwal Akademik Baru</DialogTitle><DialogDescription>Jadwalkan Ujian ITB, tryout, kuis, atau kegiatan akademik lain untuk murid.</DialogDescription></DialogHeader>{academicForm}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingSchedule)} onOpenChange={(open) => !open && setEditingSchedule(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="size-5 text-brand-primary" />Edit Jadwal Akademik</DialogTitle></DialogHeader>{academicForm}</DialogContent>
      </Dialog>

      <AdminConfirmDialog open={Boolean(pendingDeleteSchedule)} onOpenChange={(open) => !open && setPendingDeleteSchedule(null)} title="Hapus Jadwal Akademik" description={<>Apakah Anda yakin ingin menghapus jadwal <strong className="text-foreground">{pendingDeleteSchedule?.title}</strong>?</>} loading={isDeletingSchedule} onConfirm={handleDeleteConfirm} />
      <AuditLogDrawer open={Boolean(selectedAuditBooking)} onOpenChange={(open) => !open && setSelectedAuditBooking(null)} booking={selectedAuditBooking} />
      <RescheduleTicketModal open={Boolean(selectedTicketBooking)} onOpenChange={(open) => !open && setSelectedTicketBooking(null)} booking={selectedTicketBooking} role="admin" currentUserId="" onSuccess={() => router.refresh()} />

      <Dialog open={Boolean(editingTutor)} onOpenChange={(open) => !open && setEditingTutor(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GraduationCap className="size-5 text-brand-primary" />Sertifikasi Mata Kuliah: {editingTutor?.name}</DialogTitle><DialogDescription>Pilih mata kuliah yang boleh diampu tutor ini.</DialogDescription></DialogHeader>
          <div className="my-2 max-h-80 space-y-2 overflow-y-auto pr-1">
            {data.courses.map((course: any) => {
              const checked = certSelectedIds.includes(course.id);
              return <label key={course.id} className={`flex items-center justify-between rounded-lg border p-3 ${checked ? "border-brand-primary bg-brand-primary/10" : "border-border"}`}><div className="flex items-center gap-2 text-body-sm font-semibold"><input type="checkbox" checked={checked} onChange={() => handleToggleCourse(course.id)} className="size-4 accent-brand-primary" /><span>{course.title}</span></div>{checked ? <CheckCircle2 className="size-4 text-brand-primary" /> : null}</label>;
            })}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline" type="button" disabled={certSaving}>Batal</Button></DialogClose><Button type="button" disabled={certSaving} isLoading={certSaving} onClick={handleSaveCerts}>Simpan Sertifikasi</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
