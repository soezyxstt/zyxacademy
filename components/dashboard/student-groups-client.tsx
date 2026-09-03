"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  CalendarDays,
  BookOpen,
  GraduationCap,
  Clock,
  KeyRound,
  Copy,
  Check,
  ArrowRight,
  CalendarRange,
  ChevronRight,
  Brain,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { joinGroupWithToken } from "@/app/(student)/dashboard/groups/actions";
import { formatIsoDate } from "@/lib/date-utils";

type StudentGroup = {
  id: string;
  name: string;
  packageType: string;
  packageName: string;
  frequencyLabel: string;
  totalQuotaSessions: number;
  usedQuotaSessions: number;
  remainingQuota: number;
  usedPercentage: number;
  weeklyQuotaSessions: number;
  weeklyUsedSessions: number;
  weeklyRemainingQuota: number;
  weeklyStats: Array<{
    weekStartIso: string;
    label: string;
    booked: number;
    attended: number;
    missed: number;
    cancelled: number;
  }>;
  academicYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  notes: string | null;
  isLeader: boolean;
  myRole: string;
  joinedAt: Date;
  courses: {
    id: string;
    title: string;
    category?: string | null;
  }[];
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    isMe: boolean;
    joinedAt: Date;
  }[];
  token: {
    id: string;
    token: string;
    capacity: number;
    membersCount: number;
    expiresAt: Date;
  } | null;
  recentBookings: {
    id: string;
    bookedAt: Date;
    studentName: string;
    isMyBooking: boolean;
    courseTitle: string;
    slot: {
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      tutorName: string;
    } | null;
  }[];
};

type Props = {
  initialGroups: StudentGroup[];
};

export function StudentGroupsClient({ initialGroups }: Props) {
  const router = useRouter();
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const activeGroup = initialGroups[selectedGroupIndex] || null;

  const handleJoinToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      toast.error("Silakan masukkan kode token");
      return;
    }

    setTokenLoading(true);
    try {
      const res = await joinGroupWithToken(tokenInput.trim());
      if (res.success) {
        toast.success("Berhasil bergabung ke kelompok belajar!");
        setTokenInput("");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal bergabung ke kelompok");
      }
    } catch {
      toast.error("Terjadi kesalahan sistem");
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopy = (tokenStr: string) => {
    navigator.clipboard.writeText(tokenStr);
    setCopiedToken(tokenStr);
    toast.success("Token kelompok disalin");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // If student has no study groups yet
  if (!activeGroup) {
    return (
      <div className="space-y-8 py-6">
        <div className="rounded-2xl border border-border bg-card p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm">
          <div className="size-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-4">
            <Users className="size-8" />
          </div>
          <h2 className="font-heading text-h5 font-bold text-foreground mb-2">
            Belum tergabung dalam kelompok belajar
          </h2>
          <p className="text-body-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Pembelajaran di Zyx Academy berbasis kelompok belajar terstruktur dengan kuota pertemuan berkala dan pendampingan tutor ahli setiap minggu.
          </p>

          {/* Token Form */}
          <form onSubmit={handleJoinToken} className="max-w-md mx-auto space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Masukkan kode token kelompok (contoh: Zyx-XXXX-3-2)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="h-11 rounded-lg text-body-sm font-mono"
              />
              <Button
                type="submit"
                disabled={tokenLoading || !tokenInput.trim()}
                className="h-11 rounded-lg px-6 bg-brand-primary text-white hover:bg-brand-primary/95 shrink-0"
              >
                {tokenLoading ? "Memproses..." : "Gabung"}
              </Button>
            </div>
            <p className="text-body-xs text-muted-foreground text-left flex items-center gap-1.5 pt-1">
              <KeyRound className="size-3.5 text-brand-primary shrink-0" />
              <span>Dapatkan token aktivasi kelompok dari admin atau ketua kelompok Anda.</span>
            </p>
          </form>
        </div>

        {/* Benefits Info Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
            <div className="size-8 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <CalendarDays className="size-4" />
            </div>
            <h3 className="font-heading text-body-sm font-bold text-foreground">
              Kuota Sesi Semester
            </h3>
            <p className="text-body-xs text-muted-foreground">
              Paket fleksibel mulai dari 15 sesi (1x/minggu) hingga 30 sesi (2x/minggu) untuk mendampingi persiapan ujian Anda.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
            <div className="size-8 rounded-lg bg-status-info/10 text-status-info flex items-center justify-center">
              <GraduationCap className="size-4" />
            </div>
            <h3 className="font-heading text-body-sm font-bold text-foreground">
              Mata Kuliah Terintegrasi
            </h3>
            <p className="text-body-xs text-muted-foreground">
              Akses otomatis ke seluruh dokumen materi, bank soal terkurasi, kuis adaptif, dan pembahasan komprehensif.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
            <div className="size-8 rounded-lg bg-brand-secondary/10 text-brand-secondary flex items-center justify-center">
              <Brain className="size-4" />
            </div>
            <h3 className="font-heading text-body-sm font-bold text-foreground">
              Belajar Bersama Rekan
            </h3>
            <p className="text-body-xs text-muted-foreground">
              Diskusi materi dan jadwalkan sesi tatap muka interaktif bersama tutor dan teman sekelompok Anda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group Selector if multiple groups */}
      {initialGroups.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {initialGroups.map((g, idx) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGroupIndex(idx)}
              className={`px-4 py-2 rounded-lg text-body-sm font-semibold transition-all whitespace-nowrap ${
                selectedGroupIndex === idx
                  ? "bg-brand-primary text-white shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* 1. Main Group Banner & Quota Metric */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h2 className="font-heading text-h4 font-bold text-foreground">
                {activeGroup.name}
              </h2>
              <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-semibold">
                Kelompok Aktif
              </Badge>
              <Badge variant="outline" className="text-[11px] font-semibold">
                {activeGroup.myRole === "leader" ? "Ketua Kelompok" : "Anggota"}
              </Badge>
            </div>
            <p className="text-body-sm text-muted-foreground">
              {activeGroup.packageName} • Semester {activeGroup.semester} {activeGroup.academicYear}
            </p>
          </div>

          {/* Quick Schedule Button */}
          <Link href="/dashboard/schedule">
            <Button className="h-10 rounded-lg gap-2 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-sm shadow-brand-primary/20">
              <CalendarRange className="size-4" />
              <span>Jadwalkan Sesi Tutorial</span>
            </Button>
          </Link>
        </div>

        {/* Quota Progress Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Progress Gauge */}
          <div className="md:col-span-2 space-y-4 p-5 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-body-xs font-semibold text-muted-foreground block">
                  Sesi Minggu Ini
                </span>
                <span className="font-heading text-h4 font-bold text-foreground">
                  {activeGroup.weeklyUsedSessions}{" "}
                  <span className="text-body-base font-normal text-muted-foreground">
                    / {activeGroup.weeklyQuotaSessions} Sesi Dipesan
                  </span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-body-xs font-semibold text-muted-foreground block">
                  Sisa Minggu Ini
                </span>
                <span className="font-heading text-h4 font-bold text-brand-primary">
                  {activeGroup.weeklyRemainingQuota}{" "}
                  <span className="text-body-xs font-normal text-muted-foreground">Sesi</span>
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div
                className="w-full bg-muted rounded-full h-3 overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.min(
                  100,
                  Math.round((activeGroup.weeklyUsedSessions / Math.max(1, activeGroup.weeklyQuotaSessions)) * 100)
                )}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-brand-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (activeGroup.weeklyUsedSessions / Math.max(1, activeGroup.weeklyQuotaSessions)) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-body-xs text-muted-foreground">
                <span>Kuota mingguan mengikuti paket kelompok</span>
                <span>Target: {activeGroup.frequencyLabel}</span>
              </div>
            </div>

            <p className="text-body-xs text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/50">
              <Activity className="size-3.5 text-brand-primary shrink-0" />
              <span>
                Total {activeGroup.usedQuotaSessions} sesi terlaksana dari paket {activeGroup.totalQuotaSessions} sesi.
              </span>
            </p>
          </div>

          {/* Period & Info Card */}
          <div className="space-y-3 p-5 rounded-xl border border-border bg-muted/10 flex flex-col justify-between">
            <div>
              <span className="text-body-xs font-semibold text-muted-foreground block mb-2">
                Periode Masa Aktif
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                  <CalendarDays className="size-4 text-brand-primary" />
                  <span>
                    {activeGroup.endDate
                      ? `Hingga ${formatIsoDate(new Date(activeGroup.endDate))}`
                      : "Satu Semester Penuh"}
                  </span>
                </div>
                <p className="text-body-xs text-muted-foreground">
                  Tergabung sejak {formatIsoDate(new Date(activeGroup.joinedAt))}
                </p>
              </div>
            </div>

            {/* Share Token if available and slots remain */}
            {activeGroup.token && activeGroup.members.length < activeGroup.token.capacity && (
              <div className="pt-3 border-t border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                  Ajak Teman Sekelompok ({activeGroup.members.length}/{activeGroup.token.capacity})
                </span>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card border border-border">
                  <span className="font-mono text-body-xs font-bold text-foreground truncate">
                    {activeGroup.token.token}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => handleCopy(activeGroup.token!.token)}
                    className="h-7 px-2 text-[11px] gap-1 shrink-0"
                  >
                    {copiedToken === activeGroup.token.token ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>Salin</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Attendance Traceability */}
        <div className="p-5 rounded-xl border border-border bg-muted/10">
          <span className="text-body-xs font-semibold text-muted-foreground block mb-3">
            Riwayat 4 Minggu Terakhir
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {activeGroup.weeklyStats.map((w) => (
              <div
                key={w.weekStartIso}
                className="p-2.5 rounded-lg border border-border bg-card text-center space-y-1"
              >
                <span className="text-[11px] font-semibold text-foreground block">
                  {w.label}
                </span>
                <div className="flex items-center justify-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    {w.attended} hadir
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-red-500">
                    <XCircle className="size-3" />
                    {w.missed + w.cancelled} batal/lewat
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Mata Kuliah & Anggota Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mata Kuliah Kelompok (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-5 text-brand-primary" />
              Mata Kuliah Kelompok ({activeGroup.courses.length})
            </h3>
            <Link
              href="/courses"
              className="text-body-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
            >
              <span>Jelajahi Course</span>
              <ChevronRight className="size-3.5" />
            </Link>
          </div>

          {activeGroup.courses.length === 0 ? (
            <p className="text-body-sm text-muted-foreground italic py-4">
              Belum ada mata kuliah yang terasosiasi dengan kelompok ini.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {activeGroup.courses.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl border border-border bg-muted/15 hover:bg-muted/30 transition-all flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">
                        {c.category || "Kelas"}
                      </span>
                    </div>
                    <h4 className="font-heading text-body-sm font-bold text-foreground">
                      {c.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <Link
                      href={`/courses/${c.id}`}
                      className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                    >
                      <span>Masuk Kelas</span>
                      <ArrowRight className="size-3" />
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link
                      href={`/courses/${c.id}/material`}
                      className="text-body-xs text-muted-foreground hover:text-foreground"
                    >
                      Materi
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link
                      href={`/courses/${c.id}/quiz`}
                      className="text-body-xs text-muted-foreground hover:text-foreground"
                    >
                      Kuis
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rekan Belajar / Anggota Kelompok (1 col) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <Users className="size-5 text-brand-primary" />
              Rekan Belajar ({activeGroup.members.length})
            </h3>
          </div>

          <div className="divide-y divide-border/60">
            {activeGroup.members.map((m) => (
              <div key={m.userId} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-body-sm shrink-0 uppercase">
                    {m.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-heading text-body-sm font-bold text-foreground truncate">
                        {m.name}
                      </p>
                      {m.isMe && (
                        <span className="text-[10px] bg-brand-primary/15 text-brand-primary font-bold px-1.5 py-0.2 rounded shrink-0">
                          Anda
                        </span>
                      )}
                    </div>
                    <p className="text-body-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>

                <Badge
                  variant={m.role === "leader" ? "default" : "outline"}
                  className="text-[10px] uppercase font-semibold shrink-0"
                >
                  {m.role === "leader" ? "Ketua" : "Anggota"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Riwayat Pertemuan Kelompok */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <Clock className="size-5 text-brand-primary" />
            Riwayat Pertemuan & Jadwal Kelompok
          </h3>
          <Link
            href="/dashboard/schedule"
            className="text-body-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
          >
            <span>Buka Kalender Jadwal</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {activeGroup.recentBookings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-body-sm space-y-2">
            <p>Belum ada sesi tutorial yang dijadwalkan untuk kelompok ini.</p>
            <Link href="/dashboard/schedule">
              <Button variant="outline" size="sm" className="rounded-lg gap-1.5 mt-2">
                <CalendarRange className="size-3.5" />
                <span>Pilih Jadwal Tutor</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3">Mata Kuliah</th>
                  <th scope="col" className="px-4 py-3">Tutor Pengampu</th>
                  <th scope="col" className="px-4 py-3">Waktu Sesi</th>
                  <th scope="col" className="px-4 py-3">Dipesan Oleh</th>
                  <th scope="col" className="px-4 py-3">Tanggal Booking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeGroup.recentBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {b.courseTitle}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.slot?.tutorName || "Tutor Zyx"}
                    </td>
                    <td className="px-4 py-3">
                      {b.slot ? (
                        <span className="font-mono text-body-xs font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded">
                          {b.slot.dayOfWeek}, {b.slot.startTime} - {b.slot.endTime}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-body-xs">Selesai</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-body-xs">
                      {b.isMyBooking ? (
                        <span className="font-semibold text-brand-primary">Anda</span>
                      ) : (
                        <span className="text-muted-foreground">{b.studentName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-body-xs text-muted-foreground">
                      {formatIsoDate(new Date(b.bookedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Gabung Kelompok Tambahan Dengan Token */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <KeyRound className="size-4 text-brand-primary" />
              Punya Token Kelompok Lain?
            </h3>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Masukkan token aktivasi untuk bergabung ke kelompok belajar tambahan.
            </p>
          </div>

          <form onSubmit={handleJoinToken} className="flex gap-2 w-full sm:w-auto">
            <Input
              type="text"
              placeholder="Zyx-XXXXXXXX-3-2"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="h-10 w-full sm:w-60 rounded-lg text-body-sm font-mono"
            />
            <Button
              type="submit"
              disabled={tokenLoading || !tokenInput.trim()}
              className="h-10 rounded-lg px-5 bg-brand-primary text-white hover:bg-brand-primary/95 shrink-0"
            >
              {tokenLoading ? "Memproses..." : "Gabung"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
