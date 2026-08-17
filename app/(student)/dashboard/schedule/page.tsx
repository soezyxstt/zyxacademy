"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Clock,
  Plus,
  Trash2,
  User,
  Check,
  BookOpen,
  GraduationCap,
  AlertCircle,
  CalendarCheck,
  Users,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { toast } from "@/components/ui/toast";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { studentCardClass } from "@/components/course/course-surfaces";
import {
  getScheduleData,
  addTutorSlot,
  deleteTutorSlot,
  bookTutorSlot,
  cancelBooking,
  updateTutorCourses,
} from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// Course styling helper
const getCourseStyles = (courseId: string) => {
  switch (courseId) {
    case "calc-1":
      return {
        bg: "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 hover:border-indigo-400 dark:hover:border-indigo-800",
        text: "text-indigo-600 dark:text-indigo-400",
        badge: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-900/50",
      };
    case "physics-1":
      return {
        bg: "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 hover:border-amber-400 dark:hover:border-amber-800",
        text: "text-amber-600 dark:text-amber-400",
        badge: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200/50 dark:border-amber-900/50",
      };
    case "chem-1":
      return {
        bg: "bg-teal-50/50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/40 hover:border-teal-400 dark:hover:border-teal-800",
        text: "text-teal-600 dark:text-teal-400",
        badge: "bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200/50 dark:border-teal-900/50",
      };
    default:
      return {
        bg: "bg-slate-50/50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800/40 hover:border-slate-400 dark:hover:border-slate-700",
        text: "text-slate-600 dark:text-slate-400",
        badge: "bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-800/50",
      };
  }
};

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export default function SchedulePage() {
  void useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states for Tutor
  const [newSlotDay, setNewSlotDay] = useState("Senin");
  const [newSlotStart, setNewSlotStart] = useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = useState("10:30");

  // Booking Modal / State for Student
  const [bookingSlot, setBookingSlot] = useState<any>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  // Mobile day selector
  const [activeMobileDay, setActiveMobileDay] = useState("Senin");

  // Confirmation dialogs
  const [pendingDeleteSlotId, setPendingDeleteSlotId] = useState<string | null>(null);
  const [pendingCancelBookingId, setPendingCancelBookingId] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      const scheduleData = await getScheduleData();
      setData(scheduleData);
    } catch (error: any) {
      console.error("Gagal memuat jadwal:", error);
      toast.error("Sesi telah berakhir atau tidak ada otorisasi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    // Auto-set mobile active day to today
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const todayName = dayNames[new Date().getDay()];
    if (DAYS.includes(todayName)) {
      setActiveMobileDay(todayName);
    }
  }, []);

  // Tutor Action: Add Availability Slot
  const handleAddSlot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActionLoading(true);
    const res = await addTutorSlot(newSlotDay, newSlotStart, newSlotEnd);
    setActionLoading(false);

    if (res.success) {
      toast.success("Jadwal kosong berhasil ditambahkan!");
      refreshData();
    } else {
      toast.error(res.error || "Gagal menambahkan jadwal.");
    }
  };

  // Tutor Action: Delete Slot
  const handleDeleteSlot = async () => {
    if (!pendingDeleteSlotId) return;
    setActionLoading(true);
    const res = await deleteTutorSlot(pendingDeleteSlotId);
    setActionLoading(false);
    setPendingDeleteSlotId(null);

    if (res.success) {
      toast.success("Slot jadwal telah dihapus.");
      refreshData();
    } else {
      toast.error(res.error || "Gagal menghapus slot.");
    }
  };

  // Tutor Action: Toggle Subject Certifications
  const handleToggleCertification = async (courseId: string, isCertified: boolean) => {
    const currentCerts = data.certifiedCourses.map((c: any) => c.id);
    let newCerts = [];
    if (isCertified) {
      newCerts = currentCerts.filter((id: string) => id !== courseId);
    } else {
      newCerts = [...currentCerts, courseId];
    }

    setActionLoading(true);
    const res = await updateTutorCourses(newCerts);
    setActionLoading(false);

    if (res.success) {
      toast.success("Sertifikasi bimbingan diperbarui!");
      refreshData();
    } else {
      toast.error(res.error || "Gagal memperbarui sertifikasi.");
    }
  };

  // Student Action: Book Slot
  const handleBookSlot = async () => {
    if (!selectedCourseId) {
      toast.error("Pilih mata kuliah terlebih dahulu.");
      return;
    }

    const sharedGroupId = bookingSlot.tutorGroups?.[0]?.id || data.groups?.[0]?.id;

    if (!sharedGroupId) {
      toast.error("Anda tidak memiliki grup tutorial yang aktif.");
      return;
    }

    setActionLoading(true);
    const res = await bookTutorSlot(bookingSlot.id, selectedCourseId, sharedGroupId);
    setActionLoading(false);

    if (res.success) {
      toast.success(`Berhasil memesan jadwal bimbingan!`);
      setBookingSlot(null);
      setSelectedCourseId("");
      refreshData();
    } else {
      toast.error(res.error || "Gagal memesan jadwal.");
    }
  };

  // Student/Tutor Action: Cancel Booking
  const handleCancelBooking = async () => {
    if (!pendingCancelBookingId) return;

    setActionLoading(true);
    const res = await cancelBooking(pendingCancelBookingId);
    setActionLoading(false);
    setPendingCancelBookingId(null);

    if (res.success) {
      toast.success("Jadwal bimbingan telah dibatalkan.");
      refreshData();
    } else {
      toast.error(res.error || "Gagal membatalkan jadwal.");
    }
  };

  // Helper: Scroll and prefill new slot form (Tutor quick-action in calendar header)
  const handleQuickAddSlot = (day: string) => {
    setNewSlotDay(day);
    const element = document.getElementById("add-slot-form");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="size-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
        <p className="text-body-sm text-muted-foreground">Memuat data jadwal...</p>
      </div>
    );
  }

  const userRole = data?.role;

  // Group slots by day
  const slotsList = userRole === "teacher" ? data.slots : data.availableSlots;
  const slotsByDay: { [key: string]: any[] } = {
    Senin: [],
    Selasa: [],
    Rabu: [],
    Kamis: [],
    Jumat: [],
    Sabtu: [],
    Minggu: [],
  };
  slotsList?.forEach((slot: any) => {
    if (slotsByDay[slot.dayOfWeek]) {
      slotsByDay[slot.dayOfWeek].push(slot);
    }
  });
  // Sort slots by time within each day
  DAYS.forEach((day) => {
    slotsByDay[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  return (
    <div className="pb-16 pt-8 md:pt-12">
      <div className="marketing-container max-w-7xl">
        
        {/* Welcome Header */}
        <Reveal duration="duration-500">
          <PageHeader title="Jadwal Kelas & Bimbingan" />
        </Reveal>

        {/* Calendar Timetable Section (Full Width) */}
        <Reveal duration="duration-700" className="mb-8">
          <div className={studentCardClass("overflow-hidden !p-4 md:!p-6")}>
              
              {/* MOBILE DAY SELECTOR BUTTONS */}
              <div className="flex border-b border-border/40 pb-2 mb-4 md:hidden overflow-x-auto scrollbar-none gap-2">
                {DAYS.map((day) => {
                  const count = slotsByDay[day]?.length || 0;
                  const isSelected = activeMobileDay === day;
                  return (
                    <button
                      key={day}
                      onClick={() => setActiveMobileDay(day)}
                      className={`px-4 py-2 border-b-2 text-body-xs font-semibold whitespace-nowrap transition-all rounded-t-lg cursor-pointer ${
                        isSelected
                          ? "border-brand-primary text-brand-primary bg-brand-primary/5 font-bold"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      }`}
                    >
                      {day} {count > 0 && <span className="ml-1.5 px-2 py-0.2 text-[9px] font-bold rounded bg-brand-primary text-white">{count}</span>}
                    </button>
                  );
                })}
              </div>

              {/* DESKTOP 7-COLUMN CALENDAR TIMETABLE GRID */}
              <div className="hidden md:grid grid-cols-7 gap-3">
                {DAYS.map((day) => {
                  const daySlots = slotsByDay[day] || [];
                  const count = daySlots.length;
                  return (
                    <div key={day} className="flex flex-col gap-3 p-2.5 rounded-xl bg-muted/10 border border-border/30">
                      
                      {/* Day Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-border/50">
                        <div>
                          <h3 className="font-heading text-body-xs font-bold text-foreground">{day}</h3>
                          <span className="text-[10px] font-medium text-muted-foreground">{count} slot</span>
                        </div>
                        {userRole === "teacher" && (
                          <button
                            type="button"
                            onClick={() => handleQuickAddSlot(day)}
                            title={`Tambah slot untuk hari ${day}`}
                            className="flex size-6 items-center justify-center rounded-lg hover:bg-brand-primary/10 text-muted-foreground hover:text-brand-primary transition-all border border-border/40 cursor-pointer"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Day Slots List */}
                      <div className="flex flex-col gap-2.5 min-h-[350px]">
                        {daySlots.length > 0 ? (
                          daySlots.map((slot) => {
                            const isBooked = !!slot.booking;
                            const b = slot.booking;
                            const isMine = b?.studentId === data?.user?.id;
                            const cStyles = isBooked ? getCourseStyles(b.courseId) : null;
                            
                            return (
                              <div
                                key={slot.id}
                                className={`flex flex-col rounded-xl border p-3.5 transition-all text-left ${
                                  isBooked 
                                    ? `${cStyles?.bg} shadow-2xs` 
                                    : "border-dashed border-brand-primary/25 bg-brand-primary/5 hover:bg-brand-primary/10 hover:border-brand-primary/40"
                                }`}
                              >
                                {/* Slot Time */}
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                                  <Clock className="size-3.5" />
                                  <span>{slot.startTime} - {slot.endTime}</span>
                                </div>

                                {isBooked ? (
                                  /* Booked state representation */
                                  <div className="mt-3 space-y-2.5 flex-1 flex flex-col justify-between">
                                    <div>
                                      <Badge variant="outline" className={`text-[8px] font-bold uppercase tracking-wider ${cStyles?.badge}`}>
                                        {b.course?.title}
                                      </Badge>
                                      
                                      <div className="mt-2 flex flex-col gap-1 text-[10px] text-muted-foreground leading-tight">
                                        <div className="flex items-center gap-1.5">
                                          <User className="size-3 shrink-0" />
                                          <span className="truncate">
                                            {userRole === "teacher" ? `Siswa: ${b.student?.name}` : `Tutor: ${slot.tutor?.name}`}
                                          </span>
                                        </div>
                                        {userRole === "student" && (
                                          <div className="flex items-center gap-1.5">
                                            <Users className="size-3 shrink-0" />
                                            <span className="truncate">
                                              {isMine ? "Dipesan Anda" : `Siswa: ${b.student?.name}`}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Cancel Booking Action Button */}
                                    {(userRole === "teacher" || isMine) && (
                                      <button
                                        type="button"
                                        onClick={() => setPendingCancelBookingId(b.id)}
                                        disabled={actionLoading}
                                        className="mt-2 text-[10px] font-bold text-status-error hover:underline text-left cursor-pointer"
                                      >
                                        Batalkan bimbingan
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  /* Available state representation */
                                  <div className="mt-3 flex-1 flex flex-col justify-between">
                                    <span className="text-[10px] text-brand-primary/80 font-bold">Tersedia</span>
                                    
                                    {userRole === "student" ? (
                                      <Button
                                        size="xs"
                                        className="mt-3 w-full rounded-lg font-bold text-[10px] py-1 h-7 bg-brand-primary hover:bg-brand-primary/95 text-white"
                                        onClick={() => {
                                          const tutor = data.relevantTutors?.find((t: any) => t.user.id === slot.tutorId);
                                          setBookingSlot({ ...slot, tutorGroups: tutor?.groups });
                                          setSelectedCourseId(tutor?.sharedCourseIds?.[0] || "");
                                        }}
                                        disabled={actionLoading}
                                      >
                                        Pesan
                                      </Button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setPendingDeleteSlotId(slot.id)}
                                        disabled={actionLoading}
                                        className="mt-3 text-[10px] font-bold text-status-error hover:underline text-left flex items-center gap-1 cursor-pointer"
                                      >
                                        <Trash2 className="size-3" /> Hapus slot
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex flex-col items-center justify-center flex-1 rounded-xl border border-dashed border-border/30 py-10 bg-muted/5">
                            <span className="text-[10px] text-muted-foreground font-medium italic">Kosong</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* MOBILE DAY TIMETABLE REPRESENTATION */}
              <div className="md:hidden flex flex-col gap-3 min-h-[150px]">
                {slotsByDay[activeMobileDay]?.length > 0 ? (
                  slotsByDay[activeMobileDay].map((slot) => {
                    const isBooked = !!slot.booking;
                    const b = slot.booking;
                    const isMine = b?.studentId === data?.user?.id;
                    const cStyles = isBooked ? getCourseStyles(b.courseId) : null;

                    return (
                      <div
                        key={slot.id}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                          isBooked 
                            ? `${cStyles?.bg}` 
                            : "border-dashed border-brand-primary/25 bg-brand-primary/5"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                            isBooked ? "bg-card text-foreground border border-border" : "bg-brand-primary/10 text-brand-primary"
                          }`}>
                            <Clock className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-heading text-body-xs font-bold text-foreground">
                              {slot.startTime} - {slot.endTime}
                            </h4>
                            <div className="flex flex-col gap-1 mt-1">
                              {isBooked ? (
                                <>
                                  <div>
                                    <Badge variant="outline" className={`text-[8px] uppercase tracking-wider ${cStyles?.badge}`}>
                                      {b.course?.title}
                                    </Badge>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {userRole === "teacher" 
                                      ? `Siswa: ${b.student?.name}` 
                                      : isMine ? "Dipesan Anda" : `Siswa: ${b.student?.name}`}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] text-brand-primary font-semibold">Tersedia untuk bimbingan</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 ml-2">
                          {isBooked ? (
                            (userRole === "teacher" || isMine) && (
                              <Button
                                variant="outline"
                                size="xs"
                                className="rounded-md text-status-error border-border/50 hover:bg-status-error/10"
                                onClick={() => setPendingCancelBookingId(b.id)}
                                disabled={actionLoading}
                              >
                                Batal
                              </Button>
                            )
                          ) : userRole === "student" ? (
                            <Button
                              size="xs"
                              className="rounded-md bg-brand-primary hover:bg-brand-primary/95 text-white"
                              onClick={() => {
                                const tutor = data.relevantTutors?.find((t: any) => t.user.id === slot.tutorId);
                                setBookingSlot({ ...slot, tutorGroups: tutor?.groups });
                                setSelectedCourseId(tutor?.sharedCourseIds?.[0] || "");
                              }}
                              disabled={actionLoading}
                            >
                              Pesan
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-md text-status-error border-border/50 hover:bg-status-error/10"
                              onClick={() => setPendingDeleteSlotId(slot.id)}
                              disabled={actionLoading}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border/50 bg-muted/10">
                    <CalendarRange className="size-6 text-muted-foreground/30 mb-2" />
                    <p className="text-body-xs text-muted-foreground">Tidak ada jadwal pada hari {activeMobileDay}</p>
                  </div>
                )}
              </div>
            </div>
          </Reveal>

        {userRole === "teacher" ? (
          /* ========================================================
             TUTOR SIDE DETAILS PANEL (Certifications & Add Slot)
             ======================================================== */
          <div className="grid gap-6 lg:grid-cols-12">
            
            {/* Subject Certifications (Tutor Courses Checklist) */}
            <div className="lg:col-span-6">
              <Reveal duration="duration-700">
                <div className={studentCardClass("h-full")}>
                  <div className="pb-3 mb-4 border-b border-border/30">
                    <h3 className="font-heading text-body-base font-bold flex items-center gap-2 text-foreground">
                      <BookOpen className="size-4 text-brand-primary" />
                      Mata Kuliah Bimbingan Anda
                    </h3>
                  </div>
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {data.allCourses?.map((course: any) => {
                        const isCertified = data.certifiedCourses.some((c: any) => c.id === course.id);
                        const cStyles = getCourseStyles(course.id);
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => handleToggleCertification(course.id, isCertified)}
                            disabled={actionLoading}
                            className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                              isCertified
                                ? `${cStyles.bg} ring-1 ring-border/25`
                                : "border-border/40 bg-muted/10 hover:bg-muted/30"
                            }`}
                          >
                            <div>
                              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                                {course.category}
                              </span>
                              <h4 className="font-heading text-body-xs font-bold text-foreground mt-0.5">
                                {course.title}
                              </h4>
                            </div>
                            <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                              isCertified
                                ? "bg-brand-primary border-brand-primary text-white"
                                : "border-border text-transparent"
                            }`}>
                              <Check className="size-3" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Quick Add Availability Slot Form */}
            <div className="lg:col-span-6" id="add-slot-form">
              <Reveal duration="duration-700">
                <div className={studentCardClass("h-full")}>
                  <div className="pb-3 mb-4 border-b border-border/30">
                    <h3 className="font-heading text-body-base font-bold flex items-center gap-2 text-foreground">
                      <Clock className="size-4 text-brand-secondary" />
                      Tambah Ketersediaan Jadwal Baru
                    </h3>
                  </div>
                  <div>
                    <form onSubmit={handleAddSlot} className="flex flex-col gap-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hari</label>
                          <select
                            value={newSlotDay}
                            onChange={(e) => setNewSlotDay(e.target.value)}
                            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-body-sm text-foreground focus:ring-1 focus:ring-brand-primary"
                          >
                            {DAYS.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jam Mulai</label>
                          <input
                            type="text"
                            value={newSlotStart}
                            onChange={(e) => setNewSlotStart(e.target.value)}
                            placeholder="09:00"
                            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-body-sm text-foreground focus:ring-1 focus:ring-brand-primary"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jam Selesai</label>
                          <input
                            type="text"
                            value={newSlotEnd}
                            onChange={(e) => setNewSlotEnd(e.target.value)}
                            placeholder="10:30"
                            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-body-sm text-foreground focus:ring-1 focus:ring-brand-primary"
                          />
                        </div>
                      </div>

                      <Button type="submit" disabled={actionLoading} className="rounded-xl flex items-center justify-center gap-1.5 w-full mt-2 bg-brand-primary hover:bg-brand-primary/95 text-white">
                        <CalendarPlus className="size-4" /> Simpan Slot Waktu
                      </Button>
                    </form>
                  </div>
                </div>
              </Reveal>
            </div>

          </div>
        ) : (
          /* ========================================================
             STUDENT SIDE DETAILS PANEL (Group Info & Personal Bookings)
             ======================================================== */
          <div className="grid gap-6 lg:grid-cols-12">
            
            {/* Tutors in Group Info Card */}
            <div className="lg:col-span-6">
              <Reveal duration="duration-700">
                <div className={studentCardClass("h-full")}>
                  <div className="pb-3 mb-4 border-b border-border/30">
                    <h3 className="font-heading text-body-base font-bold flex items-center gap-2 text-foreground">
                      <GraduationCap className="size-4 text-brand-primary" />
                      Tutor Bimbingan Kelompok Anda
                    </h3>
                  </div>
                  <div>
                    {data.relevantTutors?.length > 0 ? (
                      <div className="space-y-3">
                        {data.relevantTutors.map((tutor: any) => (
                          <div key={tutor.user.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-muted/15">
                            <div className="flex items-center gap-2.5">
                              <div className="flex size-8 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-xs">
                                {tutor.user.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-heading text-body-xs font-bold text-foreground leading-tight">
                                  {tutor.user.name}
                                </h4>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Tutor TPB</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                              {tutor.sharedCourseIds.map((cid: string) => {
                                const course = data.enrollments.find((e: any) => e.id === cid);
                                const cStyles = getCourseStyles(cid);
                                return (
                                  <Badge key={cid} variant="outline" className={`text-[8px] px-1.5 py-0 rounded ${cStyles.badge}`}>
                                    {course?.title || cid}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60">
                        <AlertCircle className="size-6 text-status-warning/60 mb-2" />
                        <p className="text-body-xs text-muted-foreground">
                          Belum ada tutor yang relevan dengan mata kuliah aktif Anda di grup ini.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Student Personal Bookings List */}
            <div className="lg:col-span-6">
              <Reveal duration="duration-700">
                <div className={studentCardClass("h-full")}>
                  <div className="pb-3 mb-4 border-b border-border/30">
                    <h3 className="font-heading text-body-base font-bold flex items-center gap-2 text-foreground">
                      <CalendarCheck className="size-4 text-status-success" />
                      Daftar Pemesanan Bimbingan Saya
                    </h3>
                  </div>
                  <div>
                    {data.myBookings?.length > 0 ? (
                      <div className="space-y-3">
                        {data.myBookings.map((b: any) => {
                          const cStyles = getCourseStyles(b.courseId);
                          return (
                            <div
                              key={b.id}
                              className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-muted/15"
                            >
                              <div>
                                <span className={`inline-block rounded-md border px-2 py-0 text-[8px] font-semibold uppercase ${cStyles.badge}`}>
                                  {b.course?.title}
                                </span>
                                <h4 className="mt-1 font-heading text-body-xs font-bold text-foreground">
                                  {b.slot?.dayOfWeek}, {b.slot?.startTime} - {b.slot?.endTime}
                                </h4>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Tutor: {b.slot?.tutor?.name}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="xs"
                                className="rounded-md text-status-error border-border/60 hover:bg-status-error/10"
                                onClick={() => setPendingCancelBookingId(b.id)}
                                disabled={actionLoading}
                              >
                                Batalkan
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border/60">
                        <CalendarCheck className="size-6 text-muted-foreground/30 mb-2" />
                        <p className="text-body-xs text-muted-foreground">
                          Anda belum memesan bimbingan untuk pekan ini.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            </div>

          </div>
        )}

        {/* Modal Booking Form (Alternative to popup dialog) */}
        {bookingSlot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <Reveal duration="duration-200" className="w-full max-w-md rounded-2xl border border-border/80 bg-background p-6 shadow-xl">
              <h3 className="font-heading text-body-lg font-bold text-foreground">
                Konfirmasi Pemesanan Jadwal
              </h3>
              <p className="text-body-xs text-muted-foreground mt-1">
                Anda akan melakukan pemesanan bimbingan dengan <strong>{bookingSlot.tutor?.name}</strong>.
              </p>

              <div className="mt-4 rounded-xl bg-muted/40 border border-border/40 p-3.5 space-y-1">
                <div className="flex justify-between text-body-xs">
                  <span className="text-muted-foreground">Hari & Jam:</span>
                  <span className="font-bold text-foreground">{bookingSlot.dayOfWeek}, {bookingSlot.startTime} - {bookingSlot.endTime}</span>
                </div>
                <div className="flex justify-between text-body-xs pt-1">
                  <span className="text-muted-foreground">Sistem Kelas:</span>
                  <span className="font-semibold text-brand-secondary">First-Come First-Served</span>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mata Kuliah Bimbingan</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-body-sm text-foreground focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="" disabled>-- Pilih Mata Kuliah --</option>
                  {bookingSlot.startTime && (
                    // Map tutor's shared courses that student takes
                    data.relevantTutors
                      ?.find((t: any) => t.user.id === bookingSlot.tutorId)
                      ?.sharedCourseIds.map((cid: string) => {
                        const course = data.enrollments.find((e: any) => e.id === cid);
                        return (
                          <option key={cid} value={cid}>
                            {course?.title || cid}
                          </option>
                        );
                      })
                  )}
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" size="sm" className="rounded-md" onClick={() => setBookingSlot(null)}>
                  Batal
                </Button>
                <Button size="sm" className="rounded-md bg-brand-primary hover:bg-brand-primary/95 text-white" onClick={handleBookSlot} disabled={actionLoading}>
                  {actionLoading ? "Memproses..." : "Konfirmasi Booking"}
                </Button>
              </div>
            </Reveal>
          </div>
        )}

        {/* Delete Slot Confirmation Dialog */}
        <Dialog open={!!pendingDeleteSlotId} onOpenChange={(open) => !open && setPendingDeleteSlotId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hapus Slot Jadwal</DialogTitle>
              <DialogDescription>
                Apakah Anda yakin ingin menghapus slot jadwal ini? Pemesanan terkait juga akan terhapus.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={actionLoading}>Batal</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleDeleteSlot} disabled={actionLoading}>
                {actionLoading ? "Menghapus..." : "Hapus"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Booking Confirmation Dialog */}
        <Dialog open={!!pendingCancelBookingId} onOpenChange={(open) => !open && setPendingCancelBookingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Batalkan Bimbingan</DialogTitle>
              <DialogDescription>
                Apakah Anda yakin ingin membatalkan jadwal bimbingan ini?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={actionLoading}>Tidak</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleCancelBooking} disabled={actionLoading}>
                {actionLoading ? "Membatalkan..." : "Ya, Batalkan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
