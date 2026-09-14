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
  setDemoCourse,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import {
  Settings,
  Trash2,
  Save,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  CircleAlert,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  isDemo?: boolean;
  demoEligibility?: {
    eligible: boolean;
    checks: Array<{
      key: "article" | "diktat" | "flashcards" | "quiz";
      label: string;
      ready: boolean;
      count: number;
    }>;
    issues: string[];
  } | null;
};

type Props = {
  course: Course;
};

export function SettingsTab({ course }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
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

  const handleDemoToggle = async () => {
    setDemoLoading(true);
    const res = await setDemoCourse(course.id, !course.isDemo);
    setDemoLoading(false);

    if (res.success) {
      toast.success(course.isDemo ? "Mata kuliah dikeluarkan dari demo." : "Mata kuliah dipilih sebagai demo.");
      router.refresh();
    } else {
      toast.error(res.error || "Pilihan demo tidak dapat diperbarui.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Edit Course Form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="size-4 text-brand-primary" />
          Pengaturan Informasi Mata Kuliah
        </h3>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">ID / Slug (Permanen)</Label>
              <Input
                value={course.id}
                disabled
                className="bg-muted text-muted-foreground font-mono rounded-lg h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Nama Mata Kuliah</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className="rounded-lg h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">Program Studi / Kategori</Label>
            <Select value={category} onValueChange={setCategory} disabled={loading}>
              <SelectTrigger className="rounded-lg h-9">
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
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder="Jelaskan ringkasan materi, capaian pembelajaran, atau informasi penting lainnya..."
              className="rounded-lg text-body-sm"
            />
          </div>

          <div className="pt-1">
            <Button
              type="submit"
              size="sm"
              disabled={loading || !title.trim()}
              className="gap-1.5 rounded-lg font-semibold h-9"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Simpan Perubahan
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Public demo selection */}
      <div className="rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-brand-primary" aria-hidden="true" />
            <div>
              <h3 className="font-heading text-body-sm font-semibold text-foreground">Demo publik</h3>
              <p className="mt-1 max-w-2xl text-body-xs leading-relaxed text-muted-foreground">
                Pilih satu mata kuliah aktif untuk halaman demo tanpa login. Konten harus terbit dan lengkap.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={course.isDemo ? "border-brand-primary/40 text-brand-primary" : "text-muted-foreground"}>
            {course.isDemo ? "Terpilih" : "Belum dipilih"}
          </Badge>
        </div>

        {course.demoEligibility ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {course.demoEligibility.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background px-3 py-2.5">
                {check.ready ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-body-xs font-semibold text-foreground">{check.label}</p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground">{check.count} tersedia</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {course.demoEligibility && !course.demoEligibility.eligible ? (
          <p className="mt-3 text-body-xs text-status-error">
            Lengkapi konten terbit sebelum memilih mata kuliah ini.
          </p>
        ) : null}

        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            variant={course.isDemo ? "outline" : "default"}
            onClick={handleDemoToggle}
            disabled={loading || demoLoading || (!course.isDemo && !course.demoEligibility?.eligible)}
            isLoading={demoLoading}
            className="gap-1.5 rounded-lg"
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {course.isDemo ? "Keluarkan dari demo" : "Jadikan demo publik"}
          </Button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-heading text-body-sm font-bold text-destructive">
              Zona Bahaya
            </h4>
            <p className="text-body-xs text-muted-foreground">
              Menghapus mata kuliah ini akan menghapus seluruh data bab, materi PDF, kuis, dan riwayat pengerjaan siswa yang terhubung.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setDeleteModalOpen(true)}
          disabled={loading}
          className="gap-1.5 rounded-lg h-8 font-semibold"
        >
          <Trash2 className="size-3.5" />
          Hapus Mata Kuliah
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!loading) setDeleteModalOpen(open);
        }}
      >
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
              isLoading={loading}
              className="rounded-lg"
            >
              Ya, Hapus Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
