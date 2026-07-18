"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  CalendarDays,
  Video,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createPkaScheduleAction,
  updatePkaScheduleAction,
  deletePkaScheduleAction,
  type PkaScheduleRow,
} from "../actions";
import { formatDatetimeLocal } from "@/lib/date-utils";

export function SchedulesTab({ schedules }: { schedules: PkaScheduleRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<PkaScheduleRow | null>(null);
  const [deleteItem, setDeleteItem] = useState<PkaScheduleRow | null>(null);

  const [title, setTitle] = useState("");
  const [sessionAt, setSessionAt] = useState("");
  const [meetLink, setMeetLink] = useState("");

  const router = useRouter();

  // Snapshot once on mount; the linter forbids impure calls during render.
  const [now] = useState(() => Date.now());
  const upcomingCount = schedules.filter((s) => new Date(s.sessionAt).getTime() > now).length;

  const resetForm = () => {
    setTitle("");
    setSessionAt("");
    setMeetLink("");
    setEditItem(null);
    setIsFormOpen(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: PkaScheduleRow) => {
    setTitle(item.title);
    setSessionAt(formatDatetimeLocal(item.sessionAt));
    setMeetLink(item.meetLink || "");
    setEditItem(item);
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const parsed = new Date(sessionAt);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Waktu pelaksanaan tidak valid.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title);
    // Send a full ISO timestamp so the server does not re-interpret the wall
    // time in its own timezone.
    formData.set("sessionAt", parsed.toISOString());
    if (meetLink) formData.set("meetLink", meetLink);

    startTransition(async () => {
      if (editItem) {
        const res = await updatePkaScheduleAction(editItem.id, formData);
        if (!res.success) {
          toast.error("Gagal menyimpan jadwal", { description: res.error });
          return;
        }
        toast.success("Jadwal berhasil diperbarui.");
      } else {
        const res = await createPkaScheduleAction({}, formData);
        if (res.error) {
          toast.error("Gagal menambah jadwal", { description: res.error });
          return;
        }
        if (res.result?.broadcasted) {
          toast.success(`Jadwal ditambahkan dan dikirim ke ${res.result.recipientCount} siswa.`);
        } else {
          toast.success("Jadwal ditambahkan.", {
            description: "Sesi sudah lewat, jadi tidak ada notifikasi yang dikirim.",
          });
        }
      }
      resetForm();
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteItem) return;

    startTransition(async () => {
      const res = await deletePkaScheduleAction(deleteItem.id);
      if (!res.success) {
        toast.error("Gagal menghapus jadwal", { description: res.error });
      } else {
        toast.success("Jadwal berhasil dihapus.");
        setDeleteItem(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-body-sm text-muted-foreground">
          {schedules.length} sesi total, {upcomingCount} akan datang.
        </p>
        <Button onClick={handleOpenCreate} size="sm" className="gap-2 rounded-lg">
          <Plus className="size-4" />
          Tambah Jadwal
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
          <p className="text-body-sm text-muted-foreground">Belum ada jadwal sesi live.</p>
          <Button onClick={handleOpenCreate} variant="outline" size="sm" className="mt-3 gap-2">
            <Plus className="size-4" />
            Buat jadwal pertama
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border bg-muted/30 px-5 py-3">
            <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Sesi</span>
            <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
            <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Link Meet</span>
            <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Aksi</span>
          </div>
          <ul className="divide-y divide-border/60">
            {schedules.map((row) => {
              const sessionDate = new Date(row.sessionAt);
              const isPast = sessionDate.getTime() < now;
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3.5 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_auto_auto_auto] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className={cn("truncate text-body-sm font-medium", isPast ? "text-muted-foreground" : "text-foreground")}>
                      {row.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-body-xs text-muted-foreground">
                      <CalendarDays className="size-3.5 shrink-0" />
                      {sessionDate.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}
                    </p>
                  </div>

                  <div className="flex items-center">
                    {isPast ? (
                      <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
                        <CheckCircle2 className="size-3.5" />
                        Selesai
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-body-xs text-status-success">
                        <Clock className="size-3.5" />
                        Akan datang
                      </span>
                    )}
                  </div>

                  <div className="flex items-center">
                    {row.meetLink ? (
                      <a
                        href={row.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary/10 px-2 py-1 text-body-xs font-medium text-brand-primary transition-colors duration-150 hover:bg-brand-primary/20"
                      >
                        <Video className="size-3.5" />
                        Buka Meet
                      </a>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-body-xs font-medium text-muted-foreground">
                        Belum ada link
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenEdit(row)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit jadwal</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:bg-status-error/10 hover:text-status-error"
                      onClick={() => setDeleteItem(row)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Hapus jadwal</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => (open ? setIsFormOpen(true) : resetForm())}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSave} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editItem ? "Edit Jadwal" : "Tambah Jadwal Baru"}</DialogTitle>
              <DialogDescription>
                {editItem
                  ? "Perubahan tidak mengirim ulang notifikasi ke siswa."
                  : "Jadwal dengan waktu di masa depan langsung dikirim ke email dan notifikasi siswa."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pka-sched-title" className="text-body-sm font-medium text-foreground">
                  Judul / Topik
                </Label>
                <Input
                  id="pka-sched-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Pembahasan Soal Fungsi (Matematika)"
                  required
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pka-sched-at" className="text-body-sm font-medium text-foreground">
                  Waktu Pelaksanaan
                </Label>
                <Input
                  id="pka-sched-at"
                  type="datetime-local"
                  value={sessionAt}
                  onChange={(e) => setSessionAt(e.target.value)}
                  required
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pka-sched-link" className="text-body-sm font-medium text-foreground">
                  Link Google Meet <span className="font-normal text-muted-foreground">(opsional)</span>
                </Label>
                <Input
                  id="pka-sched-link"
                  type="url"
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="rounded-md"
                />
                <p className="text-body-xs text-muted-foreground">
                  Bisa dikosongkan dan ditambahkan lewat Edit saat sesi akan dimulai.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>
                Batal
              </Button>
              <Button type="submit" isLoading={isPending} className="gap-2">
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Jadwal</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus jadwal <strong>{deleteItem?.title}</strong>? Tindakan ini tidak dapat
              dibatalkan dan jadwal langsung hilang dari halaman siswa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteItem(null)} disabled={isPending}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} isLoading={isPending} className="gap-2">
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
