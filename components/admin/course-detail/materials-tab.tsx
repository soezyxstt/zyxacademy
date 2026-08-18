"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  const getChapterLabels = (chapterIds: any) => {
    const ids: string[] = Array.isArray(chapterIds)
      ? chapterIds
      : typeof chapterIds === "string"
      ? JSON.parse(chapterIds)
      : [];

    return ids
      .map((id) => {
        const chap = chapters.find((c) => c.id === id);
        return chap ? `Bab ${chap.orderIndex}: ${chap.title}` : "Bab tidak diketahui";
      })
      .join(", ");
  };

  return (
    <div className="space-y-4">
      {/* Direct PDF Upload Form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Upload className="size-4 text-brand-secondary" />
          Unggah Dokumen PDF untuk {courseTitle}
        </h3>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Judul Dokumen</Label>
              <Input
                placeholder="Contoh: Modul Kuliah Bab 1 - Limit Fungsi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className="h-9 rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Kategori / Jenis Dokumen</Label>
              <Select
                value={type}
                onValueChange={(v: "materi_kelas" | "contoh_soal") => setType(v)}
                disabled={loading}
              >
                <SelectTrigger className="h-9 rounded-lg">
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
          <div className="rounded-xl border border-border/70 bg-muted/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
                Kaitkan dengan Bab ({selectedChapters.size} dipilih)
              </span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                {chapters.map((ch) => {
                  const isChecked = selectedChapters.has(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className={`flex items-start gap-2 p-2 rounded-lg border text-body-xs cursor-pointer select-none transition-colors ${
                        isChecked
                          ? "border-brand-primary bg-brand-primary/10 text-foreground font-medium"
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

          {/* File Input and Submit */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
            <div className="space-y-1 flex-1 max-w-md">
              <Label className="text-body-sm font-semibold text-foreground">Berkas PDF</Label>
              <Input
                id="course-pdf-input"
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={loading}
                className="cursor-pointer file:rounded-md file:bg-muted file:border-0 file:px-2.5 file:py-0.5 file:text-body-xs file:font-semibold h-9 rounded-lg text-body-xs"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={loading || !title.trim() || selectedChapters.size === 0 || !selectedFile}
              className="gap-1.5 rounded-lg font-semibold h-9"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Mengunggah...
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  Unggah PDF
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Materials List */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs overflow-x-auto">
        <h3 className="font-heading text-body-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <FileText className="size-4 text-brand-primary" />
          Daftar PDF Terunggah ({materials.length})
        </h3>

        {materials.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <FileText className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-body-xs font-medium text-foreground">Belum ada dokumen PDF terunggah</p>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Gunakan formulir di atas untuk mengunggah materi kelas atau contoh soal PDF.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-body-xs">
            <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Judul Dokumen</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2">Kaitan Bab</th>
                <th className="px-3 py-2">Diunggah</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materials.map((m) => {
                const fileUrl = m.fileUrl.startsWith("http")
                  ? m.fileUrl
                  : `/api/storage/file/${m.fileUrl}`;

                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-foreground max-w-xs">
                      <span className="truncate block" title={m.title}>
                        {m.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={m.type === "contoh_soal" ? "secondary" : "default"}
                        className="rounded-md text-[10px] px-1.5 py-0.5"
                      >
                        {m.type === "contoh_soal" ? "Contoh Soal" : "Materi Kelas"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-xs truncate" title={getChapterLabels(m.chapterIds)}>
                      {getChapterLabels(m.chapterIds)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-body-xs">
                      <FormattedDate date={m.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-body-sm font-medium text-foreground transition-colors"
                        >
                          <ExternalLink className="size-3" />
                          <span>PDF</span>
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(m.id)}
                          disabled={deleteLoadingId === m.id}
                          title="Hapus Dokumen"
                        >
                          {deleteLoadingId === m.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
