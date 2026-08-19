"use client";

import { useState } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Video,
  MapPin,
  GraduationCap,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  tutorAddSlot,
  tutorDeleteSlot,
  updateTutorCourses,
} from "@/app/(student)/dashboard/schedule/actions";

type Props = {
  mySlots: any[];
  certifiedCourses: any[];
  allCourses: any[];
  onRefresh: () => void;
};

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export function TutorAvailabilityPanel({
  mySlots,
  certifiedCourses,
  allCourses,
  onRefresh,
}: Props) {
  const [dayOfWeek, setDayOfWeek] = useState("Senin");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [certLoading, setCertLoading] = useState(false);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "offline" && !location.trim()) {
      toast.error("Untuk sesi offline, lokasi/ruangan fisik wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const res = await tutorAddSlot(dayOfWeek, startTime, endTime, mode, location);
      if (res.success) {
        toast.success("Slot ketersediaan berhasil ditambahkan!");
        setLocation("");
        onRefresh();
      } else {
        toast.error(res.error || "Gagal menambahkan slot");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    try {
      const res = await tutorDeleteSlot(slotId);
      if (res.success) {
        toast.success("Slot ketersediaan berhasil dihapus");
        onRefresh();
      } else {
        toast.error(res.error || "Gagal menghapus slot");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    }
  };

  const handleToggleCert = async (courseId: string) => {
    const isAlready = certifiedCourses.some((c) => c.id === courseId);
    let newCourseIds = [];
    if (isAlready) {
      newCourseIds = certifiedCourses.filter((c) => c.id !== courseId).map((c) => c.id);
    } else {
      newCourseIds = [...certifiedCourses.map((c) => c.id), courseId];
    }

    setCertLoading(true);
    try {
      const res = await updateTutorCourses(newCourseIds);
      if (res.success) {
        toast.success("Mata kuliah tutorial diperbarui");
        onRefresh();
      } else {
        toast.error(res.error || "Gagal memperbarui");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCertLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Add Slot Form (1 col) */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
          <Clock className="size-5 text-brand-primary" />
          Tambah Slot Ketersediaan (90 Menit)
        </h3>

        <form onSubmit={handleAddSlot} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-body-xs font-semibold text-foreground block">
              Hari Tutorial
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-card px-3 text-body-sm"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Jam Mulai
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Jam Selesai
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-body-xs font-semibold text-foreground block">
              Mode Pertemuan
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("online")}
                className={`p-2.5 rounded-lg border text-body-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mode === "online"
                    ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <Video className="size-4" />
                <span>Online (Meet)</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("offline")}
                className={`p-2.5 rounded-lg border text-body-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mode === "offline"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <MapPin className="size-4" />
                <span>Offline</span>
              </button>
            </div>
          </div>

          {mode === "offline" && (
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Lokasi Fisik / Ruangan / Cabang
              </label>
              <Input
                placeholder="Contoh: Ruang Diskusi Lantai 2, Cabang Ganesha"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 gap-1.5 shadow-sm"
          >
            <Plus className="size-4" />
            <span>{loading ? "Menambahkan..." : "Buka Slot Ketersediaan"}</span>
          </Button>
        </form>
      </div>

      {/* 2. My Slots List (1 col) */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
          <Clock className="size-5 text-brand-primary" />
          Daftar Slot Dibuka ({mySlots.length})
        </h3>

        {mySlots.length === 0 ? (
          <div className="p-8 text-center text-body-xs text-muted-foreground italic border border-dashed border-border rounded-xl">
            Anda belum membuka slot ketersediaan tutorial.
          </div>
        ) : (
          <div className="divide-y divide-border/70 max-h-96 overflow-y-auto pr-1">
            {mySlots.map((s) => {
              const isBooked = Boolean(s.booking);
              return (
                <div
                  key={s.id}
                  className="py-3 flex items-center justify-between gap-2 text-body-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">
                        {s.dayOfWeek}, {s.startTime} - {s.endTime}
                      </span>
                      {s.mode === "online" ? (
                        <Badge variant="outline" className="text-[9px] text-blue-600">Online</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] text-emerald-600 truncate max-w-[80px]">
                          {s.location || "Offline"}
                        </Badge>
                      )}
                    </div>
                    {isBooked ? (
                      <p className="text-[11px] text-brand-primary font-semibold mt-0.5">
                        ✓ Diambil oleh: {s.booking?.group?.name}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Menunggu pemilihan murid
                      </p>
                    )}
                  </div>

                  {!isBooked && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDeleteSlot(s.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md"
                      title="Hapus Slot"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Subject Certifications (1 col) */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
          <GraduationCap className="size-5 text-brand-primary" />
          Mata Kuliah Diampu ({certifiedCourses.length})
        </h3>
        <p className="text-body-xs text-muted-foreground">
          Pilih mata kuliah yang Anda ampu agar murid dari kelas tersebut dapat memesan slot Anda.
        </p>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {allCourses.map((c) => {
            const isChecked = certifiedCourses.some((cc) => cc.id === c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                  isChecked
                    ? "border-brand-primary bg-brand-primary/10 text-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={certLoading}
                    onChange={() => handleToggleCert(c.id)}
                    className="size-4 accent-brand-primary rounded"
                  />
                  <span>{c.title}</span>
                </div>
                {isChecked && <Check className="size-4 text-brand-primary" />}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
