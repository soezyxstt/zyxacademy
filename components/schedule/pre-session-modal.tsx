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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  FileQuestion,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { updatePreSessionData } from "@/app/(student)/dashboard/schedule/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  onSuccess: () => void;
};

export function PreSessionModal({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: Props) {
  const [topic, setTopic] = useState(booking?.topic || "");
  const [notes, setNotes] = useState(booking?.preSessionNotes || "");
  const [attachments, setAttachments] = useState<any[]>(
    booking?.preSessionAttachments || []
  );
  const [fileUploading, setFileUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync when booking changes
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && booking) {
      setTopic(booking.topic || "");
      setNotes(booking.preSessionNotes || "");
      setAttachments(booking.preSessionAttachments || []);
    }
    onOpenChange(isOpen);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("folder", `schedules/${booking?.id || "temp"}/materials`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Gagal mengunggah berkas");
      }

      const data = await res.json();
      const newAtt = {
        id: `att-${Date.now()}`,
        name: files[0].name,
        url: data.url || data.fileUrl,
        size: files[0].size,
        type: files[0].type,
      };

      setAttachments((prev) => [...prev, newAtt]);
      toast.success(`Berkas ${files[0].name} berhasil diunggah`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err?.message || "Gagal mengunggah berkas");
    } finally {
      setFileUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    setLoading(true);
    try {
      const res = await updatePreSessionData(booking.id, topic, notes, attachments);
      if (res.success) {
        toast.success("Persiapan sesi tutorial berhasil disimpan!");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res.error || "Gagal menyimpan data");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl rounded-xl border border-border p-6 shadow-xl text-left max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <FileQuestion className="size-5 text-brand-primary" />
            Persiapan Sesi & Unggah Soal
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Topik bahasan dan berkas soal latihan yang diunggah dapat diakses oleh seluruh rekan sekelompok dan tutor pengampu.
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <form onSubmit={handleSave} className="space-y-4 my-2">
            {/* Header info */}
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Tutor: {booking.slot?.tutor?.name || "Tutor"} • Kelompok: {booking.group?.name}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {booking.startTime || booking.slot?.startTime} - {booking.endTime || booking.slot?.endTime}
              </Badge>
            </div>

            {/* Topic Input */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Topik / Materi yang Ingin Dibahas
              </label>
              <Input
                placeholder="Contoh: Pembahasan Soal UTS Bab Integral Substitusi & Parsial"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            {/* Notes Input */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Catatan Tambahan untuk Tutor (Opsional)
              </label>
              <Textarea
                placeholder="Tuliskan bagian materi mana yang masih sulit dipahami atau request khusus..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rounded-lg text-body-sm resize-none"
              />
            </div>

            {/* Attachments Upload Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-body-xs font-semibold text-foreground block">
                  Berkas Soal / Foto Latihan ({attachments.length})
                </label>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline">
                    <Upload className="size-3" />
                    {fileUploading ? "Mengunggah..." : "+ Unggah Berkas (PDF/Gambar)"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={fileUploading}
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {/* Uploaded files list */}
              {attachments.length === 0 ? (
                <div className="p-4 text-center text-body-xs text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                  Belum ada berkas soal yang diunggah untuk sesi ini.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg bg-card overflow-hidden">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-muted/20 text-body-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="size-4 text-brand-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{att.name}</p>
                          {att.uploadedByName && (
                            <p className="text-[10px] text-muted-foreground">
                              Diunggah oleh: {att.uploadedByName}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded text-muted-foreground hover:text-foreground"
                          title="Buka Berkas"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1 rounded text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          title="Hapus Berkas"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={loading || !topic.trim()}
                className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
              >
                {loading ? "Menyimpan..." : "Simpan Persiapan Sesi"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
