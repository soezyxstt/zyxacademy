"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  CalendarDays,
  Clock,
  Video,
  MapPin,
  BookOpen,
} from "lucide-react";
import { collaborativeBookSlot } from "@/app/(student)/dashboard/schedule/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSlot: any | null;
  selectedDateIso: string;
  groups: any[];
  onSuccess: () => void;
};

export function CollaborativeBookingModal({
  open,
  onOpenChange,
  selectedSlot,
  selectedDateIso,
  groups,
  onSuccess,
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || "");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(false);

  const activeGroup = groups.find((g) => g.id === selectedGroupId) || groups[0] || null;

  // Available courses in the selected group that the tutor is certified for
  const availableCourses = (activeGroup?.courses || [])
    .map((gc: any) => gc.course || gc)
    .filter(Boolean);

  const handleBook = async () => {
    if (!selectedSlot) return;
    if (!selectedGroupId) {
      toast.error("Pilih kelompok belajar terlebih dahulu");
      return;
    }
    if (!selectedCourseId) {
      toast.error("Pilih mata kuliah bimbingan");
      return;
    }

    setLoading(true);
    try {
      const res = await collaborativeBookSlot(
        selectedSlot.id,
        selectedCourseId,
        selectedGroupId,
        selectedDateIso
      );

      if (res.success) {
        toast.success("Jadwal bimbingan kelompok berhasil dipesan!");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res.error || "Gagal memesan slot");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-xl text-left">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <CalendarDays className="size-5 text-brand-primary" />
            Pilih Jadwal Bimbingan Kelompok
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Slot ini akan dipesan atas nama kelompok belajar Anda.
          </DialogDescription>
        </DialogHeader>

        {selectedSlot && (
          <div className="space-y-4 my-2">
            {/* Slot Info Card */}
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-body-sm">
                  {selectedSlot.tutor?.name || "Tutor Zyx"}
                </span>
                {selectedSlot.mode === "online" ? (
                  <Badge variant="outline" className="text-blue-600 border-blue-300 gap-1 text-[10px]">
                    <Video className="size-3" />
                    Online (Meet)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 gap-1 text-[10px]">
                    <MapPin className="size-3" />
                    {selectedSlot.location || "Offline"}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-body-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <CalendarDays className="size-3.5 text-brand-primary" />
                  <span>{selectedDateIso} ({selectedSlot.dayOfWeek})</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="size-3.5 text-brand-primary" />
                  <span>{selectedSlot.startTime} - {selectedSlot.endTime}</span>
                </div>
              </div>
            </div>

            {/* Select Group (if multiple) */}
            {groups.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  Kelompok Belajar
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => {
                    setSelectedGroupId(e.target.value);
                    setSelectedCourseId("");
                  }}
                  className="w-full h-10 rounded-lg border border-border bg-card px-3 text-body-sm"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} (Sisa Kuota: {Math.max(0, g.totalQuotaSessions - g.usedQuotaSessions)} sesi)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quota indicator */}
            {activeGroup && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-card text-body-xs">
                <span className="text-muted-foreground">Sisa Kuota Semester:</span>
                <span className="font-bold text-foreground">
                  {Math.max(0, activeGroup.totalQuotaSessions - activeGroup.usedQuotaSessions)} / {activeGroup.totalQuotaSessions} Sesi
                </span>
              </div>
            )}

            {/* Select Course */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Pilih Mata Kuliah Bimbingan
              </label>
              {availableCourses.length === 0 ? (
                <p className="text-body-xs text-muted-foreground italic">
                  Tidak ada mata kuliah yang terhubung dengan kelompok Anda.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto">
                  {availableCourses.map((c: any) => {
                    const isSelected = selectedCourseId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCourseId(c.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? "border-brand-primary bg-brand-primary/10 text-foreground font-semibold"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen className="size-4 text-brand-primary shrink-0" />
                          <span className="text-body-sm">{c.title}</span>
                        </div>
                        {isSelected && <Badge variant="default" className="text-[10px]">Dipilih</Badge>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Batal
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={loading || !selectedCourseId}
            onClick={handleBook}
            className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
          >
            {loading ? "Memesan..." : "Konfirmasi Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
