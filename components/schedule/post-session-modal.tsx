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
  CheckCircle2,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";
import { tutorCompleteSession } from "@/app/(student)/dashboard/schedule/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  onSuccess: () => void;
};

export function PostSessionModal({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: Props) {
  const [notes, setNotes] = useState(booking?.postSessionNotes || "");
  const [linkUrl, setLinkUrl] = useState(booking?.postSessionLinkUrl || "");
  const [attachments, setAttachments] = useState<any[]>(
    booking?.postSessionAttachments || []
  );
  const [fileUploading, setFileUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (loading) return;
    if (isOpen && booking) {
      setNotes(booking.postSessionNotes || "");
      setLinkUrl(booking.postSessionLinkUrl || "");
      setAttachments(booking.postSessionAttachments || []);
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
      formData.append("folder", `schedules/${booking?.id || "temp"}/notes`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Gagal mengunggah berkas");
      }

      const data = await res.json();
      const newAtt = {
        id: `note-${Date.now()}`,
        name: files[0].name,
        url: data.url || data.fileUrl,
        size: files[0].size,
        type: files[0].type,
      };

      setAttachments((prev) => [...prev, newAtt]);
      toast.success(`Catatan ${files[0].name} berhasil diunggah`);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    if (!notes.trim()) {
      toast.error("Tuliskan catatan/rangkuman pembahasan sesi");
      return;
    }

    setLoading(true);
    try {
      const res = await tutorCompleteSession(
        booking.id,
        notes,
        attachments,
        linkUrl || undefined
      );

      if (res.success) {
        toast.success("Sesi tutorial berhasil diselesaikan!");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res.error || "Gagal menyelesaikan sesi");
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
            <CheckCircle2 className="size-5 text-emerald-600" />
            Selesaikan Sesi & Unggah Rangkuman Pembahasan
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Unggah rangkuman materi, foto catatan tangan/papan tulis, dan tautan referensi yang dapat dipelajari kembali oleh murid.
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <form onSubmit={handleSubmit} className="space-y-4 my-2">
            {/* Header info */}
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Kelompok: {booking.group?.name} • {booking.sessionDate || "Jadwal"}
                </p>
              </div>
              <Badge variant="default" className="text-[10px] bg-emerald-600">
                Sesi Selesai
              </Badge>
            </div>

            {/* Topic preview if any */}
            {booking.topic && (
              <div className="p-2.5 rounded-lg border border-border bg-card text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Topik Request Murid: </span>
                <span>{booking.topic}</span>
              </div>
            )}

            {/* Notes Input */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Catatan & Rangkuman Pembahasan Sesi
              </label>
              <Textarea
                placeholder="Tuliskan poin-poin penting materi yang telah dibahas, rumus kunci, atau evaluasi pemahaman kelompok..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                required
                className="rounded-lg text-body-sm resize-none"
              />
            </div>

            {/* External Link Input */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                Sematkan Tautan Materi Eksternal (Opsional)
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://drive.google.com/... atau https://youtube.com/..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="pl-8 h-9 rounded-lg text-body-xs font-mono"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Sistem akan otomatis mengambil pratinjau judul dan gambar ringkasan tautan.
              </p>
            </div>

            {/* Attachments Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-body-xs font-semibold text-foreground block">
                  Foto Catatan Tangan / Berkas Pembahasan ({attachments.length})
                </label>
                <label className={`cursor-pointer ${fileUploading ? "opacity-60 pointer-events-none" : ""}`}>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline">
                    {fileUploading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Upload className="size-3" />
                    )}
                    {fileUploading ? "Mengunggah..." : "+ Unggah Berkas (Foto/PDF)"}
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

              {attachments.length === 0 ? (
                <div className="p-4 text-center text-body-xs text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                  Belum ada catatan tangan atau berkas pembahasan yang diunggah.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg bg-card overflow-hidden">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-muted/20 text-body-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="size-4 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-foreground truncate">{att.name}</span>
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
                <Button variant="outline" type="button" disabled={loading || fileUploading}>
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                isLoading={loading}
                disabled={loading || fileUploading || !notes.trim()}
                className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg"
              >
                Simpan & Selesaikan Sesi
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
