"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveCourse,
  deleteCourse,
  allowedCategories,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  Settings,
  Trash2,
  Save,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type Course = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
};

type Props = {
  course: Course;
};

export function SettingsTab({ course }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState(course.title);
  const [category, setCategory] = useState(course.category);
  const [description, setDescription] = useState(course.description || "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Nama mata kuliah wajib diisi.");
      return;
    }
    if (!category) {
      toast.error("Kategori program studi wajib dipilih.");
      return;
    }

    setLoading(true);
    const res = await saveCourse(
      course.id,
      title.trim(),
      category,
      description.trim() || null,
      false
    );
    setLoading(false);

    if (res.success) {
      toast.success("Informasi mata kuliah berhasil diperbarui.");
      router.refresh();
    } else {
      toast.error(res.error || "Gagal memperbarui data mata kuliah.");
    }
  };

  const handleDeleteConfirm = async () => {
    setLoading(true);
    const res = await deleteCourse(course.id);
    setLoading(false);
    setDeleteModalOpen(false);

    if (res.success) {
      toast.success("Mata kuliah berhasil dihapus.");
      router.push("/admin/courses");
    } else {
      toast.error(res.error || "Gagal menghapus mata kuliah.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Edit Course Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings className="size-4 text-brand-primary" />
          Pengaturan Informasi Mata Kuliah
        </h3>

        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">ID / Slug Mata Kuliah (Permanen)</Label>
            <Input
              value={course.id}
              disabled
              className="bg-muted text-muted-foreground font-mono rounded-lg"
            />
            <p className="text-[11px] text-muted-foreground">
              Slug ID digunakan pada URL rute dan tidak dapat diubah setelah dibuat.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">Nama Mata Kuliah</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">Program Studi / Kategori</Label>
            <Select value={category} onValueChange={setCategory} disabled={loading}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Pilih Program Studi" />
              </SelectTrigger>
              <SelectContent>
                {allowedCategories.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">Deskripsi Mata Kuliah (Opsional)</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder="Jelaskan ringkasan materi, capaian pembelajaran, atau informasi penting lainnya..."
              className="rounded-lg"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading || !title.trim()}
              className="gap-1.5 rounded-lg font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Simpan Perubahan
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-4 max-w-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-heading text-body-sm font-bold text-destructive">
              Zona Bahaya
            </h4>
            <p className="text-body-xs text-muted-foreground">
              Menghapus mata kuliah ini akan menghapus seluruh data bab, materi PDF, kuis, dan riwayat pengerjaan siswa yang terhubung. Tindakan ini permanen dan tidak dapat dibatalkan.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setDeleteModalOpen(true)}
          disabled={loading}
          className="gap-1.5 rounded-lg"
        >
          <Trash2 className="size-4" />
          Hapus Mata Kuliah Ini
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Mata Kuliah Secara Permanen</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{course.title}</strong> ({course.id})? Semua silabus, dokumen, kuis, dan data nilai akan hilang selamanya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={loading} className="rounded-lg">
                Batal
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={loading}
              className="rounded-lg"
            >
              {loading ? "Menghapus..." : "Ya, Hapus Sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
