"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveCourseMaterial,
  deleteCourseMaterial,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";
import { FormattedDate } from "@/components/ui/formatted-date";

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
};

type UploadedMaterial = {
  id: string;
  courseId: string;
  title: string;
  type: "materi_kelas" | "contoh_soal";
  fileUrl: string;
  chapterIds: any;
  createdAt: Date;
};

type Props = {
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
  initialMaterials: UploadedMaterial[];
};

export function MaterialsTab({
  courseId,
  courseTitle,
  chapters,
  initialMaterials,
}: Props) {
  const router = useRouter();
  const [materials] = useState<UploadedMaterial[]>(initialMaterials);
  const [loading, setLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"materi_kelas" | "contoh_soal">("materi_kelas");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    if (selectedChapters.size === chapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(chapters.map((c) => c.id)));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }
    if (selectedChapters.size === 0) {
      toast.error("Pilih minimal satu bab yang terkait dengan dokumen ini.");
      return;
    }
    if (!selectedFile) {
      toast.error("Silakan pilih berkas PDF yang akan diunggah.");
      return;
    }
    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      toast.error("Ukuran berkas PDF maksimal 50 MB.");
      return;
    }

    setLoading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", selectedFile);
      uploadForm.append("courseId", courseId);

      const uploadResponse = await fetch("/api/admin/upload-pdf", {
        method: "POST",
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok || typeof uploadData?.key !== "string") {
        toast.error(uploadData?.error || "Gagal mengunggah berkas PDF.");
        return;
      }

      const res = await saveCourseMaterial(
        courseId,
        title.trim(),
        type,
        Array.from(selectedChapters),
        uploadData.key
      );

      if (res.success) {
        toast.success("Dokumen PDF berhasil diunggah.");
        setTitle("");
        setSelectedChapters(new Set());
        setSelectedFile(null);
        const fileInput = document.getElementById("course-pdf-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan data materi.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Terjadi kesalahan jaringan saat mengunggah.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus materi ini?")) return;
    setDeleteLoadingId(id);
    try {
      const res = await deleteCourseMaterial(id);
      if (res.success) {
        toast.success("Materi berhasil dihapus.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus materi.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus materi.");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const renderChapterBadges = (chapterIds: any) => {
    const ids: string[] = Array.isArray(chapterIds)
      ? chapterIds
      : typeof chapterIds === "string"
      ? JSON.parse(chapterIds)
      : [];

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {ids.map((id) => {
          const chap = chapters.find((c) => c.id === id);
          return (
            <Badge
              key={id}
              variant="outline"
              className="text-[11px] font-medium rounded-md px-1.5 py-0 bg-muted/30"
            >
              {chap ? `Bab ${chap.orderIndex}: ${chap.title}` : "Bab tidak diketahui"}
            </Badge>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Informational Callout */}
      <div className="p-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 flex items-start gap-3">
        <Info className="size-5 text-brand-primary shrink-0 mt-0.5" />
        <div className="space-y-1 text-body-sm text-foreground">
          <p className="font-semibold">Penyimpanan Dokumen PDF &amp; Materi Pembelajaran</p>
          <p className="text-body-xs text-muted-foreground">
            Dokumen PDF yang diunggah di sini ditujukan sebagai bahan bacaan langsung dan latihan mahasiswa pada mata kuliah <strong>{courseTitle}</strong>.
            Untuk memproses pengetahuan menjadi kurikulum AI, ringkasan interaktif, dan bank soal otomatis, Anda juga dapat mengelola materi Markdown di{" "}
            <Link href={`/admin/materials?courseId=${courseId}`} className="text-brand-primary font-semibold hover:underline">
              Materi AI
            </Link>.
          </p>
        </div>
      </div>

      {/* Direct PDF Upload Form */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="size-4 text-brand-secondary" />
          Unggah Dokumen PDF untuk {courseTitle}
        </h3>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Judul Dokumen</Label>
              <Input
                placeholder="Contoh: Modul Kuliah Bab 1 - Limit Fungsi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Kategori / Jenis Dokumen</Label>
              <Select
                value={type}
                onValueChange={(v: "materi_kelas" | "contoh_soal") => setType(v)}
                disabled={loading}
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Pilih Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="materi_kelas">Materi Kelas / Diktat (PDF)</SelectItem>
                  <SelectItem value="contoh_soal">Contoh Soal &amp; Latihan (PDF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Chapter Selector */}
          <div className="rounded-xl border border-border/80 bg-muted/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
                Kaitkan dengan Bab Mata Kuliah ({selectedChapters.size} dipilih)
              </Label>
              {chapters.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllChapters}
                  className="text-body-xs text-brand-primary font-medium hover:underline cursor-pointer"
                >
                  {selectedChapters.size === chapters.length ? "Batalkan Semua" : "Pilih Semua Bab"}
                </button>
              )}
            </div>

            {chapters.length === 0 ? (
              <p className="text-body-xs text-status-warning py-1">
                Mata kuliah ini belum memiliki bab. Silakan tambahkan bab terlebih dahulu di tab <strong>Silabus &amp; Bab</strong>.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {chapters.map((ch) => {
                  const isChecked = selectedChapters.has(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-body-xs font-semibold cursor-pointer transition-colors ${
                        isChecked
                          ? "border-brand-primary bg-brand-primary/10 text-foreground"
                          : "border-border/60 hover:bg-muted/20 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChapter(ch.id)}
                        disabled={loading}
                        className="mt-0.5 rounded border-border"
                      />
                      <span className="truncate">
                        Bab {ch.orderIndex}: {ch.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* File Input */}
          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">Berkas PDF</Label>
            <Input
              id="course-pdf-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={loading}
              className="cursor-pointer file:rounded-md file:bg-muted file:border-0 file:px-3 file:py-1 file:text-body-xs file:font-semibold rounded-lg"
            />
            <p className="text-body-xs text-muted-foreground">Format PDF, maksimal 50 MB.</p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={loading || !title.trim() || selectedChapters.size === 0 || !selectedFile}
              className="gap-1.5 rounded-lg font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Mengunggah PDF...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Unggah PDF
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Materials List */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-heading text-body-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <FileText className="size-4 text-brand-primary" />
          Daftar PDF Terunggah ({materials.length})
        </h3>

        {materials.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <FileText className="size-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-body-sm font-medium text-foreground">Belum ada dokumen PDF terunggah</p>
            <p className="text-body-xs text-muted-foreground mt-1">
              Gunakan formulir di atas untuk mengunggah materi kelas atau contoh soal PDF untuk mata kuliah ini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {materials.map((m) => {
              const fileUrl = m.fileUrl.startsWith("http")
                ? m.fileUrl
                : `/api/storage/file/${m.fileUrl}`;

              return (
                <div
                  key={m.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-body-sm font-semibold text-foreground truncate">
                        {m.title}
                      </p>
                      <Badge
                        variant={m.type === "contoh_soal" ? "secondary" : "default"}
                        className="rounded-md text-[11px]"
                      >
                        {m.type === "contoh_soal" ? "Contoh Soal" : "Materi Kelas"}
                      </Badge>
                    </div>

                    {renderChapterBadges(m.chapterIds)}

                    <p className="text-body-xs text-muted-foreground mt-1">
                      Diunggah pada <FormattedDate date={m.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-body-xs font-medium text-foreground transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                      Lihat PDF
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(m.id)}
                      disabled={deleteLoadingId === m.id}
                      title="Hapus Dokumen"
                    >
                      {deleteLoadingId === m.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
